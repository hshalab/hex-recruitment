import { NextRequest, NextResponse } from 'next/server'
import { interviewReminderEmail } from '@/emails/interview-reminder'

import { supabaseAdmin } from '@/lib/supabase-admin'

function friendlyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export async function GET(req: NextRequest) {
  // Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const in1h = new Date(now.getTime() + 60 * 60 * 1000)
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Today and tomorrow date strings (YYYY-MM-DD) for filtering bookings
  const todayStr = now.toISOString().slice(0, 10)
  const tomorrowStr = in24h.toISOString().slice(0, 10)

  // Fetch confirmed bookings for today or tomorrow that haven't had
  // both reminders sent yet.
  const { data: bookings, error } = await supabaseAdmin
    .from('interview_bookings')
    .select(`
      id, employer_id, candidate_id, booked_date, booked_time, duration_minutes,
      reminder_24h_sent, reminder_1h_sent,
      interviews ( job_id, interview_type, location_or_link,
        jobs ( title, company ) )
    `)
    .eq('status', 'confirmed')
    .in('booked_date', [todayStr, tomorrowStr])
    .or('reminder_24h_sent.eq.false,reminder_1h_sent.eq.false')

  if (error) {
    console.error('[interview-reminders] query error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent24h = 0
  let sent1h = 0
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  for (const b of bookings || []) {
    const [y, m, d] = String(b.booked_date).split('-').map(Number)
    const [hh, mm] = String(b.booked_time).split(':').map(Number)
    const bookingTime = new Date(y, m - 1, d, hh, mm)
    const hoursUntil = (bookingTime.getTime() - now.getTime()) / (60 * 60 * 1000)

    // Skip past bookings
    if (hoursUntil < 0) continue

    const iv: any = Array.isArray(b.interviews) ? b.interviews[0] : b.interviews
    const job: any = iv?.jobs ? (Array.isArray(iv.jobs) ? iv.jobs[0] : iv.jobs) : null
    const jobTitle = job?.title || 'Interview'
    const companyName = job?.company || 'Employer'
    const dateStr = friendlyDate(String(b.booked_date))
    const timeStr = String(b.booked_time).slice(0, 5)

    // Look up names and emails
    const { data: empProfile } = await supabaseAdmin
      .from('employer_profiles')
      .select('contact_name, email')
      .eq('user_id', b.employer_id)
      .maybeSingle()
    const { data: candProfile } = await supabaseAdmin
      .from('candidate_profiles')
      .select('full_name, email')
      .eq('user_id', b.candidate_id)
      .maybeSingle()

    const employerName = empProfile?.contact_name || 'Employer'
    const employerEmail = empProfile?.email
    const candidateName = candProfile?.full_name || 'Candidate'
    const candidateEmail = candProfile?.email

    // 24h reminder: send when 1h < hoursUntil <= 25h and not yet sent
    if (!b.reminder_24h_sent && hoursUntil > 1 && hoursUntil <= 25) {
      // Employer reminder
      if (employerEmail) {
        const email = interviewReminderEmail(employerName, candidateName, jobTitle, companyName, dateStr, timeStr, 24, 'employer')
        fetch(`${siteUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: employerEmail, type: 'raw', data: email }),
        }).catch(() => {})
      }
      // Candidate reminder
      if (candidateEmail) {
        const email = interviewReminderEmail(candidateName, candidateName, jobTitle, companyName, dateStr, timeStr, 24, 'candidate')
        fetch(`${siteUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: candidateEmail, type: 'raw', data: email }),
        }).catch(() => {})
      }
      await supabaseAdmin
        .from('interview_bookings')
        .update({ reminder_24h_sent: true })
        .eq('id', b.id)
      sent24h++
    }

    // 1h reminder: send when 0 < hoursUntil <= 1.5h and not yet sent
    if (!b.reminder_1h_sent && hoursUntil > 0 && hoursUntil <= 1.5) {
      if (employerEmail) {
        const email = interviewReminderEmail(employerName, candidateName, jobTitle, companyName, dateStr, timeStr, 1, 'employer')
        fetch(`${siteUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: employerEmail, type: 'raw', data: email }),
        }).catch(() => {})
      }
      if (candidateEmail) {
        const email = interviewReminderEmail(candidateName, candidateName, jobTitle, companyName, dateStr, timeStr, 1, 'candidate')
        fetch(`${siteUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: candidateEmail, type: 'raw', data: email }),
        }).catch(() => {})
      }
      await supabaseAdmin
        .from('interview_bookings')
        .update({ reminder_1h_sent: true })
        .eq('id', b.id)
      sent1h++
    }
  }

  console.log(`[interview-reminders] done — 24h: ${sent24h}, 1h: ${sent1h}`)
  return NextResponse.json({ ok: true, sent24h, sent1h })
}
