import { emailLayout, ctaButton, BASE_URL } from './layout'

export function activationDay7Email(companyName: string): { subject: string; html: string } {
  const subject = `How's hiring going, ${companyName}?`

  const html = emailLayout(subject, `
    <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">One week in — we want to make sure it's working for you.</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Quick check-in from Paul</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hey ${companyName},
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      It's been a week since you joined Hex. I wanted to check in and see how things are going.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      If you've had applications coming in — brilliant. If things have been quiet, don't worry. Sometimes it takes a few days for the right candidates to find your listing. A couple of things that help: make sure your job description is detailed, and try searching for candidates directly rather than waiting for them to come to you.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Either way, I'd love to hear how it's going. You can reply directly to this email — it comes straight to me.
    </p>
    ${ctaButton('View your dashboard', `${BASE_URL}/employer/dashboard`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      Paul Davies, Founder — Hex Jobs
    </p>
  `)

  return { subject, html }
}
