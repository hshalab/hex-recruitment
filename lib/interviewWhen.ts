// Formats an interview's scheduled date/time into the same human string the
// confirmation email uses, e.g. "Tuesday, 9 June 2026 at 12:00".
//
// Used by the cancellation email path (/api/calendar/cancel) so the cancel
// email shows a real date instead of the literal word "undefined" (the prior
// bug: the cancel route never passed a date to the interview_cancelled
// template). Returns undefined when no date is resolvable — callers must then
// omit the "scheduled for …" clause entirely rather than render a broken token.
export function formatInterviewWhen(
  dateStr?: string | null,
  timeStr?: string | null,
): string | undefined {
  if (!dateStr) return undefined
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return undefined
  const longDate = new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  // interviews.interview_time comes back as "HH:MM:SS" — trim to "HH:MM"
  // to match the confirmation email's "… at 12:00" form.
  const hhmm = timeStr ? String(timeStr).slice(0, 5) : ''
  return hhmm ? `${longDate} at ${hhmm}` : longDate
}
