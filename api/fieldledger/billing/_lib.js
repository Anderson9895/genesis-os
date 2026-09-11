// Genesis OS — FieldLedger billing shared logic (underscore module, NOT a
// Vercel function). Everything here is pure/dependency-injected so the full
// Suite can run offline with fakes — no live Stripe, no live Supabase, no
// network, no keys.
import { FOUNDING_OFFER, PLANS } from '../../_lib/stripe.js'

// Stripe timestamps come in unix seconds; the repo stores ISO timestamptz.
export function isoFromSeconds(seconds) {
  const numeric = Number(seconds)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return new Date(numeric * 1000).toISOString()
}

export function nowIso() {
  return new Date().toISOString()
}

// Read the EXACT raw request body. Stripe signs the raw bytes, so we must
// never sign a re-serialized object. Vercel's Node runtime parses `req.body`
// lazily on first access; consuming the stream first yields the raw payload.
// Fallbacks: a runtime that already parsed into a string is fine; a parsed
// object cannot be reconstructed faithfully, so we fail closed (the caller
// responds 400) instead of trusting an unverifiable body.
export async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const streamBody = Buffer.concat(chunks).toString('utf8')
  if (streamBody) return streamBody
  if (typeof req.body === 'string' && req.body) return req.body
  if (req.body && typeof req.body === 'object') {
    throw Object.assign(
      new Error('Raw request body is unavailable; cannot verify webhook signature.'),
      { statusCode: 400 },
    )
  }
  return ''
}

// The public shape the entitlement endpoint returns. `active` is deliberately
// conservative: only an `active` Stripe status grants access. `past_due`
// (failed payment, dunning) is reported as a billing issue, not as active —
// we never over-grant; a `canceled` subscription is definitively not active.
export function deriveEntitlement(row) {
  if (!row || !row.plan) {
    return {
      plan: 'none',
      status: 'none',
      active: false,
      currentPeriodEnd: null,
      renewalPriceCents: null,
      renewalAt: null,
      foundingOffer: false,
      scheduleId: null,
    }
  }
  return {
    plan: row.plan,
    status: row.status,
    active: row.status === 'active',
    currentPeriodEnd: row.current_period_end || null,
    renewalPriceCents: row.renewal_price_cents ?? null,
    renewalAt: row.renewal_at || null,
    foundingOffer: Boolean(row.founding_offer),
    scheduleId: row.stripe_subscription_schedule_id || null,
  }
}

// ---------------------------------------------------------------------------
// Webhook handlers (dependency-injected `stripe` + `db`; see _webhook.js for
// the production adapter). Each returns { handled, ... } and throws on
// unrecoverable errors so the route can 500 and let Stripe retry.
// ---------------------------------------------------------------------------

// Phase blueprint for the $99 -> $199 founding offer. Verified against the
// Stripe docs (docs.stripe.com/billing/subscriptions/subscription-schedules):
// phase 1 = `duration.interval_count` billing cycles at the founding price,
// phase 2 = open-ended at the Grower price, `proration_behavior: 'none'`.
// Phase transitions happen automatically at the phase end date, so after
// 3 monthly $99 cycles the subscription mechanically bills $199/mo.
export function buildFoundingSchedulePhases({ foundingPriceId, growerPriceId }) {
  return [
    {
      items: [{ price: foundingPriceId, quantity: 1 }],
      duration: { interval: 'month', interval_count: FOUNDING_OFFER.phaseMonths },
      proration_behavior: 'none',
    },
    {
      items: [{ price: growerPriceId, quantity: 1 }],
      proration_behavior: 'none',
    },
  ]
}

// checkout.session.completed (mode=subscription):
//   * persist the subscription row (service-role write)
//   * for founding offers, attach a Subscription Schedule that enforces the
//     $99 x 3 months -> $199 auto-renew, and record the renewal price/timing
//     that the UI must disclose.
// Stripe's `from_subscription` cannot be combined with `phases` (docs), so
// this is the documented two-step: create the schedule from the subscription
// (phase 1 inherits the $99 price and auto-renews monthly), THEN update the
// schedule with the explicit phases. Retries are idempotent: if the
// subscription already carries a schedule we reuse it and just re-assert the
// phases.
export async function handleCheckoutCompleted({ stripe, db, event, foundingPriceId, growerPriceId }) {
  const session = event.data?.object
  if (!session || session.mode !== 'subscription') return { handled: false }
  const userId = session.client_reference_id
  const subscriptionId = session.subscription
  const customerId = session.customer
  if (!userId || !subscriptionId || !customerId) {
    return { handled: false, reason: 'checkout session is missing client_reference_id/subscription/customer' }
  }
  const plan = String(session.metadata?.plan ?? '').trim()
  const founding = session.metadata?.founding === '1'

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['schedule'] })
  const priceId = subscription.items?.data?.[0]?.price?.id || null

  const row = {
    user_id: userId,
    // A founding subscription renews onto the Grower plan — the plan is
    // 'grower' from day one, `founding_offer` records the special pricing.
    plan: founding ? FOUNDING_OFFER.renewsToPlan : (PLANS[plan] ? plan : 'grower'),
    status: subscription.status || 'incomplete',
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    current_price_id: priceId,
    founding_offer: founding,
    current_period_end: isoFromSeconds(subscription.current_period_end),
    updated_at: nowIso(),
  }

  if (!founding) {
    const planMeta = PLANS[plan]
    row.renewal_price_cents = planMeta ? planMeta.monthlyCents : null
    row.renewal_at = isoFromSeconds(subscription.current_period_end)
    await db.upsertSubscription(row)
    return { handled: true, founding: false }
  }

  // Founding offer: enforce the $99 -> $199 schedule.
  let schedule = subscription.schedule && typeof subscription.schedule === 'object'
    ? subscription.schedule
    : null
  if (!schedule) {
    const created = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })
    schedule = created
  }
  const phases = buildFoundingSchedulePhases({ foundingPriceId, growerPriceId })
  const updated = await stripe.subscriptionSchedules.update(schedule.id, { phases })
  // Phase 2 starts the day phase 1 ends — that is the day the customer starts
  // being billed $199. Record it (and the amount) so the confirmation UI can
  // show the real, schedule-backed numbers.
  const phaseOneEnd = updated.phases?.[0]?.end_date
  row.stripe_subscription_schedule_id = schedule.id
  row.renewal_price_cents = PLANS.grower.monthlyCents
  row.renewal_at = isoFromSeconds(phaseOneEnd) || isoFromSeconds(subscription.current_period_end)
  await db.upsertSubscription(row)
  return { handled: true, founding: true, scheduleId: schedule.id, renewalAt: row.renewal_at }
}

// customer.subscription.updated — refresh live state. For founding rows, once
// the schedule has moved the subscription onto the Grower price the $199
// renewal is the ongoing reality (renewal_at = this period's end).
export async function handleSubscriptionUpdated({ db, event, growerPriceId }) {
  const sub = event.data?.object
  if (!sub?.id) return { handled: false, reason: 'no subscription id' }
  const existing = await db.findSubscriptionByStripeId(sub.id)
  if (!existing) return { handled: false, reason: 'unknown subscription' }
  const priceId = sub.items?.data?.[0]?.price?.id || existing.current_price_id
  const updates = {
    status: sub.status || existing.status,
    current_price_id: priceId,
    current_period_end: isoFromSeconds(sub.current_period_end) ?? existing.current_period_end,
    updated_at: nowIso(),
  }
  if (existing.founding_offer) {
    if (growerPriceId && priceId === growerPriceId) {
      updates.renewal_price_cents = PLANS.grower.monthlyCents
      updates.renewal_at = isoFromSeconds(sub.current_period_end) ?? existing.current_period_end
    }
  } else if (existing.plan && PLANS[existing.plan]) {
    updates.renewal_price_cents = PLANS[existing.plan].monthlyCents
    updates.renewal_at = isoFromSeconds(sub.current_period_end) ?? existing.current_period_end
  }
  await db.updateSubscription(existing.id, updates)
  return { handled: true }
}

// customer.subscription.deleted — the customer (or Stripe) ended the
// subscription; entitlement is definitively off.
export async function handleSubscriptionDeleted({ db, event }) {
  const sub = event.data?.object
  if (!sub?.id) return { handled: false, reason: 'no subscription id' }
  const existing = await db.findSubscriptionByStripeId(sub.id)
  if (!existing) return { handled: false, reason: 'unknown subscription' }
  await db.updateSubscription(existing.id, {
    status: 'canceled',
    current_price_id: existing.current_price_id,
    current_period_end: existing.current_period_end,
    renewal_price_cents: null,
    renewal_at: null,
    updated_at: nowIso(),
  })
  return { handled: true }
}

// invoice.payment_failed — the subscription flips to past_due (Stripe dunning).
// The entitlement endpoint reports this as inactive with a billing issue; the
// follow-up customer.subscription.updated event carries the authoritative
// status when Stripe resolves or finals it.
export async function handleInvoicePaymentFailed({ db, event }) {
  const invoice = event.data?.object
  const subscriptionId = invoice?.subscription
  if (!subscriptionId) return { handled: false, reason: 'no subscription reference' }
  const existing = await db.findSubscriptionByStripeId(subscriptionId)
  if (!existing) return { handled: false, reason: 'unknown subscription' }
  if (existing.status !== 'canceled') {
    await db.updateSubscription(existing.id, {
      status: 'past_due',
      updated_at: nowIso(),
    })
  }
  return { handled: true }
}

export const WEBHOOK_HANDLERS = Object.freeze({
  'checkout.session.completed': handleCheckoutCompleted,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.payment_failed': handleInvoicePaymentFailed,
})