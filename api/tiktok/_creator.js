import { json } from '../_lib/http.js'
import { callTikTok, getTikTokConfig, postingReadiness, requireTikTokUser } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })
  const auth = await requireTikTokUser(req)
  if (auth.error) return json(res, auth.status, { error: auth.error })
  const config = getTikTokConfig()
  const readiness = postingReadiness(config)
  if (!readiness.ready) return json(res, 409, { error: `TikTok is not connected: ${readiness.missing.join(', ')}.` })

  try {
    const payload = await callTikTok('/v2/post/publish/creator_info/query/', { accessToken: config.accessToken, body: {} })
    return json(res, 200, { creator: payload?.data?.creator_info || null })
  } catch (error) {
    return json(res, error.status || 502, { error: error.message })
  }
}
