import { emailLayout, ctaButton, BASE_URL } from './layout'

// Signature preserved (notes? + meetingLink? still accepted) so call
// sites in app/api/email/send/route.ts don't need to change, but the
// rendered email no longer duplicates the meeting link / notes / dial-in
// details — those now live in the native Google Calendar invite the
// candidate also receives. This email is a complementary heads-up:
// brand presence + confirmation + a pointer to the Google invite to RSVP.
export function interviewScheduledEmail(
  companyName: string,
  jobTitle: string,
  date: string,
  time: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _notes?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _meetingLink?: string,
): { subject: string; html: string } {
  const subject = `Your ${jobTitle} interview is confirmed`

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Interview confirmed</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      Your interview for the <strong>${jobTitle}</strong> role at <strong>${companyName}</strong> is confirmed for <strong>${date} at ${time}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      You'll receive a separate calendar invite from Google with the meeting details and an RSVP option. Please respond to that invite so ${companyName} knows you're attending.
    </p>
    ${ctaButton('View on Thrive', `${BASE_URL}/applications`)}
    <p style="margin:24px 0 0;font-size:14px;color:#94a3b8;line-height:1.6;">
      Good luck — and if anything changes, you can manage your interviews and messages from your Thrive dashboard.
    </p>
  `)

  return { subject, html }
}
