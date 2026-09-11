-- FieldLedger AI billing / subscription entitlement state (additive).
--
-- Owner-locked billing decision (FIELDLEDGER_ALIGNMENT.md §4b, 2026-09-11):
--   * Plans: Grower $199/mo, Professional $499/mo, Enterprise $1,499/mo.
--   * Founding offer (first 20 farms): $99/mo for the first 90 days, then
--     AUTOMATIC renewal on the $199/mo Grower plan (Stripe Subscription
--     Schedule enforces the price change on Stripe's side).
--   * Mandatory disclosure: the $199 renewal price AND its timing must be
--     shown (a) before checkout (pricing page) and (b) in the subscription
--     confirmation. That disclosure is implemented in the app UI
--     (src/pages/FieldLedgerBilling*.jsx), which reads the real renewal
--     price/timing persisted here.
--
-- This migration only adds the entitlement-state table. Billable events come
-- from Stripe webhooks (api/fieldledger/billing/[...path].js, TEST MODE only)
-- and no charge is ever made by this repo directly.
--
-- Security shape (deliberate, mirrors the fieldledger_leads mirror):
--   * anon has NO grants on this table — nothing is exposed publicly, there
--     is no public `insert` (or any) grant, and the unique `user_id` column
--     is precisely the tenant split shown to `authenticated` users below.
--   * Inserts/updates happen ONLY through the serverless API endpoint using an
--     env-guarded service-role client (bypasses RLS). If that key is absent
--     the API refuses (503) — never a fallback to anon.
--   * Each authenticated user can SELECT/UPDATE only their own subscription
--     row (user_id = auth.uid()) — the repo's per-user RLS convention.
--
-- `status` stores Stripe's subscription status verbatim so the entitlement
-- endpoint can map it honestly (active / past_due / canceled / ...) without
-- inventing state. `renewal_price_cents` is the amount the customer will be
-- billed at the next renewal (for a founding offer: $199.00 from the day the
-- schedule's second phase starts); `renewal_at` is when that price applies
-- (phase-2 start for founding offers, current period end otherwise). The UI
-- renders both of these from this table — it never hardcodes the promise.
create table if not exists public.fieldledger_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan text not null
    check (plan in ('grower', 'pro', 'enterprise')),
  status text not null default 'incomplete'
    check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active',
                      'past_due', 'canceled', 'unpaid', 'paused')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_schedule_id text,
  current_price_id text,
  founding_offer boolean not null default false,
  current_period_end timestamptz,
  renewal_price_cents integer,
  renewal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One entitlement row per user: a farm manages its plan through Stripe's
-- billing portal; the webhook upserts this row on every relevant event.
create unique index if not exists fieldledger_subscriptions_user_idx
  on public.fieldledger_subscriptions (user_id);
-- The Stripe ids are unique backstops so webhook events can never create
-- duplicate rows for the same customer/subscription.
create unique index if not exists fieldledger_subscriptions_customer_idx
  on public.fieldledger_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;
create unique index if not exists fieldledger_subscriptions_sub_idx
  on public.fieldledger_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
-- The owner's founding-offer cap ("first 20 farms") is enforced at the API
-- layer by counting rows where founding_offer is true; this index keeps the
-- count cheap.
create index if not exists fieldledger_subscriptions_founding_idx
  on public.fieldledger_subscriptions (founding_offer);
alter table public.fieldledger_subscriptions enable row level security;
-- anon: no grants at all. Inserts/deletes are intentionally granted to no
-- role: only the service-role API client can write (bypasses RLS).
revoke all on table public.fieldledger_subscriptions from anon;
grant select, update on table public.fieldledger_subscriptions to authenticated;
drop policy if exists "Owner can view their FieldLedger subscription" on public.fieldledger_subscriptions;
drop policy if exists "Owner can update their FieldLedger subscription" on public.fieldledger_subscriptions;
create policy "Owner can view their FieldLedger subscription"
  on public.fieldledger_subscriptions
  for select
  to authenticated
  using (
    user_id = auth.uid()
  );
create policy "Owner can update their FieldLedger subscription"
  on public.fieldledger_subscriptions
  for update
  to authenticated
  using (
    user_id = auth.uid()
  )
  with check (
    user_id = auth.uid()
  );