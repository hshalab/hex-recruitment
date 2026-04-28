// Client-safe subscription tier config (no server secrets)
//
// Single-plan pricing. A row with `subscription_tier: 'standard'` in
// employer_subscriptions means the employer is on the paid plan (either in
// trial or active). Historical rows with 'free' or 'professional' are
// treated as 'standard' by hasFeatureAccess in lib/subscription.ts.
export const SUBSCRIPTION_TIERS = {
  standard: {
    name: 'Standard',
    price: 99,
    trialDays: 91, // 3-month free trial
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
