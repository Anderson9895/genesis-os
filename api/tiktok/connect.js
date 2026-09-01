// Genesis OS — TikTok OAuth connect (initiates the video.publish authorization
// flow). INTERNAL BUILD ONLY: not live. The app is NOT registered with TikTok,
// so this returns 503 with the exact missing config until the connection
// checklist steps 1–4 are genuinely completed.
//
// The owner must authorize the campaign account through this flow — never ask
// them to type a token into chat. All secrets are read server-side.

import { json } from '../_lib/http.js'
import {
  getClientKey,
  getRedirectUri,
  getClientSecret,
} from './tokenStore.js'

const SCOPES = encodeURIComponent('user.info.basic,video.publish')
const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'

export function buildAuthUrl(config) {
  const query = new URLSearchParams({
    client_key: config.clientKey,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    state: 'genesis-os-6000-strangers',
  })
  return `${AUTHORIZE_URL}?${query.toString()}`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })

  const config = {
    clientKey: getClientKey(),
    redirectUri: getRedirectUri(),
    clientSecret: getClientSecret(),
  }

  const missing = []
  if (!config.clientKey) missing.push('TikTok client key (register the app first)')
  if (!config.redirectUri) missing.push('approved redirect URI')
  if (!config.clientSecret) missing.push('TikTok client secret')

  if (missing.length) {
    return json(res, 503, {
      error: 'TikTok OAuth is not configured. Register the developer app and add server secrets first.',
      configured: false,
      missing,
      note: 'No authorization URL is produced and no account is authorized until the app is registered and domain-verified.',
    })
  }

  return json(res, 200, {
    configured: true,
    authUrl: buildAuthUrl(config),
    scope: 'user.info.basic,video.publish',
    note: 'Send the owner to authUrl. The callback exchanges the code server-side; no token ever passes through chat or the repository.',
  })
}
