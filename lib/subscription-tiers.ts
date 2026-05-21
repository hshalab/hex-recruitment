// Client-safe subscription tier config (no server secrets)
//
// Single-plan pricing. A row with `subscription_tier: 'standard'` in
// employer_subscriptions means the employer is on the paid plan (either in
// trial or active). Historical rows with 'free' or 'professional' are
// treated as 'standard' by hasFeatureAccess in lib/subscription.ts.
//
// `price` and `trialDays` import from lib/trialUtils so this file can never
// drift from the canonical EMPLOYER_SUBSCRIPTION_PRICE / TRIAL_DURATION_DAYS.
// Direction matters: subscription-tiers ← trialUtils only; if trialUtils ever
// needs tier info, route it through a separate module to avoid a cycle.
import { EMPLOYER_SUBSCRIPTION_PRICE, TRIAL_DURATION_DAYS } from './trialUtils'

export const SUBSCRIPTION_TIERS = {
  standard: {
    name: 'Standard',
    price: EMPLOYER_SUBSCRIPTION_PRICE,
    trialDays: TRIAL_DURATION_DAYS,
    maxActiveJobs: Infinity,
    features: [
      'Unlimited job listings',
      'Browse and contact candidates',
      'Manage applications in dashboard',
      'Analytics dashboard',
      'Dedicated account support',
      'Cancel anytime',
    ],
  },
} as const

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS
