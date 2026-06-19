// Banner resolution for the candidate-facing job cards + detail view.
//
// There are exactly TWO card states now:
//   1. an employer-uploaded banner (Job.companyBanner, merged from the
//      company_banner_url column by supabaseRowToJob), or
//   2. the branded Thrive fallback (rendered by <BrandedJobFallback>).
//
// We deliberately do NOT guess a stock sector image any more — a food photo on
// an insurance role is both wrong and a little dishonest. resolveJobBanner now
// only ever returns a real uploaded banner or null; null = render the branded
// fallback. The per-company variation for that fallback comes from
// fallbackVariant() so a screen full of fallbacks isn't monotonous, while
// staying stable for a given employer.

export interface BannerSource {
  id?: string
  companyBanner?: string | null
  company?: string | null
  category?: string | null
}

/** Stable small hash so a given seed always maps to the same variation. */
function hashKey(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Resolve the banner image URL for a job: the employer-uploaded banner if set,
 * otherwise null. null means the caller renders the branded Thrive fallback —
 * there is no stock-image fallback by design.
 */
export function resolveJobBanner(job: BannerSource): string | null {
  if (job.companyBanner && job.companyBanner.trim()) return job.companyBanner
  return null
}

/**
 * Deterministic per-company variation for the branded fallback so a page of
 * fallbacks reads as varied but is stable for a given employer. Returns a
 * gradient angle and a horizontal position for the subtle yellow glow.
 */
export function fallbackVariant(seed: string): { angle: number; glowX: number } {
  const h = hashKey(seed || 'thrive')
  return {
    angle: 118 + (h % 64),          // 118–181deg
    glowX: 12 + ((h >> 4) % 76),    // 12–87%
  }
}
