// Genesis OS — Outreach tracker API: GET /api/outreach
//
// Read-only list surface for manually-managed outreach records. This endpoint
// never sends a message or changes a lead's status; it only returns the
// authenticated user's records. RLS provides the second ownership boundary.

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
    .from('outreach_leads')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return json(res, 500, { error: error.message || 'Failed to load outreach leads.' })
  }

  return json(res, 200, { leads: data || [] })
}
