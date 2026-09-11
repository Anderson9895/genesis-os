// Genesis OS — FieldLedger AI billing shared config (underscore lib = NOT a
// Vercel function; only imported by the /api/fieldledger/billing catch-all).
//
// TEST MODE ONLY by design: every Stripe interaction happens against env-keyed
// credentials (STRIPE_SECRET_KEY etc. — the owner provisions test keys first).
// When any required key is absent the routes fail closed with a 503; this
// module never contains a key, never invents a fallback, and never constructs
// the SDK unless the environment is configured.
import Stripe from 'stripe'

export const PLANS = Object.freeze({
  grower: {
    id: 'grower',
    name: 'Grower',
    monthlyCents: 19900,
    priceEnv: 'STRIPE_PRICE_GROWER',
  },
  pro: {
    id: 'pro',
    name: 'Professional',
    monthlyCents: 49900,
    priceEnv: 'STRIPE_PRICE_PRO',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyCents: 149900,
    priceEnv: 'STRIPE_PRICE_ENTERPRISE',
  },
})

// Founding offer (owner-locked §4b): $99/mo for the first 90 days, then AUTO
// renewal at $199/mo Grower. Implemented with a Stripe Subscription Schedule
// (see _webhook.js) — NOT a trial, NOT a discount coupon: billing starts day 1
// at $99 and the schedule mechanically moves the subscription onto the $199
// price after 3 monthly cycles.
export const FOUNDING_OFFER = Object.freeze({
  id: 'founding',
  name: 'Founding Farms',
  monthlyCents: 9900,
  priceEnv: 'STRIPE_PRICE_FOUNDING_99',
  // 3 monthly billing cycles ≈ 90 days; the schedule's phase 2 then bills the
  // Grower price for as long as the subscription stays active.
  phaseMonths: 3,
  // The plan the subscription auto-renews onto after the founding phase.
  renewsToPlan: 'grower',
})

export const FOUNDING_CAP_ENV = 'FIELD_LEDGER_FOUNDING_CAP'
export const DEFAULT_FOUNDING_CAP = 20

export function envText(name) {
  return String(process.env[name] || '').trim()
}

export function hasStripeConfig() {
  return Boolean(envText('STRIPE_SECRET_KEY'))
}

export function hasStripeWebhookConfig() {
  return Boolean(envText('STRIPE_SECRET_KEY') && envText('STRIPE_WEBHOOK_SECRET'))
}

// Lazy SDK construction: the pure logic in this module never touches the SDK,
// and tests inject fakes instead — no live Stripe, no network, no keys.
export function getStripeClient() {
  const secretKey = envText('STRIPE_SECRET_KEY')
  if (!secretKey) return null
  return new Stripe(secretKey)
}

// Resolve a plan code to its price id from the environment. Undefined price
// envs are a misconfiguration the caller turns into a 503 (fail closed) —
// never a guess.
export function resolvePlanPrice(planId) {
  const plan = PLANS[planId]
  if (!plan) return { ok: false, error: `Unknown plan: ${planId}` }
  const priceId = envText(plan.priceEnv)
  if (!priceId) {
    return { ok: false, error: `Server is missing ${plan.priceEnv} (Stripe price id).` }
  }
  return { ok: true, value: { ...plan, priceId } }
}

export function resolveFoundingPrice() {
  const priceId = envText(FOUNDING_OFFER.priceEnv)
  if (!priceId) {
    return { ok: false, error: `Server is missing ${FOUNDING_OFFER.priceEnv} (Stripe price id).` }
  }
  return { ok: true, value: { ...FOUNDING_OFFER, priceId } }
}

export function getFoundingCap() {
  const raw = envText(FOUNDING_CAP_ENV)
  const parsed = Number.parseInt(raw, 10)
  if (!raw || Number.isNaN(parsed) || parsed < 1) return DEFAULT_FOUNDING_CAP
  return parsed
}

// Founding-offer checkout payload validator — separate from plan checkout so
// unknown values are rejected before any Stripe call.
export function validateCheckoutPayload(body) {
  const input = body && typeof body === 'object' ? body : {}
  const plan = String(input.plan ?? '').trim().toLowerCase()
  if (plan === FOUNDING_OFFER.id || Object.hasOwn(PLANS, plan)) {
    return { ok: true, value: { plan } }
  }
  return { ok: false, error: `plan must be one of founding, ${Object.keys(PLANS).join(', ')}.` }
}

// The Stripe billing-zone URLs used in checkout/portal sessions. We derive the
// app origin from the inbound request so previews and the live domain both
// work; operators can override the portal return URL with
// STRIPE_PORTAL_RETURN_URL.
export function getAppOrigin(req) {
  const explicit = envText('STRIPE_PORTAL_RETURN_URL')
  if (explicit) {
    try {
      return new URL(explicit).origin
    } catch {
      // fall through to the request-derived origin below
    }
  }
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https'
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim()
  if (!host) return 'https://localhost'
  return `${proto}://${host}`
}

export function getPortalReturnUrl(req) {
  return envText('STRIPE_PORTAL_RETURN_URL') || `${getAppOrigin(req)}/app/fieldledger-billing`
}