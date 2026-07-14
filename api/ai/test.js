import { json, getBearerToken } from '../_lib/http.js'
import { generateCloudCompletion, isCloudProviderConfigured } from '../_lib/providers.js'
import { createSupabaseServerClient, getAuthenticatedUser, hasSupabaseServerConfig } from '../_lib/supabase.js'
import { resolveModel } from '../_lib/config.js'

async function getPreferredCloudConfig(client, userId) {
  const { data } = await client
    .from('companion_ai_settings')
    .select('provider, model, preferred_mode')
    .eq('user_id', userId)
    .maybeSingle()

  const provider = String(data?.provider || 'openai').toLowerCase()
  const model = resolveModel(provider, data?.model)
  const preferredMode = data?.preferred_mode === 'cloud' ? 'cloud' : 'local'

  return { provider, model, preferredMode }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  if (!hasSupabaseServerConfig()) {
    return json(res, 503, { ok: false, error: 'Server-side Supabase environment is not configured.' })
  }

  const accessToken = getBearerToken(req)
  const { user, error: userError } = await getAuthenticatedUser(accessToken)

  if (userError || !user) {
    return json(res, 401, { ok: false, error: 'Unauthorized.' })
  }

  const client = createSupabaseServerClient(accessToken)
  if (!client) {
    return json(res, 503, { ok: false, error: 'Server-side database is unavailable.' })
  }

  const { provider, model, preferredMode } = await getPreferredCloudConfig(client, user.id)

  if (preferredMode !== 'cloud') {
    return json(res, 200, {
      ok: true,
      mode: 'local',
      provider: 'local-free',
      model: 'template-v1',
      message: 'Test successful in Local Free Mode.',
    })
  }

  if (!isCloudProviderConfigured(provider)) {
    return json(res, 200, {
      ok: false,
      mode: 'local',
      provider,
      model,
      message: `Cloud key for ${provider} is not configured.`,
    })
  }

  try {
    const response = await generateCloudCompletion({
      provider,
      model,
      systemPrompt: 'You are Genesis Companion test endpoint. Reply with exactly: CONNECTION_OK',
      messages: [{ role: 'user', content: 'Respond with CONNECTION_OK' }],
    })

    const ok = String(response.text || '').toUpperCase().includes('CONNECTION_OK')

    return json(res, 200, {
      ok,
      mode: ok ? 'cloud' : 'local',
      provider,
      model,
      message: ok ? 'Cloud AI connection is healthy.' : 'Cloud AI responded unexpectedly.',
    })
  } catch {
    return json(res, 200, {
      ok: false,
      mode: 'local',
      provider,
      model,
      message: 'Cloud provider unavailable. Local Free Mode remains active.',
    })
  }
}
