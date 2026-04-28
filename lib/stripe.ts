import 'server-only'
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Single-plan Stripe Price ID. Create the £99/month recurring price in
// the Stripe dashboard and set STRIPE_PRICE_ID in .env.local.
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || ''

// Re-export tier config for convenience in server code
export { SUBSCRIPTION_TIERS, type SubscriptionTier } from './subscription-tiers'
