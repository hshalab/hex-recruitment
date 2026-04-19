import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, fetchFreeBusy } from '@/lib/googleCalendar'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Convert JS Date.getDay() (0=Sun..6=Sat) to app convention (0=Mon..6=Sun)
const toAppDow = (jsDay: number) => (jsDay + 6) % 7

const pad = (n: number) => String(n).padStart(2, '0')
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Parse "HH:MM" or "HH:MM:SS" to minutes-of-day
const parseHm = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const fmtHm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const employerId = searchParams.get('employerId')
    const fromStr = searchParams.get('from')
    const toStr = searchParams.get('to')

    if (!employerId || !fromStr || !toStr) {
      return NextResponse.json(
        { error: 'employerId, from and to are required' },
        { status: 400 }
      )
    }

    const from = new Date(fromStr)
    const to = new Date(toStr)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    const fromDateStr = toDateStr(from)
    const toDateStrVal = toDateStr(to)

    const [weeklyRes, overridesRes, bookingsRes, interviewsRes] = await Promise.all([
      supabaseAdmin
        .from('employer_availability')
        .select('*')
        .eq('employer_id', employerId)
        .eq('is_active', true),
      supabaseAdmin
        .from('employer_availability_overrides')
        .select('*')
        .eq('employer_id', employerId)
        .gte('override_date', fromDateStr)
        .lte('override_date', toDateStrVal),
      supabaseAdmin
        .from('interview_bookings')
        .select('booked_date, booked_time, duration_minutes, status')
        .eq('employer_id', employerId)
        .eq('status', 'confirmed')
        .gte('booked_date', fromDateStr)
        .lte('booked_date', toDateStrVal),
      supabaseAdmin
        .from('interviews')
        .select('interview_date, interview_time, duration_minutes, status')
        .eq('employer_id', employerId)
        .in('status', ['scheduled', 'confirmed', 'pending_selection'])
        .gte('interview_date', fromDateStr)
        .lte('interview_date', toDateStrVal),
    ])

    let weekly = weeklyRes.data || []
    const overrides = overridesRes.data || []
    const bookings = bookingsRes.data || []
    const interviews = interviewsRes.data || []

    // Check if employer has Google Calendar connected
    const { data: empProfile } = await supabaseAdmin
      .from('employer_profiles')
      .select('gcal_access_token, gcal_refresh_token, gcal_calendar_id')
      .eq('user_id', employerId)
      .maybeSingle()

    const hasGcal = !!(empProfile?.gcal_refresh_token && empProfile?.gcal_calendar_id)

    // If no Thrive availability configured but Google Calendar IS connected,
    // use default working hours (Mon–Fri, 9:00–17:00, 45 min slots).
    if (weekly.length === 0 && hasGcal) {
      for (let dow = 0; dow <= 4; dow++) { // Mon=0 .. Fri=4
        weekly.push({
          employer_id: employerId,
          day_of_week: dow,
          slot_start: '09:00:00',
          slot_end: '17:00:00',
          duration_minutes: 45,
          buffer_minutes: 15,
          min_notice_hours: 24,
          max_advance_days: 28,
          is_active: true,
        })
      }
    }

    // Scheduling rules — pull from first active weekly row (same across days)
    const firstRule = weekly[0]
    const bufferMinutes: number = firstRule?.buffer_minutes ?? 0
    const minNoticeHours: number = firstRule?.min_notice_hours ?? 24
    const maxAdvanceDays: number = firstRule?.max_advance_days ?? 28

    // Compute "now" as Europe/London wall-clock, projected into the server's
    // naive Date space. Slots are built with new Date(y, m-1, d, h, min) which
    // also lives in that same "wall-clock-as-naive-Date" space, so the
    // comparison is correct regardless of the server timezone.
    const londonFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    const lparts = londonFmt.formatToParts(new Date())
    const lget = (t: string) => Number(lparts.find(p => p.type === t)!.value)
    const nowLondon = new Date(
      lget('year'),
      lget('month') - 1,
      lget('day'),
      lget('hour') === 24 ? 0 : lget('hour'),
      lget('minute'),
      lget('second')
    )

    // "Today" in Europe/London (midnight)
    const today = new Date(nowLondon)
    today.setHours(0, 0, 0, 0)

    // Cap the upper bound of the range by the employer's max_advance_days
    const maxAdvanceCap = new Date(today)
    maxAdvanceCap.setDate(maxAdvanceCap.getDate() + maxAdvanceDays)

    // Minimum-notice cutoff — any slot whose London wall-clock start is before this is hidden
    const noticeCutoff = new Date(nowLondon.getTime() + minNoticeHours * 60 * 60 * 1000)

    // Build blocked 15-min slot map keyed by date → Set<minutes>
    // Buffer is added after each booking's end.
    const blockedTimes = new Map<string, Set<number>>()
    const markBlocked = (date: string, startMin: number, dur: number) => {
      if (!blockedTimes.has(date)) blockedTimes.set(date, new Set())
      const set = blockedTimes.get(date)!
      const totalEnd = startMin + dur + bufferMinutes
      for (let m = startMin; m < totalEnd; m += 15) set.add(m)
    }

    for (const b of bookings) {
      markBlocked(b.booked_date, parseHm(String(b.booked_time)), b.duration_minutes || 45)
    }
    for (const i of interviews) {
      if (!i.interview_date || !i.interview_time) continue
      markBlocked(i.interview_date, parseHm(String(i.interview_time)), i.duration_minutes || 45)
    }

    // Block times from Google Calendar busy periods
    if (hasGcal) {
      try {
        const accessToken = await getValidAccessToken(employerId)
        if (accessToken) {
          const busyPeriods = await fetchFreeBusy(
            accessToken,
            empProfile!.gcal_calendar_id,
            from.toISOString(),
            to.toISOString()
          )
          for (const period of busyPeriods) {
            const start = new Date(period.start)
            const end = new Date(period.end)
            const dateStr = toDateStr(start)
            const startMin = start.getHours() * 60 + start.getMinutes()
            const durationMin = Math.ceil((end.getTime() - start.getTime()) / 60000)
            markBlocked(dateStr, startMin, durationMin)
          }
        }
      } catch (err) {
        console.error('[calendar/slots] Google Calendar freeBusy error:', err)
        // Continue without gcal data — don't fail the request
      }
    }

    const blockedDates = new Set(
      overrides.filter(o => o.is_blocked).map(o => o.override_date as string)
    )
    const extraSlots = overrides.filter(o => !o.is_blocked && o.slot_start && o.slot_end)

    const slots: Array<{ date: string; time: string; duration: number }> = []
    const cursor = new Date(from)
    cursor.setHours(0, 0, 0, 0)
    // Cap end date by max_advance_days from today
    let end = new Date(to)
    end.setHours(0, 0, 0, 0)
    if (end > maxAdvanceCap) end = maxAdvanceCap

    while (cursor <= end) {
      const dateStr = toDateStr(cursor)

      // Skip past dates
      if (cursor >= today && !blockedDates.has(dateStr)) {
        const dow = toAppDow(cursor.getDay())
        const rules = weekly.filter(w => w.day_of_week === dow)

        const pushSlots = (startMin: number, endMin: number, dur: number) => {
          for (let m = startMin; m + dur <= endMin; m += 15) {
            // Apply minimum-notice cutoff — build full slot datetime from strings
            const [yy, mm, dd] = dateStr.split('-').map(Number)
            const slotDatetime = new Date(yy, mm - 1, dd, Math.floor(m / 60), m % 60, 0, 0)
            if (slotDatetime <= noticeCutoff) continue

            const blockedSet = blockedTimes.get(dateStr)
            let overlaps = false
            if (blockedSet) {
              // Check slot + buffer window for conflicts with existing bookings
              const checkEnd = m + dur + bufferMinutes
              for (let s = m; s < checkEnd; s += 15) {
                if (blockedSet.has(s)) { overlaps = true; break }
              }
            }
            if (!overlaps) slots.push({ date: dateStr, time: fmtHm(m), duration: dur })
          }
        }

        for (const rule of rules) {
          pushSlots(
            parseHm(String(rule.slot_start)),
            parseHm(String(rule.slot_end)),
            rule.duration_minutes || 45
          )
        }

        // Apply any additive overrides for this specific date
        for (const o of extraSlots.filter(x => x.override_date === dateStr)) {
          pushSlots(
            parseHm(String(o.slot_start)),
            parseHm(String(o.slot_end)),
            // Fall back to first weekly rule's duration or 45
            rules[0]?.duration_minutes || 45
          )
        }
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    return NextResponse.json({ slots, hasGcal })
  } catch (err: any) {
    console.error('[calendar/slots] error', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
