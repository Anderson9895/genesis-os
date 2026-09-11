// FieldLedger AI billing — ONE catch-all serverless function.
//
// Mirrors api/tiktok/[...path].js: checkout + portal + webhook + entitlement
// live under a single Vercel function so the deploy stays within the Hobby
// plan's 12-function budget (this file is the only new function).
//
// Routes:
//   POST /api/fieldledger/billing/checkout    -> create Stripe Checkout Session
//   POST /api/fieldledger/billing/portal      -> create Stripe Billing Portal session
//   POST /api/fieldledger/billing/webhook     -> signed Stripe webhook (constructEvent)
//   GET  /api/fieldledger/billing/entitlement -> the caller's subscription state
// TEST MODE ONLY: env-keyed STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET; every
// route fails closed with 503 when its required env is absent.
import { json } from '../../_lib/http.js'
import checkout from './_checkout.js'
import portal from './_portal.js'
import webhook from './_webhook.js'
import entitlement from './_entitlement.js'

const handlers = {
  checkout,
  portal,
  webhook,
  entitlement,
}

function requestedPath(req) {
  const value = req.query?.path
  const queryPath = Array.isArray(value) ? value.join('/') : String(value || '')
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname
    .replace(/^\/api\/fieldledger\/billing\/?/, '')
  return (queryPath || urlPath)
    .replace(/^\/+|\/+$/g, '')
}

export default async function handler(req, res) {
  const route = requestedPath(req)
  const routeHandler = handlers[route]
  if (!routeHandler) return json(res, 404, { error: 'FieldLedger billing route not found.' })
  return routeHandler(req, res)
}