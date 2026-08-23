// Genesis OS — Jobs API (P2-2): GET /api/jobs/:id
//
// Fetch one job plus its deliverables (RLS-scoped to the caller). Deliverables
// production is wired in P2-3; this only returns whatever already exists.

import { json, getBearerToken } from '../_lib/http.js'
import { consumeRateLimit } from '../_lib/rateLimit.js'
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
  hasSupabaseServerConfig,
} from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (!hasSupabaseServerConfig()) {
    return json(res, 503, { error: 'Server-side Supabase environment is not configured.' })
  }

  if (req.method !== 'GET') {
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
