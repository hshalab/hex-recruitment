// Shared model for the Temp Work feed (v1). Client + server safe.

export const TEMP_CATEGORIES = [
  { key: 'chef', label: 'Chef', icon: '👨‍🍳' },
  { key: 'sous', label: 'Sous Chef', icon: '🔪' },
  { key: 'kp', label: 'Kitchen Porter', icon: '🧽' },
  { key: 'waiting', label: 'Waiting', icon: '🍽️' },
  { key: 'bar', label: 'Bar', icon: '🍸' },
  { key: 'host', label: 'Host', icon: '🛎️' },
  { key: 'events', label: 'Events', icon: '🎪' },
] as const

export type TempCategory = typeof TEMP_CATEGORIES[number]['key']
export const TEMP_CATEGORY_KEYS: string[] = TEMP_CATEGORIES.map(c => c.key)

export function categoryMeta(key: string) {
  return TEMP_CATEGORIES.find(c => c.key === key) ?? { key, label: key, icon: '💼' }
}

export const RATE_TYPES = ['hour', 'shift', 'day'] as const
export type RateType = typeof RATE_TYPES[number]

export interface TempPost {
  id: string
  employer_id: string
  title: string
  category: string
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
  status: 'open' | 'filled' | 'closed' | 'expired'
  created_at: string
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
