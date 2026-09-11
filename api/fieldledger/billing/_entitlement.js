// FieldLedger billing — GET /api/fieldledger/billing/entitlement
//
// Reads the signed-in customer's subscription state from OUR database (the
// webhook keeps it current). This route never calls Stripe, so it also works
// while the Stripe env is absent — it simply reports what is persisted
// (`plan: 'none'` when there is no subscription), and the DB write side
// remains locked behind the service-role env.
import { getBearerToken, json } from '../../_lib/http.js'
import { consumeRateLimit } from '../../_lib/rateLimit.js'
import { getAuthenticatedUser } from '../../_lib/supabase.js'
import { createDbAdapter, hasFieldLedgerBillingDbConfig } from './_db.js'
import { deriveEntitlement } from './_lib.js'

export default async function handler(req, res) {
  if (!hasFieldLedgerBillingDbConfig()) {
    return json(res, 503, { error: 'Server-side database is not configured.' })
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed.' })
  }
  const accessToken = getBearerToken(req)
  const { user, error: userError } = await getAuthenticatedUser(accessToken)
  if (userError || !user) {
    return json(res, 401, { error: 'Unauthorized.' })
  }
  const rateResult = consumeRateLimit(user.id)
  if (!rateResult.allowed) {
    return json(res, 429, {
      error: 'Rate limit exceeded. Please try again shortly.',
      retryAfterSeconds: rateResult.retryAfterSeconds,
    })
  }
  const db = createDbAdapter()
  try {
    const row = await db.findSubscriptionByUserId(user.id)
    return json(res, 200, { entitlement: deriveEntitlement(row) })
  } catch (err) {
    return json(res, 500, { error: err?.message || 'Failed to load subscription entitlements.' })
  }
}