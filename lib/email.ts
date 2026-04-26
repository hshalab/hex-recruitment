import 'server-only'
import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set — emails will not be sent')
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_ADDRESS = process.env.RESEND_DOMAIN_VERIFIED === 'true'
  ? 'Thrive <noreply@thrivecareer.co.uk>'
  : 'Thrive <onboarding@resend.dev>'

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn(`[Email] Would send to ${to}: ${subject} (Resend not configured)`)
    return { success: false, error: 'Resend not configured' }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    })

    if (error) {
      console.error('[Email] Send failed:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Email] Unexpected error:', err.message)
    return { success: false, error: err.message }
  }
}
