import { useEffect, useState } from 'react'
import { callAiApi } from '../lib/aiApiClient'
import {
  FIELD_LEDGER_DISCLOSURE,
  FIELD_LEDGER_PLANS,
  formatDate,
  formatUsd,
} from '../lib/fieldledgerBilling'

const PLAN_NAMES = Object.fromEntries(FIELD_LEDGER_PLANS.map((plan) => [plan.id, plan.name]))

// FieldLedger AI billing — pricing + subscription management page.
//
// The owner-locked disclosure (the $199 renewal price AND the 90-day timing)
// is rendered ON THIS PAGE, before any checkout call can happen, and again on
// the confirmation page after purchase.
export default function FieldLedgerBilling() {
  const [entitlement, setEntitlement] = useState(null)
  const [loadingEntitlement, setLoadingEntitlement] = useState(true)
  const [busy, setBusy] = useState(null) // plan id while a checkout/portal call runs
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    callAiApi('/api/fieldledger/billing/entitlement')
      .then((payload) => {
        if (!active) return
        setEntitlement(payload?.entitlement || null)
      })
      .catch((err) => {
        if (!active) return
        // 503 = billing not configured yet; page still renders with the full
        // disclosure so the offer stays visibly honest.
        setError(err?.payload?.error || err?.message || 'Could not load your subscription.')
      })
      .finally(() => {
        if (active) setLoadingEntitlement(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function startCheckout(plan) {
    setBusy(plan)
    setError(null)
    try {
      const payload = await callAiApi('/api/fieldledger/billing/checkout', {
        method: 'POST',
        body: { plan },
      })
      if (payload?.url) {
        window.location.href = payload.url
        return
      }
      throw new Error('Stripe did not return a checkout URL.')
    } catch (err) {
      setError(err?.payload?.error || err?.message || 'Could not start checkout.')
    } finally {
      setBusy(null)
    }
  }

  async function openPortal() {
    setBusy('portal')
    setError(null)
    try {
      const payload = await callAiApi('/api/fieldledger/billing/portal', { method: 'POST' })
      if (payload?.url) {
        window.location.href = payload.url
        return
      }
      throw new Error('Stripe did not return a portal URL.')
    } catch (err) {
      setError(err?.payload?.error || err?.message || 'Could not open the billing portal.')
    } finally {
      setBusy(null)
    }
  }

  const subscribed = Boolean(entitlement && entitlement.active)

  return (
    <div className="fieldledger-billing">
      <h1>FieldLedger AI — Plans &amp; Billing</h1>
      <p>
        Pick a plan for your farm. Subscriptions are handled securely by Stripe and are currently in
        test mode — no real charges.
      </p>

      {loadingEntitlement && <p aria-live="polite">Loading your subscription…</p>}
      {!loadingEntitlement && subscribed && (
        <div className="billing-status">
          <h2>Your subscription</h2>
          <p>
            <strong>{PLAN_NAMES[entitlement.plan] || entitlement.plan}</strong> — status:{' '}
            <strong>{entitlement.status}</strong>
          </p>
          {entitlement.foundingOffer && (
            <p>
              Founding rate active. Renews automatically at{' '}
              <strong>{formatUsd(entitlement.renewalPriceCents)}</strong> starting{' '}
              <strong>{formatDate(entitlement.renewalAt) || 'after your founding period'}</strong>.
            </p>
          )}
          <button type="button" onClick={openPortal} disabled={busy === 'portal'}>
            {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
          </button>
        </div>
      )}

      {/* Founding offer block — disclosure BEFORE checkout is here, verbatim. */}
      <section className="founding-offer">
        <h2>{FIELD_LEDGER_DISCLOSURE.foundingHeading}</h2>
        <p>{FIELD_LEDGER_DISCLOSURE.foundingBody}</p>
        <p>
          <strong>{FIELD_LEDGER_DISCLOSURE.renewalLine}</strong>
        </p>
        <p>{FIELD_LEDGER_DISCLOSURE.manageNote}</p>
        <button
          type="button"
          onClick={() => startCheckout('founding')}
          disabled={Boolean(busy) || subscribed}
        >
          {busy === 'founding' ? 'Taking you to Stripe…' : 'Claim the founding offer — $99/mo for 90 days'}
        </button>
        {subscribed && <p className="muted">You already have an active subscription.</p>}
      </section>

      <div className="plan-grid">
        {FIELD_LEDGER_PLANS.map((plan) => (
          <div className="plan-card" key={plan.id}>
            <h3>{plan.name}</h3>
            <p className="plan-price">{formatUsd(plan.monthlyCents)}</p>
            <p>{plan.blurb}</p>
            <button
              type="button"
              onClick={() => startCheckout(plan.id)}
              disabled={Boolean(busy) || subscribed}
            >
              {busy === plan.id ? 'Taking you to Stripe…' : `Choose ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="billing-error" role="alert">
          {error}
        </p>
      )}

      <p className="muted">{FIELD_LEDGER_DISCLOSURE.pricingNote}</p>
    </div>
  )
}