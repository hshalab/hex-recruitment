import { NextResponse } from 'next/server'
import { REGIONS, COUNTIES, countiesOfRegion } from '@/lib/areas'
import { getJobAreaCounts } from '@/lib/jobAreaCounts'

// Area taxonomy for the candidate's preferred-areas picker, annotated with LIVE
// job counts so the UI can lead with areas that actually have work in them.
//
// Counts are DERIVED from the resolved job areas (jobs.area_region /
// area_county) — nothing is hardcoded, so as jobs spread into new regions the
// picker follows automatically.
//
//   GET → { regions: [{ id, name, jobCount, hasJobs, counties: [...] }],
//           totalJobs, resolvedJobs }
// Public: aggregate counts only, no job or employer detail.

export async function GET() {
  try {
    const { regions: regionCounts, counties: countyCounts, totalJobs, resolvedJobs } =
      await getJobAreaCounts()

    // Full taxonomy, every region present. hasJobs drives whether the picker
    // surfaces it prominently or tucks it under "other areas".
    const regions = REGIONS.map(r => {
      const counties = countiesOfRegion(r.id)
        .map(c => ({ ...c, jobCount: countyCounts.get(c.id) || 0 }))
        .sort((a, b) => b.jobCount - a.jobCount || a.name.localeCompare(b.name))
      const jobCount = regionCounts.get(r.id) || 0
      return { id: r.id, name: r.name, jobCount, hasJobs: jobCount > 0, counties }
    }).sort((a, b) => b.jobCount - a.jobCount || a.name.localeCompare(b.name))

    return NextResponse.json(
      { regions, totalJobs, resolvedJobs, totalCounties: COUNTIES.length },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to load areas' }, { status: 500 })
  }
}
