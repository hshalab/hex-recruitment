import { emailLayout, ctaButton, BASE_URL } from './layout'

export function activationDay3Email(companyName: string): { subject: string; html: string } {
  const subject = "3 ways to find candidates faster on Thrive"

  const html = emailLayout(subject, `
    <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">Most employers miss this — don't be one of them.</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Get more from Thrive, ${companyName}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
      Here are three things the most successful employers on Thrive do differently:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1e293b;">1. Search candidates directly</p>
          <p style="margin:0;font-size:14px;color:#64748b;line-height:1.5;">Don't wait for applications to come in. Browse candidate profiles by skills, location and availability — and message them before they even apply.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1e293b;">2. Set your job to remote or hybrid</p>
          <p style="margin:0;font-size:14px;color:#64748b;line-height:1.5;">If the role allows it, offering remote or hybrid opens up a much bigger talent pool. More visibility, more applicants.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 0;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1e293b;">3. Respond within 24 hours</p>
          <p style="margin:0;font-size:14px;color:#64748b;line-height:1.5;">Candidates ghost employers who are slow. The ones who respond fast get the best people — it's that simple.</p>
        </td>
      </tr>
    </table>
    ${ctaButton('Browse candidates now', `${BASE_URL}/candidates`)}
  `)

  return { subject, html }
}
