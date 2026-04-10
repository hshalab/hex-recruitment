import { emailLayout, ctaButton, BASE_URL } from './layout'

export function interviewReminderEmail(
  recipientName: string,
  candidateName: string,
  jobTitle: string,
  companyName: string,
  date: string,
  time: string,
  hoursUntil: number,
  role: 'employer' | 'candidate',
): { subject: string; html: string } {
  const window = hoursUntil <= 1 ? 'in 1 hour' : 'tomorrow'
  const subject = `Interview reminder — ${candidateName} for ${jobTitle} ${window}`

  const greeting = recipientName ? `Hi ${recipientName.split(' ')[0]},` : 'Hi,'

  const body = role === 'employer'
    ? `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        ${greeting} Just a quick reminder that you have an interview <strong>${window}</strong>:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;">
        <tr><td style="padding:8px 0;font-size:15px;color:#334155;"><strong>Candidate:</strong> ${candidateName}</td></tr>
        <tr><td style="padding:8px 0;font-size:15px;color:#334155;"><strong>Role:</strong> ${jobTitle}</td></tr>
        <tr><td style="padding:8px 0;font-size:15px;color:#334155;"><strong>Date:</strong> ${date}</td></tr>
        <tr><td style="padding:8px 0;font-size:15px;color:#334155;"><strong>Time:</strong> ${time}</td></tr>
      </table>
      ${ctaButton('View Interview Details', `${BASE_URL}/interviews`)}`
    : `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        ${greeting} Just a quick reminder that you have an interview <strong>${window}</strong>:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;">
        <tr><td style="padding:8px 0;font-size:15px;color:#334155;"><strong>Company:</strong> ${companyName}</td></tr>
        <tr><td style="padding:8px 0;font-size:15px;color:#334155;"><strong>Role:</strong> ${jobTitle}</td></tr>
        <tr><td style="padding:8px 0;font-size:15px;color:#334155;"><strong>Date:</strong> ${date}</td></tr>
        <tr><td style="padding:8px 0;font-size:15px;color:#334155;"><strong>Time:</strong> ${time}</td></tr>
      </table>
      ${ctaButton('View Your Applications', `${BASE_URL}/applications`)}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Interview Reminder</h1>
    ${body}
    <p style="margin:24px 0 0;font-size:14px;color:#94a3b8;">
      Good luck! If you need to reschedule, please contact the ${role === 'employer' ? 'candidate' : 'employer'} via Thrive messaging.
    </p>
  `)

  return { subject, html }
}
