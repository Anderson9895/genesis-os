import { estimateTokenCount } from './config.js'

function getApiKeyForProvider(provider) {
  const normalized = String(provider || '').toLowerCase()
  if (normalized === 'openai') return String(process.env.OPENAI_API_KEY || '').trim()
  if (normalized === 'anthropic') return String(process.env.ANTHROPIC_API_KEY || '').trim()
  return ''
}

export function isCloudProviderConfigured(provider) {
  return Boolean(getApiKeyForProvider(provider))
}

function toMessageList(messages) {
  if (!Array.isArray(messages)) return []

  return messages
    .map((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : 'user'
      const content = String(item?.content || '').trim()
      return { role, content }
    })
    .filter((item) => Boolean(item.content))
}

async function requestOpenAI({ apiKey, model, systemPrompt, messages, temperature, maxTokens }) {
  const payload = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      ...toMessageList(messages),
    ],
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  const usage = data?.usage || {}

  return {
    text: typeof content === 'string' ? content.trim() : '',
    inputTokens: Number(usage.prompt_tokens || 0),
    outputTokens: Number(usage.completion_tokens || 0),
    totalTokens: Number(usage.total_tokens || 0),
  }
}

async function requestAnthropic({ apiKey, model, systemPrompt, messages, temperature, maxTokens }) {
  const payload = {
    model,
    system: systemPrompt,
    max_tokens: maxTokens,
    temperature,
    messages: toMessageList(messages).map((item) => ({
      role: item.role,
      content: [{ type: 'text', text: item.content }],
    })),
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Anthropic request failed with status ${response.status}`)
  }

  const data = await response.json()
  const content = Array.isArray(data?.content)
    ? data.content.find((item) => item?.type === 'text')?.text
    : ''

  return {
    text: typeof content === 'string' ? content.trim() : '',
    inputTokens: Number(data?.usage?.input_tokens || 0),
    outputTokens: Number(data?.usage?.output_tokens || 0),
    totalTokens: Number((data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0)),
  }
}

export async function generateCloudCompletion({ provider, model, systemPrompt, messages }) {
  const apiKey = getApiKeyForProvider(provider)

  if (!apiKey) {
    throw new Error(`${provider} is not configured.`)
  }

  const temperature = 0.4
  const maxTokens = 550

  let result
  if (provider === 'anthropic') {
    result = await requestAnthropic({ apiKey, model, systemPrompt, messages, temperature, maxTokens })
  } else {
    result = await requestOpenAI({ apiKey, model, systemPrompt, messages, temperature, maxTokens })
  }

  if (!result.text) {
    throw new Error('Cloud provider returned an empty response.')
  }

  if (!result.totalTokens) {
    const estimatedInput = estimateTokenCount(systemPrompt, ...messages.map((item) => item.content))
    const estimatedOutput = estimateTokenCount(result.text)
    result.inputTokens = estimatedInput
    result.outputTokens = estimatedOutput
    result.totalTokens = estimatedInput + estimatedOutput
  }

  return result
}
