'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import styles from './page.module.css'

type BookingRow = {
  id: string
  interview_id: string | null
  candidate_id: string
  booked_date: string
  booked_time: string
  duration_minutes: number
  status: string
  interviews?: {
    interview_type?: string | null
    location_or_link?: string | null
    job_id?: string | null
    application_id?: string | null
    jobs?: { title?: string | null } | { title?: string | null }[] | null
  } | any
}

type Event = {
  id: string
  interviewId: string | null
  applicationId: string | null
  jobId: string | null
  candidateId: string
  candidateName: string
  jobTitle: string
  date: string
  time: string
  duration: number
  status: string
  interviewType: string
  meetingLink: string
  locationOrLink: string
}

type WeeklyRule = {
  day_of_week: number
  slot_start: string
  slot_end: string
  is_active: boolean
}

const DAY_GRID_START = 8 // 08:00
const DAY_GRID_END = 19 // 19:00 (so 08 → 18 are labelled)
const HOUR_HEIGHT = 80 // px

const pad = (n: number) => String(n).padStart(2, '0')
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseHm = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const fmt12 = (hm: string) => {
  const [hStr, mStr] = hm.split(':')
  let h = Number(hStr); const m = Number(mStr)
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${pad(m)}${ap}`
}

// Convert JS getDay() (0=Sun..6=Sat) to our 0=Mon..6=Sun
const toAppDow = (jsDay: number) => (jsDay + 6) % 7

// Start of the ISO week (Monday) for a given date
function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const day = out.getDay()
  const diff = (day + 6) % 7 // 0 if Mon
  out.setDate(out.getDate() - diff)
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function fmtRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const e = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} – ${e}`
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?'

// ───── Single-day mobile view ─────
function DayView({
  day,
  events,
  availability,
  now,
  onSelectEvent,
  onPrev,
  onNext,
}: {
  day: Date
  events: Event[]
  availability: WeeklyRule[]
  now: Date
  onSelectEvent: (e: Event) => void
  onPrev: () => void
  onNext: () => void
}) {
  const touchStartX = useRef<number | null>(null)
  const gridTotalMinutes = (DAY_GRID_END - DAY_GRID_START) * 60
  const isToday =
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate()

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0) onNext()
    else onPrev()
  }

  return (
    <div className={styles.dayViewWrap}>
      <div className={styles.dayViewBody} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className={styles.timeCol}>
          {Array.from({ length: DAY_GRID_END - DAY_GRID_START }).map((_, hourIdx) => (
            <div key={hourIdx} className={styles.timeLabel}>
              {pad(DAY_GRID_START + hourIdx)}:00
            </div>
          ))}
        </div>
        <div className={`${styles.dayCol} ${isToday ? styles.dayColToday : ''}`} style={{ flex: 1 }}>
          {Array.from({ length: DAY_GRID_END - DAY_GRID_START }).map((_, h) => (
            <div
              key={`hl-${h}`}
              className={styles.hourLine}
              style={{ top: `${h * HOUR_HEIGHT}px` }}
            />
          ))}
          {availability.map((r, idx) => {
            const sMin = parseHm(String(r.slot_start).slice(0, 5))
            const eMin = parseHm(String(r.slot_end).slice(0, 5))
            const topMin = sMin - DAY_GRID_START * 60
            const heightMin = eMin - sMin
            if (topMin < 0 || topMin >= gridTotalMinutes) return null
            return (
              <div
                key={`av-${idx}`}
                className={styles.availBlock}
                style={{
                  top: `${(topMin / 60) * HOUR_HEIGHT}px`,
                  height: `${(heightMin / 60) * HOUR_HEIGHT}px`,
                }}
              />
            )
          })}
          {events.map(ev => {
            const topMin = parseHm(ev.time) - DAY_GRID_START * 60
            if (topMin < 0 || topMin >= gridTotalMinutes) return null
            const heightPx = Math.max(22, (ev.duration / 60) * HOUR_HEIGHT - 4)
            const cls =
              ev.status === 'confirmed' ? styles.eventConfirmed :
              ev.status === 'cancelled' ? styles.eventCancelled :
              styles.eventScheduled
            return (
              <div
                key={ev.id}
                className={`${styles.event} ${cls}`}
                style={{
                  top: `${(topMin / 60) * HOUR_HEIGHT + 2}px`,
                  height: `${heightPx}px`,
                }}
                onClick={() => onSelectEvent(ev)}
              >
                <span className={styles.eventName}>{ev.candidateName}</span>
                <span className={styles.eventMeta}>{fmt12(ev.time)} · {ev.jobTitle}</span>
              </div>
            )
          })}
          {isToday && (() => {
            const mins = now.getHours() * 60 + now.getMinutes() - DAY_GRID_START * 60
            if (mins < 0 || mins > gridTotalMinutes) return null
            return (
              <div
                className={styles.nowLine}
                style={{ top: `${(mins / 60) * HOUR_HEIGHT}px` }}
              >
                <span className={styles.nowDot} />
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [weeklyRules, setWeeklyRules] = useState<WeeklyRule[]>([])
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [isMobile, setIsMobile] = useState(false)
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  // selectedDay used by mobile day view
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })

  // Track mobile viewport
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      // When switching to mobile for the first time, default to day view
      setView(prev => (mobile && prev === 'week' ? 'day' : prev))
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  const [selected, setSelected] = useState<Event | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)

  // Inline editing state for event detail modal
  const [editField, setEditField] = useState<'date' | 'time' | 'type' | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editType, setEditType] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset edit state when selection changes
  useEffect(() => {
    if (selected) {
      setEditDate(selected.date)
      setEditTime(selected.time)
      setEditType(selected.interviewType)
      setEditField(null)
    }
  }, [selected])

  const handleInlineUpdate = async () => {
    if (!selected || !userId) return
    setSaving(true)
    try {
      const updates: Record<string, any> = {}
      if (editDate !== selected.date) updates.interview_date = editDate
      if (editTime !== selected.time) updates.interview_time = editTime
      if (editType !== selected.interviewType) updates.interview_type = editType

      if (Object.keys(updates).length === 0) { setEditField(null); setSaving(false); return }

      // Update interviews table
      if (selected.interviewId) {
        await supabase.from('interviews').update(updates).eq('id', selected.interviewId)
      }

      // Update interview_bookings if the row exists
      const bookingUpdates: Record<string, any> = {}
      if (updates.interview_date) bookingUpdates.booked_date = updates.interview_date
      if (updates.interview_time) bookingUpdates.booked_time = updates.interview_time
      if (Object.keys(bookingUpdates).length > 0 && selected.interviewId) {
        await supabase.from('interview_bookings').update(bookingUpdates).eq('interview_id', selected.interviewId)
      }

      // Sync to Google Calendar (non-blocking)
      fetch('/api/calendar/update-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId: selected.interviewId,
          employerId: userId,
          date: editDate,
          time: editTime,
          duration: selected.duration,
          interviewType: editType,
          candidateName: selected.candidateName,
          jobTitle: selected.jobTitle,
        }),
      }).catch(() => {})

      // Update local state
      setSelected(prev => prev ? {
        ...prev,
        date: editDate,
        time: editTime,
        interviewType: editType,
      } : null)

      setEditField(null)
      if (userId) loadEvents(userId)
    } catch (err) {
      console.error('[calendar] inline update failed:', err)
    } finally {
      setSaving(false)
    }
  }
  const [now, setNow] = useState<Date>(new Date())

  // Tick the "now" line every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Auth / role gate
  useEffect(() => {
    const init = async () => {
      if (DEV_MODE) {
        if (getMockUserType() !== 'employer') { router.push('/dashboard'); return }
        const mockUser = getMockUser()
        if (mockUser) setUserId(mockUser.id)
        return
      }
      const session = await getSessionWithRetry()
      if (!session) { router.push('/login/employer'); return }
      if (session.user.user_metadata?.role !== 'employer') { router.push('/dashboard'); return }
      setUserId(session.user.id)
    }
    init()
  }, [router])

  // Fetch data for the current range
  const range = useMemo(() => {
    if (view === 'day') {
      // For the day view, fetch the whole week so swiping day-to-day is instant
      const start = startOfWeek(selectedDay)
      return { start, end: addDays(start, 6) }
    }
    if (view === 'week') {
      const start = startOfWeek(cursor)
      const end = addDays(start, 6)
      return { start, end }
    }
    // month: show grid from Monday of first week to Sunday of last week
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    return { start: startOfWeek(first), end: addDays(startOfWeek(last), 6) }
  }, [view, cursor, selectedDay])

  const loadEvents = useCallback(async (uid: string) => {
    setLoading(true)
    const fromStr = toDateStr(range.start)
    const toStr = toDateStr(range.end)

    const [{ data: bookings }, { data: interviews }, { data: weekly }] = await Promise.all([
      supabase
        .from('interview_bookings')
        .select(`
          id, interview_id, candidate_id, booked_date, booked_time, duration_minutes, status,
          interviews ( interview_type, location_or_link, job_id, application_id, jobs ( title ) )
        `)
        .eq('employer_id', uid)
        .gte('booked_date', fromStr)
        .lte('booked_date', toStr)
        .order('booked_date'),
      // Also fetch interviews directly — some may not have booking rows
      // (e.g. manual mode, or booking API failed)
      supabase
        .from('interviews')
        .select('id, candidate_id, interview_date, interview_time, duration_minutes, status, interview_type, location_or_link, job_id, application_id, booking_id, jobs ( title )')
        .eq('employer_id', uid)
        .gte('interview_date', fromStr)
        .lte('interview_date', toStr)
        .in('status', ['scheduled', 'confirmed', 'pending_selection'])
        .order('interview_date'),
      supabase
        .from('employer_availability')
        .select('day_of_week, slot_start, slot_end, is_active')
        .eq('employer_id', uid)
        .eq('is_active', true),
    ])

    // Collect candidate IDs from both sources
    const bookingCandidateIds = (bookings || []).map((b: BookingRow) => b.candidate_id)
    const interviewCandidateIds = (interviews || []).map((i: any) => i.candidate_id)
    const candidateIds = Array.from(
      new Set([...bookingCandidateIds, ...interviewCandidateIds].filter(Boolean))
    ) as string[]

    const names = new Map<string, string>()
    if (candidateIds.length) {
      const { data: candidates } = await supabase
        .from('candidate_profiles')
        .select('user_id, full_name')
        .in('user_id', candidateIds)
      for (const c of candidates || []) {
        if (c.full_name) names.set(c.user_id, c.full_name)
      }
    }

    // Map events from interview_bookings
    const bookedInterviewIds = new Set<string>()
    const mapped: Event[] = (bookings || []).map((b: BookingRow) => {
      const iv: any = Array.isArray(b.interviews) ? b.interviews[0] : b.interviews
      const job = iv?.jobs ? (Array.isArray(iv.jobs) ? iv.jobs[0] : iv.jobs) : null
      if (b.interview_id) bookedInterviewIds.add(b.interview_id)
      return {
        id: b.id,
        interviewId: b.interview_id,
        applicationId: iv?.application_id || null,
        jobId: iv?.job_id || null,
        candidateId: b.candidate_id,
        candidateName: names.get(b.candidate_id) || 'Candidate',
        jobTitle: job?.title || 'Interview',
        date: b.booked_date,
        time: String(b.booked_time).slice(0, 5),
        duration: b.duration_minutes || 45,
        status: b.status || 'scheduled',
        interviewType: iv?.interview_type || 'in-person',
        meetingLink: iv?.location_or_link || '',
        locationOrLink: iv?.location_or_link || '',
      }
    })

    // Merge interviews that DON'T have a booking row yet
    for (const iv of interviews || []) {
      if (bookedInterviewIds.has(iv.id)) continue
      const job = iv.jobs ? (Array.isArray(iv.jobs) ? iv.jobs[0] : iv.jobs) : null
      mapped.push({
        id: iv.id,
        interviewId: iv.id,
        applicationId: iv.application_id || null,
        jobId: iv.job_id || null,
        candidateId: iv.candidate_id,
        candidateName: names.get(iv.candidate_id) || 'Candidate',
        jobTitle: job?.title || 'Interview',
        date: iv.interview_date,
        time: String(iv.interview_time).slice(0, 5),
        duration: iv.duration_minutes || 45,
        status: iv.status || 'scheduled',
        interviewType: iv.interview_type || 'in-person',
        meetingLink: iv.location_or_link || '',
        locationOrLink: iv.location_or_link || '',
      })
    }

    setEvents(mapped)
    setWeeklyRules(((weekly as WeeklyRule[]) || []))
    setLoading(false)
  }, [range.start, range.end])

  useEffect(() => {
    if (userId) loadEvents(userId)
  }, [userId, loadEvents])

  // Sidebar: next 7 days
  const upcoming = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const cutoff = addDays(today, 7)
    return [...events]
      .filter(e => {
        const d = new Date(`${e.date}T${e.time}:00`)
        return d >= today && d <= cutoff && e.status !== 'cancelled'
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 10)
  }, [events])

  const handleCopyFeed = async () => {
    if (!userId) return
    const { data: profile } = await supabase
      .from('employer_profiles')
      .select('ics_feed_token')
      .eq('user_id', userId)
      .maybeSingle()
    if (profile?.ics_feed_token) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      const feedUrl = `${siteUrl}/api/calendar/feed/${profile.ics_feed_token}.ics`
      try { await navigator.clipboard.writeText(feedUrl) } catch {}
    }
  }

  const handleCancelBooking = async () => {
    if (!selected) return
    if (!confirm('Cancel this interview? The candidate will be notified.')) return
    await supabase
      .from('interview_bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', selected.id)
    if (selected.interviewId) {
      await supabase.from('interviews').update({ status: 'cancelled' }).eq('id', selected.interviewId)
    }
    setSelected(null)
    if (userId) loadEvents(userId)
  }

  // ───── Week view helpers ─────
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [cursor])

  const eventsForDate = (d: Date) => {
    const s = toDateStr(d)
    return events.filter(e => e.date === s)
  }

  const availabilityForDate = (d: Date) => {
    const dow = toAppDow(d.getDay())
    return weeklyRules.filter(r => r.day_of_week === dow && r.is_active)
  }

  const minutesSinceGridStart = (hm: string) => parseHm(hm) - DAY_GRID_START * 60
  const gridTotalMinutes = (DAY_GRID_END - DAY_GRID_START) * 60

  // ───── Month view helpers ─────
  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const gridStart = startOfWeek(first)
    const gridEnd = addDays(startOfWeek(last), 6)
    const days: Date[] = []
    for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) days.push(new Date(d))
    return days
  }, [cursor])

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  const rangeLabel = view === 'day'
    ? selectedDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    : view === 'week'
      ? fmtRange(weekDays[0], weekDays[6])
      : fmtMonth(cursor)

  if (loading && events.length === 0) {
    return (
      <main>
        <Header />
        <div className={styles.page}>
          <div className={styles.loading}>
            <div className={styles.loadingSpinner} />
            <p>Loading calendar…</p>
          </div>
        </div>
      </main>
    )
  }

  const today = new Date()

  return (
    <main>
      <Header />
      <div className={styles.page}>
        <div className={styles.topBar}>
          <h1 className={styles.topTitle}>Calendar</h1>
        </div>

        <div className={styles.headerRow}>
          <div className={styles.navGroup}>
            <button
              className={styles.navBtn}
              onClick={() => {
                if (view === 'day') setSelectedDay(addDays(selectedDay, -1))
                else if (view === 'week') setCursor(addDays(cursor, -7))
                else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }}
            >
              ‹ Prev
            </button>
            <button
              className={styles.navBtn}
              onClick={() => {
                const d = new Date(); d.setHours(0,0,0,0)
                setCursor(d); setSelectedDay(d)
              }}
            >
              Today
            </button>
            <button
              className={styles.navBtn}
              onClick={() => {
                if (view === 'day') setSelectedDay(addDays(selectedDay, 1))
                else if (view === 'week') setCursor(addDays(cursor, 7))
                else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }}
            >
              Next ›
            </button>
          </div>
          <div className={styles.rangeLabel}>{rangeLabel}</div>
          <div className={styles.viewToggle}>
            {isMobile && (
              <button
                className={`${styles.viewBtn} ${view === 'day' ? styles.viewBtnActive : ''}`}
                onClick={() => setView('day')}
              >
                Day
              </button>
            )}
            <button
              className={`${styles.viewBtn} ${view === 'week' ? styles.viewBtnActive : ''}`}
              onClick={() => setView('week')}
            >
              Week
            </button>
            <button
              className={`${styles.viewBtn} ${view === 'month' ? styles.viewBtnActive : ''}`}
              onClick={() => setView('month')}
            >
              Month
            </button>
          </div>
        </div>

        {/* 7-dot week indicator — mobile day view only */}
        {view === 'day' && (
          <div className={styles.dotRow} aria-hidden="true">
            {Array.from({ length: 7 }).map((_, i) => {
              const weekStart = startOfWeek(selectedDay)
              const d = addDays(weekStart, i)
              const active = isSameDay(d, selectedDay)
              return (
                <button
                  key={i}
                  type="button"
                  className={`${styles.dot} ${active ? styles.dotActive : ''}`}
                  onClick={() => setSelectedDay(d)}
                  aria-label={d.toLocaleDateString('en-GB', { weekday: 'long' })}
                />
              )
            })}
          </div>
        )}

        <div className={styles.layout}>
          <div className={styles.calCard}>
            {view === 'day' && (
              <DayView
                day={selectedDay}
                events={eventsForDate(selectedDay)}
                availability={availabilityForDate(selectedDay)}
                now={now}
                onSelectEvent={setSelected}
                onPrev={() => setSelectedDay(addDays(selectedDay, -1))}
                onNext={() => setSelectedDay(addDays(selectedDay, 1))}
              />
            )}
            {view === 'week' && (
              <div className={styles.weekGrid}>
                {/* Header row */}
                <div className={styles.weekHeadRow}>
                  <div className={styles.weekHead}></div>
                  {weekDays.map((d, i) => {
                    const isToday = isSameDay(d, today)
                    return (
                      <div key={i} className={`${styles.weekHead} ${isToday ? styles.weekHeadToday : ''}`}>
                        {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                        <span className={styles.weekHeadDay}>{d.getDate()}</span>
                      </div>
                    )
                  })}
                </div>
                {/* Body */}
                <div className={styles.weekBody}>
                  <div className={styles.timeCol}>
                    {Array.from({ length: DAY_GRID_END - DAY_GRID_START }).map((_, hourIdx) => (
                      <div key={hourIdx} className={styles.timeLabel}>
                        {pad(DAY_GRID_START + hourIdx)}:00
                      </div>
                    ))}
                  </div>
                  {weekDays.map((d, i) => {
                    const isToday = isSameDay(d, today)
                    const dayEvents = eventsForDate(d)
                    const avail = availabilityForDate(d)
                    return (
                      <div
                        key={`col-${i}`}
                        className={`${styles.dayCol} ${isToday ? styles.dayColToday : ''}`}
                      >
                        {Array.from({ length: DAY_GRID_END - DAY_GRID_START }).map((_, h) => (
                          <div
                            key={`hl-${h}`}
                            className={styles.hourLine}
                            style={{ top: `${h * HOUR_HEIGHT}px` }}
                          />
                        ))}
                        {avail.map((r, idx) => {
                          const sMin = parseHm(String(r.slot_start).slice(0, 5))
                          const eMin = parseHm(String(r.slot_end).slice(0, 5))
                          const topMin = sMin - DAY_GRID_START * 60
                          const heightMin = eMin - sMin
                          if (topMin < 0 || topMin >= gridTotalMinutes) return null
                          return (
                            <div
                              key={`av-${idx}`}
                              className={styles.availBlock}
                              style={{
                                top: `${(topMin / 60) * HOUR_HEIGHT}px`,
                                height: `${(heightMin / 60) * HOUR_HEIGHT}px`,
                              }}
                            />
                          )
                        })}
                        {dayEvents.map(ev => {
                          const topMin = minutesSinceGridStart(ev.time)
                          if (topMin < 0 || topMin >= gridTotalMinutes) return null
                          const heightPx = Math.max(22, (ev.duration / 60) * HOUR_HEIGHT - 4)
                          const cls =
                            ev.status === 'confirmed' ? styles.eventConfirmed :
                            ev.status === 'cancelled' ? styles.eventCancelled :
                            styles.eventScheduled
                          return (
                            <div
                              key={ev.id}
                              className={`${styles.event} ${cls}`}
                              style={{
                                top: `${(topMin / 60) * HOUR_HEIGHT + 2}px`,
                                height: `${heightPx}px`,
                              }}
                              onClick={() => setSelected(ev)}
                            >
                              <span className={styles.eventName}>{ev.candidateName}</span>
                              <span className={styles.eventMeta}>{fmt12(ev.time)} · {ev.jobTitle}</span>
                            </div>
                          )
                        })}
                        {isToday && (() => {
                          const mins = now.getHours() * 60 + now.getMinutes() - DAY_GRID_START * 60
                          if (mins < 0 || mins > gridTotalMinutes) return null
                          return (
                            <div
                              className={styles.nowLine}
                              style={{ top: `${(mins / 60) * HOUR_HEIGHT}px` }}
                            >
                              <span className={styles.nowDot} />
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {view === 'month' && (
              <div className={styles.monthGrid}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                  <div key={d} className={styles.monthHeadCell}>{d}</div>
                ))}
                {monthDays.map((d, i) => {
                  const dayEvents = eventsForDate(d).sort((a,b) => a.time.localeCompare(b.time))
                  const inMonth = d.getMonth() === cursor.getMonth()
                  const isToday = isSameDay(d, today)
                  return (
                    <div
                      key={i}
                      className={`${styles.monthDay} ${!inMonth ? styles.monthDayOther : ''} ${isToday ? styles.monthDayToday : ''}`}
                      onClick={() => { setCursor(new Date(d)); setView('week') }}
                    >
                      <span className={styles.monthDayNum}>{d.getDate()}</span>
                      {dayEvents.slice(0, 3).map(ev => {
                        const cls =
                          ev.status === 'confirmed' ? styles.monthEventPill :
                          ev.status === 'cancelled' ? `${styles.monthEventPill} ${styles.monthEventPillCancelled}` :
                          `${styles.monthEventPill} ${styles.monthEventPillScheduled}`
                        return (
                          <div key={ev.id} className={cls} onClick={(e) => { e.stopPropagation(); setSelected(ev) }}>
                            {fmt12(ev.time)} {ev.candidateName}
                          </div>
                        )
                      })}
                      {dayEvents.length > 3 && (
                        <span className={styles.monthMore}>+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.sideCard}>
              <h2 className={styles.sideTitle}>Upcoming interviews</h2>
              {upcoming.length === 0 ? (
                <p className={styles.sideEmpty}>
                  No interviews this week. Schedule one from your applications.
                </p>
              ) : (
                <div className={styles.sideList}>
                  {upcoming.map(ev => {
                    const dayFmt = new Date(`${ev.date}T${ev.time}:00`).toLocaleDateString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short',
                    })
                    const badgeCls =
                      ev.status === 'confirmed' ? styles.badgeConfirmed :
                      ev.status === 'cancelled' ? styles.badgeCancelled :
                      styles.badgeScheduled
                    return (
                      <div key={ev.id} className={styles.sideItem} onClick={() => setSelected(ev)}>
                        <div className={styles.avatarCircle}>{initials(ev.candidateName)}</div>
                        <div className={styles.sideItemBody}>
                          <div className={styles.sideItemName}>{ev.candidateName}</div>
                          <div className={styles.sideItemJob}>{ev.jobTitle}</div>
                          <div className={styles.sideItemTime}>{dayFmt} · {fmt12(ev.time)}</div>
                        </div>
                        <span className={`${styles.badge} ${badgeCls}`}>{ev.status}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className={styles.sideLinks}>
                <Link href="/settings/availability" className={styles.sideLink}>Availability settings →</Link>
                <button type="button" className={styles.sideLink} style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={handleCopyFeed}>
                  Copy ICS feed →
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* Event detail modal */}
        {selected && (
          <div className={styles.modalOverlay} onClick={() => setSelected(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHead}>
                <div className={styles.avatarCircle}>{initials(selected.candidateName)}</div>
                <div>
                  <h3 className={styles.modalName}>{selected.candidateName}</h3>
                  <p className={styles.modalJob}>{selected.jobTitle}</p>
                </div>
                <button className={styles.modalClose} onClick={() => setSelected(null)} aria-label="Close">✕</button>
              </div>

              <div className={styles.modalRow}>
                <span className={styles.modalRowLabel}>Date</span>
                {editField === 'date' ? (
                  <span className={styles.modalRowValue} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ fontSize: '0.9rem', padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 4 }} />
                    <button onClick={handleInlineUpdate} disabled={saving} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}>{saving ? '...' : 'Save'}</button>
                    <button onClick={() => { setEditDate(selected.date); setEditField(null) }} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </span>
                ) : (
                  <span className={styles.modalRowValue} onClick={() => selected.status !== 'cancelled' && setEditField('date')} style={{ cursor: selected.status !== 'cancelled' ? 'pointer' : 'default', textDecoration: selected.status !== 'cancelled' ? 'underline dotted #d1d5db' : 'none' }}>
                    {new Date(`${editDate}T${editTime}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalRowLabel}>Time</span>
                {editField === 'time' ? (
                  <span className={styles.modalRowValue} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={{ fontSize: '0.9rem', padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 4 }} />
                    <button onClick={handleInlineUpdate} disabled={saving} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}>{saving ? '...' : 'Save'}</button>
                    <button onClick={() => { setEditTime(selected.time); setEditField(null) }} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </span>
                ) : (
                  <span className={styles.modalRowValue} onClick={() => selected.status !== 'cancelled' && setEditField('time')} style={{ cursor: selected.status !== 'cancelled' ? 'pointer' : 'default', textDecoration: selected.status !== 'cancelled' ? 'underline dotted #d1d5db' : 'none' }}>
                    {fmt12(editTime)} · {selected.duration} min
                  </span>
                )}
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalRowLabel}>Type</span>
                {editField === 'type' ? (
                  <span className={styles.modalRowValue} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select value={editType} onChange={e => setEditType(e.target.value)} style={{ fontSize: '0.9rem', padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 4 }}>
                      <option value="in-person">In-Person</option>
                      <option value="video">Video Call</option>
                      <option value="phone">Phone Call</option>
                    </select>
                    <button onClick={handleInlineUpdate} disabled={saving} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}>{saving ? '...' : 'Save'}</button>
                    <button onClick={() => { setEditType(selected.interviewType); setEditField(null) }} style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </span>
                ) : (
                  <span className={styles.modalRowValue} onClick={() => selected.status !== 'cancelled' && setEditField('type')} style={{ cursor: selected.status !== 'cancelled' ? 'pointer' : 'default', textDecoration: selected.status !== 'cancelled' ? 'underline dotted #d1d5db' : 'none' }}>
                    {editType === 'in-person' ? 'In-Person' : editType === 'video' ? 'Video Call' : 'Phone Call'}
                  </span>
                )}
              </div>
              {selected.interviewType === 'video' && selected.meetingLink && (
                <div className={styles.modalRow}>
                  <span className={styles.modalRowLabel}>Meeting link</span>
                  <a href={selected.meetingLink} target="_blank" rel="noopener noreferrer" className={styles.modalRowValue}>
                    Join call
                  </a>
                </div>
              )}
              <div className={styles.modalRow}>
                <span className={styles.modalRowLabel}>Status</span>
                <span className={`${styles.badge} ${
                  selected.status === 'confirmed' ? styles.badgeConfirmed :
                  selected.status === 'cancelled' ? styles.badgeCancelled :
                  styles.badgeScheduled
                }`}>{selected.status}</span>
              </div>

              <div className={styles.modalActions}>
                <button
                  className={styles.modalBtn}
                  onClick={() => { setRescheduleOpen(true) }}
                >
                  Reschedule
                </button>
                <button className={`${styles.modalBtn} ${styles.modalBtnDanger}`} onClick={handleCancelBooking}>
                  Cancel
                </button>
              </div>

              {selected.applicationId && (
                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                  <Link
                    href="/interviews"
                    className={styles.sideLink}
                  >
                    View application →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {selected && rescheduleOpen && selected.applicationId && selected.jobId && (
          <ScheduleInterviewModal
            isOpen={rescheduleOpen}
            onClose={() => setRescheduleOpen(false)}
            applicationId={selected.applicationId}
            jobId={selected.jobId}
            jobTitle={selected.jobTitle}
            company={''}
            candidateId={selected.candidateId}
            candidateName={selected.candidateName}
            existingInterviewId={selected.interviewId || undefined}
            existingMeetingLink={selected.meetingLink}
            onSuccess={() => {
              setRescheduleOpen(false)
              setSelected(null)
              if (userId) loadEvents(userId)
            }}
          />
        )}
      </div>
    </main>
  )
}
