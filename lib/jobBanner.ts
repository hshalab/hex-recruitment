// Banner cascade for the candidate-facing job cards + detail view, so a job is
// NEVER bannerless. Order: the job/employer banner if set (already merged into
// Job.companyBanner by supabaseRowToJob) → else a sector-matched stock image
// (stable per job, so each company reads as its own identity) → else null,
// which the UI renders as the branded navy fallback.
//
// The stock pools mirror app/post-job's defaultImages set (hospitality-led,
// since Thrive is a hospitality recruitment platform) plus a few sector buckets.

const HOSPITALITY = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=825&fit=crop', // restaurant interior
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200&h=825&fit=crop',   // chefs plating
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=825&fit=crop', // dining room
  'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=1200&h=825&fit=crop', // coffee / cafe
  'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=1200&h=825&fit=crop', // kitchen plating
]
const RETAIL = [
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&h=825&fit=crop',
  'https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=1200&h=825&fit=crop',
]
const OFFICE = [
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&h=825&fit=crop',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&h=825&fit=crop',
]
const WAREHOUSE = [
  'https://images.unsplash.com/photo-1553413077-190dd305871c?w=1200&h=825&fit=crop',
  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&h=825&fit=crop',
]

const POOLS: Record<string, string[]> = {
  hospitality: HOSPITALITY,
  retail: RETAIL,
  office: OFFICE,
  admin: OFFICE,
  warehouse: WAREHOUSE,
  logistics: WAREHOUSE,
}
const GENERAL = HOSPITALITY

/** Stable small hash so the same job always maps to the same stock image. */
function hashKey(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function poolFor(category?: string | null): string[] {
  const c = (category || '').toLowerCase()
  for (const key of Object.keys(POOLS)) {
    if (c.includes(key)) return POOLS[key]
  }
  return GENERAL
}

export interface BannerSource {
  id?: string
  companyBanner?: string | null
  company?: string | null
  category?: string | null
}

/**
 * Resolve the banner image URL for a job, or null if even the stock cascade
 * shouldn't apply (callers render the navy fallback for null). In practice this
 * only returns null when there's no key at all to hash, which shouldn't happen.
 */
export function resolveJobBanner(job: BannerSource): string | null {
  if (job.companyBanner && job.companyBanner.trim()) return job.companyBanner
  const pool = poolFor(job.category)
  if (!pool.length) return null
  const key = job.id || job.company || 'thrive'
  return pool[hashKey(key) % pool.length]
}

/** A single deterministic stock banner — used at post-time to default an
 *  employer's job banner when they skip the upload, so the saved record carries
 *  an image too (display still falls back via resolveJobBanner regardless). */
export function defaultStockBanner(seed: string, category?: string | null): string {
  const pool = poolFor(category)
  return pool[hashKey(seed || 'thrive') % pool.length]
}
