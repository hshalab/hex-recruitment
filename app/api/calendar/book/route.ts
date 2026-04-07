import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      interviewId,
      employerId,
      candidateId,
      bookedDate,
      bookedTime,
      duration,
      candidateEmail,
      jobTitle,
      companyName,
      candidateName,
    } = body || {}

    if (!employerId || !candidateId || !bookedDate || !bookedTime) {
      return NextResponse.json(
        { error: 'employerId, candidateId, bookedDate and bookedTime are required' },
        { status: 400 }
      )
    }

    const dur = Number(duration) || 45

    // Insert booking
    const { data: booking, error: bookErr } = await supabaseAdmin
      .from('interview_bookings')
      .insert({
        interview_id: interviewId || null,
        employer_id: employerId,
        candidate_id: candidateId,
        booked_date: bookedDate,
        booked_time: bookedTime,
        duration_minutes: dur,
        status: 'confirmed',
      })
      .select()
      .single()

    if (bookErr || !booking) {
      console.error('[calendar/book] insert error', bookErr)
      return NextResponse.json({ error: bookErr?.message || 'Booking failed' }, { status: 500 })
    }

    // Update the interview row → confirmed
    let applicationId: string | null = null
    if (interviewId) {
      const { data: interview } = await supabaseAdmin
        .from('interviews')
        .select('application_id')
        .eq('id', interviewId)
        .maybeSingle()
      applicationId = interview?.application_id || null

      await supabaseAdmin
        .from('interviews')
        .update({
          status: 'confirmed',
          interview_date: bookedDate,
          interview_time: bookedTime,
          duration_minutes: dur,
          booking_id: booking.id,
        })
        .eq('id', interviewId)
    }

    // Update job_applications status → 'interview'
    if (applicationId) {
      await supabaseAdmin
        .from('job_applications')
        .update({ status: 'interview' })
        .eq('id', applicationId)
    }

    // Format a friendly date for notifications/emails
    const [y, m, d] = String(bookedDate).split('-').map(Number)
    const friendlyDate = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    // Insert notifications for both sides
    const notifications = [
      {
        user_id: candidateId,
        title: 'Interview Confirmed',
        message: `${companyName || 'The employer'} confirmed your interview for ${jobTitle || 'the role'} on ${friendlyDate} at ${bookedTime}.`,
        type: 'application_update',
        read: false,
        related_id: applicationId,
        related_type: 'application',
        link: '/applications',
      },
      {
        user_id: employerId,
        title: 'Interview Booked',
        message: `${candidateName || 'A candidate'} booked an interview for ${jobTitle || 'the role'} on ${friendlyDate} at ${bookedTime}.`,
        type: 'application_update',
        read: false,
        related_id: applicationId,
        related_type: 'application',
        link: '/applicants',
      },
    ]
    await supabaseAdmin.from('notifications').insert(notifications)

    // Fire-and-forget email to candidate
    if (candidateEmail) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: candidateEmail,
          type: 'interview_scheduled',
          data: {
            companyName: companyName || '',
            jobTitle: jobTitle || '',
            date: friendlyDate,
            time: bookedTime,
          },
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ booking, success: true })
  } catch (err: any) {
    console.error('[calendar/book] error', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
