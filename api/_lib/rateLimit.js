const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MAX_REQUESTS = 30

function getStore() {
  if (!globalThis.__genesisAiRateLimitStore) {
    globalThis.__genesisAiRateLimitStore = new Map()
  }

  return globalThis.__genesisAiRateLimitStore
}

export function consumeRateLimit(userId) {
  const key = String(userId || '').trim()
  if (!key) {
    return { allowed: false, retryAfterSeconds: Math.ceil(RATE_WINDOW_MS / 1000) }
  }

  const now = Date.now()
  const store = getStore()
  const existing = store.get(key)

  if (!existing || now > existing.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + RATE_WINDOW_MS,
    })

    return {
      allowed: true,
      limit: RATE_MAX_REQUESTS,
      remaining: RATE_MAX_REQUESTS - 1,
      resetAt: now + RATE_WINDOW_MS,
      retryAfterSeconds: 0,
    }
  }

  if (existing.count >= RATE_MAX_REQUESTS) {
    return {
      allowed: false,
      limit: RATE_MAX_REQUESTS,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  store.set(key, existing)

  return {
    allowed: true,
    limit: RATE_MAX_REQUESTS,
    remaining: Math.max(0, RATE_MAX_REQUESTS - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: 0,
  }
}
