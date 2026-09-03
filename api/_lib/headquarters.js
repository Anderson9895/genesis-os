import { json, getBearerToken, getRequestBody } from './http.js'
import { createSupabaseServerClient, getAuthenticatedUser, hasSupabaseServerConfig } from './supabase.js'
import { consumeRateLimit } from './rateLimit.js'
import { getConfiguredAgentProviders } from './agent.js'
import { TEAM, BUILD_CHARTER } from '../../shared/team.js'

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' })
  if (!hasSupabaseServerConfig()) return json(res, 503, { error: 'Database connection is not configured.' })
  const token = getBearerToken(req)
  const { user, error } = await getAuthenticatedUser(token)
  if (error || !user) return json(res, 401, { error: 'Unauthorized.' })
  if (!consumeRateLimit(user.id).allowed) return json(res, 429, { error: 'Please wait a moment before trying again.' })
  const client = createSupabaseServerClient(token)
  if (req.method === 'POST') {
    const body = getRequestBody(req)
    if (body.action === 'enroll') {
      const result = await client.from('hq_agents').upsert(TEAM.map((agent) => ({ user_id: user.id, role_id: agent.id })), { onConflict: 'user_id,role_id', ignoreDuplicates: true })
      if (result.error) return json(res, 500, { error: 'Could not enroll the team.' })
      return json(res, 200, { enrolled: TEAM.length })
    }
    if (body.action !== 'note') return json(res, 400, { error: 'Unknown action.' })
    const title = String(body.title || '').trim()
    const note = String(body.body || '').trim()
    if (!title || title.length > 200 || !note || note.length > 10000) return json(res, 400, { error: 'Provide a title (up to 200 characters) and note (up to 10,000 characters).' })
    const result = await client.from('hq_journal').insert({ user_id: user.id, title, body: note }).select().single()
    if (result.error) return json(res, 500, { error: 'Could not save your team note.' })
    return json(res, 201, { entry: result.data })
  }
  const results = await Promise.all([
    client.from('hq_agents').select('*').eq('user_id', user.id),
    client.from('hq_journal').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    client.from('jobs').select('id,title,assigned_employee,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
  ])
  if (results.some((result) => result.error)) return json(res, 503, { error: 'Headquarters records could not be loaded. Check the database setup.' })
  return json(res, 200, {
    team: TEAM.map((agent) => ({ ...agent, enrolled: results[0].data.some((row) => row.role_id === agent.id) })),
    journal: results[1].data, jobs: results[2].data, charter: BUILD_CHARTER,
    runtime: { providerConfigured: getConfiguredAgentProviders().length > 0, execution: 'drafts_only', schedulerEnabled: false, externalToolsEnabled: false },
  })
}
