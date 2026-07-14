export const SUPPORTED_PROVIDERS = ['openai', 'anthropic']

export const DEFAULT_MODE = 'local'

export const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
}

export const RATE_CARD_PER_1K = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-3-5-haiku-latest': { input: 0.00025, output: 0.00125 },
}

export const DEFAULT_MONTHLY_USAGE_CAP_TOKENS = 200000
export const DEFAULT_MONTHLY_SPENDING_LIMIT_USD = 15

export function isSupportedProvider(provider) {
  return SUPPORTED_PROVIDERS.includes(String(provider || '').toLowerCase())
}

export function resolveModel(provider, requestedModel) {
  const normalizedProvider = String(provider || '').toLowerCase()
  const fallback = DEFAULT_MODELS[normalizedProvider] || DEFAULT_MODELS.openai
  const model = String(requestedModel || '').trim()
  return model || fallback
}

export function estimateTokenCount(...parts) {
  const combined = parts
    .filter(Boolean)
    .map((part) => String(part))
    .join(' ')

  if (!combined) return 0

  // Approximate 1 token ~ 4 chars for rough budgeting.
  return Math.max(1, Math.ceil(combined.length / 4))
}

export function estimateCostUSD(model, inputTokens, outputTokens) {
  const card = RATE_CARD_PER_1K[model]
  if (!card) return 0

  const input = (Number(inputTokens || 0) / 1000) * card.input
  const output = (Number(outputTokens || 0) / 1000) * card.output

  return Number((input + output).toFixed(6))
}
