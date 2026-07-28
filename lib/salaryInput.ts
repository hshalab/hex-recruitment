// Validation for what a candidate types into "Salary Range".
//
// WHY THIS EXISTS. A live profile asked for "£38-£60/year". The candidate meant
// thirty-eight to sixty thousand and typed the thousands as units; nothing
// checked, so the row stored 38 and 60. Any matching rule reading that number
// straight would conclude he wants £38 a year and rank the entire board as a
// wild overpayment. One in eight of the profiles that had set a salary was
// wrong by a factor of a thousand.
//
// The rule this guards is deliberately narrow: catch the mistake AT ENTRY and
// ask, rather than store it silently. It is not a completeness gate — an empty
// salary is perfectly fine and stays fine. Only a value the candidate has
// actually typed, and which cannot mean what it says, is refused.

export type SalaryPeriod = 'hour' | 'year'

/** Below this, an annual figure is almost certainly thousands typed as units. */
export const MIN_CREDIBLE_ANNUAL = 5_000
/** Above this it's a typo (an extra zero) far more often than a real ask. */
export const MAX_CREDIBLE_ANNUAL = 500_000
/** Under the National Minimum Wage for any age band — cannot be a real ask. */
export const MIN_CREDIBLE_HOURLY = 5
/** Comfortably above any hospitality hourly rate, including agency premiums. */
export const MAX_CREDIBLE_HOURLY = 200

export interface SalaryInput {
  min?: string | number | null
  max?: string | number | null
  period?: SalaryPeriod | string | null
}

export interface SalaryProblem {
  /** Which box to point at. */
  field: 'min' | 'max' | 'range'
  message: string
}

function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  // Tolerate what people actually type: "£45,000", "45k", " 45000 ".
  const cleaned = s.replace(/[£,\s]/g, '')
  const k = /^([0-9]*\.?[0-9]+)k$/i.exec(cleaned)
  const n = k ? Number(k[1]) * 1000 : Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

function money(n: number): string {
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
}

/**
 * Check one end of the range. Returns null when it's blank or plausible.
 *
 * The under-minimum annual message names the number they probably meant rather
 * than just refusing — the mistake is a slip, not a misunderstanding, and being
 * told "did you mean £38,000?" is the difference between fixing it and giving
 * up on the field.
 */
function checkOne(value: number | null, period: SalaryPeriod, field: 'min' | 'max'): SalaryProblem | null {
  if (value === null) return null
  if (Number.isNaN(value)) return { field, message: 'Please enter salary as a number.' }
  if (value <= 0) return { field, message: 'Salary must be more than zero.' }

  if (period === 'year') {
    if (value < MIN_CREDIBLE_ANNUAL) {
      return {
        field,
        message:
          `${money(value)} a year looks like it's missing three zeros — did you mean ` +
          `${money(value * 1000)}? Enter the full amount, or switch Salary Period to Per Hour.`,
      }
    }
    if (value > MAX_CREDIBLE_ANNUAL) {
      return { field, message: `${money(value)} a year looks like a typo. Please check the amount.` }
    }
    return null
  }

  if (value < MIN_CREDIBLE_HOURLY) {
    return {
      field,
      message: `${money(value)} an hour is below the minimum wage. Please check the amount, or switch Salary Period to Per Year.`,
    }
  }
  if (value > MAX_CREDIBLE_HOURLY) {
    return {
      field,
      message: `${money(value)} an hour looks like a typo — did you mean to choose Per Year?`,
    }
  }
  return null
}

/** The first problem with what they've typed, or null if it's fine (or empty). */
export function validateSalaryInput(input: SalaryInput): SalaryProblem | null {
  const period: SalaryPeriod = input.period === 'hour' ? 'hour' : 'year'
  const min = toNumber(input.min)
  const max = toNumber(input.max)

  return (
    checkOne(min, period, 'min') ??
    checkOne(max, period, 'max') ??
    (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && max < min
      ? { field: 'range', message: 'The top of the range is lower than the bottom — please swap them.' }
      : null)
  )
}

/**
 * True when a stored figure cannot be trusted as an annual expectation.
 *
 * The counterpart to the input rule, for reading rows that predate it. Matching
 * work should treat these as "no salary stated" rather than as a real ask —
 * a candidate we think wants £38 a year is worse than one we know nothing about.
 */
export function isCredibleAnnualAsk(value: number | null | undefined, period?: string | null): boolean {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return false
  if (period === 'hour') return value >= MIN_CREDIBLE_HOURLY && value <= MAX_CREDIBLE_HOURLY
  return value >= MIN_CREDIBLE_ANNUAL && value <= MAX_CREDIBLE_ANNUAL
}
