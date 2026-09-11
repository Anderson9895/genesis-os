// FieldLedger billing — POST /api/fieldledger/billing/checkout
//
// Creates a Stripe Checkout Session (mode=subscription) for the chosen plan.
// TEST MODE ONLY: STRIPE_SECRET_KEY must be a test-mode key; no charge is made
// by this code, and live activation is a separate owner-approved step.
//
// Body: { plan: 'grower' | 'pro' | 'enterprise' | 'founding' }
//   * founding = the owner-locked $99/mo x 90 days offer that AUTO-RENEWS at
//     $199/mo Grower (mechanism lives in the webhook — a Subscription
//     Schedule). The $199 + 90-day disclosure is shown on the pricing page
//     BEFORE this call is made (src/pages/FieldLedgerBilling.jsx) and again in
//     the confirmation (FieldLedgerBillingSuccess.jsx).
import { getBearerToken, getRequestBody, json } from '../../_lib/http.js'
import { consumeRateLimit } from '../../_lib/rateLimit.js'
import { getAuthenticatedUser } from '../../_lib/supabase.js'
import {
  getAppOrigin,
  getFoundingCap,
  getStripeClient,
  hasStripeConfig,
  resolveFoundingPrice,
  resolvePlanPrice,
  validateCheckoutPayload,
} from '../../_lib/stripe.js'
import { createDbAdapter, hasFieldLedgerBillingDbConfig } from './_db.js'

const MAX_BODY_BYTES = 1024 * 1024 // 1 MB

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
  const contentLength = Number(req.headers?.['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return json(res, 413, { error: 'Request body too large.' })
  }
  const body = getRequestBody(req)
  if (JSON.stringify(body || {}).length > MAX_BODY_BYTES) {
    return json(res, 413, { error: 'Request body too large.' })
  }
  // Validate the payload and resolve the price ids BEFORE authentication so a
  // malformed request or a price misconfiguration fails fast and clean with no
  // half-done state — mirrors the fieldledger_leads endpoint.
  const validation = validateCheckoutPayload(body)
  if (!validation.ok) {
    return json(res, 400, { error: validation.error })
  }
  const { plan } = validation.value

  // Resolve the price ids BEFORE touching the database, so a price
  // misconfiguration fails clean (503) with nothing half-done — and so the
  // full short-circuit path is testable offline.
  let priceId
  let isFounding = false
  if (plan === 'founding') {
    const resolved = resolveFoundingPrice()
    if (!resolved.ok) return json(res, 503, { error: resolved.error })
    priceId = resolved.value.priceId
    isFounding = true
  } else {
    const resolved = resolvePlanPrice(plan)
    if (!resolved.ok) return json(res, 503, { error: resolved.error })
    priceId = resolved.value.priceId
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

  // One live subscription per farm: upgrades/downgrades/cancellation happen in
  // the billing portal, so a second checkout while active is a client error.
  const existing = await db.findSubscriptionByUserId(user.id)
  if (existing && existing.status === 'active') {
    return json(res, 409, { error: 'You already have an active subscription. Manage it from the billing portal.' })
  }
  if (isFounding) {
    // Owner-locked: only the first N farms may claim the founding offer. Each
    // farm is one row (unique user_id); a farm that already claimed it may
    // re-purchase even after the cap fills, but new farms cannot.
    const cap = getFoundingCap()
    const claimed = await db.countFoundingSubscriptions()
    const alreadyClaimed = Boolean(existing && existing.founding_offer)
    if (!alreadyClaimed && claimed >= cap) {
      return json(res, 409, { error: `The founding offer (first ${cap} farms) has been fully claimed.` })
    }
  }

  const stripe = getStripeClient()
  const origin = getAppOrigin(req)
  try {
    const founding = plan === 'founding'
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email || undefined,
      // Lets the webhook map this session back to the Supabase user, and the
      // same user's future sessions share one Stripe customer.
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          genesis_user_id: user.id,
          plan,
          founding: founding ? '1' : '0',
        },
      },
      metadata: {
        genesis_user_id: user.id,
        plan,
        founding: founding ? '1' : '0',
      },
      success_url: `${origin}/app/fieldledger-billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app/fieldledger-billing`,
      allow_promotion_codes: false,
    })
    if (!session.url) {
      return json(res, 500, { error: 'Stripe did not return a checkout URL.' })
    }
    return json(res, 200, { url: session.url })
  } catch (err) {
    return json(res, 500, { error: err?.message || 'Failed to create Stripe checkout session.' })
  }
}