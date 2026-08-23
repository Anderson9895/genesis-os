// Genesis OS — Deliverables API (P2-3): GET /api/deliverables
//
// Additive read surface for the Deliverables area. Returns the caller's
// deliverables, newest first, each with its job title joined in for display.
// RLS scopes by the caller's auth.uid(), so a caller only sees their own work.

import { json, getBearerToken } from './_lib/http.js'
import { consumeRateLimit } from './_lib/rateLimit.js'
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
  hasSupabaseServerConfig,
} from './_lib/supabase.js'

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

  const { data, error } = await client
    .from('deliverables')
    .select('*, jobs(title)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return json(res, 500, { error: error.message || 'Failed to load deliverables.' })
  }

  const deliverables = (data || []).map((row) => ({
    ...row,
    job_title: row?.jobs?.title || null,
    jobs: undefined,
  }))

  return json(res, 200, { deliverables })
}
