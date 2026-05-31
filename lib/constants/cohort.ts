/**
 * Free-founding-mode single source of truth.
 *
 * The hospitality beachhead launch is free for the first 100 employers
 * for 12 months. No card required at signup, no Stripe subscription
 * created during the founding period. Stripe code stays in the repo
 * but is dormant until pricing is decided post-launch.
 *
 * When FREE_FOUNDING_MODE is true:
 *   - /register/employer-free is the only employer signup path
 *   - new employers get employer_subscriptions(tier='free',
 *     founding_period_ends_at = NOW() + FOUNDING_PERIOD_MONTHS) on confirm
 *   - the post-job / messages / candidates gates open for founding-cohort
 *     rows without requiring subscription_status in ('active','trialing')
 *
 * subscription_status stays 'inactive' for founding-cohort rows — there
 * is no Stripe subscription, so writing 'active'/'trialing' would be a
 * lie. The gate consults founding-cohort signals separately.
 *
 * If FREE_FOUNDING_MODE is ever flipped off, founding rows still carry
 * their tier='free' + founding_period_ends_at signals, so the offboarding
 * decision can be implemented later against captured data.
 */
export const EMPLOYER_COHORT_CAP = 100

export const FOUNDING_PERIOD_MONTHS = 12

export const FREE_FOUNDING_MODE = true
