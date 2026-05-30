import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken, createCalendarEvent, updateCalendarEvent, buildLondonIso, addMinutesToLondonIso } from '@/lib/googleCalendar'
import { sendInterviewMessage } from '@/lib/sendInterviewMessage'

import { supabaseAdmin } from '@/lib/supabase-admin'

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

    // Get the interview's candidate, application, and current link info
    const { data: interview } = await supabaseAdmin
      .from('interviews')
      .select('candidate_id, application_id, job_id, location_or_link')
      .eq('id', interviewId)
      .maybeSingle()

    const meetingLink = interview?.location_or_link?.startsWith('http') ? interview.location_or_link : null

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

    // Format friendly date for notifications. The previous version
    // unconditionally called `new Date(y, m, d)` even when `date` was
    // empty / missing — producing the literal string "Invalid Date" in
    // every downstream notification + email. After fix #1b, an interview
    // row in pending_selection has NULL date/time on purpose; if a
    // caller (handleAcceptInterview or NotificationBell) hits this route
    // for an interview that hasn't been scheduled yet, we now render
    // honest "awaiting scheduling" / "TBC" copy and skip the gcal sync
    // block at the bottom. The confirm-without-real-date path itself
    // is parked for fix #1c; this guard only ensures #1b doesn't
    // produce Invalid Date anywhere.
    const hasDate = typeof date === 'string' && date.length > 0
    const hasTime = typeof time === 'string' && time.length > 0
    let friendlyDate = 'awaiting scheduling'
    if (hasDate) {
      const [y, m, d] = date.split('-').map(Number)
      friendlyDate = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    }
    const displayTime = hasTime ? time : 'TBC'

    // 1. Notify the candidate about the change
    if (candidateId) {
      await supabaseAdmin.from('notifications').insert({
        user_id: candidateId,
        title: 'Interview Updated',
        message: `${companyName} has updated your interview for ${jobTitle || 'the role'} to ${friendlyDate} at ${displayTime}. Type: ${typeLabel}.`,
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
            time: displayTime,
            interviewType: typeLabel,
          },
        }),
      }).catch(() => {})
    }

    // 3. Send in-app message to candidate
    if (candidateId) {
      sendInterviewMessage({
        employerId,
        candidateId,
        companyName,
        candidateName: candidateName || 'Candidate',
        jobId: interview?.job_id || null,
        jobTitle: jobTitle || 'the role',
        content: `Hi ${candidateName || 'there'}, your interview for ${jobTitle || 'the role'} has been updated to ${friendlyDate} at ${displayTime}. Type: ${typeLabel}.${meetingLink ? ` Meeting link: ${meetingLink}` : ''} Check your email for the updated calendar invite.`,
      }).catch(() => {})
    }

    // 4. Sync to Google Calendar — update existing event or create new one.
    // Failures are recorded on interview_bookings.gcal_sync_error (added by
    // migration 20260529160000) rather than silently swallowed. The route
    // still returns 200 — this is a sync operation that runs after the
    // interview's in-DB state has already been updated above, so calendar
    // failure isn't a blocker for the user-visible change.
    const { data: booking } = await supabaseAdmin
      .from('interview_bookings')
      .select('id, gcal_event_id_employer')
      .eq('interview_id', interviewId)
      .maybeSingle()

    if (empProfile?.gcal_calendar_id && hasDate && hasTime) {
      // Skip the gcal sync entirely if we don't have real date+time —
      // buildLondonIso('', '') NaNs out and any downstream events.insert
      // would emit garbage. The candidate-facing notification + email
      // above already rendered "awaiting scheduling" / "TBC", which is
      // the right user-visible state when this branch doesn't run.
      try {
        const accessToken = await getValidAccessToken(employerId)
        if (accessToken) {
          const startIso = buildLondonIso(date, time)
          const endIso = addMinutesToLondonIso(startIso, dur)

          const eventPayload = {
              summary: `Interview: ${candidateName || 'Candidate'} — ${jobTitle || 'Interview'}`,
              description: [
                `Type: ${typeLabel}`,
                `Candidate: ${candidateName || 'Candidate'}`,
                ...(meetingLink ? [`Join: ${meetingLink}`] : []),
                'Managed via Thrive — thrivecareer.co.uk',
              ].join('\n'),
              startIso,
              endIso,
              attendees: candidateEmail ? [candidateEmail] : [],
            }

          // updateCalendarEvent returns null on 404/410 ("event no longer
          // exists" — expected fall-through to create); throws on other
          // failures (caught below).
          let gEvent: Awaited<ReturnType<typeof createCalendarEvent>> | null = null
          if (booking?.gcal_event_id_employer) {
            gEvent = await updateCalendarEvent(accessToken, empProfile.gcal_calendar_id, booking.gcal_event_id_employer, eventPayload)
          }
          if (!gEvent) {
            gEvent = await createCalendarEvent(accessToken, empProfile.gcal_calendar_id, eventPayload)
          }

          if (gEvent?.id && booking?.id && (!booking.gcal_event_id_employer || booking.gcal_event_id_employer !== gEvent.id)) {
            await supabaseAdmin
              .from('interview_bookings')
              .update({ gcal_event_id_employer: gEvent.id, gcal_sync_error: null })
              .eq('id', booking.id)
          } else if (gEvent?.id && booking?.id) {
            // Clear any previously recorded error if the update succeeded
            // on a row that already had the correct gcal_event_id_employer.
            await supabaseAdmin
              .from('interview_bookings')
              .update({ gcal_sync_error: null })
              .eq('id', booking.id)
          }
        }
      } catch (err: any) {
        const errMessage = err?.message || String(err)
        console.error('[calendar/update-event] gcal sync failed', err)
        if (booking?.id) {
          await supabaseAdmin
            .from('interview_bookings')
            .update({ gcal_sync_error: errMessage })
            .eq('id', booking.id)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[calendar/update-event]', err.message)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
