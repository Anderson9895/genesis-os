import {
  DEFAULT_MODE,
  DEFAULT_MODELS,
  DEFAULT_MONTHLY_SPENDING_LIMIT_USD,
  DEFAULT_MONTHLY_USAGE_CAP_TOKENS,
  isSupportedProvider,
  resolveModel,
} from '../_lib/config.js'
import { json, getBearerToken, getRequestBody } from '../_lib/http.js'
import { isCloudProviderConfigured } from '../_lib/providers.js'
import { createSupabaseServerClient, getAuthenticatedUser, hasSupabaseServerConfig } from '../_lib/supabase.js'

function getMonthWindow() {
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function buildFallbackSettings() {
  return {
    preferred_mode: DEFAULT_MODE,
    provider: 'openai',
    model: DEFAULT_MODELS.openai,
    monthly_usage_cap_tokens: DEFAULT_MONTHLY_USAGE_CAP_TOKENS,
    spending_limit_usd: DEFAULT_MONTHLY_SPENDING_LIMIT_USD,
  }
}

async function getSettings(client, userId) {
  const { data, error } = await client
    .from('companion_ai_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return buildFallbackSettings()
  return { ...buildFallbackSettings(), ...(data || {}) }
}

async function getMonthlyUsage(client, userId) {
  const { startIso, endIso } = getMonthWindow()
  const { data, error } = await client
    .from('companion_ai_usage')
    .select('estimated_tokens, estimated_cost_usd')
    .eq('user_id', userId)
    .gte('created_at', startIso)
    .lt('created_at', endIso)

  if (error || !Array.isArray(data)) {
    return { estimatedTokens: 0, estimatedCostUsd: 0 }
  }

  return data.reduce((acc, row) => {
    acc.estimatedTokens += Number(row.estimated_tokens || 0)
    acc.estimatedCostUsd += Number(row.estimated_cost_usd || 0)
    return acc
  }, { estimatedTokens: 0, estimatedCostUsd: 0 })
}

function summarize(settings, usage) {
  const provider = isSupportedProvider(settings.provider) ? settings.provider : 'openai'
  const model = resolveModel(provider, settings.model)
  const cloudConfigured = isCloudProviderConfigured(provider)
  const mode = settings.preferred_mode === 'cloud' && cloudConfigured ? 'cloud' : 'local'

  return {
    mode,
    provider,
    model,
    preferred_mode: settings.preferred_mode,
    cloudConfigured,
    estimatedUsageTokens: usage.estimatedTokens,
    estimatedCostUsd: Number(usage.estimatedCostUsd.toFixed(6)),
    monthlyUsageCapTokens: Number(settings.monthly_usage_cap_tokens || DEFAULT_MONTHLY_USAGE_CAP_TOKENS),
    spendingLimitUsd: Number(settings.spending_limit_usd || DEFAULT_MONTHLY_SPENDING_LIMIT_USD),
  }
}

export default async function handler(req, res) {
  if (!hasSupabaseServerConfig()) {
    return json(res, 503, { error: 'Server-side Supabase environment is not configured.' })
  }

  const accessToken = getBearerToken(req)
  const { user, error: userError } = await getAuthenticatedUser(accessToken)

  if (userError || !user) {
    return json(res, 401, { error: 'Unauthorized.' })
  }

  const client = createSupabaseServerClient(accessToken)
  if (!client) {
    return json(res, 503, { error: 'Server-side database is unavailable.' })
  }

  if (req.method === 'GET') {
    const settings = await getSettings(client, user.id)
    const usage = await getMonthlyUsage(client, user.id)
    return json(res, 200, summarize(settings, usage))
  }

  if (req.method === 'PATCH') {
    const body = getRequestBody(req)

    const preferredMode = body.preferredMode === 'cloud' ? 'cloud' : DEFAULT_MODE
    const provider = isSupportedProvider(body.provider) ? String(body.provider).toLowerCase() : 'openai'
    const model = resolveModel(provider, body.model)

    const monthlyUsageCapTokens = Math.max(
      1000,
      Number.parseInt(body.monthlyUsageCapTokens, 10) || DEFAULT_MONTHLY_USAGE_CAP_TOKENS
    )

    const spendingLimitUsd = Math.max(
      1,
      Number.parseFloat(body.spendingLimitUsd) || DEFAULT_MONTHLY_SPENDING_LIMIT_USD
    )

    const payload = {
      user_id: user.id,
      preferred_mode: preferredMode,
      provider,
      model,
      monthly_usage_cap_tokens: monthlyUsageCapTokens,
      spending_limit_usd: Number(spendingLimitUsd.toFixed(2)),
      updated_at: new Date().toISOString(),
    }

    const { error } = await client
      .from('companion_ai_settings')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) {
      return json(res, 500, { error: error.message || 'Failed to update AI settings.' })
    }

    const settings = await getSettings(client, user.id)
    const usage = await getMonthlyUsage(client, user.id)
    return json(res, 200, summarize(settings, usage))
  }

  return json(res, 405, { error: 'Method not allowed.' })
}
