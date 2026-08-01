// THE work-type vocabulary. One list, imported everywhere.
//
// Before this module there were SIX copies of this idea and they disagreed:
//
//   post-job            <option> elements — the right six
//   job-alerts          two local consts — the right six
//   profile form        an inline literal inside JSX, with Contract, Freelance
//                       and Internship, which no job has ever carried
//   /jobs filter        a seventh word, Apprenticeship, that exists nowhere else
//   /candidates filter  Contract and Freelance again, filtering candidates on
//                       words candidates could no longer pick
//
// The two that WRITE the vocabulary onto rows were already correct; the three
// that READ and FILTER were the ones adrift. That is the wrong way round — the
// filters were offering choices the board could never satisfy, which is the same
// fault as the job-alert tags where all 34 options matched zero rows.
//
// THIS VOCABULARY IS STILL MUDDLED and deliberately left that way for now. It
// mixes VOLUME (full/part-time), DURATION (permanent/temporary/fixed-term) and
// something route-ish (flexible). Splitting those into route/contract/hours is
// scoped separately. The point of this module is that when that split happens it
// is a change to ONE file rather than six.

/** Hours-shaped: how much of a week the work is. */
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Flexible'] as const

/** Duration-shaped: how long the arrangement lasts. */
export const CONTRACT_TYPES = ['Permanent', 'Temporary', 'Fixed-term'] as const

/**
 * The whole vocabulary, in the order a form should present it.
 *
 * Part-time and Fixed-term currently match zero live rows and are kept
 * deliberately: they are legitimate hospitality arrangements that will exist.
 * That is the opposite of Contract/Freelance/Internship below, which never will.
 */
export const WORK_TYPES = [...EMPLOYMENT_TYPES, ...CONTRACT_TYPES] as const

export type WorkType = typeof WORK_TYPES[number]

/**
 * Words removed from the vocabulary, kept only so the migration and any future
 * audit can recognise them. Nothing should OFFER these.
 *
 * Contract / Freelance / Internship came from the profile form; Apprenticeship
 * existed only in the /jobs filter. No job on the board has ever carried any of
 * them, and none is a hospitality word.
 */
export const RETIRED_WORK_TYPES = ['Contract', 'Freelance', 'Internship', 'Apprenticeship'] as const

export function isWorkType(value: string | null | undefined): value is WorkType {
  return !!value && (WORK_TYPES as readonly string[]).includes(value)
}

/** Drops anything no longer in the vocabulary. Used to read legacy rows safely. */
export function keepKnownWorkTypes(values: readonly string[] | null | undefined): WorkType[] {
  return (values || []).filter(isWorkType)
}
