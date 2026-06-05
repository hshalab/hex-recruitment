import { emailLayout, ctaButton, BASE_URL } from './layout'

export function activationDay1Email(companyName: string): { subject: string; html: string } {
  const subject = "Post your first job — it takes 3 minutes"

  const html = emailLayout(subject, `
    <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">Your free spot is claimed. Here's what to do next.</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Time to post your first job, ${companyName}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      The first job is the hardest part. After that, Thrive runs itself — applications come in, you review them, and you hire. The whole thing takes about 3 minutes:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;width:24px;height:24px;background:#0f172a;border-radius:50%;text-align:center;line-height:24px;font-weight:700;color:#ffffff;font-size:13px;margin-right:10px;vertical-align:middle;">1</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;">Write the job title and salary</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;width:24px;height:24px;background:#0f172a;border-radius:50%;text-align:center;line-height:24px;font-weight:700;color:#ffffff;font-size:13px;margin-right:10px;vertical-align:middle;">2</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;">Describe what you need</span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <span style="display:inline-block;width:24px;height:24px;background:#0f172a;border-radius:50%;text-align:center;line-height:24px;font-weight:700;color:#ffffff;font-size:13px;margin-right:10px;vertical-align:middle;">3</span>
          <span style="font-size:15px;color:#334155;vertical-align:middle;">Hit publish</span>
        </td>
      </tr>
    </table>
    ${ctaButton('Post your first job', `${BASE_URL}/post-job`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      That's it. Candidates start seeing your job immediately.
    </p>
  `)

  return { subject, html }
}
