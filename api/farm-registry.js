import { json, getBearerToken, getRequestBody } from './_lib/http.js'
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
  hasSupabaseServerConfig,
} from './_lib/supabase.js'

const OWNERSHIP = new Set(['owned','cash_rent','crop_share','flex_lease','custom_farmed','grazing_lease','other'])
const PROGRAMS = new Set(['conventional','certified_organic','transitional_organic','organic_practices','regenerative','non_gmo','identity_preserved','other'])

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function cleanNumber(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export default async function handler(req, res) {
  if (!hasSupabaseServerConfig()) {
    return json(res, 503, { error: 'Server-side Supabase environment is not configured.' })
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const token = getBearerToken(req)
  const { user, error: userError } = await getAuthenticatedUser(token)
  if (userError || !user) return json(res, 401, { error: 'Unauthorized.' })

  const client = createSupabaseServerClient(token)
  if (!client) return json(res, 503, { error: 'Farm database is unavailable.' })

  if (req.method === 'GET') {
    const [farmsResult, fieldsResult, seasonsResult] = await Promise.all([
      client.from('farms').select('*').eq('user_id', user.id).order('name'),
      client.from('fields').select('*').eq('user_id', user.id).eq('archived', false).order('name'),
      client.from('field_seasons').select('*').eq('user_id', user.id).order('crop_year', { ascending: false }),
    ])
    const error = farmsResult.error || fieldsResult.error || seasonsResult.error
    if (error) {
      const missing = /relation .* does not exist|schema cache/i.test(error.message || '')
      return json(res, missing ? 503 : 500, {
        error: missing
          ? 'Farm Operations tables are not installed yet. Apply supabase/farm-operations-migration.sql.'
          : error.message,
      })
    }
    return json(res, 200, {
      farms: farmsResult.data || [],
      fields: fieldsResult.data || [],
      seasons: seasonsResult.data || [],
    })
  }

  const body = getRequestBody(req)
  const action = cleanText(body.action, 50)

  if (action === 'create_farm') {
    const name = cleanText(body.name, 120)
    if (!name) return json(res, 400, { error: 'Farm name is required.' })
    const { data, error } = await client.from('farms').insert({
      user_id: user.id,
      name,
      business_name: cleanText(body.business_name, 160) || null,
      notes: cleanText(body.notes, 4000) || null,
    }).select().single()
    if (error) return json(res, 500, { error: error.message })
    return json(res, 201, { farm: data })
  }

  if (action === 'create_field') {
    const name = cleanText(body.name, 120)
    const farmId = cleanText(body.farm_id, 80)
    if (!name || !farmId) return json(res, 400, { error: 'Farm and field name are required.' })

    const ownership = OWNERSHIP.has(body.ownership_type) ? body.ownership_type : 'owned'
    const program = PROGRAMS.has(body.production_program) ? body.production_program : 'conventional'
    const latitude = cleanNumber(body.latitude)
    const longitude = cleanNumber(body.longitude)

    const payload = {
      user_id: user.id,
      farm_id: farmId,
      name,
      field_number: cleanText(body.field_number, 80) || null,
      ownership_type: ownership,
      stated_acres: cleanNumber(body.stated_acres),
      rent_per_acre: cleanNumber(body.rent_per_acre),
      production_program: program,
      certifier_name: cleanText(body.certifier_name, 160) || null,
      notes: cleanText(body.notes, 4000) || null,
    }
    if (latitude != null && longitude != null) {
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return json(res, 400, { error: 'GPS latitude or longitude is outside the valid range.' })
      }
      payload.center_point = { type: 'Point', coordinates: [longitude, latitude] }
    }

    const { data, error } = await client.from('fields').insert(payload).select().single()
    if (error) return json(res, 500, { error: error.message })
    return json(res, 201, { field: data })
  }

  if (action === 'create_season') {
    const fieldId = cleanText(body.field_id, 80)
    const cropYear = Number(body.crop_year)
    if (!fieldId || !Number.isInteger(cropYear)) {
      return json(res, 400, { error: 'Field and crop year are required.' })
    }
    const { data, error } = await client.from('field_seasons').insert({
      user_id: user.id,
      field_id: fieldId,
      crop_year: cropYear,
      crop_name: cleanText(body.crop_name, 120) || null,
      variety: cleanText(body.variety, 120) || null,
      intended_use: cleanText(body.intended_use, 80) || 'commercial',
      planted_acres: cleanNumber(body.planted_acres),
      notes: cleanText(body.notes, 4000) || null,
    }).select().single()
    if (error) return json(res, 500, { error: error.message })
    return json(res, 201, { season: data })
  }

  return json(res, 400, { error: 'Unknown farm registry action.' })
}
