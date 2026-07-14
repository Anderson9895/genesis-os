export function json(res, status, payload) {
  res.status(status).json(payload)
}

export function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  const parts = String(header).split(' ')

  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

export function getRequestBody(req) {
  if (!req?.body) return {}
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }

  return req.body
}
