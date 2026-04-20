import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getValidAccessToken,
  createCalendarEvent,
  updateCalendarEvent,
  buildLondonIso,
  addMinutesToLondonIso,
} from '@/lib/googleCalendar'
import { sendInterviewMessage } from '@/lib/sendInterviewMessage'

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
      selfScheduled,
    } = body || {}

    if (!employerId || !candidateId || !bookedDate || !bookedTime) {
      return NextResponse.json(
        { error: 'employerId, candidateId, bookedDate and bookedTime are required' },
        { status: 400 }
      )
    }

    const dur = Number(duration) || 45

    // If this is a reschedule of an existing interview, find the prior
    // booking so we can carry the Google Calendar event id forward and
    // PUT (update) the existing event instead of creating a new one.
    let priorGcalEventId: string | null = null
    if (interviewId) {
      const { data: priorBooking } = await supabaseAdmin
        .from('interview_bookings')
        .select('id, gcal_event_id_employer')
        .eq('interview_id', interviewId)
        .not('gcal_event_id_employer', 'is', null)
        .order('booked_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      priorGcalEventId = priorBooking?.gcal_event_id_employer || null

      // Mark any prior bookings for this interview as cancelled so they
      // don't pile up. We keep the gcal_event_id_employer cleared on the
      // prior row since we're taking it over on the new row.
      if (priorBooking?.id) {
        await supabaseAdmin
          .from('interview_bookings')
          .update({ status: 'cancelled', gcal_event_id_employer: null, cancelled_at: new Date().toISOString() })
          .eq('id', priorBooking.id)
      }
    }

    // Insert booking — carry forward the prior Google event id if we're rescheduling
    const { data: booking, error: bookErr } = await supabaseAdmin
      .from('interview_bookings')
      .insert({
        interview_id: interviewId || null,
        employer_id: employerId,
        candidate_id: candidateId,
        booked_date: bookedDate,
        booked_time: bookedTime,
        duration_minutes: dur,
        status: 'scheduled',
        gcal_event_id_employer: priorGcalEventId,
      })
      .select()
      .single()

    if (bookErr || !booking) {
      console.error('[calendar/book] insert error', bookErr)
      return NextResponse.json({ error: bookErr?.message || 'Booking failed' }, { status: 500 })
    }

    // Update the interview row → scheduled (awaiting candidate confirmation)
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
          status: selfScheduled ? 'confirmed' : 'scheduled',
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

    // Get meeting link from the interview (if video call)
    let bookingMeetingLink: string | null = null
    if (interviewId) {
      const { data: ivRow } = await supabaseAdmin
        .from('interviews')
        .select('location_or_link')
        .eq('id', interviewId)
        .maybeSingle()
      if (ivRow?.location_or_link?.startsWith('http')) {
        bookingMeetingLink = ivRow.location_or_link
      }
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
        link: '/interviews',
      },
    ]
    await supabaseAdmin.from('notifications').insert(notifications)

    // Create Google Calendar event on the employer's connected calendar (soft-fail).
    try {
      const { data: profile } = await supabaseAdmin
        .from('employer_profiles')
        .select('gcal_calendar_id')
        .eq('user_id', employerId)
        .maybeSingle()

      const calendarId = profile?.gcal_calendar_id
      if (calendarId) {
        const accessToken = await getValidAccessToken(employerId)
        if (accessToken) {
          const startIso = buildLondonIso(bookedDate, bookedTime)
          const endIso = addMinutesToLondonIso(startIso, dur)
          const { data: interviewRow } = interviewId
            ? await supabaseAdmin
                .from('interviews')
                .select('interview_type, location_or_link')
                .eq('id', interviewId)
                .maybeSingle()
            : { data: null as any }
          const interviewType = interviewRow?.interview_type || 'Interview'
          const interviewLink = interviewRow?.location_or_link?.startsWith('http') ? interviewRow.location_or_link : null

          const eventPayload = {
            summary: `Interview: ${candidateName || 'Candidate'} — ${jobTitle || 'Role'}`,
            description: [
              'Interview via Thrive',
              `Candidate: ${candidateName || 'Candidate'}`,
              `Job: ${jobTitle || 'Role'}`,
              `Type: ${interviewType}`,
              ...(interviewLink ? [`Join: ${interviewLink}`] : []),
            ].join('\n'),
            startIso,
            endIso,
            timeZone: 'Europe/London',
            attendees: candidateEmail ? [candidateEmail] : [],
          }

          // Reschedule path: update the existing event. Initial booking path:
          // create a new event. If the update fails (e.g. the event was
          // deleted directly in Google Calendar) fall through and create
          // a fresh one.
          let gEvent = null as Awaited<ReturnType<typeof createCalendarEvent>>
          if (priorGcalEventId) {
            gEvent = await updateCalendarEvent(accessToken, calendarId, priorGcalEventId, eventPayload)
          }
          if (!gEvent) {
            gEvent = await createCalendarEvent(accessToken, calendarId, eventPayload)
          }

          if (gEvent?.id) {
            await supabaseAdmin
              .from('interview_bookings')
              .update({ gcal_event_id_employer: gEvent.id })
              .eq('id', booking.id)
          }
        }
      }
    } catch (err) {
      // Never block the booking on a calendar sync failure
      console.error('[calendar/book] gcal sync failed', err)
    }

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

    // Send in-app message to candidate
    sendInterviewMessage({
      employerId,
      candidateId,
      companyName: companyName || 'The employer',
      candidateName: candidateName || 'Candidate',
      jobId: null, // resolved from interview if needed
      jobTitle: jobTitle || 'the role',
      content: `Hi ${candidateName || 'there'}, I've scheduled an interview for ${jobTitle || 'the role'} on ${friendlyDate} at ${bookedTime}.${bookingMeetingLink ? ` Meeting link: ${bookingMeetingLink}` : ''} Check your email for the calendar invite.`,
    }).catch(() => {})

    return NextResponse.json({ booking, success: true })
  } catch (err: any) {
    console.error('[calendar/book] error', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
