// First-party signup source attribution. No third-party trackers — we only read
// our own ?ref / ?utm_* tags and store them first-party (cookie + localStorage) so
// they survive the signup journey, then persist onto the profile row at creation.
//
// Isomorphic: the capture/store helpers are client-only (guarded on `document`),
// while normalizeSource + parseAttrCookie are pure and safe on the server (used by
// the auth callback to write the columns).

export const ATTR_COOKIE = 'thrive_attr'
export const ATTR_MAX_AGE_DAYS = 90

export interface Attribution {
  signup_ref?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  heard_from?: string | null
}

// Options shown in the "How did you hear about us?" dropdown (Layer 2).
export const HEARD_FROM_OPTIONS = [
  'LinkedIn',
  'Facebook group',
  'WhatsApp / word of mouth',
  'Instagram',
  'A recruiter / agency',
  'Google search',
  'Other',
] as const

// Map raw ref/utm channel tokens -> normalized channel label.
const CHANNEL_ALIASES: Record<string, string> = {
  li: 'LinkedIn', linkedin: 'LinkedIn',
  fb: 'Facebook', facebook: 'Facebook', meta: 'Facebook',
  wa: 'WhatsApp', whatsapp: 'WhatsApp',
  ig: 'Instagram', instagram: 'Instagram', insta: 'Instagram',
  google: 'Google search', gsearch: 'Google search', g: 'Google search',
  email: 'Email', newsletter: 'Email',
}

// Map self-reported dropdown answers -> the same normalized channels, so the
// signup_source column is consistent whether it came from a tag or the dropdown.
const HEARD_FROM_ALIASES: Record<string, string> = {
  'linkedin': 'LinkedIn',
  'facebook group': 'Facebook',
  'whatsapp / word of mouth': 'WhatsApp',
  'instagram': 'Instagram',
  'a recruiter / agency': 'Recruiter/agency',
  'google search': 'Google search',
  'other': 'Other',
}

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Derive a single normalized channel. Priority (per spec):
 *   explicit ref/utm_source  ->  heard_from  ->  'unknown'.
 * For ref tags we key off the channel PREFIX before the first '-'
 * (fb-chefsuk -> Facebook) while the raw ref is kept separately for drill-down.
 */
export function normalizeSource(a: Attribution): string {
  const raw = (a.signup_ref || a.utm_source || '').toString().trim().toLowerCase()
  if (raw) {
    const prefix = raw.split(/[-_]/)[0]
    return CHANNEL_ALIASES[prefix] || CHANNEL_ALIASES[raw] || titleCase(prefix || raw)
  }
  const hf = (a.heard_from || '').toString().trim()
  if (hf) return HEARD_FROM_ALIASES[hf.toLowerCase()] || hf
  return 'unknown'
}

// ── Client-only store helpers (first-touch-wins) ─────────────────────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? m[1] : null
}

/** Read whatever attribution we've already stored (localStorage first, then cookie). */
export function getStoredAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null
  try {
    const ls = window.localStorage.getItem(ATTR_COOKIE)
    if (ls) return JSON.parse(ls) as Attribution
  } catch { /* ignore */ }
  const c = readCookie(ATTR_COOKIE)
  if (c) { try { return JSON.parse(decodeURIComponent(c)) as Attribution } catch { /* ignore */ } }
  return null
}

function writeStored(a: Attribution) {
  if (typeof document === 'undefined') return
  const json = JSON.stringify(a)
  try { window.localStorage.setItem(ATTR_COOKIE, json) } catch { /* ignore */ }
  const maxAge = ATTR_MAX_AGE_DAYS * 86400
  document.cookie = `${ATTR_COOKIE}=${encodeURIComponent(json)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

/**
 * Read ref/utm_* from a URL query string and store them FIRST-TOUCH-WINS.
 * If anything is already stored, do nothing (we keep the channel that originally
 * found them, not the last page they were on). No-op when there's nothing to tag.
 */
export function captureFromSearch(search: string) {
  if (typeof document === 'undefined') return
  const params = new URLSearchParams(search)
  const incoming: Attribution = {
    signup_ref: params.get('ref') || undefined,
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
  }
  const hasAny = incoming.signup_ref || incoming.utm_source || incoming.utm_medium || incoming.utm_campaign
  if (!hasAny) return
  if (getStoredAttribution()) return // first-touch wins
  writeStored(incoming)
}

// ── Server helper ────────────────────────────────────────────────────────────

/** Parse the thrive_attr cookie out of a raw Cookie header (server fallback). */
export function parseAttrCookie(cookieHeader: string | null | undefined): Attribution | null {
  if (!cookieHeader) return null
  const m = cookieHeader.match(new RegExp('(?:^|; )' + ATTR_COOKIE + '=([^;]*)'))
  if (!m) return null
  try { return JSON.parse(decodeURIComponent(m[1])) as Attribution } catch { return null }
}

/** Build the profile columns from raw attribution (used at profile creation). */
export function attributionColumns(a: Attribution | null | undefined) {
  const attr = a || {}
  return {
    signup_ref: attr.signup_ref || null,
    utm_source: attr.utm_source || null,
    utm_medium: attr.utm_medium || null,
    utm_campaign: attr.utm_campaign || null,
    heard_from: attr.heard_from || null,
    signup_source: normalizeSource(attr),
  }
}
