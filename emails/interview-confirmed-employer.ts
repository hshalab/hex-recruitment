import { emailLayout, ctaButton, BASE_URL } from './layout'

export function interviewConfirmedEmployerEmail(
  companyName: string,
  jobTitle: string,
  candidateName: string,
  date: string,
  time: string,
  interviewType: string,
): { subject: string; html: string } {
  const subject = `${candidateName} confirmed their interview for ${jobTitle}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Interview Confirmed ✓</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      <strong>${candidateName}</strong> has confirmed their interview for the <strong>${jobTitle}</strong> role at ${companyName}.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;">Interview Details</p>
          <p style="margin:8px 0 8px;font-size:14px;color:#64748b;">Candidate</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${candidateName}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Date</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${date}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Time</p>
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#1e293b;">${time}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Format</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${interviewType}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      The interview is now locked in on your calendar. You can message ${candidateName.split(' ')[0]} directly through your Thrive inbox if anything changes.
    </p>
    ${ctaButton('View Interview', `${BASE_URL}/interviews`)}
  `)

  return { subject, html }
}
