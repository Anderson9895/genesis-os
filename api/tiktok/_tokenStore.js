// Genesis OS — TikTok token vault (server-side only, encrypted seam).
//
// SECURITY RULES (non-negotiable, campaign policy):
//   * Tokens NEVER go in the browser, the repository, logs, chat, or campaign files.
//   * They live only in a server-side encrypted store. Production store = Vercel
//     server environment variables (encrypted secrets), optionally re-encrypted
//     at runtime with TIKTOK_TOKEN_ENCRYPTION_KEY (AES-256-GCM).
//   * Never ask the owner to paste an access/refresh token into chat.
//
// STATUS: This is the implemented secure-storage seam. There is NOT yet a
// registered TikTok app nor live credentials, so `configured` is false until
// the connection checklist steps 1–4 are genuinely done. Nothing is persisted
// at runtime here — the seam reads server-side secrets only, so no secret can
// leak into any artifact.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function secretValue(name) {
  return String(process.env[name] || '').trim()
}

function encryptionKey() {
  // Server-only key. If absent, encryption-at-rest is NOT configured and the
  // vault reports configured=false (the owner must add it to Vercel secrets).
  return secretValue('TIKTOK_TOKEN_ENCRYPTION_KEY')
}

// Encrypt a value with AES-256-GCM using the server-only key.
// Returns { iv, tag, data } (base64) or null if no encryption key is set.
export function encryptToken(plaintext) {
  const key = Buffer.from(encryptionKey(), 'utf8')
  if (!encryptionKey()) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key.slice(0, 32), iv)
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  }
}

// Decrypt a value previously produced by encryptToken(). Returns null on
// failure (never throws secrets into logs).
export function decryptToken(payload) {
  try {
    const key = Buffer.from(encryptionKey(), 'utf8')
    if (!payload || !encryptionKey()) return null
    const decipher = createDecipheriv(ALGO, key.slice(0, 32), Buffer.from(payload.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

// Read the access token from the server-side secrets store. Returns null when
// not configured. A registered app + live authorized credentials do not exist
// yet, so this returns null until the checklist is genuinely completed.
export function getAccessToken() {
  return secretValue('TIKTOK_ACCESS_TOKEN') || null
}

export function getRefreshToken() {
  return secretValue('TIKTOK_REFRESH_TOKEN') || null
}

export function getClientKey() {
  return secretValue('TIKTOK_CLIENT_KEY')
}

export function getClientSecret() {
  return secretValue('TIKTOK_CLIENT_SECRET')
}

export function getRedirectUri() {
  return secretValue('TIKTOK_REDIRECT_URI')
}

// Is the encrypted token vault ready for live use? Requires the server-side
// encryption key in addition to a stored access token. Until a real registered
// app authorizes an account, this stays false.
export function vaultConfigured() {
  const hasToken = Boolean(getAccessToken())
  const hasKey = Boolean(encryptionKey())
  return {
    configured: hasToken && hasKey,
    hasStoredToken: hasToken,
    encryptionAtRest: hasKey,
    note: hasToken && !hasKey
      ? 'A token is set but encryption-at-rest is not; add TIKTOK_TOKEN_ENCRYPTION_KEY before live use.'
      : null,
  }
}
