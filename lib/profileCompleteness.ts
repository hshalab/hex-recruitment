// Shared profile-completeness definition for the admin user views.
// Used by both the user LIST (percentage + bar) and the user DETAIL panel
// (per-signal checklist), so the score and the breakdown always agree.

export type ProfileRole = 'candidate' | 'employer'

export interface CompletenessSignal {
  key: string
  label: string
  filled: boolean
}

export interface Completeness {
  percent: number // 0–100
  filledCount: number
  total: number
  signals: CompletenessSignal[]
}

const str = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim().length > 0 : v != null && v !== ''

const arr = (v: unknown): boolean => Array.isArray(v) && v.length > 0

// work_history / education etc. arrive as jsonb — could be an array, object or
// a stringified blank. Treat only genuinely-populated values as filled.
const json = (v: unknown): boolean => {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  if (typeof v === 'string') {
    const t = v.trim()
    return t.length > 0 && t !== '[]' && t !== '{}' && t !== 'null'
  }
  return false
}

// Candidate: 10 signals. Name + email are always present at sign-up, so they
// don't count toward "how much extra have they filled in".
function candidateSignals(p: Record<string, any>): CompletenessSignal[] {
  return [
    { key: 'phone', label: 'Phone', filled: str(p.phone) },
    { key: 'location', label: 'Location', filled: str(p.location) || str(p.city) || str(p.postcode) },
    { key: 'job_title', label: 'Job title', filled: str(p.job_title) || str(p.headline) },
    { key: 'bio', label: 'Bio', filled: str(p.bio) || str(p.personal_bio) },
    { key: 'experience', label: 'Experience', filled: p.years_experience != null && Number(p.years_experience) > 0 },
    { key: 'skills', label: 'Skills', filled: arr(p.skills) },
    { key: 'cv', label: 'CV', filled: str(p.cv_url) },
    { key: 'photo', label: 'Photo', filled: str(p.profile_picture_url) || str(p.dashboard_photo_url) },
    { key: 'work_history', label: 'Work history', filled: json(p.work_history) },
    { key: 'salary', label: 'Desired salary', filled: str(p.desired_salary) || p.salary_min != null },
  ]
}

// Employer: 6 signals (company name is always present at sign-up).
function employerSignals(p: Record<string, any>): CompletenessSignal[] {
  return [
    { key: 'phone', label: 'Phone', filled: str(p.phone) },
    { key: 'location', label: 'Location', filled: str(p.location) },
    { key: 'industry', label: 'Industry', filled: str(p.industry) },
    { key: 'website', label: 'Website', filled: str(p.website) },
    { key: 'description', label: 'Description', filled: str(p.description) },
    { key: 'logo', label: 'Logo', filled: str(p.logo_url) },
  ]
}

export function computeCompleteness(
  profile: Record<string, any> | null | undefined,
  role: ProfileRole
): Completeness {
  const p = profile || {}
  const signals = role === 'employer' ? employerSignals(p) : candidateSignals(p)
  const filledCount = signals.filter(s => s.filled).length
  const percent = signals.length ? Math.round((filledCount / signals.length) * 100) : 0
  return { percent, filledCount, total: signals.length, signals }
}

// Normalise the sign-up channel from the auth user's OAuth provider, with an
// optional UTM/source refinement from the profile row.
export function signupSource(
  authUser: { app_metadata?: { provider?: string } | null; identities?: { provider?: string }[] | null } | null,
  profile?: Record<string, any> | null
): string {
  const raw =
    authUser?.app_metadata?.provider ||
    authUser?.identities?.[0]?.provider ||
    'email'
  const map: Record<string, string> = {
    google: 'Google',
    linkedin_oidc: 'LinkedIn',
    linkedin: 'LinkedIn',
    email: 'Email',
  }
  const base = map[raw] || raw
  const utm = profile?.utm_source || profile?.signup_source
  return utm && String(utm).toLowerCase() !== base.toLowerCase()
    ? `${base} · ${utm}`
    : base
}
