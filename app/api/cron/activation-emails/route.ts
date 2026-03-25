import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { activationDay1Email } from '@/emails/activation-day1'
import { activationDay3Email } from '@/emails/activation-day3'
import { activationDay7Email } from '@/emails/activation-day7'
import { activationDay14Email } from '@/emails/activation-day14'
import { activationDay30Email } from '@/emails/activation-day30'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const ACTIVATION_DAYS = [1, 3, 7, 14, 30] as const

const EMAIL_BUILDERS: Record<number, (companyName: string) => { subject: string; html: string }> = {
  1: activationDay1Email,
  3: activationDay3Email,
  7: activationDay7Email,
  14: activationDay14Email,
  30: activationDay30Email,
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  let totalSent = 0

  for (const targetDay of ACTIVATION_DAYS) {
    // Find employers who signed up exactly targetDay days ago
    const { data: employers, error } = await supabase
      .from('employer_subscriptions')
      .select(`
        user_id,
        created_at,
        employer_profiles!inner(email, company_name)
      `)
      .eq('subscription_tier', 'free')

    if (error || !employers) continue

    const now = Date.now()
    const matches = employers.filter(emp => {
      const created = new Date(emp.created_at).getTime()
      const daysSince = Math.floor((now - created) / (1000 * 60 * 60 * 24))
      return daysSince === targetDay
    })

    for (const emp of matches) {
      const profile = emp.employer_profiles as any
      const email = profile?.email
      const companyName = profile?.company_name || 'there'

      if (!email) continue

      const builder = EMAIL_BUILDERS[targetDay]
      const { subject, html } = builder(companyName)

      const result = await sendEmail(email, subject, html)
      if (result.success) totalSent++
    }
  }

  return NextResponse.json({ sent: totalSent })
}
