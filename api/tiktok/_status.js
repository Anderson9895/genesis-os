import { json } from '../_lib/http.js'
import { getTikTokConfig, postingReadiness, requireTikTokUser } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })
  const auth = await requireTikTokUser(req)
  if (auth.error) return json(res, auth.status, { error: auth.error })

  const config = getTikTokConfig()
  const readiness = postingReadiness(config)
  return json(res, 200, {
    connected: Boolean(config.accessToken),
    configured: readiness.ready,
    auditApproved: config.auditApproved,
    publicPostingUnlocked: readiness.ready && config.auditApproved,
    missing: readiness.missing,
    mode: config.auditApproved ? 'public-direct-post-eligible' : 'private-test-only',
  })
}
