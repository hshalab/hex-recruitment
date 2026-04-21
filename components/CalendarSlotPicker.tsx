'use client'

import { useState, useEffect, useMemo } from 'react'

type Slot = { date: string; time: string; duration: number }

const fmt12 = (hm: string) => {
  const [hStr, mStr] = hm.split(':')
  let h = Number(hStr)
  const m = Number(mStr)
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')}${ampm}`
}

const formatDateFull = (dateStr: string) => {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

interface CalendarSlotPickerProps {
  slots: Slot[]
  loading: boolean
  selectedDate: string
  selectedTime: string
  onSelectDate: (d: string) => void
  onSelectTime: (t: string) => void
}

export default function CalendarSlotPicker({
  slots,
  loading,
  selectedDate,
  selectedTime,
  onSelectDate,
  onSelectTime,
}: CalendarSlotPickerProps) {
  // Group slots by date
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots) {
      if (!map.has(s.date)) map.set(s.date, [])
      map.get(s.date)!.push(s)
    }
    return map
  }, [slots])

  const availableDates = useMemo(() => new Set(slotsByDate.keys()), [slotsByDate])

  // Calendar month state
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  // Jump to first available month when slots load
  useEffect(() => {
    const dates = Array.from(availableDates).sort()
    if (dates.length > 0 && !selectedDate) {
      const [y, m] = dates[0].split('-').map(Number)
      setCalMonth({ year: y, month: m - 1 })
      onSelectDate(dates[0])
    }
  }, [availableDates, selectedDate, onSelectDate])

  // Build monthly grid
  const calendarGrid = useMemo(() => {
    const { year, month } = calMonth
    const firstDay = new Date(year, month, 1)
    const startDow = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const cells: Array<{ date: string; day: number; hasSlots: boolean; isPast: boolean; isToday: boolean } | null> = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d)
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({
        date: dateStr, day: d,
        hasSlots: availableDates.has(dateStr),
        isPast: dt < today,
        isToday: dt.getTime() === today.getTime(),
      })
    }
    return cells
  }, [calMonth, availableDates])

  const monthLabel = new Date(calMonth.year, calMonth.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    const now = new Date()
    if (new Date(calMonth.year, calMonth.month) <= new Date(now.getFullYear(), now.getMonth())) return
    setCalMonth(prev => { const d = new Date(prev.year, prev.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })
  }
  const nextMonth = () => {
    setCalMonth(prev => { const d = new Date(prev.year, prev.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })
  }

  const selectedDateSlots = selectedDate ? (slotsByDate.get(selectedDate) || []) : []

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Loading available times...</div>
  }

  if (slots.length === 0) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No available slots at this time.</div>
  }

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <button type="button" onClick={prevMonth} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: '0.25rem 0.5rem', color: '#64748b' }}>&#8249;</button>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{monthLabel}</span>
        <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: '0.25rem 0.5rem', color: '#64748b' }}>&#8250;</button>
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', marginBottom: '1rem' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', padding: '0.25rem 0' }}>{d}</div>
        ))}
        {calendarGrid.map((cell, i) => {
          if (!cell) return <div key={`blank-${i}`} />
          const isSelected = cell.date === selectedDate
          const disabled = !cell.hasSlots || cell.isPast
          return (
            <button
              key={cell.date}
              type="button"
              disabled={disabled}
              onClick={() => { if (!disabled) { onSelectDate(cell.date); onSelectTime('') } }}
              style={{
                padding: '0.5rem 0', fontSize: '0.82rem', minHeight: 44,
                fontWeight: isSelected ? 700 : cell.isToday ? 600 : 400,
                background: isSelected ? '#0f172a' : 'transparent',
                color: isSelected ? '#FFE500' : disabled ? '#d1d5db' : '#0f172a',
                border: cell.isToday && !isSelected ? '1px solid #0f172a' : '1px solid transparent',
                borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
                position: 'relative',
              }}
            >
              {cell.day}
              {cell.hasSlots && !isSelected && (
                <span style={{ display: 'block', width: 4, height: 4, borderRadius: '50%', background: '#16a34a', margin: '2px auto 0' }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.5rem', color: '#0f172a' }}>
            {formatDateFull(selectedDate)}
          </h4>
          {selectedDateSlots.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '0.75rem 0' }}>No slots on this date</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '0.375rem' }}>
              {selectedDateSlots.map(s => {
                const active = s.time === selectedTime
                return (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => onSelectTime(s.time)}
                    style={{
                      padding: '0.5rem 0.25rem', fontSize: '0.8rem', fontWeight: active ? 600 : 400,
                      background: active ? '#0f172a' : '#f8fafc',
                      color: active ? '#FFE500' : '#334155',
                      border: active ? '1px solid #0f172a' : '1px solid #e2e8f0',
                      borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    {fmt12(s.time)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirmation banner */}
      {selectedDate && selectedTime && (
        <div style={{ marginTop: '0.75rem', padding: '0.625rem 0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: '0.85rem', color: '#15803d', fontWeight: 500 }}>
          ✓ {formatDateFull(selectedDate)} at {fmt12(selectedTime)} · {selectedDateSlots[0]?.duration || 45} min
        </div>
      )}
    </div>
  )
}
