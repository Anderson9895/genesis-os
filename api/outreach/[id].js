// Genesis OS — Outreach tracker API: GET/PATCH /api/outreach/:id
//
// PATCH records facts entered by the owner after manual outreach. It has no
// sending integration and deliberately does not infer or fabricate sent_at.

import { json, getBearerToken, getRequestBody } from '../_lib/http.js'
import { consumeRateLimit } from '../_lib/rateLimit.js'
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
  hasSupabaseServerConfig,
} from '../_lib/supabase.js'

const VALID_STATUSES = new Set(['pending', 'sent', 'responded', 'followed_up', 'closed'])
const MAX_RESPONSE_LENGTH = 10000
const MAX_FOLLOW_UP_NOTES_LENGTH = 10000

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

export default async function handler(req, res) {
  if (!hasSupabaseServerConfig()) {
    return json(res, 503, { error: 'Server-side Supabase environment is not configured.' })
  }

  if (req.method !== 'GET' && req.method !== 'PATCH') {
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
    return json(res, 400, { error: 'Outreach lead id is required.' })
  }

  const { data: lead, error: loadError } = await client
    .from('outreach_leads')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (loadError) {
    return json(res, 500, { error: loadError.message || 'Failed to load outreach lead.' })
  }
  if (!lead) {
    return json(res, 404, { error: 'Outreach lead not found.' })
  }

  if (req.method === 'GET') {
    return json(res, 200, { lead })
  }

  const body = getRequestBody(req)
  const update = { updated_at: new Date().toISOString() }
  let updateCount = 0

  if (hasOwn(body, 'status')) {
    const status = String(body.status || '').trim()
    if (!VALID_STATUSES.has(status)) {
      return json(res, 400, { error: 'status must be pending, sent, responded, followed_up, or closed.' })
    }
    update.status = status
    updateCount += 1
  }

  if (hasOwn(body, 'sent_at')) {
    const rawSentAt = body.sent_at
    if (rawSentAt === null || rawSentAt === '') {
      update.sent_at = null
    } else {
      const parsed = new Date(rawSentAt)
      if (Number.isNaN(parsed.getTime())) {
        return json(res, 400, { error: 'sent_at must be a valid date/time or null.' })
      }
      update.sent_at = parsed.toISOString()
    }
    updateCount += 1
  }

  if (hasOwn(body, 'response_text')) {
    const responseText = String(body.response_text || '')
    if (responseText.length > MAX_RESPONSE_LENGTH) {
      return json(res, 400, { error: `response_text must be ${MAX_RESPONSE_LENGTH} characters or fewer.` })
    }
    update.response_text = responseText
    updateCount += 1
  }

  if (hasOwn(body, 'follow_up_notes')) {
    const followUpNotes = String(body.follow_up_notes || '')
    if (followUpNotes.length > MAX_FOLLOW_UP_NOTES_LENGTH) {
      return json(res, 400, { error: `follow_up_notes must be ${MAX_FOLLOW_UP_NOTES_LENGTH} characters or fewer.` })
    }
    update.follow_up_notes = followUpNotes
    updateCount += 1
  }

  if (updateCount === 0) {
    return json(res, 400, {
      error: 'Provide at least one of status, sent_at, response_text, or follow_up_notes.',
    })
  }

  const { data: updatedLead, error: updateError } = await client
    .from('outreach_leads')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (updateError) {
    return json(res, 500, { error: updateError.message || 'Failed to update outreach lead.' })
  }

  return json(res, 200, { lead: updatedLead })
}
