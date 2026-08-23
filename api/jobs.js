// Genesis OS — Jobs API (P2-2).
//
// Customer-facing intake for the Genesis Team Lead. A logged-in customer posts
// a plain-language job and it is persisted to `public.jobs` (RLS-scoped to the
// caller). This endpoint creates/tracks the job only — the actual AI production
// loop (running an employee to produce deliverables) is wired in P2-3, so it is
// honest by design: it reports queued/assigned, it does not claim completion.
//
// Routes handled here:
//   GET  /api/jobs      -> list the caller's jobs, newest first
//   POST /api/jobs      -> create a job { title, brief, assigned_employee? }
//
// Mirrors the api/ai/* convention: Bearer-token auth, same _lib helpers, rate
// limited per user.

import { json, getBearerToken, getRequestBody } from './_lib/http.js'
import { consumeRateLimit } from './_lib/rateLimit.js'
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
  hasSupabaseServerConfig,
} from './_lib/supabase.js'
import { isKnownEmployee, pickEmployeeFromBrief } from './_lib/workforce.js'

const MAX_TITLE_LENGTH = 200
const MAX_BRIEF_LENGTH = 10000

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

  // ---- POST /api/jobs — create a job --------------------------------
  if (req.method === 'POST') {
    const body = getRequestBody(req)
    const title = String(body.title || '').trim()
    const brief = String(body.brief || '').trim()
    const requestedEmployee = body.assigned_employee != null
      ? String(body.assigned_employee).trim()
      : ''

    if (!title) {
      return json(res, 400, { error: 'title is required.' })
    }
    if (!brief) {
      return json(res, 400, { error: 'brief is required.' })
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return json(res, 400, { error: `title must be ${MAX_TITLE_LENGTH} characters or fewer.` })
    }
    if (brief.length > MAX_BRIEF_LENGTH) {
      return json(res, 400, { error: `brief must be ${MAX_BRIEF_LENGTH} characters or fewer.` })
    }

    // Validate a user-supplied employee, or auto-assign from the brief.
    let assignedEmployee = ''
    let status = 'queued'

    if (requestedEmployee) {
      if (!isKnownEmployee(requestedEmployee)) {
        return json(res, 400, { error: `Unknown employee: ${requestedEmployee}` })
      }
      assignedEmployee = requestedEmployee
      status = 'assigned'
    } else {
      const picked = pickEmployeeFromBrief(`${title} ${brief}`)
      if (picked) {
        assignedEmployee = picked
        status = 'assigned'
      }
    }

    const payload = {
      user_id: user.id,
      title,
      brief,
      status,
      ...(assignedEmployee ? { assigned_employee: assignedEmployee } : {}),
    }

    const { data, error } = await client.from('jobs').insert(payload).select().single()

    if (error) {
      return json(res, 500, { error: error.message || 'Failed to create job.' })
    }

    return json(res, 201, { job: data })
  }

  // ---- GET /api/jobs — list the caller's jobs, newest first ---------
  const { data, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return json(res, 500, { error: error.message || 'Failed to load jobs.' })
  }

  return json(res, 200, { jobs: data || [] })
}
