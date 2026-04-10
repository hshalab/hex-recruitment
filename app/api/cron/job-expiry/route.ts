import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jobExpiredEmail } from '@/emails/job-expired'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
  const cutoffStr = cutoff.toISOString()

  // Find active jobs posted more than 60 days ago
  const { data: expiredJobs, error } = await supabaseAdmin
    .from('jobs')
    .select('id, title, employer_id, posted_at')
    .eq('status', 'active')
    .lt('posted_at', cutoffStr)

  if (error) {
    console.error('[job-expiry] query error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!expiredJobs || expiredJobs.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  let expired = 0

  for (const job of expiredJobs) {
    // Mark as expired
    const { error: updateErr } = await supabaseAdmin
      .from('jobs')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', job.id)

    if (updateErr) {
      console.error('[job-expiry] update failed for', job.id, updateErr)
      continue
    }

    expired++

    // Look up employer contact for email
    const { data: profile } = await supabaseAdmin
      .from('employer_profiles')
      .select('contact_name, email')
      .eq('user_id', job.employer_id)
      .maybeSingle()

    if (profile?.email) {
      const email = jobExpiredEmail(
        profile.contact_name || '',
        job.title || 'your job listing',
        job.id,
      )
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: profile.email, type: 'raw', data: email }),
      }).catch(() => {})
    }

    // In-app notification
    await supabaseAdmin.from('notifications').insert({
      user_id: job.employer_id,
      title: 'Job Listing Expired',
      message: `Your listing for "${job.title}" has been live for 60 days and has been automatically closed. You can repost it from your jobs page.`,
      type: 'application_update',
      read: false,
      related_id: job.id,
      related_type: 'job',
      link: '/my-jobs',
    })
  }

  console.log(`[job-expiry] done — expired ${expired} jobs`)
  return NextResponse.json({ ok: true, expired })
}
