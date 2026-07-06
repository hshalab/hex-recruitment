// Shared model for the Temp Work feed. Client + server safe.

// ── Grouped role taxonomy (one source for the composer picker AND the filter) ──
export interface RoleDef { key: string; label: string }
export interface RoleGroup { key: string; label: string; icon: string; roles: RoleDef[] }

export const ROLE_GROUPS: RoleGroup[] = [
  { key: 'kitchen', label: 'Kitchen', icon: '👨‍🍳', roles: [
    { key: 'head_chef', label: 'Head Chef' },
    { key: 'sous_chef', label: 'Sous Chef' },
    { key: 'chef_de_partie', label: 'Chef de Partie' },
    { key: 'commis_chef', label: 'Commis Chef' },
    { key: 'pastry_chef', label: 'Pastry Chef' },
    { key: 'kitchen_porter', label: 'Kitchen Porter' },
  ] },
  { key: 'foh', label: 'Front of House', icon: '🍽️', roles: [
    { key: 'waiting_staff', label: 'Waiting Staff' },
    { key: 'runner', label: 'Runner' },
    { key: 'host', label: 'Host/Hostess' },
    { key: 'barista', label: 'Barista' },
    { key: 'foh_supervisor', label: 'FOH Supervisor' },
  ] },
  { key: 'bar', label: 'Bar', icon: '🍸', roles: [
    { key: 'bartender', label: 'Bartender' },
    { key: 'barback', label: 'Barback' },
    { key: 'bar_supervisor', label: 'Bar Supervisor' },
  ] },
  { key: 'events', label: 'Events & Banqueting', icon: '🎪', roles: [
    { key: 'events_staff', label: 'Events Staff' },
    { key: 'banqueting_staff', label: 'Banqueting Staff' },
    { key: 'catering_assistant', label: 'Catering Assistant' },
  ] },
  { key: 'management', label: 'Management', icon: '📋', roles: [
    { key: 'duty_manager', label: 'Duty Manager' },
    { key: 'restaurant_manager', label: 'Restaurant Manager' },
    { key: 'general_manager', label: 'General Manager' },
  ] },
  { key: 'other', label: 'Other / General', icon: '💼', roles: [
    { key: 'other', label: 'Other / General' },
  ] },
]

const ROLE_INDEX: Record<string, { role: RoleDef; group: RoleGroup }> = (() => {
  const idx: Record<string, { role: RoleDef; group: RoleGroup }> = {}
  for (const g of ROLE_GROUPS) for (const r of g.roles) idx[r.key] = { role: r, group: g }
  return idx
})()

export function roleMeta(key: string): { key: string; label: string; groupKey: string; groupLabel: string; icon: string } {
  const hit = ROLE_INDEX[key]
  if (hit) return { key, label: hit.role.label, groupKey: hit.group.key, groupLabel: hit.group.label, icon: hit.group.icon }
  return { key, label: key, groupKey: 'other', groupLabel: 'Other', icon: '💼' }
}

export function rolesInGroup(groupKey: string): string[] {
  return ROLE_GROUPS.find(g => g.key === groupKey)?.roles.map(r => r.key) ?? []
}

export const RATE_TYPES = ['hour', 'shift', 'day'] as const
export type RateType = typeof RATE_TYPES[number]

export interface TempPost {
  id: string
  employer_id: string
  title: string
  category: string // granular role key (see roleMeta)
  description: string | null
  shift_date: string | null
  start_time: string | null
  end_time: string | null
  is_ongoing: boolean
  location_area: string
  postcode: string | null
  hourly_rate: number | null
  rate_type: RateType
  headcount: number
  image_url: string | null
  external_link: string | null
  company_name: string | null
  company_logo: string | null
  interest_count: number
  status: 'open' | 'filled' | 'closed' | 'expired'
  created_at: string
  isExample?: boolean
}

export interface TempInterest {
  id: string
  temp_post_id: string
  candidate_user_id: string
  message: string | null
  status: 'interested' | 'shortlisted' | 'booked' | 'declined'
  created_at: string
}

export const DISCLAIMER =
  'Thrive connects workers and employers. Bookings, pay and compliance are arranged directly between you — Thrive is not the employer or agency.'

export function formatWhen(p: Pick<TempPost, 'is_ongoing' | 'shift_date' | 'start_time' | 'end_time'>): string {
  if (p.is_ongoing) return 'Ongoing · flexible'
  if (!p.shift_date) return 'Flexible dates'
  const d = new Date(`${p.shift_date}T00:00:00`)
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const t = (s?: string | null) => (s ? s.slice(0, 5) : null)
  const times = [t(p.start_time), t(p.end_time)].filter(Boolean).join('–')
  return times ? `${date} · ${times}` : date
}

export function formatRate(p: Pick<TempPost, 'hourly_rate' | 'rate_type'>): string | null {
  if (p.hourly_rate == null) return null
  return `£${p.hourly_rate}/${p.rate_type}`
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

export function initialsOf(name: string): string {
  return (name || '?').split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()
}
