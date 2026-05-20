import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function buildConfirmationEmail(name: string): string {
  const firstName = name?.trim().split(' ')[0] || 'there'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:28px;font-weight:800;color:#FFD700;letter-spacing:0.02em;">THRIVE</span>
        </td></tr>
        <tr><td style="background:#1a1a1a;border-radius:16px;padding:36px 32px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#ffffff;">Hi ${firstName}, you're on the list!</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.75);">
            We're giving the first ${EMPLOYER_COHORT_CAP} employers on Thrive 3 months free. We'll email you the moment we go live.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#FFD700;border-radius:8px;">
              <a href="https://thrivecareer.co.uk" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#0f0f0f;text-decoration:none;">
                Explore Thrive
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:28px;text-align:center;">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);">
            Thrive &mdash; thrivecareer.co.uk
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(request: NextRequest) {
  try {
    const { email, name, company } = await request.json()

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error } = await supabase.from('waitlist').insert({
      email: email.trim().toLowerCase(),
      name: name?.trim() || null,
      company: company?.trim() || null,
      type: 'employer',
    })

    if (error) {
      // Unique constraint violation — already on the list
      if (error.code === '23505') {
        return NextResponse.json({ success: true, alreadyJoined: true })
      }
      return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 })
    }

    // Send confirmation email (fire and forget — don't block response)
    sendEmail(
      email.trim(),
      "You're on the Thrive waitlist — we'll be in touch soon",
      buildConfirmationEmail(name || '')
    ).catch(() => {})

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
