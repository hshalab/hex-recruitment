import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const weekly = weeklyRes.data || []
    const overrides = overridesRes.data || []
    const bookings = bookingsRes.data || []
    const interviews = interviewsRes.data || []

    // Build blocked 15-min slot map keyed by date → Set<minutes>
    const blockedTimes = new Map<string, Set<number>>()
    const markBlocked = (date: string, startMin: number, dur: number) => {
      if (!blockedTimes.has(date)) blockedTimes.set(date, new Set())
      const set = blockedTimes.get(date)!
      for (let m = startMin; m < startMin + dur; m += 15) set.add(m)
    }

    for (const b of bookings) {
      markBlocked(b.booked_date, parseHm(String(b.booked_time)), b.duration_minutes || 45)
    }
    for (const i of interviews) {
      if (!i.interview_date || !i.interview_time) continue
      markBlocked(i.interview_date, parseHm(String(i.interview_time)), i.duration_minutes || 45)
    }

    const blockedDates = new Set(
      overrides.filter(o => o.is_blocked).map(o => o.override_date as string)
    )
    const extraSlots = overrides.filter(o => !o.is_blocked && o.slot_start && o.slot_end)

    // Today at midnight (local)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const slots: Array<{ date: string; time: string; duration: number }> = []
    const cursor = new Date(from)
    cursor.setHours(0, 0, 0, 0)
    const end = new Date(to)
    end.setHours(0, 0, 0, 0)

    while (cursor <= end) {
      const dateStr = toDateStr(cursor)

      // Skip past dates
      if (cursor >= today && !blockedDates.has(dateStr)) {
        const dow = toAppDow(cursor.getDay())
        const rules = weekly.filter(w => w.day_of_week === dow)

        const pushSlots = (startMin: number, endMin: number, dur: number) => {
          for (let m = startMin; m + dur <= endMin; m += dur) {
            const blockedSet = blockedTimes.get(dateStr)
            let overlaps = false
            if (blockedSet) {
              for (let s = m; s < m + dur; s += 15) {
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

    return NextResponse.json({ slots })
  } catch (err: any) {
    console.error('[calendar/slots] error', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
