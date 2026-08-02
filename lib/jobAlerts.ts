import { parsePreferredAreas, jobMatchesPreferredAreas } from './areas'
import { Job } from './mockJobs'

const SECTOR_KEY_TO_LABEL: Record<string, string> = {
  hospitality: 'Hospitality Tourism & Sport',
  accountancy: 'Accountancy Banking & Finance',
  business: 'Business Consulting & Management',
  charity: 'Charity & Voluntary Work',
  creative: 'Creative Arts & Design',
  digital: 'Digital & Information Technology',
  energy: 'Energy & Utilities',
  engineering: 'Engineering & Manufacturing',
  environment: 'Environment & Agriculture',
  healthcare: 'Healthcare & Social Care',
  law: 'Law & Legal Services',
  marketing: 'Marketing Advertising & PR',
  media: 'Media & Internet',
  property: 'Property & Construction',
  public: 'Public Services & Administration',
  recruitment: 'Recruitment & HR',
  retail: 'Retail & Sales',
  science: 'Science & Pharmaceuticals',
  teaching: 'Teaching & Education',
  transport: 'Transport & Logistics',
}

// ─── Job Alert Types ─────────────────────────────────────────────

export interface JobAlert {
  id: string
  candidate_id: string
  alert_name: string
  sectors: string[]
  locations: string[]
  min_salary: number | null
  max_salary: number | null
  job_types: string[]
  tags: string[]
  is_active: boolean
  frequency: 'instant' | 'daily' | 'weekly'
  created_at: string
  updated_at: string
}

// ─── Supabase row → JobAlert conversion ─────────────────────────

export function supabaseRowToJobAlert(row: any): JobAlert {
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    alert_name: row.alert_name,
    sectors: row.sectors || [],
    locations: row.locations || [],
    min_salary: row.min_salary ?? null,
    max_salary: row.max_salary ?? null,
    job_types: row.job_types || [],
    tags: row.tags || [],
    is_active: row.is_active ?? true,
    frequency: row.frequency || 'instant',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ─── Matching Algorithm ──────────────────────────────────────────

/**
 * Determines whether a newly posted job matches a given alert.
 *
 * Matching rules (ALL specified criteria must match — AND logic):
 *   - sectors:    if alert.sectors is non-empty, job.category must be in the list
 *   - locations:  if alert.locations is non-empty, the job must fall in one of
 *                 the chosen areas, by the SAME rule the profile uses
 *                 (lib/areas jobMatchesPreferredAreas) — region/county tokens,
 *                 not a substring test, and an unplaceable job is never hidden
 *   - salary:     if alert.min_salary is set, job.salaryMax must be >= alert.min_salary
 *                 if alert.max_salary is set, job.salaryMin must be <= alert.max_salary
 *   - job_types:  if alert.job_types is non-empty, at least one must appear in
 *                 job.employmentType array
 *   - tags:       if alert.tags is non-empty, at least one must appear in job.tags
 *
 * Empty criteria arrays are treated as "match anything" for that dimension.
 */
export function jobMatchesAlert(job: Job, alert: JobAlert): boolean {
  // 1. Sector match (normalise key → label)
  if (alert.sectors.length > 0) {
    const jobSectorLabel = SECTOR_KEY_TO_LABEL[job.category] || job.category
    if (!alert.sectors.includes(jobSectorLabel)) {
      return false
    }
  }

  // 2. Location match — THE SAME RULE THE PROFILE USES.
  //
  // This was a case-insensitive SUBSTRING test against job.location, while the
  // profile matched area tokens through lib/areas. Two location vocabularies on
  // one side of the product, and the substring version was the worse of the two
  // in both directions: "York" matched "New York Road", and a candidate who
  // picked a county got nothing from a job that only knew its region.
  //
  // jobMatchesPreferredAreas brings the guarantees with it — an unplaceable job
  // is never hidden, and picking a county still surfaces region-only jobs in
  // that region.
  if (alert.locations.length > 0) {
    const prefs = parsePreferredAreas(alert.locations)
    if (!prefs.isEmpty && !jobMatchesPreferredAreas(job, prefs)) return false
  }

  // 3. Salary overlap (normalise hourly → annual using 2080 hours/year)
  const annualMin = job.salaryPeriod === 'hour' ? job.salaryMin * 2080 : job.salaryMin
  const annualMax = job.salaryPeriod === 'hour' ? job.salaryMax * 2080 : job.salaryMax
  if (alert.min_salary !== null && alert.min_salary > 0) {
    if (annualMax < alert.min_salary) return false
  }
  if (alert.max_salary !== null && alert.max_salary > 0) {
    if (annualMin > alert.max_salary) return false
  }

  // 4. Job type match (at least one overlap)
  if (alert.job_types.length > 0) {
    const jobTypes = Array.isArray(job.employmentType)
      ? job.employmentType
      : [job.employmentType]
    const typeMatch = alert.job_types.some(t =>
      jobTypes.some(jt => jt.toLowerCase() === t.toLowerCase())
    )
    if (!typeMatch) return false
  }

  // 5. Tags match (at least one overlap)
  if (alert.tags.length > 0) {
    const jobTags = (job.tags || []).map(t => t.toLowerCase())
    const tagMatch = alert.tags.some(t => jobTags.includes(t.toLowerCase()))
    if (!tagMatch) return false
  }

  return true
}
