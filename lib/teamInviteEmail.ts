import 'server-only'
import { emailLayout, ctaButton } from '@/emails/layout'

/** Branded "join the team" invitation email (used by invite + resend routes). */
export function buildInviteEmail(opts: {
  company: string
  inviterName: string
  email: string
  link: string
}): { subject: string; html: string } {
  const { company, inviterName, email, link } = opts
  const subject = `You're invited to join ${company} on Thrive`
  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#0f172a;">Join ${company} on Thrive</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
      ${inviterName} has invited you to help with hiring at <strong>${company}</strong> on Thrive — the hospitality hiring platform.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#334155;">
      Accept the invitation to get access to their jobs, applicants and pipeline.
    </p>
    ${ctaButton('Accept invitation', link)}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
      This invitation was sent to ${email} and expires in 7 days. If you weren't expecting it, you can safely ignore this email.
    </p>
  `)
  return { subject, html }
}
