import 'server-only'
import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set — emails will not be sent')
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_ADDRESS = 'Thrive <noreply@thrivecareer.co.uk>'

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo: string = 'hello@thrivecareer.co.uk'
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn(`[Email] Would send to ${to}: ${subject} (Resend not configured)`)
    return { success: false, error: 'Resend not configured' }
  }

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      replyTo,
    })

    if (result.error) {
      // Resend's error has more than just .message — capture name + statusCode
      // so callers (and the foundingSignup error-surfacing logging in particular)
      // can tell apart validation errors, domain-unverified, rate limits, etc.
      const detail = {
        name: (result.error as any).name,
        message: result.error.message,
        statusCode: (result.error as any).statusCode,
      }
      console.error('[Email] Send failed:', JSON.stringify(detail))
      return { success: false, error: JSON.stringify(detail) }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Email] Unexpected error:', err?.message, err?.stack?.slice(0, 300))
    return { success: false, error: err?.message || 'unknown error' }
  }
}
