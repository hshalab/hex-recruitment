import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FREE_FOUNDING_MODE } from '@/lib/constants/cohort'
import { calculateFoundingPeriodEnd } from '@/lib/foundingEntitlement'
import { classifyEmail, type EmailClass } from '@/lib/emailDomains'
import { generateApprovalToken } from '@/lib/foundingApprovalToken'
import { sendEmail } from '@/lib/email'

/**
 * Single source of truth for what happens at email-confirmation time
 * for a brand-new employer. Called from:
 *   - lib/authCallback.ts (email-link signup flow via /auth/confirm)
 *   - app/auth/callback/employer/route.ts (Google OAuth flow)
 *
 * The domain class lives in user_metadata.email_domain_class (stamped
 * server-side by /api/auth/employer-signup) but we re-classify the
 * email here so the OAuth path — which doesn't go through our signup
 * route — still gets the right treatment.
 *
 *   business  → employer_subscriptions(tier='free', founding_period_ends_at)
 *               + employer_profiles.approval_status='approved'. Spot
 *               consumed; gate opens.
 *   freemail  → employer_profiles.approval_status='pending'. NO
 *               employer_subscriptions row written; spot NOT consumed;
 *               gate stays closed; email Paul with signed approve/reject
 *               links.
 *   disposable → should never reach here for the email-signup flow (the
 *               signup endpoint blocks 422 first). For OAuth it's
 *               theoretically possible — treat as freemail-pending so
 *               Paul has a chance to reject explicitly rather than
 *               silently bouncing.
 */

// Recipient of the founding-cohort approval email. Configurable via
// env var FOUNDING_ADMIN_EMAIL — defaults to paul@thrivecareer.co.uk
// (the verified mailbox Paul confirmed receives reliably). Previously
// hardcoded to pauldavies.gbr@gmail.com; the change unblocks Resend
// deliverability if the gmail-recipient combo was triggering bounces
// and lets us swap the reviewer without redeploying.
function getFoundingAdminEmail(): string {
  return (process.env.FOUNDING_ADMIN_EMAIL || 'paul@thrivecareer.co.uk').trim()
}

export type ProvisionResult = {
  status: 'approved' | 'pending' | 'noop_legacy_mode'
  classification: EmailClass | 'unknown'
  /**
   * For 'pending' provisions, records what happened when we tried to
   * email Paul. 'sent' = Resend accepted the send; 'failed' includes
   * the (stringified) error. Absent on 'approved'/'noop' paths.
   *
   * The founding-row write is never blocked by an email failure — the
   * user is genuinely pending, Paul can still flip them via direct DB
   * if the email path is broken. But the result is now visible to the
   * caller so we can surface it.
   */
  approvalEmail?: { recipient: string; result: 'sent' | 'failed'; error?: string }
}

export async function provisionFoundingEmployer({
  admin,
  userId,
  email,
  companyName,
  contactName,
  metadataClass,
  siteUrl,
}: {
  admin: SupabaseClient
  userId: string
  email: string | undefined
  companyName: string
  contactName: string
  metadataClass: EmailClass | undefined
  siteUrl: string
}): Promise<ProvisionResult> {
  if (!FREE_FOUNDING_MODE) {
    return { status: 'noop_legacy_mode', classification: 'unknown' }
  }

  // Prefer the metadata stamp (set server-side by /api/auth/employer-signup
  // so it's tamper-proof), but fall back to fresh classification for the
  // Google OAuth path where there's no signup intermediary.
  const classification: EmailClass = metadataClass || classifyEmail(email || '')

  if (classification === 'business') {
    // Approved on the spot. Write the profile (marked approved) and the
    // founding subscription row. Both upserts use ignoreDuplicates so a
    // returning confirmed user doesn't clobber edited fields.
    await admin
      .from('employer_profiles')
      .upsert(
        {
          user_id: userId,
          company_name: companyName,
          contact_name: contactName,
          email: email || '',
          approval_status: 'approved',
        },
        { onConflict: 'user_id' },
      )

    await admin.from('employer_subscriptions').upsert(
      {
        user_id: userId,
        subscription_status: 'inactive',
        subscription_tier: 'free',
        founding_period_ends_at: calculateFoundingPeriodEnd().toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )

    return { status: 'approved', classification }
  }

  // freemail OR disposable-via-OAuth → pending
  await admin
    .from('employer_profiles')
    .upsert(
      {
        user_id: userId,
        company_name: companyName,
        contact_name: contactName,
        email: email || '',
        approval_status: 'pending',
      },
      { onConflict: 'user_id' },
    )

  // Approval email — result captured and returned. Email failure does
  // NOT block the founding-row/profile write: the user is genuinely
  // pending, Paul can still flip them via direct DB if the email path
  // is broken. But the result is surfaced (logged + returned) so we
  // can diagnose Resend issues without Vercel runtime logs.
  const recipient = getFoundingAdminEmail()
  let approvalEmail: { recipient: string; result: 'sent' | 'failed'; error?: string } = {
    recipient,
    result: 'failed',
    error: 'unstarted',
  }

  try {
    const approveToken = generateApprovalToken(userId, 'approve')
    const rejectToken = generateApprovalToken(userId, 'reject')
    const approveUrl = `${siteUrl}/api/admin/approve-founding?t=${approveToken}`
    const rejectUrl = `${siteUrl}/api/admin/approve-founding?t=${rejectToken}`

    const subject = `[Thrive] Founding-cohort review: ${companyName}`
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 12px">New founding-cohort signup awaiting review</h2>
        <p>A new signup arrived from a free-mail address (${classification}). Decide whether to admit them to the founding cohort.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Company:</td><td><strong>${escapeHtml(companyName)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Contact:</td><td>${escapeHtml(contactName)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email:</td><td>${escapeHtml(email || '')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Classification:</td><td>${classification}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">User ID:</td><td><code>${userId}</code></td></tr>
        </table>
        <p style="margin:20px 0">
          <a href="${approveUrl}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;margin-right:8px">Approve</a>
          <a href="${rejectUrl}" style="display:inline-block;padding:10px 18px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none">Reject</a>
        </p>
        <p style="color:#64748b;font-size:13px">Approve consumes one of the 100 founding spots. Reject locks the account out of founding entitlement. Links are signed with HMAC and expire in 7 days; single-use enforced by approval_status.</p>
      </div>
    `
    const sendResult = await sendEmail(recipient, subject, html, 'noreply@thrivecareer.co.uk')
    if (sendResult.success) {
      approvalEmail = { recipient, result: 'sent' }
      console.log('[foundingSignup] approval email sent', { recipient, userId })
    } else {
      approvalEmail = { recipient, result: 'failed', error: sendResult.error }
      console.error('[foundingSignup] approval email FAILED', { recipient, userId, error: sendResult.error })
    }
  } catch (err: any) {
    // Thrown errors here are typically generateApprovalToken (missing/short
    // FOUNDING_APPROVAL_SECRET) — log with full detail.
    approvalEmail = { recipient, result: 'failed', error: err?.message || 'unknown error' }
    console.error('[foundingSignup] approval email threw', { recipient, userId, error: err?.message, stack: err?.stack?.slice(0, 300) })
  }

  return { status: 'pending', classification, approvalEmail }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
