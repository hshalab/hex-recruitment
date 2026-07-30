import { emailLayout, ctaButton, BASE_URL } from './layout'

// Emails for the Temp Work loop. Same layout, same ctaButton, same tone as
// new-application — deliberately, because an agency should not be able to tell
// that a shift and a job travel down different code paths.
//
// Both land on /temp-work/manage, which is the page that can actually answer
// them. A notification or email that opens somewhere you cannot do the thing it
// invited you to do is the fault we keep finding, so these do not link to the
// public feed.

/** Someone has put themselves forward for a shift. The one that must not be missed. */
export function tempInterestEmail(
  candidateName: string,
  shiftTitle: string,
  when: string,
  note?: string | null
): { subject: string; html: string } {
  const subject = `${candidateName} is available for ${shiftTitle}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Someone's available for your shift</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      <strong>${candidateName}</strong> has put themselves forward for <strong>${shiftTitle}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f8fafc;border-radius:8px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Shift</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">${shiftTitle}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">When</p>
          <p style="margin:0${note ? ';padding-bottom:16px' : ''};font-size:16px;font-weight:600;color:#1e293b;">${when}</p>
          ${note ? `
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Their note</p>
          <p style="margin:0;font-size:15px;color:#1e293b;line-height:1.6;">${note}</p>` : ''}
        </td>
      </tr>
    </table>
    ${ctaButton('See who\'s available', `${BASE_URL}/temp-work/manage`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      Reply on the post and they'll be told straight away.
    </p>
  `)

  return { subject, html }
}

/** A comment on the employer's shift — a question, usually. */
export function tempCommentEmail(
  authorName: string,
  shiftTitle: string,
  body: string
): { subject: string; html: string } {
  const subject = `New comment on ${shiftTitle}`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">New comment on your shift</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      <strong>${authorName}</strong> commented on <strong>${shiftTitle}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f8fafc;border-radius:8px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0;font-size:15px;color:#1e293b;line-height:1.6;">${body}</p>
        </td>
      </tr>
    </table>
    ${ctaButton('Read and reply', `${BASE_URL}/temp-work/manage`)}
    <p style="margin:0;font-size:14px;color:#94a3b8;">
      They'll be notified as soon as you reply.
    </p>
  `)

  return { subject, html }
}
