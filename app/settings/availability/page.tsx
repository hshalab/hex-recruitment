'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

const DAYS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
]

const DURATIONS = [30, 45, 60, 90]

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 19; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`)
    out.push(`${String(h).padStart(2, '0')}:30`)
  }
  out.push('20:00')
  return out
})()

type WeeklyRow = { enabled: boolean; start: string; end: string }
type Override = { id?: string; override_date: string; reason: string | null }

const DEFAULT_WEEKLY: WeeklyRow[] = DAYS.map((_, i) => ({
  enabled: i <= 4, // Mon–Fri on by default
  start: '09:00',
  end: '17:00',
}))

export default function AvailabilitySettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [duration, setDuration] = useState<number>(60)
  const [bufferMinutes, setBufferMinutes] = useState<number>(0)
  const [minNoticeHours, setMinNoticeHours] = useState<number>(24)
  const [maxAdvanceDays, setMaxAdvanceDays] = useState<number>(28)
  const [weekly, setWeekly] = useState<WeeklyRow[]>(DEFAULT_WEEKLY)
  const [overrides, setOverrides] = useState<Override[]>([])
  const [newBlockDate, setNewBlockDate] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const loadAll = useCallback(async (uid: string) => {
    // weekly
    const { data: weeklyRows } = await supabase
      .from('employer_availability')
      .select('*')
      .eq('employer_id', uid)
      .order('day_of_week')

    if (weeklyRows && weeklyRows.length) {
      const next: WeeklyRow[] = DAYS.map((_, idx) => {
        const row = weeklyRows.find(r => r.day_of_week === idx)
        if (row) {
          return {
            enabled: !!row.is_active,
            start: String(row.slot_start).slice(0, 5),
            end: String(row.slot_end).slice(0, 5),
          }
        }
        return { enabled: false, start: '09:00', end: '17:00' }
      })
      setWeekly(next)
      const first = weeklyRows[0]
      if (first?.duration_minutes) setDuration(first.duration_minutes)
      if (typeof first?.buffer_minutes === 'number') setBufferMinutes(first.buffer_minutes)
      if (typeof first?.min_notice_hours === 'number') setMinNoticeHours(first.min_notice_hours)
      if (typeof first?.max_advance_days === 'number') setMaxAdvanceDays(first.max_advance_days)
    }

    // overrides
    const today = new Date().toISOString().slice(0, 10)
    const { data: ov } = await supabase
      .from('employer_availability_overrides')
      .select('id, override_date, reason, is_blocked')
      .eq('employer_id', uid)
      .eq('is_blocked', true)
      .gte('override_date', today)
      .order('override_date')
    setOverrides((ov || []).map(o => ({ id: o.id, override_date: o.override_date, reason: o.reason })))

    // ICS feed token
    const { data: profile } = await supabase
      .from('employer_profiles')
      .select('ics_feed_token')
      .eq('user_id', uid)
      .maybeSingle()
    if (profile?.ics_feed_token) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      setFeedUrl(`${siteUrl}/api/calendar/feed/${profile.ics_feed_token}.ics`)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      if (session.user.user_metadata?.role !== 'employer') { router.push('/login'); return }
      setUserId(session.user.id)
      await loadAll(session.user.id)
      setLoading(false)
    }
    init()
  }, [router, loadAll])

  const toggleDay = (idx: number) => {
    setWeekly(prev => prev.map((w, i) => i === idx ? { ...w, enabled: !w.enabled } : w))
  }
  const updateDay = (idx: number, key: 'start' | 'end', val: string) => {
    setWeekly(prev => prev.map((w, i) => i === idx ? { ...w, [key]: val } : w))
  }

  const handleAddBlocked = async () => {
    if (!userId || !newBlockDate) return
    const { data, error } = await supabase
      .from('employer_availability_overrides')
      .insert({
        employer_id: userId,
        override_date: newBlockDate,
        is_blocked: true,
        reason: newBlockReason.trim() || null,
      })
      .select()
      .single()
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    setOverrides(prev => [...prev, { id: data.id, override_date: data.override_date, reason: data.reason }]
      .sort((a, b) => a.override_date.localeCompare(b.override_date)))
    setNewBlockDate('')
    setNewBlockReason('')
  }

  const handleRemoveBlocked = async (id?: string) => {
    if (!id) return
    const { error } = await supabase.from('employer_availability_overrides').delete().eq('id', id)
    if (error) { setMessage({ type: 'error', text: error.message }); return }
    setOverrides(prev => prev.filter(o => o.id !== id))
  }

  const handleCopyFeed = async () => {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleRegenerate = async () => {
    if (!userId) return
    if (!confirm('Regenerate your calendar feed URL? Any existing subscriptions using the old URL will stop receiving updates.')) return
    const res = await fetch('/api/calendar/regenerate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json()
    if (data.feedUrl) {
      setFeedUrl(data.feedUrl)
      setMessage({ type: 'success', text: 'Feed URL regenerated' })
    } else {
      setMessage({ type: 'error', text: data.error || 'Failed to regenerate' })
    }
  }

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    setMessage(null)
    try {
      // Validate enabled rows
      for (let i = 0; i < weekly.length; i++) {
        const w = weekly[i]
        if (w.enabled && w.start >= w.end) {
          setMessage({ type: 'error', text: `${DAYS[i].label}: start time must be before end time` })
          setSaving(false)
          return
        }
      }

      // Delete all existing weekly rows for this employer
      const { error: delErr } = await supabase
        .from('employer_availability')
        .delete()
        .eq('employer_id', userId)
      if (delErr) throw delErr

      // Re-insert active days
      const rows = weekly
        .map((w, i) => ({
          employer_id: userId,
          day_of_week: i,
          slot_start: `${w.start}:00`,
          slot_end: `${w.end}:00`,
          duration_minutes: duration,
          buffer_minutes: bufferMinutes,
          min_notice_hours: minNoticeHours,
          max_advance_days: maxAdvanceDays,
          is_active: w.enabled,
        }))
        .filter(r => r.is_active)

      if (rows.length) {
        const { error: insErr } = await supabase.from('employer_availability').insert(rows)
        if (insErr) throw insErr
      }

      setMessage({ type: 'success', text: 'Availability saved successfully!' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.loadingSpinner} />
            <p>Loading availability…</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => router.push('/settings')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Settings
        </button>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings" className={styles.breadcrumbLink}>Settings</Link>
          <span className={styles.breadcrumbSeparator}>›</span>
          <span className={styles.breadcrumbCurrent}>Interview Availability</span>
        </nav>

        <div className={styles.header}>
          <div className={styles.headerIcon}>📅</div>
          <div>
            <h1 className={styles.title}>Interview Availability</h1>
            <p className={styles.subtitle}>Set your available days and hours for candidate interview bookings</p>
          </div>
        </div>

        {message && (
          <div
            className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}
            role="alert"
            aria-live="polite"
          >
            {message.type === 'success' ? '✓ ' : '⚠ '}{message.text}
          </div>
        )}

        <div className={styles.form}>
          {/* Duration */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Interview duration</h2>
            <p className={styles.sectionDescription}>How long is each interview slot?</p>
            <div className={styles.pillRow}>
              {DURATIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`${styles.pill} ${duration === d ? styles.pillActive : ''}`}
                >
                  {d} minutes
                </button>
              ))}
            </div>
          </div>

          {/* Scheduling rules */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Scheduling rules</h2>

            <div style={{ marginBottom: '1.25rem' }}>
              <p className={styles.sectionDescription} style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#0f172a' }}>Buffer between interviews</strong>
                <br />Breathing room between consecutive interviews
              </p>
              <div className={styles.pillRow}>
                {[
                  { v: 0, label: 'None' },
                  { v: 15, label: '15 min' },
                  { v: 30, label: '30 min' },
                  { v: 45, label: '45 min' },
                  { v: 60, label: '60 min' },
                ].map(o => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setBufferMinutes(o.v)}
                    className={`${styles.pill} ${bufferMinutes === o.v ? styles.pillActive : ''}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <p className={styles.sectionDescription} style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#0f172a' }}>Minimum notice</strong>
                <br />How far in advance candidates must book
              </p>
              <div className={styles.pillRow}>
                {[
                  { v: 1, label: '1 hour' },
                  { v: 2, label: '2 hours' },
                  { v: 4, label: '4 hours' },
                  { v: 24, label: '24 hours' },
                  { v: 48, label: '48 hours' },
                ].map(o => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setMinNoticeHours(o.v)}
                    className={`${styles.pill} ${minNoticeHours === o.v ? styles.pillActive : ''}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={styles.sectionDescription} style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: '#0f172a' }}>Maximum advance booking</strong>
                <br />How far ahead candidates can book
              </p>
              <div className={styles.pillRow}>
                {[
                  { v: 7, label: '1 week' },
                  { v: 14, label: '2 weeks' },
                  { v: 21, label: '3 weeks' },
                  { v: 28, label: '4 weeks' },
                ].map(o => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setMaxAdvanceDays(o.v)}
                    className={`${styles.pill} ${maxAdvanceDays === o.v ? styles.pillActive : ''}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Weekly availability */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Weekly availability</h2>
            <p className={styles.sectionDescription}>Turn on days you&apos;re available and pick a window.</p>
            {DAYS.map((day, idx) => {
              const row = weekly[idx]
              const parseHm = (t: string) => {
                const [h, m] = t.split(':').map(Number)
                return h * 60 + m
              }
              const fmt12 = (hm: string) => {
                const [hStr, mStr] = hm.split(':')
                let h = Number(hStr); const m = Number(mStr)
                const ap = h >= 12 ? 'pm' : 'am'
                h = h % 12 || 12
                return `${h}:${String(m).padStart(2, '0')}${ap}`
              }
              let hint: { text: string; warn: boolean } | null = null
              if (row.enabled) {
                const s = parseHm(row.start)
                const e = parseHm(row.end)
                if (e - s >= duration) {
                  const count = Math.floor((e - s) / duration)
                  const lastStart = s + (count - 1) * duration
                  const lastEnd = lastStart + duration
                  const toHm = (mins: number) =>
                    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
                  hint = {
                    text: `${fmt12(row.start)} – ${fmt12(toHm(lastEnd))} · ${count} slot${count === 1 ? '' : 's'} per day`,
                    warn: false,
                  }
                } else {
                  hint = { text: 'No slots fit this range with the selected duration', warn: true }
                }
              }
              return (
                <div key={day.value}>
                <div className={styles.dayRow}>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={() => toggleDay(idx)}
                      aria-label={`Toggle ${day.label}`}
                    />
                    <span className={styles.slider} />
                  </label>
                  <span className={styles.dayLabel}>{day.label}</span>
                  <select
                    value={row.start}
                    disabled={!row.enabled}
                    onChange={(e) => updateDay(idx, 'start', e.target.value)}
                    className={styles.timeSelect}
                  >
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select
                    value={row.end}
                    disabled={!row.enabled}
                    onChange={(e) => updateDay(idx, 'end', e.target.value)}
                    className={styles.timeSelect}
                  >
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {hint && (
                  <div
                    style={{
                      marginLeft: 60,
                      fontSize: '0.78rem',
                      color: hint.warn ? '#92400e' : '#6b7280',
                      padding: hint.warn ? '0.3rem 0.5rem' : '0 0 0.4rem 0',
                      background: hint.warn ? '#fef3c7' : 'transparent',
                      border: hint.warn ? '1px solid #fde68a' : 'none',
                      borderRadius: hint.warn ? 6 : 0,
                      marginBottom: hint.warn ? '0.5rem' : 0,
                    }}
                  >
                    {hint.text}
                  </div>
                )}
                </div>
              )
            })}
          </div>

          {/* Blocked dates */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Blocked dates</h2>
            <p className={styles.sectionDescription}>Block out holidays or other days you&apos;re unavailable.</p>
            {overrides.length > 0 && (
              <div className={styles.blockedList}>
                {overrides.map(o => (
                  <div key={o.id} className={styles.blockedRow}>
                    <span className={styles.blockedDate}>
                      {new Date(o.override_date + 'T00:00:00').toLocaleDateString('en-GB', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                    <span className={styles.blockedReason}>{o.reason || 'Blocked'}</span>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => handleRemoveBlocked(o.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.addRow}>
              <input
                type="date"
                value={newBlockDate}
                onChange={(e) => setNewBlockDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className={styles.addInput}
              />
              <input
                type="text"
                value={newBlockReason}
                onChange={(e) => setNewBlockReason(e.target.value)}
                placeholder="Reason (optional)"
                className={styles.addInput}
              />
              <button
                type="button"
                onClick={handleAddBlocked}
                disabled={!newBlockDate}
                className={styles.blockBtn}
              >
                Block date
              </button>
            </div>
          </div>

          {/* Calendar feed */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Calendar feed</h2>
            <p className={styles.sectionDescription}>Subscribe to this feed to see interviews in your own calendar.</p>
            <div className={styles.feedRow}>
              <input
                type="text"
                readOnly
                value={feedUrl}
                className={styles.feedInput}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button type="button" onClick={handleCopyFeed} className={styles.copyBtn}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className={styles.feedNote}>
              Subscribe in Google Calendar: Other calendars › From URL
            </p>
            <button type="button" onClick={handleRegenerate} className={styles.regenBtn}>
              Regenerate URL
            </button>
          </div>

          <div className={styles.actions}>
            <Link href="/settings" className={styles.cancelBtn}>Cancel</Link>
            <button
              type="button"
              onClick={handleSave}
              className={styles.saveBtn}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
