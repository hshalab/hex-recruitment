import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, updateCalendarEvent, buildLondonIso, addMinutesToLondonIso } from '@/lib/googleCalendar'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Sync an interview update to Google Calendar + notify the candidate.
 * Called after inline edits on the calendar event detail modal.
 */
export async function POST(req: NextRequest) {
  try {
    const { interviewId, employerId, date, time, duration, interviewType, candidateName, jobTitle } = await req.json()

    if (!interviewId || !employerId) {
      return NextResponse.json({ error: 'Missing interviewId or employerId' }, { status: 400 })
    }

    const dur = duration || 45
    const typeLabel = interviewType === 'video' ? 'Video Call' : interviewType === 'phone' ? 'Phone Call' : 'In-Person'

    // Get the interview's candidate and application info
    const { data: interview } = await supabaseAdmin
      .from('interviews')
      .select('candidate_id, application_id, job_id')
      .eq('id', interviewId)
      .maybeSingle()

    const candidateId = interview?.candidate_id
    const applicationId = interview?.application_id

    // Get candidate email for calendar invite + email notification
    let candidateEmail: string | null = null
    if (candidateId) {
      const { data: candidateProfile } = await supabaseAdmin
        .from('candidate_profiles')
        .select('email')
        .eq('user_id', candidateId)
        .maybeSingle()
      candidateEmail = candidateProfile?.email || null
    }

    // Get employer company name
    const { data: empProfile } = await supabaseAdmin
      .from('employer_profiles')
      .select('company_name, gcal_calendar_id')
      .eq('user_id', employerId)
      .maybeSingle()

    const companyName = empProfile?.company_name || 'The employer'

    // Format friendly date for notifications
    const [y, m, d] = date.split('-').map(Number)
    const friendlyDate = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    // 1. Notify the candidate about the change
    if (candidateId) {
      await supabaseAdmin.from('notifications').insert({
        user_id: candidateId,
        title: 'Interview Updated',
        message: `${companyName} has updated your interview for ${jobTitle || 'the role'} to ${friendlyDate} at ${time}. Type: ${typeLabel}.`,
        type: 'application_update',
        read: false,
        related_id: applicationId || null,
        related_type: 'application',
        link: '/applications',
      })
    }

    // 2. Send email to candidate about the update
    if (candidateEmail) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || ''
      fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: candidateEmail,
          type: 'interview_rescheduled',
          data: {
            companyName,
            jobTitle: jobTitle || '',
            date: friendlyDate,
            time,
            interviewType: typeLabel,
          },
        }),
      }).catch(() => {})
    }

    // 3. Sync to Google Calendar
    const { data: booking } = await supabaseAdmin
      .from('interview_bookings')
      .select('gcal_event_id_employer')
      .eq('interview_id', interviewId)
      .maybeSingle()

    if (booking?.gcal_event_id_employer && empProfile?.gcal_calendar_id) {
      const accessToken = await getValidAccessToken(employerId)
      if (accessToken) {
        const startIso = buildLondonIso(date, time)
        const endIso = addMinutesToLondonIso(startIso, dur)

        await updateCalendarEvent(
          accessToken,
          empProfile.gcal_calendar_id,
          booking.gcal_event_id_employer,
          {
            summary: `Interview: ${candidateName || 'Candidate'} — ${jobTitle || 'Interview'}`,
            description: `Type: ${typeLabel}\nCandidate: ${candidateName || 'Candidate'}\nManaged via Thrive — thrivecareer.co.uk`,
            startIso,
            endIso,
            attendees: candidateEmail ? [candidateEmail] : [],
          }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[calendar/update-event]', err.message)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
