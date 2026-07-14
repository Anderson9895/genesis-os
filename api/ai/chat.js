import {
  DEFAULT_MODE,
  DEFAULT_MONTHLY_SPENDING_LIMIT_USD,
  DEFAULT_MONTHLY_USAGE_CAP_TOKENS,
  estimateCostUSD,
  isSupportedProvider,
  resolveModel,
} from '../_lib/config.js'
import { json, getBearerToken, getRequestBody } from '../_lib/http.js'
import { generateCloudCompletion, isCloudProviderConfigured } from '../_lib/providers.js'
import { consumeRateLimit } from '../_lib/rateLimit.js'
import { createSupabaseServerClient, getAuthenticatedUser, hasSupabaseServerConfig } from '../_lib/supabase.js'

function parseDate(value) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function createLocalResponse(message, context, memoryCount) {
  const text = String(message || '').toLowerCase()

  if (text.includes('priority') || text.includes('today')) {
    return `Top focus for today: ${context.overdueTasks} overdue tasks, ${context.equipmentDue} equipment services due, and ${context.livestockAlerts} livestock alerts. Start with overdue tasks first, then maintenance, then livestock checks.`
  }

  if (text.includes('finance') || text.includes('money') || text.includes('cash')) {
    return `Finance pulse: current month income is ${context.monthlyIncome}, expenses are ${context.monthlyExpenses}, and net is ${context.monthlyNet}.`
  }

  if (text.includes('memory')) {
    return `I currently have ${memoryCount} saved memories for you. Say "Remember that ..." to store new facts intentionally, or use Forget this in the memory panel to delete one.`
  }

  if (text.includes('health') || text.includes('status')) {
    return `System status: ${context.openTasks} open tasks, ${context.equipmentDue} equipment maintenance items due, ${context.overstockedPastures} overstocked pastures, and ${context.activeAiEmployees} active AI employees.`
  }

  return 'I am online and ready. I can help summarize tasks, finance, ranch operations, and project memory. Say "Remember that ..." if you want me to save a fact.'
}

function toCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

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

function buildSystemPrompt({ contextSnapshot, recentMessages, memories }) {
  const context = contextSnapshot || {}
  const recent = (recentMessages || []).slice(-8)
  const memoryBlock = (memories || []).slice(0, 8)

  const lines = [
    'You are Genesis Companion inside Genesis OS.',
    'Be concise, practical, and grounded in the user context provided.',
    'Do not request or store secret credentials.',
    'When uncertain, say what additional data is needed.',
    '',
    'Current dashboard context:',
    `- Open Tasks: ${context.openTasks ?? 0}`,
    `- Overdue Tasks: ${context.overdueTasks ?? 0}`,
    `- Equipment Due: ${context.equipmentDue ?? 0}`,
    `- Livestock Alerts: ${context.livestockAlerts ?? 0}`,
    `- Monthly Income: ${context.monthlyIncome ?? '$0.00'}`,
    `- Monthly Expenses: ${context.monthlyExpenses ?? '$0.00'}`,
    `- Monthly Net: ${context.monthlyNet ?? '$0.00'}`,
    `- Active AI Employees: ${context.activeAiEmployees ?? 0}`,
    `- Overstocked Pastures: ${context.overstockedPastures ?? 0}`,
  ]

  if (recent.length) {
    lines.push('', 'Recent conversation context (oldest to newest):')
    recent.forEach((item) => {
      const role = item.role === 'assistant' ? 'Assistant' : 'User'
      lines.push(`- ${role}: ${item.content}`)
    })
  }

  if (memoryBlock.length) {
    lines.push('', 'Relevant user memory (opt-in):')
    memoryBlock.forEach((item) => {
      lines.push(`- ${item.category}: ${item.title} -> ${item.content}`)
    })
  }

  return lines.join('\n')
}

async function getAiSettings(client, userId) {
  const { data, error } = await client
    .from('companion_ai_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return {
      preferred_mode: DEFAULT_MODE,
      provider: 'openai',
      model: resolveModel('openai', ''),
      monthly_usage_cap_tokens: DEFAULT_MONTHLY_USAGE_CAP_TOKENS,
      spending_limit_usd: DEFAULT_MONTHLY_SPENDING_LIMIT_USD,
    }
  }

  return {
    preferred_mode: data?.preferred_mode || DEFAULT_MODE,
    provider: data?.provider || 'openai',
    model: data?.model || resolveModel(data?.provider || 'openai', ''),
    monthly_usage_cap_tokens: Number(data?.monthly_usage_cap_tokens || DEFAULT_MONTHLY_USAGE_CAP_TOKENS),
    spending_limit_usd: Number(data?.spending_limit_usd || DEFAULT_MONTHLY_SPENDING_LIMIT_USD),
  }
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
    return { tokens: 0, costUsd: 0 }
  }

  return data.reduce((acc, item) => {
    acc.tokens += Number(item.estimated_tokens || 0)
    acc.costUsd += Number(item.estimated_cost_usd || 0)
    return acc
  }, { tokens: 0, costUsd: 0 })
}

async function getMemoryOptIn(client, userId) {
  const { data } = await client
    .from('companion_settings')
    .select('memory_enabled')
    .eq('user_id', userId)
    .maybeSingle()

  return data?.memory_enabled ?? true
}

async function getRecentContext(client, userId, includeMemory) {
  const recentMessagesResult = await client
    .from('companion_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(12)

  const recentMessages = Array.isArray(recentMessagesResult.data)
    ? [...recentMessagesResult.data].reverse()
    : []

  if (!includeMemory) {
    return { recentMessages, memories: [] }
  }

  const memoriesResult = await client
    .from('companion_memories')
    .select('title, category, content, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(8)

  return {
    recentMessages,
    memories: Array.isArray(memoriesResult.data) ? memoriesResult.data : [],
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  if (!hasSupabaseServerConfig()) {
    return json(res, 503, {
      mode: 'local',
      provider: 'local-free',
      model: 'template-v1',
      cloudActive: false,
      error: 'Server-side Supabase environment is not configured.',
    })
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

  const body = getRequestBody(req)
  const message = String(body.message || '').trim()
  const contextSnapshot = body.context && typeof body.context === 'object' ? body.context : {}

  if (!message) {
    return json(res, 400, { error: 'Message is required.' })
  }

  const client = createSupabaseServerClient(accessToken)
  if (!client) {
    return json(res, 503, {
      mode: 'local',
      provider: 'local-free',
      model: 'template-v1',
      cloudActive: false,
      error: 'Server-side database is unavailable.',
    })
  }

  const settings = await getAiSettings(client, user.id)
  const provider = isSupportedProvider(settings.provider) ? settings.provider : 'openai'
  const model = resolveModel(provider, settings.model)

  const cloudRequested = settings.preferred_mode === 'cloud'
  const cloudConfigured = isCloudProviderConfigured(provider)

  const memoryCountResult = await client
    .from('companion_memories')
    .select('id')
    .eq('user_id', user.id)

  const memoryCount = Array.isArray(memoryCountResult.data) ? memoryCountResult.data.length : 0

  if (!cloudRequested || !cloudConfigured) {
    const reply = createLocalResponse(message, contextSnapshot, memoryCount)

    return json(res, 200, {
      reply,
      mode: 'local',
      provider: cloudRequested ? provider : 'local-free',
      model: cloudRequested ? model : 'template-v1',
      cloudActive: false,
      reason: cloudRequested && !cloudConfigured
        ? `Cloud key for ${provider} is not configured.`
        : 'Local Free Mode selected.',
      usage: {
        estimatedTokens: 0,
        estimatedCostUsd: 0,
      },
    })
  }

  const monthlyUsage = await getMonthlyUsage(client, user.id)

  if (monthlyUsage.tokens >= settings.monthly_usage_cap_tokens || monthlyUsage.costUsd >= settings.spending_limit_usd) {
    const reply = createLocalResponse(message, contextSnapshot, memoryCount)

    return json(res, 200, {
      reply,
      mode: 'local',
      provider: 'local-free',
      model: 'template-v1',
      cloudActive: false,
      reason: `Cloud usage cap reached. This month: ${monthlyUsage.tokens} tokens, ${toCurrency(monthlyUsage.costUsd)}.`,
      usage: {
        estimatedTokens: monthlyUsage.tokens,
        estimatedCostUsd: Number(monthlyUsage.costUsd.toFixed(6)),
      },
    })
  }

  const memoryEnabled = await getMemoryOptIn(client, user.id)
  const { recentMessages, memories } = await getRecentContext(client, user.id, memoryEnabled)

  const cleanRecentMessages = recentMessages
    .filter((item) => item?.content)
    .map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content) }))

  const systemPrompt = buildSystemPrompt({
    contextSnapshot,
    recentMessages: cleanRecentMessages,
    memories,
  })

  const userTurn = [...cleanRecentMessages.slice(-6), { role: 'user', content: message }]

  try {
    const cloud = await generateCloudCompletion({
      provider,
      model,
      systemPrompt,
      messages: userTurn,
    })

    const inputTokens = Number(cloud.inputTokens || 0)
    const outputTokens = Number(cloud.outputTokens || 0)
    const totalTokens = Number(cloud.totalTokens || inputTokens + outputTokens)
    const estimatedCostUsd = estimateCostUSD(model, inputTokens, outputTokens)

    await client
      .from('companion_ai_usage')
      .insert({
        user_id: user.id,
        provider,
        model,
        estimated_tokens: totalTokens,
        estimated_cost_usd: estimatedCostUsd,
      })

    return json(res, 200, {
      reply: cloud.text,
      mode: 'cloud',
      provider,
      model,
      cloudActive: true,
      usage: {
        estimatedTokens: totalTokens,
        estimatedCostUsd,
      },
    })
  } catch {
    const reply = createLocalResponse(message, contextSnapshot, memoryCount)

    return json(res, 200, {
      reply,
      mode: 'local',
      provider: 'local-free',
      model: 'template-v1',
      cloudActive: false,
      reason: 'Cloud provider is unavailable right now. Switched to Local Free Mode.',
      usage: {
        estimatedTokens: 0,
        estimatedCostUsd: 0,
      },
    })
  }
}
