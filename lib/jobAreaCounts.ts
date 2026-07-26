import { createClient } from '@supabase/supabase-js'
import { regionToken, countyToken } from './areas'

// Live active-job counts per resolved area, cached briefly.
//
// Two callers, both of which want "where is there actually work?":
//   • /api/areas        — so the picker leads with areas that have jobs
//   • /api/areas/lookup — as a tie-break between same-significance places
//     ("Henley" matches two towns; the one in a county with 28 live jobs is
//     far likelier to be the one a jobseeker means)
//
// Nothing here is hardcoded — as jobs spread into new regions, both the picker
// order and the type-ahead ranking follow automatically.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface JobAreaCounts {
  regions: Map<string, number>
  counties: Map<string, number>
  totalJobs: number
  resolvedJobs: number
}

const CACHE_TTL_MS = 60_000
let cache: { at: number; value: JobAreaCounts } | null = null

export async function getJobAreaCounts(now = Date.now()): Promise<JobAreaCounts> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value

  const admin = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await admin
    .from('jobs')
    .select('area_region, area_county')
    .eq('status', 'active')

  if (error) {
    // Never fail a picker or a lookup over counts — they are a ranking hint,
    // not the answer. Serve a stale cache if we have one, else empty.
    if (cache) return cache.value
    return { regions: new Map(), counties: new Map(), totalJobs: 0, resolvedJobs: 0 }
  }

  const regions = new Map<string, number>()
  const counties = new Map<string, number>()
  let resolvedJobs = 0

  for (const row of data || []) {
    if (row.area_region) {
      regions.set(row.area_region, (regions.get(row.area_region) || 0) + 1)
      resolvedJobs++
    }
    if (row.area_county) {
      counties.set(row.area_county, (counties.get(row.area_county) || 0) + 1)
    }
  }

  const value: JobAreaCounts = { regions, counties, totalJobs: (data || []).length, resolvedJobs }
  cache = { at: now, value }
  return value
}

/**
 * Active-job count for a canonical area token, used as the type-ahead
 * tie-break. A boolean "has jobs?" is too blunt — Warwickshire has 1 job and
 * Oxfordshire 28, and that difference is exactly what tells Henley-in-Arden
 * apart from Henley-on-Thames.
 */
export function makeAreaJobCount(counts: JobAreaCounts) {
  return (token: string): number => {
    if (token.startsWith('county:')) return counts.counties.get(token.slice(7)) || 0
    if (token.startsWith('region:')) return counts.regions.get(token.slice(7)) || 0
    return 0
  }
}

export { regionToken, countyToken }
