import { emailLayout, ctaButton, BASE_URL } from './layout'

export function jobExpiredEmail(
  contactName: string,
  jobTitle: string,
  jobId: string,
): { subject: string; html: string } {
  const firstName = (contactName || '').split(' ')[0] || 'there'
  const subject = `Your listing for ${jobTitle} has expired`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Job Listing Expired</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hi ${firstName}, your job listing <strong>${jobTitle}</strong> has been live for 60 days and has been automatically closed.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      If the role is still open, you can repost it with one click. If you've already filled the position, mark it as filled to keep your dashboard tidy.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
      <tr>
        <td style="padding-right:12px;">
          ${ctaButton('Repost Job', `${BASE_URL}/my-jobs`)}
        </td>
        <td>
          <a href="${BASE_URL}/my-jobs" style="display:inline-block;padding:12px 24px;background:#f1f5f9;color:#334155;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Mark as Filled</a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:14px;color:#94a3b8;">
      Questions? Just reply to this email.
    </p>
  `)

  return { subject, html }
}
