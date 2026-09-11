// FieldLedger billing — POST /api/fieldledger/billing/webhook
//
// ONE consolidated Stripe webhook endpoint. Security first:
//   * STRIPE_WEBHOOK_SECRET must be configured, else 503 (fail closed).
//   * Every body is signature-verified with stripe.webhooks.constructEvent over
//     the EXACT raw bytes (readRawBody) — unverified bodies are never trusted
//     and never processed.
//   * Unknown/unhandled event types answer 200 { handled: false } so Stripe
//     stops retrying them.
//   * Handler failures answer 500 so Stripe retries the event.
// Handled: checkout.session.completed, customer.subscription.updated/deleted,
// invoice.payment_failed — each maps to the entitlement row in
// public.fieldledger_subscriptions.
import { json } from '../../_lib/http.js'
import { hasStripeWebhookConfig, getStripeClient, resolveFoundingPrice, resolvePlanPrice } from '../../_lib/stripe.js'
import { createDbAdapter, hasFieldLedgerBillingDbConfig } from './_db.js'
import { readRawBody, WEBHOOK_HANDLERS } from './_lib.js'

export default async function handler(req, res) {
  if (!hasStripeWebhookConfig()) {
    return json(res, 503, { error: 'Stripe webhook is not configured on the server.' })
  }
  if (!hasFieldLedgerBillingDbConfig()) {
    return json(res, 503, { error: 'Server-side database is not configured.' })
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' })
  }
  const signature = String(
    req.headers?.['stripe-signature'] || req.headers?.['Stripe-Signature'] || '',
  ).trim()
  if (!signature) {
    return json(res, 400, { error: 'Missing Stripe-Signature header.' })
  }
  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    return json(res, err.statusCode || 400, { error: err.message })
  }
  const stripe = getStripeClient()
  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    // Signature verification failed or the payload is malformed: refuse it.
    return json(res, 400, { error: `Webhook signature verification failed: ${err.message}` })
  }
  const eventHandler = WEBHOOK_HANDLERS[event.type]
  if (!eventHandler) {
    return json(res, 200, { received: true, handled: false })
  }
  const db = createDbAdapter()
  const options = { stripe, db, event }
  try {
    // Pre-flight env checks happen BEFORE any state change so a misconfigured
    // founding flow fails clean (503) with nothing half-applied; Stripe will
    // retry the event once the operator sets the missing price ids.
    if (event.type === 'checkout.session.completed') {
      if (event.data?.object?.metadata?.founding === '1') {
        const founding = resolveFoundingPrice()
        if (!founding.ok) return json(res, 503, { error: founding.error })
        options.foundingPriceId = founding.value.priceId
        const grower = resolvePlanPrice('grower')
        if (!grower.ok) return json(res, 503, { error: grower.error })
        options.growerPriceId = grower.value.priceId
      }
    } else if (event.type === 'customer.subscription.updated') {
      const grower = resolvePlanPrice('grower')
      if (grower.ok) options.growerPriceId = grower.value.priceId
    }
    const result = await eventHandler(options)
    return json(res, 200, { received: true, handled: true, ...result })
  } catch (err) {
    return json(res, 500, { error: err?.message || 'Failed to process webhook event.' })
  }
}