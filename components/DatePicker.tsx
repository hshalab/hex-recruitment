'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import styles from './DatePicker.module.css'

// Discriminated union — `mode` decides the value/onChange shape.
// Default ('single') keeps the long-standing API so every existing
// call site (work-experience start/end in JobSeekerProfileForm) needs
// no change and stays type-safe.
type SingleProps = {
  mode?: 'single'
  value: string                                      // YYYY-MM-DD, '' = unset
  onChange: (value: string) => void
  id?: string
  placeholder?: string
}

type RangeProps = {
  mode: 'range'
  value: { from: string; to: string }                // both YYYY-MM-DD, '' = unset
  onChange: (value: { from: string; to: string }) => void
  id?: string
  placeholder?: string
}

type DatePickerProps = SingleProps | RangeProps

function formatDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${date.getFullYear()}`
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseValue(value: string): Date | undefined {
  if (!value) return undefined
  const parts = value.split('-')
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  }
  if (parts.length === 2) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1)
  }
  return undefined
}

export default function DatePicker(props: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isRange = props.mode === 'range'

  // Branch the mode-specific bits — display string, selected value the
  // library expects, onSelect handler, default open-to month. Everything
  // else (trigger, panel, classNames) is shared.
  let displayValue = ''
  let placeholderText = props.placeholder ?? (isRange ? 'Select date(s)' : 'Select date')
  let defaultOpenMonth: Date = new Date()
  let pickerNode: React.ReactNode

  if (isRange) {
    const { value, onChange } = props
    const from = parseValue(value.from)
    const to = parseValue(value.to)
    defaultOpenMonth = from || new Date()
    if (from && to) {
      displayValue = `${formatDDMMYYYY(from)} – ${formatDDMMYYYY(to)}`
    } else if (from) {
      displayValue = `${formatDDMMYYYY(from)} → …`
    }

    const handleSelect = (range: DateRange | undefined) => {
      if (!range) {
        onChange({ from: '', to: '' })
        return
      }
      onChange({
        from: range.from ? toYMD(range.from) : '',
        to: range.to ? toYMD(range.to) : '',
      })
      // Intentionally do NOT close on range select — the user might still
      // be picking the second date. They'll close by tapping outside or
      // re-tapping the trigger button.
    }

    pickerNode = (
      <DayPicker
        mode="range"
        selected={from ? { from, to } : undefined}
        onSelect={handleSelect}
        captionLayout="dropdown"
        startMonth={new Date(1970, 0)}
        endMonth={new Date(new Date().getFullYear() + 5, 11)}
        defaultMonth={defaultOpenMonth}
        showOutsideDays
        fixedWeeks
        weekStartsOn={1}
        classNames={rdpClassNames}
      />
    )
  } else {
    const { value, onChange } = props
    const selectedDate = parseValue(value)
    defaultOpenMonth = selectedDate || new Date()
    if (selectedDate) displayValue = formatDDMMYYYY(selectedDate)

    const handleSelect = (date: Date | undefined) => {
      if (date) onChange(toYMD(date))
      setOpen(false)
    }

    pickerNode = (
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={handleSelect}
        captionLayout="dropdown"
        startMonth={new Date(1970, 0)}
        endMonth={new Date(new Date().getFullYear(), 11)}
        defaultMonth={defaultOpenMonth}
        showOutsideDays
        fixedWeeks
        weekStartsOn={1}
        classNames={rdpClassNames}
      />
    )
  }

  return (
    <div className={styles.picker} ref={pickerRef}>
      <button
        type="button"
        id={props.id}
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={displayValue ? '' : styles.placeholder}>
          {displayValue || placeholderText}
        </span>
        <span className={styles.calendarIcon}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
      </button>

      {open && (
        <div className={styles.panel}>
          {pickerNode}
        </div>
      )}
    </div>
  )
}

// Shared classNames mapping — same as before, extracted so the two
// DayPicker calls don't duplicate it.
const rdpClassNames = {
  root: styles.rdp,
  months: styles.rdpMonths,
  month: styles.rdpMonth,
  month_caption: styles.rdpCaption,
  caption_label: styles.rdpCaptionLabel,
  nav: styles.rdpNav,
  button_previous: styles.rdpNavBtn,
  button_next: styles.rdpNavBtn,
  chevron: styles.rdpChevron,
  dropdowns: styles.rdpDropdowns,
  dropdown: styles.rdpDropdown,
  dropdown_root: styles.rdpDropdownRoot,
  months_dropdown: styles.rdpMonthsDropdown,
  years_dropdown: styles.rdpYearsDropdown,
  month_grid: styles.rdpTable,
  weekdays: styles.rdpHeadRow,
  weekday: styles.rdpHeadCell,
  weeks: styles.rdpBody,
  week: styles.rdpRow,
  day: styles.rdpDay,
  day_button: styles.rdpDayButton,
  outside: styles.rdpDayOutside,
  today: styles.rdpDayToday,
  selected: styles.rdpDaySelected,
  disabled: styles.rdpDayDisabled,
  range_start: styles.rdpDayRangeStart,
  range_middle: styles.rdpDayRangeMiddle,
  range_end: styles.rdpDayRangeEnd,
}
