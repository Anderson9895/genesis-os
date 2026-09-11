// FieldLedger AI billing — shared customer-facing copy.
//
// Single source of truth for the owner-locked disclosure (FIELDLEDGER_ALIGNMENT
// §4b, 2026-09-11): the $199/mo renewal price AND its 90-day timing must be
// prominently shown (a) before checkout and (b) in the subscription
// confirmation. Both pages import these constants so the two surfaces can
// never drift apart.
export const FIELD_LEDGER_DISCLOSURE = {
  foundingHeading: 'Founding Farms offer — $99/mo for the first 90 days',
  foundingBody:
    'Sign up now as one of the first 20 farms and pay $99/month for your first 90 days. ' +
    'After those 90 days are up, your subscription automatically renews at the regular $199/month ' +
    'Grower price — no action needed from you, no interruption of service. Billing starts day one; ' +
    'this is not a free trial.',
  renewalLine:
    'After day 90, you will automatically be billed $199/month (Grower plan) on the same day each month ' +
    'until you cancel.',
  manageNote: 'You can cancel or change plans at any time from your billing portal.',
  pricingNote: 'Prices in USD. Subscriptions handled securely by Stripe (test mode).',
}

export const FIELD_LEDGER_PLANS = [
  {
    id: 'grower',
    name: 'Grower',
    monthlyCents: 19900,
    blurb: 'For a single farm (up to 2,500 acres) — field records, costs, and FieldLedger insights.',
  },
  {
    id: 'pro',
    name: 'Professional',
    monthlyCents: 49900,
    blurb: 'For a serious operation (up to 15,000 acres) — everything in Grower plus deeper reporting.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyCents: 149900,
    blurb: 'For multi-farm operations — every farm, every field, one command center.',
  },
]

export function formatUsd(cents) {
  if (cents == null) return '—'
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/mo`
}

export function formatDate(isoValue) {
  if (!isoValue) return null
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}