// Genesis OS — FieldLedger billing database adapter (underscore module, NOT a
// Vercel function). All writes go through the env-guarded service-role client
// (bypasses RLS, exactly like the fieldledger_leads mirror); the table grants
// no write permission to any role, so this adapter is the only writer. When
// the service-role env is absent the adapter refuses (null) and every route
// fails closed with a 503.
import { createClient } from '@supabase/supabase-js'

export function hasFieldLedgerBillingDbConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  return Boolean(url && serviceKey)
}

export function createDbAdapter() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceKey) return null
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    async upsertSubscription(row) {
      const { data, error } = await client
        .from('fieldledger_subscriptions')
        .upsert(row, { onConflict: 'user_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    async findSubscriptionByUserId(userId) {
      const { data, error } = await client
        .from('fieldledger_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    async findSubscriptionByStripeId(stripeSubscriptionId) {
      const { data, error } = await client
        .from('fieldledger_subscriptions')
        .select('*')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    async updateSubscription(id, updates) {
      const { data, error } = await client
        .from('fieldledger_subscriptions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    async countFoundingSubscriptions() {
      const { count, error } = await client
        .from('fieldledger_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('founding_offer', true)
      if (error) throw error
      return count ?? 0
    },
  }
}