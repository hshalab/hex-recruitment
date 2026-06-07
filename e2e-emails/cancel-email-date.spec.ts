import { test, expect } from '@playwright/test'
import { formatInterviewWhen } from '../lib/interviewWhen'
import { interviewCancelledEmail } from '../emails/interview-cancelled'

// Regression coverage for: the cancellation email rendered the interview date
// as the literal word "undefined" because /api/calendar/cancel never passed a
// date to the interview_cancelled template. These assert the real functions the
// route now uses: the formatter (same value the route computes from the
// interviews row) and the template (renders the date, never "undefined").

test.describe('cancellation email date', () => {
  test('formatInterviewWhen formats like the confirmation email', () => {
    // booking date A
    expect(formatInterviewWhen('2026-06-09', '12:00:00')).toBe('Tuesday, 9 June 2026 at 12:00')
    // rescheduled-to date B (the interviews row is updated on reschedule, so
    // the cancel email picks up the NEW date, not the old one)
    expect(formatInterviewWhen('2026-07-01', '09:00:00')).toBe('Wednesday, 1 July 2026 at 09:00')
  })

  test('formatInterviewWhen returns undefined for a missing/invalid date', () => {
    expect(formatInterviewWhen(null, null)).toBeUndefined()
    expect(formatInterviewWhen(undefined, undefined)).toBeUndefined()
    expect(formatInterviewWhen('', '12:00:00')).toBeUndefined()
  })

  test('cancellation email renders a real date and never "undefined"', () => {
    const when = formatInterviewWhen('2026-06-09', '12:00:00')
    const { html } = interviewCancelledEmail('Ember Hospitality Group', 'Corporate Account Manager', 'Henry Lambert', when)
    expect(html).toContain('scheduled for')
    expect(html).toContain('Tuesday, 9 June 2026 at 12:00')
    expect(html).not.toContain('undefined')
  })

  test('reschedule-then-cancel email shows the NEW date, not undefined', () => {
    const when = formatInterviewWhen('2026-07-01', '09:00:00')
    const { html } = interviewCancelledEmail('Ember Hospitality Group', 'Corporate Account Manager', 'Henry Lambert', when)
    expect(html).toContain('Wednesday, 1 July 2026 at 09:00')
    expect(html).not.toContain('undefined')
  })

  test('no-date interview cancels with graceful wording, never "undefined"', () => {
    const when = formatInterviewWhen(null, null) // undefined
    const { html } = interviewCancelledEmail('Ember Hospitality Group', 'Corporate Account Manager', 'Henry Lambert', when)
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('scheduled for') // clause omitted, not broken
    expect(html).toContain('has been cancelled')
  })
})
