import 'server-only'
import Stripe from 'stripe'

// Lazy client. The env read used to live at module scope plus a hard
// throw at import time, which broke Vercel Preview builds — Next.js
// imports every route file during the page-data collection step, so
// `next build` would crash before any request was served if
// STRIPE_SECRET_KEY wasn't on the Preview env. Deferring the read
// until first use means import is side-effect free.

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
  }
  _stripe = new Stripe(key)
  return _stripe
}

// Backward-compat. Eight route files already import `{ stripe }` from
// here (count via grep before the swap). A Proxy preserves that public
// surface while routing every property access through getStripe(),
// so the env read happens at first request — not at module import.
// Function values are bound to the real client to keep internal `this`
// references intact; nested accessors like `stripe.webhooks` are real
// Stripe objects that handle their own `this` correctly.
export const stripe = new Proxy({} as Stripe, {
  get: (_target, prop, receiver) => {
    const client = getStripe()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

// Single-plan Stripe Price ID. Create the £99/month recurring price in
// the Stripe dashboard and set STRIPE_PRICE_ID in .env.local. Safe to
// read at module scope — no throw, falls back to '' if absent.
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || ''

// Re-export tier config for convenience in server code
export { SUBSCRIPTION_TIERS, type SubscriptionTier } from './subscription-tiers'
