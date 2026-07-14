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
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
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

function normalizeEmployeeActivity(rawActivity) {
  if (!Array.isArray(rawActivity)) return []

  return rawActivity
    .map((item) => ({
      name: String(item?.name || '').trim(),
      role: String(item?.role || '').trim(),
      status: String(item?.status || '').trim() || 'Idle',
    }))
    .filter((item) => item.name)
    .slice(0, 24)
}

function buildDataSnapshot({ tasks, equipment, livestock, finance, pastures, memories, aiEmployeeActivity }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const openTasks = tasks.filter((task) => !task.done)
  const missionTasks = openTasks.filter((task) => {
    const dueDate = parseDate(task.due_date)
    if (dueDate) {
      dueDate.setHours(0, 0, 0, 0)
      return dueDate <= today
    }

    const createdAt = parseDate(task.created_at)
    if (!createdAt) return false

    createdAt.setHours(0, 0, 0, 0)
    return createdAt.getTime() === today.getTime()
  })

  const overdueTasks = openTasks.filter((task) => {
    const dueDate = parseDate(task.due_date)
    if (!dueDate) return false

    dueDate.setHours(0, 0, 0, 0)
    return dueDate < today
  })

  const equipmentDue = equipment.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    if (status === 'maintenance due' || status === 'out of service' || status === 'in repair') return true

    const nextService = parseDate(item.next_service_date)
    if (!nextService) return false

    nextService.setHours(0, 0, 0, 0)
    return nextService <= today
  })

  const livestockAlerts = livestock.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status === 'medical' || status === 'quarantine'
  })

  const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const thisMonthRecords = finance.filter((item) => String(item.date || '').startsWith(thisMonthKey))

  const monthlyIncome = thisMonthRecords
    .filter((item) => item.transaction_type === 'income')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const monthlyExpenses = thisMonthRecords
    .filter((item) => item.transaction_type === 'expense')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const overstockedPastures = pastures.filter((item) => {
    const cap = Number(item.carrying_capacity)
    const herd = Number(item.current_herd)
    if (Number.isNaN(cap) || Number.isNaN(herd) || cap <= 0) return false
    return herd > cap
  })

  const restingPastures = pastures.filter((item) => {
    const restDate = parseDate(item.rest_until_date)
    if (!restDate) return false

    restDate.setHours(0, 0, 0, 0)
    return restDate >= today
  })

  const activeAiEmployees = aiEmployeeActivity.filter((item) => String(item.status).toLowerCase() === 'working')

  return {
    missionTasks,
    overdueTasks,
    equipmentDue,
    livestockAlerts,
    monthlyIncome,
    monthlyExpenses,
    monthlyNet: monthlyIncome - monthlyExpenses,
    overstockedPastures,
    restingPastures,
    totalPastures: pastures.length,
    activeAiEmployees,
    totalAiEmployees: aiEmployeeActivity.length,
    memoryHighlights: memories.slice(0, 5),
  }
}

function buildLocalBriefing(snapshot) {
  const topPriorities = []

  if (snapshot.overdueTasks.length > 0) {
    topPriorities.push(`Clear ${snapshot.overdueTasks.length} overdue mission task${snapshot.overdueTasks.length === 1 ? '' : 's'}.`)
  }

  if (snapshot.equipmentDue.length > 0) {
    topPriorities.push(`Schedule service for ${snapshot.equipmentDue.length} equipment item${snapshot.equipmentDue.length === 1 ? '' : 's'} due now.`)
  }

  if (snapshot.livestockAlerts.length > 0) {
    topPriorities.push(`Review ${snapshot.livestockAlerts.length} livestock alert${snapshot.livestockAlerts.length === 1 ? '' : 's'} requiring attention.`)
  }

  if (topPriorities.length < 3 && snapshot.missionTasks.length > 0) {
    topPriorities.push(`Advance ${snapshot.missionTasks.length} today mission task${snapshot.missionTasks.length === 1 ? '' : 's'} before noon.`)
  }

  if (topPriorities.length < 3) {
    topPriorities.push('Review monthly financial movement and confirm today spending priorities.')
  }

  if (topPriorities.length < 3) {
    topPriorities.push('Capture one ranch operations update in Genesis OS before end of day.')
  }

  const importantAlerts = []

  if (snapshot.livestockAlerts.length > 0) {
    importantAlerts.push(`${snapshot.livestockAlerts.length} livestock record${snapshot.livestockAlerts.length === 1 ? '' : 's'} flagged as medical or quarantine.`)
  }

  if (snapshot.equipmentDue.length > 0) {
    importantAlerts.push(`${snapshot.equipmentDue.length} equipment item${snapshot.equipmentDue.length === 1 ? '' : 's'} marked due, out of service, or in repair.`)
  }

  if (snapshot.overstockedPastures.length > 0) {
    importantAlerts.push(`${snapshot.overstockedPastures.length} pasture${snapshot.overstockedPastures.length === 1 ? '' : 's'} currently over carrying capacity.`)
  }

  if (importantAlerts.length === 0) {
    importantAlerts.push('No urgent operational alerts detected this morning.')
  }

  const financialSnapshot = `This month: income ${toCurrency(snapshot.monthlyIncome)}, expenses ${toCurrency(snapshot.monthlyExpenses)}, net ${toCurrency(snapshot.monthlyNet)}.`

  const ranchStatus = `${snapshot.missionTasks.length} mission task${snapshot.missionTasks.length === 1 ? '' : 's'} due today, ${snapshot.livestockAlerts.length} livestock alert${snapshot.livestockAlerts.length === 1 ? '' : 's'}, ${snapshot.equipmentDue.length} maintenance item${snapshot.equipmentDue.length === 1 ? '' : 's'} due, ${snapshot.overstockedPastures.length} overstocked pasture${snapshot.overstockedPastures.length === 1 ? '' : 's'}.`

  const aiEmployeeStatus = snapshot.totalAiEmployees > 0
    ? `${snapshot.activeAiEmployees.length} of ${snapshot.totalAiEmployees} AI employees currently marked Working.`
    : 'AI employee activity is not yet available in local session data.'

  const recommendedNextAction = topPriorities[0]

  const summaryText = [
    `Top priorities: ${topPriorities.slice(0, 3).join(' ')}`,
    `Alerts: ${importantAlerts.join(' ')}`,
    `Financial snapshot: ${financialSnapshot}`,
    `Ranch status: ${ranchStatus}`,
    `AI employee status: ${aiEmployeeStatus}`,
    `Recommended next action: ${recommendedNextAction}`,
  ].join(' ')

  const spokenText = [
    'Good morning. Here is your Genesis Daily Briefing.',
    `Top priorities. ${topPriorities.slice(0, 3).join(' ')}`,
    `Important alerts. ${importantAlerts.join(' ')}`,
    `Financial snapshot. ${financialSnapshot}`,
    `Ranch status. ${ranchStatus}`,
    `AI employee status. ${aiEmployeeStatus}`,
    `Recommended next action. ${recommendedNextAction}`,
  ].join(' ')

  return {
    top_priorities: topPriorities.slice(0, 3),
    important_alerts: importantAlerts,
    financial_snapshot: financialSnapshot,
    ranch_status: ranchStatus,
    ai_employee_status: aiEmployeeStatus,
    recommended_next_action: recommendedNextAction,
    summary_text: summaryText,
    spoken_text: spokenText,
  }
}

function buildCloudSystemPrompt(snapshot) {
  const memoryTitles = snapshot.memoryHighlights.map((item) => `${item.category}: ${item.title}`)

  return [
    'You are Genesis OS Daily Briefing AI.',
    'Generate a concise morning briefing from live ranch and business data.',
    'Respond with valid JSON only (no markdown, no code fences).',
    'Use this exact JSON shape:',
    '{"top_priorities":["","",""],"important_alerts":[""],"financial_snapshot":"","ranch_status":"","ai_employee_status":"","recommended_next_action":"","summary_text":"","spoken_text":""}',
    'Constraints:',
    '- top_priorities must contain exactly 3 short items.',
    '- Keep tone practical and action-oriented.',
    '- Never include secrets, keys, credentials, or account numbers.',
    '',
    'Live data snapshot:',
    `- Mission tasks due today: ${snapshot.missionTasks.length}`,
    `- Overdue tasks: ${snapshot.overdueTasks.length}`,
    `- Equipment due: ${snapshot.equipmentDue.length}`,
    `- Livestock alerts: ${snapshot.livestockAlerts.length}`,
    `- Monthly income: ${toCurrency(snapshot.monthlyIncome)}`,
    `- Monthly expenses: ${toCurrency(snapshot.monthlyExpenses)}`,
    `- Monthly net: ${toCurrency(snapshot.monthlyNet)}`,
    `- Pastures total: ${snapshot.totalPastures}`,
    `- Pastures resting: ${snapshot.restingPastures.length}`,
    `- Pastures overstocked: ${snapshot.overstockedPastures.length}`,
    `- Active AI employees: ${snapshot.activeAiEmployees.length}`,
    `- Total AI employees: ${snapshot.totalAiEmployees}`,
    `- Memory highlights: ${memoryTitles.length > 0 ? memoryTitles.join(' | ') : 'none'}`,
  ].join('\n')
}

function parseCloudBriefing(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null

  let candidate = trimmed

  if (candidate.startsWith('```')) {
    candidate = candidate.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim()
  }

  const first = candidate.indexOf('{')
  const last = candidate.lastIndexOf('}')
  if (first >= 0 && last > first) {
    candidate = candidate.slice(first, last + 1)
  }

  try {
    const parsed = JSON.parse(candidate)

    const topPriorities = Array.isArray(parsed.top_priorities)
      ? parsed.top_priorities.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : []

    while (topPriorities.length < 3) {
      topPriorities.push('Review today mission priorities and assign first action.')
    }

    const importantAlerts = Array.isArray(parsed.important_alerts)
      ? parsed.important_alerts.map((item) => String(item || '').trim()).filter(Boolean)
      : []

    return {
      top_priorities: topPriorities,
      important_alerts: importantAlerts.length > 0 ? importantAlerts : ['No urgent operational alerts detected this morning.'],
      financial_snapshot: String(parsed.financial_snapshot || '').trim(),
      ranch_status: String(parsed.ranch_status || '').trim(),
      ai_employee_status: String(parsed.ai_employee_status || '').trim(),
      recommended_next_action: String(parsed.recommended_next_action || '').trim(),
      summary_text: String(parsed.summary_text || '').trim(),
      spoken_text: String(parsed.spoken_text || '').trim(),
    }
  } catch {
    return null
  }
}

async function collectLiveData(client, userId, aiEmployeeActivity) {
  const [tasksResult, financeResult, livestockResult, equipmentResult, pastureResult, memoriesResult] = await Promise.all([
    client.from('tasks').select('*').eq('user_id', userId),
    client.from('finance_transactions').select('*').eq('user_id', userId),
    client.from('livestock_records').select('*').eq('user_id', userId),
    client.from('equipment_records').select('*').eq('user_id', userId),
    client.from('pasture_records').select('*').eq('user_id', userId),
    client.from('companion_memories').select('title, category, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }),
  ])

  const anyError = tasksResult.error
    || financeResult.error
    || livestockResult.error
    || equipmentResult.error
    || pastureResult.error
    || memoriesResult.error

  if (anyError) {
    throw anyError
  }

  return {
    tasks: Array.isArray(tasksResult.data) ? tasksResult.data : [],
    finance: Array.isArray(financeResult.data) ? financeResult.data : [],
    livestock: Array.isArray(livestockResult.data) ? livestockResult.data : [],
    equipment: Array.isArray(equipmentResult.data) ? equipmentResult.data : [],
    pastures: Array.isArray(pastureResult.data) ? pastureResult.data : [],
    memories: Array.isArray(memoriesResult.data) ? memoriesResult.data : [],
    aiEmployeeActivity: normalizeEmployeeActivity(aiEmployeeActivity),
  }
}

async function saveBriefing(client, userId, briefing, runtime) {
  const payload = {
    user_id: userId,
    top_priorities: briefing.top_priorities,
    important_alerts: briefing.important_alerts,
    financial_snapshot: briefing.financial_snapshot,
    ranch_status: briefing.ranch_status,
    ai_employee_status: briefing.ai_employee_status,
    recommended_next_action: briefing.recommended_next_action,
    summary_text: briefing.summary_text,
    spoken_text: briefing.spoken_text,
    source_mode: runtime.mode,
    source_provider: runtime.provider,
    source_model: runtime.model,
    cloud_active: Boolean(runtime.cloudActive),
  }

  const { data, error } = await client
    .from('daily_briefings')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  return data
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
    const { data, error } = await client
      .from('daily_briefings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40)

    if (error) {
      return json(res, 500, { error: error.message || 'Unable to load daily briefings.' })
    }

    return json(res, 200, { briefings: Array.isArray(data) ? data : [] })
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const rateResult = consumeRateLimit(user.id)
  if (!rateResult.allowed) {
    return json(res, 429, {
      error: 'Rate limit exceeded. Please try again shortly.',
      retryAfterSeconds: rateResult.retryAfterSeconds,
    })
  }

  const body = getRequestBody(req)

  try {
    const liveData = await collectLiveData(client, user.id, body.aiEmployeeActivity)
    const snapshot = buildDataSnapshot(liveData)

    const settings = await getAiSettings(client, user.id)
    const provider = isSupportedProvider(settings.provider) ? settings.provider : 'openai'
    const model = resolveModel(provider, settings.model)

    const cloudRequested = settings.preferred_mode === 'cloud'
    const cloudConfigured = isCloudProviderConfigured(provider)

    let runtime = {
      mode: 'local',
      provider: 'local-free',
      model: 'template-v1',
      cloudActive: false,
      reason: 'Local Free Mode selected.',
    }

    let finalBriefing = buildLocalBriefing(snapshot)

    if (cloudRequested && cloudConfigured) {
      const monthlyUsage = await getMonthlyUsage(client, user.id)

      if (monthlyUsage.tokens >= settings.monthly_usage_cap_tokens || monthlyUsage.costUsd >= settings.spending_limit_usd) {
        runtime = {
          mode: 'local',
          provider: 'local-free',
          model: 'template-v1',
          cloudActive: false,
          reason: `Cloud usage cap reached. This month: ${monthlyUsage.tokens} tokens, ${toCurrency(monthlyUsage.costUsd)}.`,
        }
      } else {
        try {
          const systemPrompt = buildCloudSystemPrompt(snapshot)
          const cloud = await generateCloudCompletion({
            provider,
            model,
            systemPrompt,
            messages: [{ role: 'user', content: 'Generate the daily briefing now.' }],
          })

          const parsed = parseCloudBriefing(cloud.text)

          if (parsed) {
            finalBriefing = parsed
          }

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

          runtime = {
            mode: 'cloud',
            provider,
            model,
            cloudActive: true,
            reason: 'Cloud AI generated the briefing.',
          }
        } catch {
          runtime = {
            mode: 'local',
            provider: 'local-free',
            model: 'template-v1',
            cloudActive: false,
            reason: 'Cloud AI unavailable, so Local Free Mode generated the briefing.',
          }
        }
      }
    } else if (cloudRequested && !cloudConfigured) {
      runtime = {
        mode: 'local',
        provider: 'local-free',
        model: 'template-v1',
        cloudActive: false,
        reason: `Cloud key for ${provider} is not configured.`,
      }
    }

    const saved = await saveBriefing(client, user.id, finalBriefing, runtime)

    return json(res, 200, {
      briefing: saved,
      mode: runtime.mode,
      provider: runtime.provider,
      model: runtime.model,
      cloudActive: runtime.cloudActive,
      reason: runtime.reason,
    })
  } catch (error) {
    return json(res, 500, { error: error?.message || 'Unable to generate daily briefing.' })
  }
}
