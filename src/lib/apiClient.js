import { supabase } from './supabaseClient'

export async function callApi(path, { method = 'GET', body } = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = new Error(payload?.error || 'The request failed.')
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload || {}
}
