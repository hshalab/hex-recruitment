import { emailLayout, ctaButton, BASE_URL } from './layout'

export function applicationSubmittedEmail(
  candidateName: string,
  jobTitle: string,
  companyName: string
): { subject: string; html: string } {
  const firstName = candidateName.split(' ')[0] || 'there'
  const subject = `Application confirmed — ${jobTitle} at ${companyName}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Application submitted!</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hi ${firstName}, your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been sent to the employer.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      You'll be notified when the employer reviews your application. In the meantime, you can track all your applications from your dashboard.
    </p>
    ${ctaButton('View My Applications', `${BASE_URL}/applications`)}
    <p style="margin:16px 0 0;font-size:14px;color:#94a3b8;">
      Keep applying — the more roles you apply for, the better your chances.
    </p>
  `)

  return { subject, html }
}
