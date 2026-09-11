// FieldLedger billing — POST /api/fieldledger/billing/portal
//
// Creates a Stripe Billing Portal session so the customer manages their own
// subscription (upgrade/downgrade, payment method, cancellation). TEST MODE
// ONLY like every route in this module.
import { getBearerToken, json } from '../../_lib/http.js'
import { consumeRateLimit } from '../../_lib/rateLimit.js'
import { getAuthenticatedUser } from '../../_lib/supabase.js'
import {
  getPortalReturnUrl,
  getStripeClient,
  hasStripeConfig,
} from '../../_lib/stripe.js'
import { createDbAdapter, hasFieldLedgerBillingDbConfig } from './_db.js'

export default async function handler(req, res) {
  if (!hasStripeConfig()) {
    return json(res, 503, { error: 'Stripe is not configured on the server (test-mode keys required).' })
  }
  if (!hasFieldLedgerBillingDbConfig()) {
    return json(res, 503, { error: 'Server-side database is not configured.' })
  }
  if (req.method !== 'POST') {
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
  const row = await db.findSubscriptionByUserId(user.id)
  if (!row || !row.stripe_customer_id) {
    return json(res, 409, {
      error: 'No FieldLedger subscription found for this account yet. Subscribe first to open the billing portal.',
    })
  }
  const stripe = getStripeClient()
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: getPortalReturnUrl(req),
    })
    if (!session.url) {
      return json(res, 500, { error: 'Stripe did not return a portal URL.' })
    }
    return json(res, 200, { url: session.url })
  } catch (err) {
    return json(res, 500, { error: err?.message || 'Failed to create Stripe billing portal session.' })
  }
}