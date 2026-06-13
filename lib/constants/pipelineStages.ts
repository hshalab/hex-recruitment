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

// Softened stage tints — the SAME treatment the pipeline board uses for its
// column count badges and "N days in {stage}" pills (StageDurationBadge):
// a 12% colour-mix fill with a 30% border. Reusing this here keeps the
// applications candidate-header visually identical to the pipeline columns —
// they can't drift because both derive from STAGE_COLORS via these helpers.
const STAGE_TINT_PCT = 12
const STAGE_BORDER_PCT = 30

export function stageSoftTint(stage: StageId): string {
  return `color-mix(in srgb, ${STAGE_COLORS[stage]} ${STAGE_TINT_PCT}%, transparent)`
}
export function stageSoftBorder(stage: StageId): string {
  return `color-mix(in srgb, ${STAGE_COLORS[stage]} ${STAGE_BORDER_PCT}%, transparent)`
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

// Softened candidate-header fill for a given application status, matching the
// pipeline columns. Returns the soft 12% tint + 30% border (and the stage id /
// label for the pill). null → use the existing navy fallback (unmapped
// statuses, e.g. 'pending'). Text ink is always dark — the tint is pale.
export function headerThemeForStatus(
  status: string | null | undefined
): { stage: StageId; label: string; bg: string; border: string } | null {
  const stage = stageForStatus(status)
  if (!stage) return null
  return {
    stage,
    label: STAGE_LABELS[stage],
    bg: stageSoftTint(stage),
    border: stageSoftBorder(stage),
  }
}
