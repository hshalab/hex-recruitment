// Candidate per-field visibility. Stored on candidate_profiles.visibility_settings
// (jsonb) and set by the candidate on /settings/profile. Every EMPLOYER-facing
// view of a candidate (the /candidates modal, /candidates/[id], and the shared
// <CandidateDetail>) must resolve + honour these, so a field a candidate hid is
// never shown.

export interface VisibilitySettings {
  show_email: boolean
  show_phone: boolean
  show_address: boolean
  show_date_of_birth: boolean
  show_nationality: boolean
  show_desired_salary: boolean
  show_social_links: boolean
  show_availability: boolean
  show_verification_badges: boolean
  show_cv: boolean
}

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  show_email: true,
  show_phone: true,
  show_address: false,
  show_date_of_birth: false,
  show_nationality: true,
  show_desired_salary: true,
  show_social_links: true,
  show_availability: true,
  show_verification_badges: true,
  show_cv: true,
}

/** Merge a raw candidate_profiles.visibility_settings jsonb over the defaults. */
export function resolveVisibility(raw: unknown): VisibilitySettings {
  return raw && typeof raw === 'object'
    ? { ...DEFAULT_VISIBILITY, ...(raw as Partial<VisibilitySettings>) }
    : DEFAULT_VISIBILITY
}

/** "Active today/this week/this month" from a profile updated_at timestamp. */
export function lastActiveLabel(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null
  const diffDays = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000)
  if (diffDays <= 0) return 'Active today'
  if (diffDays <= 7) return 'Active this week'
  if (diffDays <= 30) return 'Active this month'
  return null
}
