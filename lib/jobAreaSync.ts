import { resolveJobArea } from './areas'

// Server-side "make sure this job has an area" helper, shared by every path
// that creates or revives a listing:
//   • POST /api/jobs/resolve-area  (called by the post-job hook)
//   • admin "reactivate"           (filled → active)
//
// A job with no resolved area is never hidden from candidates, so failure here
// is degraded-but-safe: we log and move on rather than blocking the status
// change the user actually asked for.

export interface JobAreaSyncResult {
  ok: boolean
  region: string | null
  county: string | null
  method?: string
  reason?: string
}

/**
 * Resolve a job's text location to a canonical area and store it.
 * `db` is any Supabase client with write access to jobs (service role).
 */
export async function resolveAndStoreJobArea(
  db: { from: (table: string) => any },
  jobId: string
): Promise<JobAreaSyncResult> {
  const { data: job, error } = await db
    .from('jobs')
    .select('id, location, area')
    .eq('id', jobId)
    .single()

  if (error || !job) {
    return { ok: false, region: null, county: null, reason: 'job-not-found' }
  }

  const area = await resolveJobArea(job)

  const { error: updateError } = await db
    .from('jobs')
    .update({ area_region: area.region, area_county: area.county })
    .eq('id', jobId)

  if (updateError) {
    return { ok: false, region: area.region, county: area.county, reason: 'write-failed' }
  }

  return { ok: true, region: area.region, county: area.county, method: area.method }
}
