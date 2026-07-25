// Geocoding via postcodes.io (https://postcodes.io) — free, no API key, UK-only,
// backed by ONS/OS open data. Used to turn a candidate's postcode and a job's
// text location into coordinates for travel-radius filtering (Phase 2).
//
// Reality of our data (see the Phase-2 report): candidates have real postcodes;
// jobs have NO postcodes — only free-text towns/areas ("Maidenhead", "Oxford",
// vague regions like "Cumbria"), occasionally an outcode in `area` ("SW10"). So
// job geocoding is best-effort and approximate; anything we can't resolve stays
// NULL and must NOT be hidden downstream.
//
// No external dependency beyond fetch (Node 18+/Next both provide global fetch).

const BASE = 'https://api.postcodes.io'

export type GeoSource = 'postcode' | 'outcode' | 'place'
export type GeoPrecision = 'exact' | 'approximate'

export interface GeoResult {
  latitude: number
  longitude: number
  source: GeoSource
  /** 'exact' = full-postcode fix; 'approximate' = outcode or town centroid. */
  precision: GeoPrecision
  /** What we actually matched on (for logging/auditing the backfill). */
  matched: string
}

// Full UK postcode (used to validate/extract from text). Case-insensitive.
const FULL_POSTCODE = /\b(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\b/i
// Outward code only, e.g. "SW10", "EC1A", "OX1".
const OUTCODE_ONLY = /^[A-Z]{1,2}\d[A-Z\d]?$/i

async function getJson(url: string): Promise<any | null> {
  // Small retry for transient 429/5xx; returns null on hard failure so callers
  // fall through the resolution chain rather than throwing.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429 || res.status >= 500) { await sleep(300 * (attempt + 1)); continue }
      if (!res.ok) return null
      return await res.json()
    } catch {
      await sleep(200 * (attempt + 1))
    }
  }
  return null
}

async function postJson(url: string, body: unknown): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (res.status === 429 || res.status >= 500) { await sleep(400 * (attempt + 1)); continue }
      if (!res.ok) return null
      return await res.json()
    } catch {
      await sleep(200 * (attempt + 1))
    }
  }
  return null
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** Full postcode → coords (exact). */
export async function geocodePostcode(postcode: string): Promise<GeoResult | null> {
  const pc = (postcode || '').trim()
  if (!pc) return null
  const data = await getJson(`${BASE}/postcodes/${encodeURIComponent(pc)}`)
  const r = data?.result
  if (r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
    return { latitude: r.latitude, longitude: r.longitude, source: 'postcode', precision: 'exact', matched: r.postcode || pc }
  }
  return null
}

/**
 * Bulk full-postcode lookup (postcodes.io accepts up to 100/request). Returns a
 * Map keyed by the ORIGINAL input string. Use for large candidate backfills; jobs
 * have no postcodes so this is rarely useful there.
 */
export async function geocodePostcodesBulk(postcodes: string[]): Promise<Map<string, GeoResult | null>> {
  const out = new Map<string, GeoResult | null>()
  for (let i = 0; i < postcodes.length; i += 100) {
    const chunk = postcodes.slice(i, i + 100)
    const data = await postJson(`${BASE}/postcodes`, { postcodes: chunk })
    const results: any[] = data?.result || []
    for (const item of results) {
      const q = item.query
      const r = item.result
      out.set(q, r && typeof r.latitude === 'number'
        ? { latitude: r.latitude, longitude: r.longitude, source: 'postcode', precision: 'exact', matched: r.postcode || q }
        : null)
    }
    for (const c of chunk) if (!out.has(c)) out.set(c, null)
    if (i + 100 < postcodes.length) await sleep(200)
  }
  return out
}

/** Outward code (e.g. "SW10") → centroid (approximate). */
export async function geocodeOutcode(outcode: string): Promise<GeoResult | null> {
  const oc = (outcode || '').trim()
  if (!OUTCODE_ONLY.test(oc)) return null
  const data = await getJson(`${BASE}/outcodes/${encodeURIComponent(oc)}`)
  const r = data?.result
  if (r && typeof r.latitude === 'number') {
    return { latitude: r.latitude, longitude: r.longitude, source: 'outcode', precision: 'approximate', matched: r.outcode || oc }
  }
  return null
}

/**
 * Place/town name → centroid (approximate), via the OS Open Names place index.
 * Picks the best of the top matches: an exact-name City/Town beats an exact-name
 * anything, which beats the first result. This avoids same-named mismatches (e.g.
 * "Oxford" resolving to a suburban area near Crewe instead of the city).
 * Counties/regions ("Cumbria", "Oxfordshire", "South East") are NOT in the index
 * and return null — those jobs stay uncoordinated on purpose.
 */
export async function geocodePlace(name: string): Promise<GeoResult | null> {
  const q = (name || '').trim()
  if (!q) return null
  const data = await getJson(`${BASE}/places?q=${encodeURIComponent(q)}&limit=10`)
  const results: any[] = data?.result || []
  if (results.length === 0) return null
  const lc = q.toLowerCase()
  const exact = results.filter(r => (r.name_1 || '').toLowerCase() === lc)
  const preferredType = (r: any) => ['City', 'Town'].includes(r.local_type)
  const pick = exact.find(preferredType) || exact[0] || results.find(preferredType) || results[0]
  if (pick && typeof pick.latitude === 'number') {
    return { latitude: pick.latitude, longitude: pick.longitude, source: 'place', precision: 'approximate', matched: `${pick.name_1} (${pick.local_type})` }
  }
  return null
}

/** Extract a full postcode from arbitrary text, if present. */
export function extractPostcode(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(FULL_POSTCODE)
  return m ? m[0].toUpperCase() : null
}

/**
 * Resolve the best coordinates for a job from its text location fields, trying in
 * order of precision:
 *   1. full_location.postcode (exact)
 *   2. a postcode found inside location/area text (exact)
 *   3. an outcode in area or location (approximate centroid)
 *   4. the town/place name in location (approximate centroid)
 *   5. null — we could not geocode it; caller must NOT hide the job for this.
 */
export async function geocodeJobLocation(job: {
  location?: string | null
  area?: string | null
  full_location?: any
}): Promise<GeoResult | null> {
  const flPostcode = job.full_location && typeof job.full_location === 'object'
    ? extractPostcode(String(job.full_location.postcode || ''))
    : null
  if (flPostcode) {
    const r = await geocodePostcode(flPostcode)
    if (r) return r
  }

  const textPostcode = extractPostcode(job.location) || extractPostcode(job.area)
  if (textPostcode) {
    const r = await geocodePostcode(textPostcode)
    if (r) return r
  }

  for (const candidate of [job.area, job.location]) {
    const c = (candidate || '').trim()
    if (c && OUTCODE_ONLY.test(c)) {
      const r = await geocodeOutcode(c)
      if (r) return r
    }
  }

  if (job.location && job.location.trim()) {
    const r = await geocodePlace(job.location)
    if (r) return r
  }

  return null
}

/** Candidate home coords from their postcode (exact). */
export async function geocodeCandidatePostcode(postcode: string): Promise<GeoResult | null> {
  const pc = extractPostcode(postcode) || (postcode || '').trim()
  return pc ? geocodePostcode(pc) : null
}

/** Great-circle distance in miles between two coordinates (Haversine). */
export function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 3958.7613 // Earth radius in miles
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
