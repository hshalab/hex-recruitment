import { emailLayout, ctaButton, BASE_URL } from './layout'

export function activationDay14Email(companyName: string): { subject: string; html: string } {
  const subject = "2 weeks on Hex — here's what's working"

  const html = emailLayout(subject, `
    <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">The employers getting the best results all do this one thing.</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Keep the momentum going, ${companyName}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Two weeks in. The employers getting the best results on Hex all have one thing in common: they stay active.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">
      Here's what works:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;">
      <tr>
        <td style="padding:8px 0;">
          <span style="color:#16a34a;font-weight:700;margin-right:8px;">&#10003;</span>
          <span style="font-size:14px;color:#334155;">Post regularly — fresh jobs get more visibility</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="color:#16a34a;font-weight:700;margin-right:8px;">&#10003;</span>
          <span style="font-size:14px;color:#334155;">Respond fast — candidates move on quickly</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="color:#16a34a;font-weight:700;margin-right:8px;">&#10003;</span>
          <span style="font-size:14px;color:#334155;">Use candidate search — don't just wait for applications</span>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Your free spot is locked in — no pressure, no expiry countdown. The platform is yours to use whenever you need to hire.
    </p>
    ${ctaButton('Post another job', `${BASE_URL}/post-job`)}
  `)

  return { subject, html }
}
