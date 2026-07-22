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

/**
 * ⚠️ READ THIS BEFORE SETTING THIS TO false.
 *
 * Turning this flag off does NOT, on its own, switch paid signup back on.
 * It re-activates code that sends employers to /register/employer/payment —
 * but that URL is currently redirected away in next.config.js. So the
 * employer would be sent to the payment page, immediately bounced to the
 * free signup instead, and no card would ever be collected. Signup would
 * appear to work perfectly while quietly taking no money. Nothing would
 * error, and nothing would show up in logs.
 *
 * So if you set this to false, you MUST also delete these four redirects
 * from next.config.js in the SAME change:
 *   /register, /subscribe, /register/employer/payment, /renew-subscription
 *
 * The three code paths that wake up when this becomes false, all of which
 * lead to the payment page:
 *   - lib/authCallback.ts:324
 *   - lib/authCallback.ts:338
 *   - app/auth/callback/employer/route.ts:149
 *
 * Also check app/robots.ts:28 — it tells search engines not to index
 * /register/employer/payment. If that page is meant to be live again,
 * that line probably needs to go too.
 *
 * Short version: this flag and those redirects are two halves of one
 * switch. Move both together, or paid signup breaks silently.
 */
export const FREE_FOUNDING_MODE = true
