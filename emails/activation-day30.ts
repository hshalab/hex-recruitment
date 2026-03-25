import { emailLayout, ctaButton, BASE_URL } from './layout'

export function activationDay30Email(companyName: string): { subject: string; html: string } {
  const subject = "30 days of free hiring — how did we do?"

  const html = emailLayout(subject, `
    <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">A quick question from the Hex founder.</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">One month in, ${companyName}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Hey — it's Paul from Hex.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      It's been a month since you joined. I'd genuinely love to know: <strong>have you hired anyone through Hex yet?</strong>
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      If you have — that's amazing. A quick review or testimonial would mean the world to us. We're a small team building this for employers like you, and every bit of feedback helps us improve.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      If things haven't worked out yet, I want to understand why. What's missing? What would make Hex more useful for you? Hit reply and let me know — I read every response.
    </p>
    ${ctaButton('Share your feedback', `${BASE_URL}/employer/dashboard`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      Paul Davies, Founder — Hex Recruitment
    </p>
  `)

  return { subject, html }
}
