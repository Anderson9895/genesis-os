import { createClient } from '@supabase/supabase-js'

function getSupabaseConfig() {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const supabaseAnonKey = String(
    process.env.SUPABASE_ANON_KEY
      || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      || process.env.VITE_SUPABASE_ANON_KEY
      || ''
  ).trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  return { supabaseUrl, supabaseAnonKey }
}

export function hasSupabaseServerConfig() {
  return Boolean(getSupabaseConfig())
}

export function createSupabaseServerClient(accessToken) {
  const config = getSupabaseConfig()
  if (!config) return null

  const headers = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : undefined

  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: headers ? { headers } : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function getAuthenticatedUser(accessToken) {
  const client = createSupabaseServerClient(accessToken)
  if (!client || !accessToken) return { user: null, error: new Error('Missing authentication token.') }

  const { data, error } = await client.auth.getUser(accessToken)
  if (error) return { user: null, error }

  return { user: data?.user ?? null, error: null }
}
