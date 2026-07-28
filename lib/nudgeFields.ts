// What each nudge actually ASKS FOR, and why the candidate should care.
//
// lib/nudges.ts decides WHETHER a nudge may be shown. This decides WHICH field
// is worth asking about and what the ask says. Kept apart so the rules stay
// testable without any copy in them.

import type { NudgeKey } from './nudges'

export interface NudgeFieldSpec {
  key: NudgeKey
  /** Headline — the payoff, not the chore. */
  title: string
  /** One line on what they get, in their terms. */
  body: string
  cta: string
  /** Deep-links straight to the control, same ?section= slugs the dashboard uses. */
  link: string
  /** True when the candidate still needs to fill this in. */
  isMissing: (c: NudgeCandidate) => boolean
}

/** Just the parts of Candidate a nudge cares about. */
export interface NudgeCandidate {
  jobTitle?: string | null
  jobSector?: string | null
  preferredAreas?: string[] | null
  salaryMin?: number | string | null
  salaryMax?: number | string | null
  desiredSalary?: string | null
}

/**
 * Priority order, highest value first. This is deliberately NOT the same as
 * "most missing" — it's ordered by what each field unlocks:
 *
 *  1. areas    — the only field that unlocks the digest AT ALL (no areas is a
 *                hard exclusion there) and drives area-matched recommendations.
 *  2. jobTitle — unlocks profile-matched recommendations for candidates who
 *                haven't set areas, and sharpens ranking for those who have.
 *  3. salary  — replaced jobSector here. Sector could not discriminate between
 *                roles while every active job on the board is 'hospitality', so
 *                it was asking for a field that changed nobody's results.
 *                Salary now orders every list through the pay penalty in
 *                lib/rolesRoundup.ts, so answering it visibly changes what the
 *                candidate is shown. It is still third: areas and job title
 *                decide WHICH roles they see, salary only decides the order.
 */
export const NUDGE_FIELDS: NudgeFieldSpec[] = [
  {
    key: 'areas',
    title: 'Where can you actually get to?',
    body: 'Tell us your areas and we’ll only show you roles within reach — and email you when new ones land there.',
    cta: 'Choose my areas',
    link: '/profile?section=areas',
    isMissing: c => !(c.preferredAreas && c.preferredAreas.length > 0),
  },
  {
    key: 'jobTitle',
    title: 'What job are you after?',
    body: 'Add the role you want and we’ll match you to jobs like it instead of everything on the board.',
    cta: 'Add my job title',
    link: '/profile?section=job-title',
    isMissing: c => !c.jobTitle || !String(c.jobTitle).trim(),
  },
  {
    key: 'salary',
    title: 'What are you looking to earn?',
    body: 'Tell us and we’ll put the roles that pay it at the top — we’ll still show you everything else.',
    cta: 'Add my salary',
    link: '/profile?section=job-preferences',
    // Any of the three counts: the range is what matching reads, but a
    // candidate who typed only the free-text figure has still answered.
    isMissing: c =>
      !c.salaryMin && !c.salaryMax && !(c.desiredSalary && String(c.desiredSalary).trim()),
  },
]

export const NUDGE_ORDER: NudgeKey[] = NUDGE_FIELDS.map(f => f.key)

export function specFor(key: NudgeKey): NudgeFieldSpec | undefined {
  return NUDGE_FIELDS.find(f => f.key === key)
}

/** Keys still worth asking about, in priority order. */
export function missingKeys(c: NudgeCandidate): NudgeKey[] {
  return NUDGE_FIELDS.filter(f => f.isMissing(c)).map(f => f.key)
}

/** Keys the candidate has since filled in — used to retire them permanently. */
export function satisfiedKeys(c: NudgeCandidate): NudgeKey[] {
  return NUDGE_FIELDS.filter(f => !f.isMissing(c)).map(f => f.key)
}
