// Shared employer team-permission model (client + server safe — no server-only).
//
// Capabilities map 1:1 to the JSONB flags stored on employer_members.permissions
// and checked by has_employer_permission() in the DB. `ownerOnly` caps can only
// be GRANTED by an owner — the guard_member_escalation trigger enforces this at
// the DB level; the Team UI hides them from non-owners as a courtesy.

export type PermissionKey =
  | 'manage_jobs'
  | 'view_applications'
  | 'manage_pipeline'
  | 'manage_interviews'
  | 'edit_company'
  | 'manage_billing'
  | 'manage_team'

export type Permissions = Partial<Record<PermissionKey, boolean>>

export interface PermissionMeta {
  key: PermissionKey
  label: string
  description: string
  ownerOnly: boolean
}

export const PERMISSIONS: PermissionMeta[] = [
  { key: 'manage_jobs', label: 'Post & edit jobs', description: 'Create, edit, open and close job listings.', ownerOnly: false },
  { key: 'view_applications', label: 'View applicants', description: 'See who has applied and read their profiles.', ownerOnly: false },
  { key: 'manage_pipeline', label: 'Move candidates', description: 'Advance, decline and hire candidates in the pipeline.', ownerOnly: false },
  { key: 'manage_interviews', label: 'Manage interviews', description: 'Schedule, reschedule and cancel interviews.', ownerOnly: false },
  { key: 'edit_company', label: 'Edit company profile', description: 'Change the company name, logo and details.', ownerOnly: true },
  { key: 'manage_billing', label: 'Manage billing', description: 'View and change the subscription and payment details.', ownerOnly: true },
  { key: 'manage_team', label: 'Manage team', description: 'Invite, edit and remove other team members.', ownerOnly: true },
]

export const OWNER_ONLY_KEYS: PermissionKey[] = PERMISSIONS.filter(p => p.ownerOnly).map(p => p.key)

// Presets offered in the invite picker. Recruiter is the default.
export interface Preset {
  id: string
  label: string
  description: string
  permissions: Permissions
}

export const PRESETS: Preset[] = [
  {
    id: 'recruiter',
    label: 'Recruiter',
    description: 'Review applicants, move the pipeline and run interviews.',
    permissions: { view_applications: true, manage_pipeline: true, manage_interviews: true },
  },
  {
    id: 'hiring_manager',
    label: 'Hiring manager',
    description: 'Everything a recruiter can do, plus posting and editing jobs.',
    permissions: { manage_jobs: true, view_applications: true, manage_pipeline: true, manage_interviews: true },
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Full access including team, billing and company settings. Owner only.',
    permissions: {
      manage_jobs: true, view_applications: true, manage_pipeline: true, manage_interviews: true,
      edit_company: true, manage_billing: true, manage_team: true,
    },
  },
]

export const DEFAULT_PRESET_ID = 'recruiter'

/** Human summary of a permission set, e.g. "Recruiter" or "Custom (3)". */
export function describePermissions(perms: Permissions): string {
  const active = PERMISSIONS.filter(p => perms[p.key]).map(p => p.key)
  for (const preset of PRESETS) {
    const presetKeys = Object.keys(preset.permissions).sort().join(',')
    if (presetKeys === active.slice().sort().join(',')) return preset.label
  }
  return active.length ? `Custom (${active.length})` : 'No access'
}
