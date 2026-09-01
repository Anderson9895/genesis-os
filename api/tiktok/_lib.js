import { getBearerToken } from '../_lib/http.js'
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
  hasSupabaseServerConfig,
} from '../_lib/supabase.js'
import { getAccessToken, getRefreshToken, vaultConfigured } from './tokenStore.js'

export const TIKTOK_API_ROOT = 'https://open.tiktokapis.com'

export function getTikTokConfig() {
  return {
    clientKey: String(process.env.TIKTOK_CLIENT_KEY || '').trim(),
    clientSecretConfigured: Boolean(String(process.env.TIKTOK_CLIENT_SECRET || '').trim()),
    accessToken: getAccessToken() || '',
    refreshToken: getRefreshToken() || null,
    auditApproved: String(process.env.TIKTOK_AUDIT_APPROVED || '').toLowerCase() === 'true',
    redirectUri: String(process.env.TIKTOK_REDIRECT_URI || '').trim(),
    vault: vaultConfigured(),
  }
}

export async function requireTikTokUser(req) {
  if (!hasSupabaseServerConfig()) {
    return { error: 'Server-side Supabase environment is not configured.', status: 503 }
  }

  const accessToken = getBearerToken(req)
  const { user, error } = await getAuthenticatedUser(accessToken)
  if (error || !user) return { error: 'Unauthorized.', status: 401 }

  const client = createSupabaseServerClient(accessToken)
  if (!client) return { error: 'Server-side database is unavailable.', status: 503 }
  return { user, client }
}

export async function callTikTok(path, { accessToken, body }) {
  const response = await fetch(`${TIKTOK_API_ROOT}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json().catch(() => ({}))
  const apiError = payload?.error

  if (!response.ok || (apiError?.code && apiError.code !== 'ok')) {
    const message = apiError?.message || payload?.error_description || `TikTok request failed (${response.status}).`
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export function postingReadiness(config) {
  const missing = []
  if (!config.clientKey) missing.push('TikTok client key')
  if (!config.clientSecretConfigured) missing.push('TikTok client secret')
  if (!config.redirectUri) missing.push('approved redirect URI')
  if (!config.accessToken) missing.push('authorized TikTok account token')
  return { ready: missing.length === 0, missing }
}
