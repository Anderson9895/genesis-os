import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { callAiApi } from '../lib/aiApiClient'
import {
  FIELD_LEDGER_DISCLOSURE,
  FIELD_LEDGER_PLANS,
  formatDate,
  formatUsd,
} from '../lib/fieldledgerBilling'

const PLAN_NAMES = Object.fromEntries(FIELD_LEDGER_PLANS.map((plan) => [plan.id, plan.name]))

// Post-purchase confirmation. This page is the subscription confirmation
// surface: it renders the owner-locked disclosure again, using the REAL
// renewal price and date stored from the Stripe schedule (so the promise shown
// is the promise the schedule enforces — not static marketing copy).
export default function FieldLedgerBillingSuccess() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id') || ''
  const [entitlement, setEntitlement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    callAiApi('/api/fieldledger/billing/entitlement')
      .then((payload) => {
        if (active) setEntitlement(payload?.entitlement || null)
      })
      .catch((err) => {
        if (active) setError(err?.payload?.error || err?.message || 'Could not load your subscription.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // sessionId is intentionally not a dependency: entitlement is source of truth.
  }, [sessionId])

  const renewingAtFoundingPrice =
    entitlement && entitlement.foundingOffer && entitlement.renewalPriceCents === 19900

  return (
    <div className="fieldledger-billing-success">
      <h1>Subscription confirmed</h1>
      {sessionId && <p className="muted">Checkout session: {sessionId.slice(0, 18)}…</p>}
      {loading && <p aria-live="polite">Finalising your subscription…</p>}

      {error && (
        <p className="billing-error" role="alert">
          {error} — your confirmation details will appear here once billing is live.
        </p>
      )}

      {!loading && entitlement && entitlement.plan !== 'none' && (
        <section className="confirmation">
          <p>
            <strong>{PLAN_NAMES[entitlement.plan] || entitlement.plan}</strong> plan — status:{' '}
            <strong>{entitlement.active ? 'active' : entitlement.status}</strong>.
          </p>
          {entitlement.foundingOffer && renewingAtFoundingPrice && (
            <>
              <h2>{FIELD_LEDGER_DISCLOSURE.foundingHeading}</h2>
              <p>{FIELD_LEDGER_DISCLOSURE.foundingBody}</p>
              <p>
                <strong>Your subscription automatically renews at {formatUsd(entitlement.renewalPriceCents)}</strong>{' '}
                (Grower plan) starting{' '}
                <strong>{formatDate(entitlement.renewalAt) || 'after your 90-day founding period'}</strong> — 90 days
                from today. {FIELD_LEDGER_DISCLOSURE.manageNote}
              </p>
            </>
          )}
          {!(entitlement.foundingOffer && renewingAtFoundingPrice) && (
            <p>
              {entitlement.foundingOffer
                ? `Your subscription renews at ${formatUsd(entitlement.renewalPriceCents)} from ${formatDate(entitlement.renewalAt) || 'your next billing period'}.`
                : `Your plan renews at ${formatUsd(entitlement.renewalPriceCents)}.`}{' '}
              {FIELD_LEDGER_DISCLOSURE.manageNote}
            </p>
          )}
        </section>
      )}

      <p>
        <Link to="/app/fieldledger-billing">Back to plans &amp; billing</Link>
      </p>
    </div>
  )
}