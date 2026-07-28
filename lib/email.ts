import 'server-only'
import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set — emails will not be sent')
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_ADDRESS = 'Thrive <noreply@thrivecareer.co.uk>'

/** "p****s@gmail.com" — enough to recognise a recipient without logging one. */
function maskAddress(to: string): string {
  const [local, domain] = String(to).split('@')
  if (!domain) return '***'
  const head = local.slice(0, 1)
  const tail = local.length > 2 ? local.slice(-1) : ''
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}${tail}@${domain}`
}

/**
 * Derive a readable plain-text alternative from the HTML body so every email
 * ships with a text/plain part (better deliverability + accessibility). This
 * is a fallback only — it changes nothing about who/when/what links are sent.
 * Strips the document chrome, turns links into "text (url)", and collapses
 * whitespace. Callers may still pass an explicit `text` to override it.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => {
      const label = txt.replace(/<[^>]+>/g, '').trim()
      return label && !href.includes(label) ? `${label} (${href})` : href
    })
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>(?:\s*)/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '·')
    .replace(/&amp;/gi, '&')
    .replace(/&copy;/gi, '©')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim()
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo: string = 'hello@thrivecareer.co.uk',
  text?: string
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
      text: text || htmlToText(html),
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

    // Log the successes too, not just the failures.
    //
    // Until now only failures were logged, which made silence ambiguous: an
    // empty log could mean "everything sent" or "nothing was even attempted",
    // and there was no way to tell them apart after the fact. That ambiguity is
    // most of the reason a broken API key could have sat unnoticed — "no errors
    // in the logs" was reassuring and meant nothing.
    //
    // The recipient is masked. These logs are for answering "did it go out and
    // when", which the subject and domain do; the full address adds little and
    // puts candidate email addresses in a log we scroll through casually.
    console.log('[Email] Sent:', JSON.stringify({ to: maskAddress(to), subject }))
    return { success: true }
  } catch (err: any) {
    console.error('[Email] Unexpected error:', err?.message, err?.stack?.slice(0, 300))
    return { success: false, error: err?.message || 'unknown error' }
  }
}
