import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, updateCalendarEvent, buildLondonIso, addMinutesToLondonIso } from '@/lib/googleCalendar'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Lightweight endpoint to sync an interview update to Google Calendar.
 * Called after inline edits on the calendar event detail modal.
 */
export async function POST(req: NextRequest) {
  try {
    const { interviewId, employerId, date, time, duration, interviewType, candidateName, jobTitle } = await req.json()

    if (!interviewId || !employerId) {
      return NextResponse.json({ error: 'Missing interviewId or employerId' }, { status: 400 })
    }

    // Find the booking row to get the gcal event ID
    const { data: booking } = await supabaseAdmin
      .from('interview_bookings')
      .select('gcal_event_id_employer')
      .eq('interview_id', interviewId)
      .maybeSingle()

    if (!booking?.gcal_event_id_employer) {
      // No Google Calendar event to update
      return NextResponse.json({ ok: true, gcal: false })
    }

    // Get employer's calendar credentials
    const { data: profile } = await supabaseAdmin
      .from('employer_profiles')
      .select('gcal_calendar_id')
      .eq('user_id', employerId)
      .maybeSingle()

    if (!profile?.gcal_calendar_id) {
      return NextResponse.json({ ok: true, gcal: false })
    }

    const accessToken = await getValidAccessToken(employerId)
    if (!accessToken) {
      return NextResponse.json({ ok: true, gcal: false })
    }

    const dur = duration || 45
    const startIso = buildLondonIso(date, time)
    const endIso = addMinutesToLondonIso(startIso, dur)
    const typeLabel = interviewType === 'video' ? 'Video Call' : interviewType === 'phone' ? 'Phone Call' : 'In-Person'

    await updateCalendarEvent(
      accessToken,
      profile.gcal_calendar_id,
      booking.gcal_event_id_employer,
      {
        summary: `Interview: ${candidateName || 'Candidate'} — ${jobTitle || 'Interview'}`,
        description: `Type: ${typeLabel}\nManaged via Thrive — thrivecareer.co.uk`,
        startIso,
        endIso,
      }
    )

    return NextResponse.json({ ok: true, gcal: true })
  } catch (err: any) {
    console.error('[calendar/update-event]', err.message)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
