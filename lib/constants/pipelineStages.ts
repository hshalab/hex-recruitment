// Single source of truth for the 6 pipeline-stage accent colours and labels.
// Imported by the pipeline board (app/pipeline/page.tsx STAGES) and the
// applications candidate-header (app/my-jobs/[jobId]/applications). These hex
// values must live ONLY here — do not duplicate them elsewhere.
export type StageId =
  | 'reviewing'
  | 'shortlisted'
  | 'interview'
  | 'offered'
  | 'hired'
  | 'rejected'

export const STAGE_COLORS: Record<StageId, string> = {
  reviewing: '#3b82f6',
  shortlisted: '#8b5cf6',
  interview: '#06b6d4',
  offered: '#10b981',
  hired: '#16a34a',
  rejected: '#6B7280',
}

export const STAGE_LABELS: Record<StageId, string> = {
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Declined',
}

// Text-ink theme per stage, chosen so the candidate-header text stays AA-legible
// on that stage's colour: dark ink on the brighter colours, white on the
// darker grey. (Verified ≥4.5:1 for each.)
const STAGE_INK: Record<StageId, 'dark' | 'light'> = {
  reviewing: 'dark',
  shortlisted: 'dark',
  interview: 'dark',
  offered: 'dark',
  hired: 'dark',
  rejected: 'light',
}

// job_applications.status is plain text (no enum). Map it to a pipeline stage.
// Statuses that don't correspond to one of the 6 board stages (e.g. 'pending')
// return null so the caller falls back to the default navy header.
export function stageForStatus(status: string | null | undefined): StageId | null {
  switch (status) {
    case 'reviewing':
      return 'reviewing'
    case 'shortlisted':
      return 'shortlisted'
    case 'interview':
    case 'interviewing':
      return 'interview'
    case 'offered':
      return 'offered'
    case 'hired':
      return 'hired'
    case 'rejected':
      return 'rejected'
    default:
      return null
  }
}

// Header background + text-ink for a candidate at a given application status.
// null → use the existing navy fallback (unmapped statuses).
export function headerThemeForStatus(
  status: string | null | undefined
): { bg: string; ink: 'dark' | 'light' } | null {
  const stage = stageForStatus(status)
  if (!stage) return null
  return { bg: STAGE_COLORS[stage], ink: STAGE_INK[stage] }
}
