import { emailLayout, ctaButton, BASE_URL } from './layout'

export function interviewCancelledEmail(
  companyName: string,
  jobTitle: string,
  candidateName: string,
  date?: string,
): { subject: string; html: string } {
  const subject = `Interview cancelled — ${jobTitle} at ${companyName}`
  const firstName = candidateName.split(' ')[0]

  // Guard: only include the "scheduled for <date>" clause when a real
  // formatted date is supplied. Previously the date was passed through
  // unguarded and a missing value rendered the literal word "undefined".
  const hasDate = typeof date === 'string' && date.trim().length > 0
  const whenClause = hasDate ? ` scheduled for <strong>${date}</strong>` : ''

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Interview Cancelled</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hi ${firstName}, we wanted to let you know that your interview for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>${whenClause} has been cancelled.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      If you have any questions or would like to discuss next steps, please reach out to ${companyName} via your Thrive messages inbox.
    </p>
    ${ctaButton('View Your Applications', `${BASE_URL}/applications`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      We hope to be in touch again soon.
    </p>
  `)

  return { subject, html }
}
