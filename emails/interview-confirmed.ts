import { emailLayout, ctaButton, BASE_URL } from './layout'

export function interviewConfirmedEmail(
  companyName: string,
  jobTitle: string,
  candidateName: string,
  date: string,
  time: string,
  interviewType: string,
): { subject: string; html: string } {
  const subject = `Interview confirmed — ${jobTitle} at ${companyName}`
  const firstName = candidateName.split(' ')[0]

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Interview Confirmed ✓</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hi ${firstName}, your interview for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong> has been confirmed.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;">Interview Details</p>
          <p style="margin:8px 0 8px;font-size:14px;color:#64748b;">Date</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${date}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Time</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${time}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Format</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${interviewType}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      If you need to make any changes, please contact ${companyName} via your Hex messages inbox.
    </p>
    ${ctaButton('View on Thrive', `${BASE_URL}/applications`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      Good luck with your interview!
    </p>
  `)

  return { subject, html }
}
