import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, deleteCalendarEvent } from '@/lib/googleCalendar'
import { sendInterviewMessage } from '@/lib/sendInterviewMessage'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

// Removes a previously-synced Google Calendar event when an interview
// is cancelled. Call from the client after the DB cancellation has
// been written. Soft-fails silently if there's nothing to delete.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const interviewId: string | undefined = body?.interviewId
    const employerId: string | undefined = body?.employerId
    // 'back_to_review' tailors the cancellation message so the candidate knows
    // their application is still under consideration.
    const context: 'default' | 'back_to_review' = body?.context === 'back_to_review' ? 'back_to_review' : 'default'
    if (!interviewId) {
      return NextResponse.json({ error: 'interviewId required' }, { status: 400 })
    }

    // Get interview details for notifications
    const { data: interview } = await supabaseAdmin
      .from('interviews')
      .select('candidate_id, job_id, interview_date, interview_time, jobs ( title, company )')
      .eq('id', interviewId)
      .maybeSingle()

    const job: any = interview?.jobs ? (Array.isArray(interview.jobs) ? interview.jobs[0] : interview.jobs) : null
    const jobTitle = job?.title || 'the role'
    const companyName = job?.company || 'The employer'
    const candidateId = interview?.candidate_id

    // Update the interview status to cancelled
    await supabaseAdmin.from('interviews').update({ status: 'cancelled' }).eq('id', interviewId)

    // Send notification + message + email to candidate
    if (candidateId) {
      // Get candidate details
      const { data: candidateProfile } = await supabaseAdmin
        .from('candidate_profiles')
        .select('full_name, email')
        .eq('user_id', candidateId)
        .maybeSingle()

      const notifTitle = context === 'back_to_review'
        ? 'Interview Cancelled — Application Under Further Review'
        : 'Interview Cancelled'
      const notifMessage = context === 'back_to_review'
        ? `${companyName} has cancelled your interview for ${jobTitle} while they take another look at your application. We'll be in touch shortly.`
        : `${companyName} has cancelled your interview for ${jobTitle}.`
      const messageBody = context === 'back_to_review'
        ? `Hi ${candidateProfile?.full_name || 'there'}, we've cancelled your scheduled interview for ${jobTitle} as we'd like to take another look at your application before we proceed. We'll be in touch shortly — thanks for your patience.`
        : `Hi ${candidateProfile?.full_name || 'there'}, your interview for ${jobTitle} has been cancelled. If you have any questions, please reply to this message.`

      await supabaseAdmin.from('notifications').insert({
        user_id: candidateId,
        title: notifTitle,
        message: notifMessage,
        type: 'application_update',
        read: false,
        link: '/applications',
      })

      sendInterviewMessage({
        employerId: employerId || '',
        candidateId,
        companyName,
        candidateName: candidateProfile?.full_name || 'Candidate',
        jobId: interview?.job_id || null,
        jobTitle,
        content: messageBody,
      }).catch(() => {})

      // Send cancellation email
      if (candidateProfile?.email) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || ''
        fetch(`${siteUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: candidateProfile.email,
            type: 'interview_cancelled',
            data: { companyName, jobTitle, candidateName: candidateProfile.full_name || 'Candidate' },
          }),
        }).catch(() => {})
      }
    }

    // Find the booking for this interview (if any)
    const { data: booking } = await supabaseAdmin
      .from('interview_bookings')
      .select('id, employer_id, gcal_event_id_employer')
      .eq('interview_id', interviewId)
      .maybeSingle()

    if (!booking?.gcal_event_id_employer || !booking.employer_id) {
      return NextResponse.json({ ok: true, skipped: 'no_gcal_event' })
    }

    const { data: profile } = await supabaseAdmin
      .from('employer_profiles')
      .select('gcal_calendar_id')
      .eq('user_id', booking.employer_id)
      .maybeSingle()

    const calendarId = profile?.gcal_calendar_id
    if (!calendarId) {
      return NextResponse.json({ ok: true, skipped: 'no_calendar' })
    }

    const accessToken = await getValidAccessToken(booking.employer_id)
    if (accessToken) {
      await deleteCalendarEvent(accessToken, calendarId, booking.gcal_event_id_employer)
    }

    await supabaseAdmin
      .from('interview_bookings')
      .update({ gcal_event_id_employer: null, status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', booking.id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[calendar/cancel] error', err)
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
