// Genesis OS — TikTok OAuth callback (code -> token exchange, server-side).
//
// INTERNAL BUILD + HONESTY: The Redirection/Login Kit callback that TikTok hits
// after the owner authorizes the app. It exchanges the one-time `code` for an
// access/refresh token using the SERVER-ONLY client secret, and persists the
// token into the secure server-side token vault.
//
// NOT LIVE. No registered app, no credentials, and no server-side persistence
// endpoint exists yet, so when this runs without a real configured environment
// it returns a truthful 503. It never logs, returns, or prints a token, and it
// never asks the owner to paste one into chat.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { json, getRequestBody } from '../_lib/http.js'
import {
  getClientKey,
  getClientSecret,
  getRedirectUri,
} from './_tokenStore.js'

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'

function stateSecret() {
  return String(process.env.TIKTOK_OAUTH_STATE_SECRET || process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || '').trim()
}

function cookieValue(req, name) {
  const cookie = String(req.headers?.cookie || '')
  const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ''
}

function validState(value, expectedCookie) {
  if (!value || !expectedCookie || value !== expectedCookie || stateSecret().length < 32) return false
  const [nonce, signature] = value.split('.')
  if (!nonce || !signature) return false
  const expected = createHmac('sha256', stateSecret()).update(nonce).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function exchangeCode(code, config) {
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  })
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.error_description || payload.error || `Token exchange failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }

  const body = req.method === 'POST' ? getRequestBody(req) : {}
  const code = req.method === 'GET' ? String(req.query?.code || '').trim() : String(body.code || '').trim()
  const state = req.method === 'GET' ? String(req.query?.state || '').trim() : String(body.state || '').trim()
  const config = {
    clientKey: getClientKey(),
    clientSecret: getClientSecret(),
    redirectUri: getRedirectUri(),
  }

  const missing = []
  if (!config.clientKey) missing.push('client key')
  if (!config.clientSecret) missing.push('client secret')
  if (!config.redirectUri) missing.push('redirect URI')
  if (stateSecret().length < 32) missing.push('OAuth state secret')

  if (missing.length) {
    return json(res, 503, {
      error: 'TikTok OAuth callback is not configured.',
      configured: false,
      missing,
      note: 'The developer app must be registered and server secrets configured before any token exchange. No token was requested or stored.',
    })
  }

  if (!code) {
    return json(res, 400, { error: 'Missing authorization code from TikTok.' })
  }
  if (!validState(state, cookieValue(req, 'genesis_tiktok_oauth_state'))) {
    return json(res, 400, { error: 'Invalid or expired OAuth state. Start the TikTok connection again.' })
  }

  try {
    const tokens = await exchangeCode(code, config)

    // Persistence into the encrypted server vault is intentionally NOT
    // performed here because a production secrets-write path (service role
    // + TLS) is not yet configured. The returned token is never echoed.
    res.setHeader('Set-Cookie', 'genesis_tiktok_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/api/tiktok/oauth/callback')
    return json(res, 200, {
      exchanged: true,
      persisted: false,
      note: 'Token exchange succeeded against a live config. Persisting the token into the encrypted vault requires the server-side vault write path, which is not yet configured. Do not copy the token into chat or files.',
      scope_granted: Array.isArray(tokens.scope) ? tokens.scope : String(tokens.scope || ''),
    })
  } catch (error) {
    return json(res, error.status || 502, { error: error.message })
  }
}
