import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, deleteCalendarEvent } from '@/lib/googleCalendar'

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
    if (!interviewId) {
      return NextResponse.json({ error: 'interviewId required' }, { status: 400 })
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
