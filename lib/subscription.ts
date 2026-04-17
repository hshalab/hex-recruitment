import { supabase } from './supabase'
import { DEV_MODE, getMockUser, getSubscriptionStatus } from './mockAuth'

// Single paid tier. 'free' is kept for backward compatibility with historical
// rows — treated as 'standard' by the access checks below.
export type SubscriptionTier = 'standard' | 'free' | null
export type SubscriptionStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'

export interface UserSubscription {
  status: SubscriptionStatus
  tier: SubscriptionTier
  isActive: boolean
  isTrial: boolean
  trialEndsAt: Date | null
  cancelAt: Date | null
  cancelAtPeriodEnd: boolean
}

/**
 * Features gated behind an active subscription. With a single plan, any
 * active (or trialing) employer gets access to everything.
 */
const GATED_FEATURES = [
  'post_job',
  'view_candidate_contact',
  'view_candidate_cv',
  'download_cv',
  'send_message',
  'analytics_dashboard',
  'demographics_data',
  'benchmarking',
  'priority_candidate_access',
  'unlimited_jobs',
] as const

type GatedFeature = (typeof GATED_FEATURES)[number]

/**
 * Fetch the current user's subscription from the database
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  // Dev mode fallback
  if (DEV_MODE) {
    const status = getSubscriptionStatus()
    return {
      status: status === 'trial' ? 'trialing' : status === 'active' ? 'active' : 'inactive',
      tier: 'standard',
      isActive: status === 'trial' || status === 'active',
      isTrial: status === 'trial',
      trialEndsAt: null,
      cancelAt: null,
      cancelAtPeriodEnd: false,
    }
  }

  const { data, error } = await supabase
    .from('employer_subscriptions')
    .select('subscription_status, subscription_tier, trial_ends_at, cancel_at, cancel_at_period_end')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return {
      status: 'inactive',
      tier: null,
      isActive: false,
      isTrial: false,
      trialEndsAt: null,
      cancelAt: null,
      cancelAtPeriodEnd: false,
    }
  }

  const status = data.subscription_status as SubscriptionStatus
  const isActive = status === 'active' || status === 'trialing'

  return {
    status,
    tier: data.subscription_tier as SubscriptionTier,
    isActive,
    isTrial: status === 'trialing',
    trialEndsAt: data.trial_ends_at ? new Date(data.trial_ends_at) : null,
    cancelAt: data.cancel_at ? new Date(data.cancel_at) : null,
    cancelAtPeriodEnd: data.cancel_at_period_end || false,
  }
}

/**
 * Check if the user has access to a specific feature.
 * Single-plan: any active/trialing subscription unlocks everything.
 */
export function hasFeatureAccess(
  subscription: UserSubscription,
  feature: GatedFeature
): boolean {
  if (!subscription.isActive) return false
  return (GATED_FEATURES as readonly string[]).includes(feature)
}

/**
 * Get the maximum number of active jobs allowed. With a single plan every
 * active subscription is unlimited.
 */
export function getMaxActiveJobs(tier: SubscriptionTier): number {
  if (tier === 'standard' || tier === 'free') return Infinity
  return 0
}

/**
 * Features allowed without any subscription (free access)
 * - Browse candidate profiles (limited view — no contact/CV)
 * - See applications list
 * - View own dashboard
 */
export function isFreeFeature(feature: string): boolean {
  const freeFeatures = [
    'browse_candidates',
    'view_applications',
    'view_dashboard',
    'view_job_listings',
  ]
  return freeFeatures.includes(feature)
}
