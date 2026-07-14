import { supabase } from './supabaseClient'

async function getAccessToken() {
  if (!supabase) return null

  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

export async function callAiApi(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken()
  const headers = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message = payload?.error || 'AI service request failed.'
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload || {}
}
