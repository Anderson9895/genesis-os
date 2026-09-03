// Genesis OS — TikTok OAuth connect (initiates the video.publish authorization
// flow). INTERNAL BUILD ONLY: not live. The app is NOT registered with TikTok,
// so this returns 503 with the exact missing config until the connection
// checklist steps 1–4 are genuinely completed.
//
// The owner must authorize the campaign account through this flow — never ask
// them to type a token into chat. All secrets are read server-side.

import { createHmac, randomBytes } from 'node:crypto'
import { json } from '../_lib/http.js'
import {
  getClientKey,
  getRedirectUri,
  getClientSecret,
} from './_tokenStore.js'

const SCOPES = 'user.info.basic,video.publish'
const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'

function stateSecret() {
  return String(process.env.TIKTOK_OAUTH_STATE_SECRET || process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || '').trim()
}

function createState() {
  const nonce = randomBytes(24).toString('base64url')
  const signature = createHmac('sha256', stateSecret()).update(nonce).digest('base64url')
  return `${nonce}.${signature}`
}

export function buildAuthUrl(config) {
  const query = new URLSearchParams({
    client_key: config.clientKey,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    state: config.state,
  })
  return `${AUTHORIZE_URL}?${query.toString()}`
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })

  const config = {
    clientKey: getClientKey(),
    redirectUri: getRedirectUri(),
    clientSecret: getClientSecret(),
    stateSecret: stateSecret(),
  }

  const missing = []
  if (!config.clientKey) missing.push('TikTok client key (register the app first)')
  if (!config.redirectUri) missing.push('approved redirect URI')
  if (!config.clientSecret) missing.push('TikTok client secret')
  if (config.stateSecret.length < 32) missing.push('OAuth state secret (at least 32 characters)')

  if (missing.length) {
    return json(res, 503, {
      error: 'TikTok OAuth is not configured. Register the developer app and add server secrets first.',
      configured: false,
      missing,
      note: 'No authorization URL is produced and no account is authorized until the app is registered and domain-verified.',
    })
  }

  const state = createState()
  res.setHeader('Set-Cookie', `genesis_tiktok_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/api/tiktok/oauth/callback`)
  return json(res, 200, {
    configured: true,
    authUrl: buildAuthUrl({ ...config, state }),
    scope: 'user.info.basic,video.publish',
    note: 'Send the owner to authUrl. The callback exchanges the code server-side; no token ever passes through chat or the repository.',
  })
}
