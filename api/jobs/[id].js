// Genesis OS — Jobs API (P2-2 + P2-3): GET /api/jobs/:id and POST /api/jobs/:id
//
//   GET  /api/jobs/:id -> fetch one job plus its deliverables (RLS-scoped).
//   POST /api/jobs/:id -> produce a deliverable: run the assigned employee on
//                         this job and hand back the finished work.
//
// The POST action is the real AI production loop. It is honest by design:
//   - if no AI provider is configured it returns 503 and leaves the job
//     unchanged (it never fakes a completion);
//   - if the job already has a deliverable it reports that instead of silently
//     producing a duplicate;
//   - the employee runs with the caller's RLS scope so only the job owner can
//     trigger and read this work.
// Both methods mirror the api/* conventions: Bearer-token auth, per-user rate
// limit, same _lib helpers.

import { json, getBearerToken } from '../_lib/http.js'
import { consumeRateLimit } from '../_lib/rateLimit.js'
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
  hasSupabaseServerConfig,
} from '../_lib/supabase.js'
import { getConfiguredAgentProviders } from '../_lib/agent.js'
import { runEmployeeOnJob } from '../_lib/runEmployee.js'
import { loadTeamContext } from '../_lib/teamContext.js'

export default async function handler(req, res) {
  if (!hasSupabaseServerConfig()) {
    return json(res, 503, { error: 'Server-side Supabase environment is not configured.' })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const accessToken = getBearerToken(req)
  const { user, error: userError } = await getAuthenticatedUser(accessToken)

  if (userError || !user) {
    return json(res, 401, { error: 'Unauthorized.' })
  }

  const rateResult = consumeRateLimit(user.id)
  if (!rateResult.allowed) {
    return json(res, 429, {
      error: 'Rate limit exceeded. Please try again shortly.',
      retryAfterSeconds: rateResult.retryAfterSeconds,
    })
  }

  const client = createSupabaseServerClient(accessToken)
  if (!client) {
    return json(res, 503, { error: 'Server-side database is unavailable.' })
  }

  const id = String(req.query?.id || '').trim()
  if (!id) {
    return json(res, 400, { error: 'Job id is required.' })
  }

  // RLS scopes by the caller's auth.uid(), so a non-owner gets no row.
  const { data: job, error: jobError } = await client
    .from('jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (jobError) {
    return json(res, 500, { error: jobError.message || 'Failed to load job.' })
  }

  if (!job) {
    return json(res, 404, { error: 'Job not found.' })
  }

  // ---- GET /api/jobs/:id — load job + its deliverables ------------------
  if (req.method === 'GET') {
    const { data: deliverables, error: deliverablesError } = await client
      .from('deliverables')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false })

    if (deliverablesError) {
      return json(res, 500, { error: deliverablesError.message || 'Failed to load deliverables.' })
    }

    return json(res, 200, { job, deliverables: deliverables || [] })
  }

  // ---- POST /api/jobs/:id — run the employee, produce a deliverable -----
  if (job.status === 'delivered') {
    return json(res, 409, {
      error: 'This job has already been delivered.',
    })
  }
  if (job.status === 'in_progress') {
    return json(res, 409, { error: 'This job is already being worked on.' })
  }
  if (job.status === 'cancelled') {
    return json(res, 400, { error: 'This job is cancelled and cannot be worked on.' })
  }

  const employee = String(job.assigned_employee || '').trim()
  if (!employee) {
    return json(res, 400, { error: 'This job has no employee assigned yet.' })
  }

  const configuredProviders = getConfiguredAgentProviders()
  if (configuredProviders.length === 0) {
    // Honest: we will not fake a completion. Leave the job unchanged.
    return json(res, 503, {
      error:
        'The AI workforce is not configured on the server yet (no OpenAI or '
        + 'Anthropic API key). The job was left as-is; it will not be marked done.',
    })
  }

  let sharedContext
  try {
    sharedContext = await loadTeamContext(client, user.id)
  } catch (err) {
    return json(res, 503, { error: err.message })
  }

  // Mark the job in progress before the (slow) model run.
  const nowIso = new Date().toISOString()
  const { data: claimedJob, error: startError } = await client
    .from('jobs')
    .update({ status: 'in_progress', updated_at: nowIso })
    .eq('id', id)
    .eq('user_id', user.id)
    .in('status', ['assigned', 'queued'])
    .select('id')
    .maybeSingle()

  if (startError) {
    return json(res, 500, { error: startError.message || 'Could not start the job.' })
  }

  if (!claimedJob) return json(res, 409, { error: 'This job has already been claimed. Refresh its status.' })

  let produced
  try {
    produced = await runEmployeeOnJob({
      job,
      sharedContext,
      provider: configuredProviders[0],
    })
  } catch (runErr) {
    // Best-effort rollback to a workable state so the customer can retry.
    const rollback = await client
      .from('jobs')
      .update({ status: 'assigned', updated_at: nowIso })
      .eq('id', id)
      .eq('user_id', user.id)
    if (rollback.error) {
      return json(res, 500, {
        error: 'The employee could not finish this job, and the job could not be reset.',
      })
    }
    return json(res, 500, {
      error: runErr?.message || 'The employee could not finish this job. Please try again.',
    })
  }

  const deliverableRow = {
    user_id: user.id,
    job_id: id,
    title: produced.title,
    content: { body: produced.body, summary: produced.text },
    format: produced.format,
  }

  const { data: deliverable, error: insertError } = await client
    .from('deliverables')
    .insert(deliverableRow)
    .select()
    .single()

  if (insertError) {
    // Honest: the work exists but could not be persisted; leave job not-delivered.
    const rollback = await client
      .from('jobs')
      .update({ status: 'assigned', updated_at: nowIso })
      .eq('id', id)
      .eq('user_id', user.id)
    if (rollback.error) {
      return json(res, 500, {
        error: 'The deliverable could not be saved, and the job could not be reset.',
      })
    }
    return json(res, 500, {
      error: insertError.message || 'The deliverable could not be saved. Please try again.',
    })
  }

  const { error: deliveredError } = await client
    .from('jobs')
    .update({ status: 'delivered', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (deliveredError) {
    return json(res, 500, {
      error: deliveredError.message || 'The deliverable was saved but the job status could not update.',
    })
  }

  const { data: refreshedJob } = await client.from('jobs').select('*').eq('id', id).maybeSingle()

  return json(res, 200, {
    job: refreshedJob || { ...job, status: 'delivered' },
    deliverable,
  })
}
