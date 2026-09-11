import test from 'node:test'
import assert from 'node:assert/strict'
import leadsHandler, {
  hasFieldLedgerServiceConfig,
  storeLead,
  validateLeadPayload,
} from '../api/fieldledger/leads.js'

// ---------------------------------------------------------------------------
// Pure validation unit tests — no database, no network.
// ---------------------------------------------------------------------------

test('validation accepts a complete payload and normalizes it to DB shape', () => {
  const result = validateLeadPayload({
    farmName: '  North Pivot Farm  ',
    contactName: ' Terra Grower ',
    email: ' grower@northpivot.example ',
    acreRange: '500–2,500',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.value, {
    farm_name: 'North Pivot Farm',
    contact_name: 'Terra Grower',
    email: 'grower@northpivot.example',
    acre_range: '500–2,500',
    source: 'chatgpt.site',
  })
})

test('validation defaults acreRange to null and source to chatgpt.site when absent', () => {
  const result = validateLeadPayload({
    farmName: 'Green Acres',
    contactName: 'Jane Doe',
    email: 'jane@example.com',
  })

  assert.equal(result.ok, true)
  assert.equal(result.value.acre_range, null)
  assert.equal(result.value.source, 'chatgpt.site')
})

test('validation accepts null/other acre range values as raw strings', () => {
  const result = validateLeadPayload({
    farmName: 'Green Acres',
    contactName: 'Jane Doe',
    email: 'jane@example.com',
    acreRange: 'Selling soon',
  })

  assert.equal(result.ok, true)
  assert.equal(result.value.acre_range, 'Selling soon')
})

test('validation honors an explicit source override', () => {
  const result = validateLeadPayload({
    farmName: 'Green Acres',
    contactName: 'Jane Doe',
    email: 'jane@example.com',
    source: 'fieldledger-ai.fdgfgfdg.chatgpt.site',
  })

  assert.equal(result.ok, true)
  assert.equal(result.value.source, 'fieldledger-ai.fdgfgfdg.chatgpt.site')
})

test('validation rejects missing farmName with a field-level error', () => {
  const result = validateLeadPayload({ contactName: 'Jane', email: 'jane@example.com' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'farmName is required.')
})

test('validation rejects blank contactName with a field-level error', () => {
  const result = validateLeadPayload({ farmName: 'Acres', contactName: '   ', email: 'jane@example.com' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'contactName is required.')
})

test('validation rejects missing email', () => {
  const result = validateLeadPayload({ farmName: 'Acres', contactName: 'Jane' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'email is required.')
})

test('validation rejects malformed email', () => {
  for (const bad of ['not-an-email', 'a@b', 'x@y.', '@example.com', 'jane@']) {
    const result = validateLeadPayload({ farmName: 'Acres', contactName: 'Jane', email: bad })
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(bad)}`)
    assert.equal(result.error, 'email must be a valid email address.')
  }
})

test('validation rejects over-long fields', () => {
  const long = 'x'.repeat(201)
  const tooLong = validateLeadPayload({ farmName: long, contactName: 'Jane', email: 'jane@example.com' })
  assert.equal(tooLong.ok, false)
  assert.equal(tooLong.error, 'farmName must be 200 characters or fewer.')

  const acreTooLong = validateLeadPayload({
    farmName: 'Acres',
    contactName: 'Jane',
    email: 'jane@example.com',
    acreRange: 'y'.repeat(101),
  })
  assert.equal(acreTooLong.ok, false)
  assert.equal(acreTooLong.error, 'acreRange must be 100 characters or fewer.')
})

test('validation rejects non-object bodies', () => {
  assert.equal(validateLeadPayload(null).ok, false)
  assert.equal(validateLeadPayload('nonsense').ok, false)
  assert.equal(validateLeadPayload(undefined).ok, false)
})

// ---------------------------------------------------------------------------
// storeLead: idempotent insert-or-return-existing — injected fake DB layer.
// ---------------------------------------------------------------------------

// `findByEmailResults` is a queue of rows-or-null returned on successive
// findByEmail calls (mirrors the case-insensitive `.ilike('email', …)`
// lookup in the real handler). `insertResult` / `insertError` / `sqlError`
// control what the insert fake does.
function fakeDb({ findByEmailResults = [null], insertResult, insertError, sqlError }) {
  const calls = { findEmailCount: 0, insertCount: 0, emailsChecked: [] }
  const queue = [...findByEmailResults]
  const findByEmail = async (email) => {
    calls.findEmailCount += 1
    calls.emailsChecked.push(email)
    return queue.shift() ?? null
  }
  const insertLead = async () => {
    calls.insertCount += 1
    if (insertError) throw insertError
    if (sqlError) throw sqlError
    return insertResult
  }
  return { calls, findByEmail, insertLead }
}

test('storeLead inserts a new email and returns 201 with the created shape', async () => {
  const row = { id: 'lead-1', email: 'new@example.com', farm_name: 'New Farm', contact_name: 'A', source: 'chatgpt.site', status: 'new' }
  const db = fakeDb({ insertResult: row })
  const payload = { farm_name: 'New Farm', contact_name: 'A', email: 'new@example.com', acre_range: null, source: 'chatgpt.site' }

  const result = await storeLead(db, payload)

  assert.equal(result.status, 201)
  assert.deepEqual(result.body, { ok: true, id: 'lead-1', alreadyExists: false })
  assert.equal(db.calls.insertCount, 1)
  assert.equal(db.calls.findEmailCount, 1)
  assert.deepEqual(db.calls.emailsChecked, ['new@example.com'])
})

test('storeLead returns 200 alreadyExists for a duplicate email and never inserts', async () => {
  const existing = { id: 'lead-1', email: 'DUP@example.com', farm_name: 'First Farm', contact_name: 'B', source: 'chatgpt.site', status: 'new' }
  const db = fakeDb({ findByEmailResults: [existing] })
  const payload = { farm_name: 'Second Farm', contact_name: 'C', email: 'DUP@example.com', acre_range: null, source: 'chatgpt.site' }

  const result = await storeLead(db, payload)

  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.alreadyExists, true)
  assert.equal(result.body.lead.id, 'lead-1')
  assert.equal(db.calls.insertCount, 0)
  assert.deepEqual(db.calls.emailsChecked, ['DUP@example.com'])
})

test('storeLead survives a duplicate-key race by returning the winner as alreadyExists', async () => {
  const winner = { id: 'lead-9', email: 'race@example.com', farm_name: 'Winner', contact_name: 'W', source: 'chatgpt.site', status: 'new' }
  const duplicateKey = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
  const db = fakeDb({ findByEmailResults: [null, winner], insertError: duplicateKey })

  const result = await storeLead(db, { farm_name: 'Loser', contact_name: 'L', email: 'race@example.com', acre_range: null, source: 'chatgpt.site' })

  assert.equal(result.status, 200)
  assert.equal(result.body.alreadyExists, true)
  assert.equal(result.body.lead.id, 'lead-9')
  assert.equal(db.calls.insertCount, 1)
  assert.equal(db.calls.findEmailCount, 2)
})

test('storeLead rethrows real non-duplicate insert errors (handler maps them to 500)', async () => {
  const db = fakeDb({ sqlError: new Error('connection refused') })
  await assert.rejects(
    storeLead(db, { farm_name: 'X', contact_name: 'Y', email: 'x@example.com', acre_range: null, source: 'chatgpt.site' }),
    /connection refused/,
  )
})

test('duplicate-key error without a recoverable row still rethrows', async () => {
  const duplicateKey = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
  const db = fakeDb({ findByEmailResults: [null, null], insertError: duplicateKey })
  await assert.rejects(
    storeLead(db, { farm_name: 'X', contact_name: 'Y', email: 'x@example.com', acre_range: null, source: 'chatgpt.site' }),
    /duplicate key/,
  )
})

// ---------------------------------------------------------------------------
// Handler-level status-code tests — env-stubbed, no live database reached.
// Handler fails before any network call for these paths.
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  FIELD_LEDGER_LEADS_TOKEN: process.env.FIELD_LEDGER_LEADS_TOKEN,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function setEnv(overrides) {
  restoreEnv()
  Object.assign(process.env, overrides)
}

function makeRes() {
  const calls = []
  return {
    calls,
    statusCode: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      calls.push({ status: this.statusCode, payload })
      return this
    },
  }
}

function makeReq(method, body, headers = {}) {
  return { method, url: '/api/fieldledger/leads', headers, body }
}

test('handler returns 503 when the service-role env is not configured', async () => {
  setEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' })
  const res = makeRes()
  await leadsHandler(makeReq('POST', { farmName: 'X' }), res)
  assert.equal(res.statusCode, 503)
  assert.equal(res.payload.error, 'FieldLedger lead mirror is not configured on the server.')
})

test('handler returns 405 for non-POST methods', async () => {
  setEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' })
  const res = makeRes()
  await leadsHandler(makeReq('GET'), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.payload.error, 'Method not allowed.')
})

test('handler enforces the bearer token when FIELD_LEDGER_LEADS_TOKEN is set', async () => {
  setEnv({
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
    FIELD_LEDGER_LEADS_TOKEN: 'shared-secret',
  })
  const noToken = makeRes()
  await leadsHandler(makeReq('POST', { farmName: 'X', contactName: 'Y', email: 'x@example.com' }), noToken)
  assert.equal(noToken.statusCode, 401)

  const badToken = makeRes()
  await leadsHandler(
    makeReq('POST', { farmName: 'X' }, { authorization: 'Bearer wrong' }),
    badToken,
  )
  assert.equal(badToken.statusCode, 401)

  const goodToken = makeRes()
  await leadsHandler(
    makeReq('POST', { farmName: 'X' }, { authorization: 'Bearer shared-secret' }),
    goodToken,
  )
  assert.notEqual(goodToken.statusCode, 401)
})

test('handler skips the token check when FIELD_LEDGER_LEADS_TOKEN is unset', async () => {
  setEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' })
  const res = makeRes()
  await leadsHandler(makeReq('POST', {}), res)
  assert.notEqual(res.statusCode, 401, 'no token gate when env var unset')
})

test('handler returns 413 for oversized bodies', async () => {
  setEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' })
  const huge = 'a'.repeat(1024 * 1024 + 1)
  const res = makeRes()
  await leadsHandler(
    makeReq('POST', { farmName: huge, contactName: 'Y', email: 'x@example.com' }, { 'content-length': String(1024 * 1024 + 1) }),
    res,
  )
  assert.equal(res.statusCode, 413)
  assert.equal(res.payload.error, 'Request body too large.')
})

test('handler returns 400 field errors before touching the database', async () => {
  setEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' })
  const res = makeRes()
  await leadsHandler(makeReq('POST', { farmName: '', contactName: 'Y', email: 'x@example.com' }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.error, 'farmName is required.')
})

test('hasFieldLedgerServiceConfig reflects the env guard', () => {
  setEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' })
  assert.equal(hasFieldLedgerServiceConfig(), true)
  setEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: '' })
  assert.equal(hasFieldLedgerServiceConfig(), false)
})