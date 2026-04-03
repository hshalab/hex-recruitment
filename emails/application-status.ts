import { emailLayout, ctaButton, BASE_URL } from './layout'

const STATUS_CONFIG: Record<string, { heading: string; message: string; nextSteps: string }> = {
  shortlisted: {
    heading: 'Great news!',
    message: 'Your application has been shortlisted.',
    nextSteps: 'The employer is reviewing shortlisted candidates and may reach out to arrange an interview. Keep an eye on your messages.',
  },
  interviewing: {
    heading: 'Interview stage',
    message: 'You have progressed to the interview stage.',
    nextSteps: 'Check your messages for interview details from the employer.',
  },
  offered: {
    heading: 'Congratulations!',
    message: 'You have received a job offer!',
    nextSteps: 'Check your messages for the full offer details. You can accept or discuss terms with the employer.',
  },
  hired: {
    heading: 'Congratulations!',
    message: 'You have been hired!',
    nextSteps: 'The employer will be in touch with onboarding details. Well done!',
  },
  rejected: {
    heading: 'Application update',
    message: 'Unfortunately, your application was not selected to move forward.',
    nextSteps: "Don't be discouraged — new opportunities are posted every day. Keep applying!",
  },
  offer_accepted: {
    heading: 'Offer accepted!',
    message: '', // dynamically set below
    nextSteps: 'Head to your applications dashboard to confirm the hire and begin onboarding.',
  },
  offer_declined: {
    heading: 'Offer declined',
    message: '', // dynamically set below
    nextSteps: 'You can view the candidate\'s reason (if provided) and decide on next steps from your dashboard.',
  },
}

export function applicationStatusEmail(
  status: string,
  companyName: string,
  jobTitle: string,
  candidateName?: string,
  reason?: string
): { subject: string; html: string } {
  // Employer-facing statuses use different subjects
  if (status === 'offer_accepted') {
    const subject = `Offer accepted — ${jobTitle} at ${companyName}`
    const html = emailLayout(subject, `
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Offer accepted!</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        <strong>${candidateName || 'A candidate'}</strong> has digitally signed and accepted your offer for <strong>${jobTitle}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
        Head to your applications dashboard to confirm the hire and begin onboarding.
      </p>
      ${ctaButton('View Applications', `${BASE_URL}/my-jobs`)}
    `)
    return { subject, html }
  }

  if (status === 'offer_declined') {
    const subject = `Offer declined — ${jobTitle} at ${companyName}`
    const reasonLine = reason ? `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">Their reason: "${reason}"</p>` : ''
    const html = emailLayout(subject, `
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">Offer declined</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        <strong>${candidateName || 'A candidate'}</strong> has declined your offer for <strong>${jobTitle}</strong>.
      </p>
      ${reasonLine}
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
        You can view the full details and decide on next steps from your dashboard.
      </p>
      ${ctaButton('View Applications', `${BASE_URL}/my-jobs`)}
    `)
    return { subject, html }
  }

  // Candidate-facing statuses (existing behaviour)
  const subject = `Update on your application at ${companyName}`
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.shortlisted

  const html = emailLayout(subject, `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e293b;">${config.heading}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
      ${config.message}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f8fafc;border-radius:8px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Company</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">${companyName}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Position</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">${jobTitle}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Status</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;text-transform:capitalize;">${status}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#334155;">Next steps</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      ${config.nextSteps}
    </p>
    ${status === 'rejected' ? ctaButton('Browse More Jobs', `${BASE_URL}/jobs`) : ctaButton('View Messages', `${BASE_URL}/messages`)}
  `)

  return { subject, html }
}
