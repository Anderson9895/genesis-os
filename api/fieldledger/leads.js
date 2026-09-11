// Genesis OS — FieldLedger founding-lead mirror: POST /api/fieldledger/leads
//
// The public FieldLedger AI sales page lives on a chatgpt.site host (not in any
// repo we control, never touched). That page captures founding-farm leads
// through its own /api/leads. This endpoint mirrors those leads into our
// Supabase table public.fieldledger_leads so the owner keeps a single
// business-owned lead list.
//
// Security shape:
//   * The write uses an env-guarded service-role client
//     (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). The service role bypasses
//     RLS, so the public DB API can stay fully closed: anon has no grants on
//     the table and there is no public `insert` grant anywhere.
//   * If the service-role env is absent the endpoint refuses (503) — it never
//     falls back to the anon key or to an unauthenticated client.
//   * Optional bearer check: when FIELD_LEDGER_LEADS_TOKEN is set in the
//     environment, requests must present the matching token; when unset the
//     check is skipped (documented in the PR). This lets the chatgpt.site host
//     authenticate later without any change to that host.
//   * Idempotent by email (case-insensitive): the unique index
//     fieldledger_leads_email_lower_idx is the DB backstop; a duplicate email
//     returns the existing row with alreadyExists: true instead of a second
//     insert.

import { createClient } from '@supabase/supabase-js'
import { json, getBearerToken, getRequestBody } from '../_lib/http.js'
import { consumeRateLimit } from '../_lib/rateLimit.js'

const MAX_FIELD_LENGTH = 200
const MAX_ACRE_RANGE_LENGTH = 100
const MAX_SOURCE_LENGTH = 100
const MAX_EMAIL_LENGTH = 254
const MAX_BODY_BYTES = 1024 * 1024 // 1 MB
const DEFAULT_SOURCE = 'chatgpt.site'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function hasFieldLedgerServiceConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim()
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  return Boolean(url && serviceKey)
}

// Pure validation: returns { ok: true, value } with the DB-ready row, or
// { ok: false, error } with the first field-level problem. Mirrors the repo's
// first-failure convention (jobs/outreach) while naming the offending field.
export function validateLeadPayload(body) {
  const input = body && typeof body === 'object' ? body : {}

  const farmName = String(input.farmName ?? '').trim()
  if (!farmName) return { ok: false, error: 'farmName is required.' }
  if (farmName.length > MAX_FIELD_LENGTH) {
    return { ok: false, error: `farmName must be ${MAX_FIELD_LENGTH} characters or fewer.` }
  }

  const contactName = String(input.contactName ?? '').trim()
  if (!contactName) return { ok: false, error: 'contactName is required.' }
  if (contactName.length > MAX_FIELD_LENGTH) {
    return { ok: false, error: `contactName must be ${MAX_FIELD_LENGTH} characters or fewer.` }
  }

  const email = String(input.email ?? '').trim()
  if (!email) return { ok: false, error: 'email is required.' }
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: `email must be ${MAX_EMAIL_LENGTH} characters or fewer.` }
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'email must be a valid email address.' }
  }

  let acreRange = null
  if (input.acreRange != null && String(input.acreRange).trim() !== '') {
    acreRange = String(input.acreRange).trim()
    if (acreRange.length > MAX_ACRE_RANGE_LENGTH) {
      return { ok: false, error: `acreRange must be ${MAX_ACRE_RANGE_LENGTH} characters or fewer.` }
    }
  }

  let source = DEFAULT_SOURCE
  if (input.source != null && String(input.source).trim() !== '') {
    source = String(input.source).trim()
    if (source.length > MAX_SOURCE_LENGTH) {
      return { ok: false, error: `source must be ${MAX_SOURCE_LENGTH} characters or fewer.` }
    }
  }

  return {
    ok: true,
    value: {
      farm_name: farmName,
      contact_name: contactName,
      email,
      acre_range: acreRange,
      source,
    },
  }
}

function isDuplicateKeyError(err) {
  return Boolean(err && (err.code === '23505' || /duplicate key/i.test(String(err.message || ''))))
}

// Core insert-or-return-existing logic, dependency-injected so tests can run it
// without any live database. `findByEmail` must resolve a row or null by
// case-insensitive email; `insertLead` must insert and return the stored row
// (throwing a 23505-style error on a unique violation).
export async function storeLead({ findByEmail, insertLead }, payload) {
  let existing = await findByEmail(payload.email)
  if (existing) {
    return { status: 200, body: { ok: true, lead: existing, alreadyExists: true } }
  }

  let inserted
  try {
    inserted = await insertLead(payload)
  } catch (err) {
    // Race backstop: two concurrent requests for the same new email — one
    // insert wins, the loser hits the unique index and returns the winner.
    if (isDuplicateKeyError(err)) {
      const duplicate = await findByEmail(payload.email)
      if (duplicate) {
        return { status: 200, body: { ok: true, lead: duplicate, alreadyExists: true } }
      }
    }
    throw err
  }

  return { status: 201, body: { ok: true, id: inserted.id, alreadyExists: false } }
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || ''
  const first = String(forwarded).split(',')[0].trim()
  return first || 'unknown'
}

export default async function handler(req, res) {
  if (!hasFieldLedgerServiceConfig()) {
    return json(res, 503, { error: 'FieldLedger lead mirror is not configured on the server.' })
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const expectedToken = String(process.env.FIELD_LEDGER_LEADS_TOKEN || '').trim()
  if (expectedToken) {
    const provided = getBearerToken(req)
    if (!provided || provided !== expectedToken) {
      return json(res, 401, { error: 'Unauthorized.' })
    }
  }

  const contentLength = Number(req.headers?.['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return json(res, 413, { error: 'Request body too large.' })
  }

  const body = getRequestBody(req)
  if (JSON.stringify(body || {}).length > MAX_BODY_BYTES) {
    return json(res, 413, { error: 'Request body too large.' })
  }

  const validation = validateLeadPayload(body)
  if (!validation.ok) {
    return json(res, 400, { error: validation.error })
  }

  const rateResult = consumeRateLimit(clientIp(req))
  if (!rateResult.allowed) {
    return json(res, 429, {
      error: 'Rate limit exceeded. Please try again shortly.',
      retryAfterSeconds: rateResult.retryAfterSeconds,
    })
  }

  const client = createClient(
    String(process.env.SUPABASE_URL).trim(),
    String(process.env.SUPABASE_SERVICE_ROLE_KEY).trim(),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  const findByEmail = async (email) => {
    const { data, error } = await client
      .from('fieldledger_leads')
      .select('*')
      .ilike('email', email)
      .maybeSingle()
    if (error) throw error
    return data
  }

  const insertLead = async (payload) => {
    const { data, error } = await client
      .from('fieldledger_leads')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  try {
    const result = await storeLead({ findByEmail, insertLead }, validation.value)
    return json(res, result.status, result.body)
  } catch (err) {
    return json(res, 500, { error: err?.message || 'Failed to store FieldLedger lead.' })
  }
}