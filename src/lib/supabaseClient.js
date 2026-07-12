import { createClient } from '@supabase/supabase-js'

const runtimeEnv = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : (typeof process !== 'undefined' ? process.env : {})

const supabaseUrl = (
  runtimeEnv.VITE_SUPABASE_URL ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).trim()
const supabasePublishableKey = (
  runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  runtimeEnv.VITE_SUPABASE_ANON_KEY ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim()

const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null

export function isSupabaseConfigured() {
  return hasSupabaseConfig
}
