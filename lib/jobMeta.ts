// Server-side single-job fetch for metadata / OG image generation on the
// /job/[id] route. Deliberately lightweight: a direct REST read with the anon
// key (public, active jobs only) rather than pulling in the supabase-js client,
// so it stays cheap to run inside generateMetadata and the OG image route.

export interface JobMeta {
  title: string
  company: string
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryType: string | null
}

export async function getJobForMeta(id: string): Promise<JobMeta | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return null
  // Basic UUID guard so we never build a weird REST query from junk input.
  if (!/^[0-9a-f-]{16,}$/i.test(id)) return null
  try {
    const url =
      `${base}/rest/v1/jobs?select=title,company,location,salary_min,salary_max,salary_type` +
      `&status=eq.active&id=eq.${encodeURIComponent(id)}&limit=1`
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      // Revalidate occasionally — job copy rarely changes and previews are cached
      // by the social platforms anyway.
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row) return null
    return {
      title: row.title,
      company: row.company,
      location: row.location ?? null,
      salaryMin: row.salary_min != null ? Number(row.salary_min) : null,
      salaryMax: row.salary_max != null ? Number(row.salary_max) : null,
      salaryType: row.salary_type ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Short salary string, e.g. "£38,000–£45,000/yr" or "£14–£18/hr". Collapses to
 * a single figure ("£70,000/yr") when min == max or max is absent. null if no
 * salary at all.
 */
export function formatSalaryShort(job: JobMeta): string | null {
  const lo = job.salaryMin
  if (lo == null) return null
  const hi = job.salaryMax
  const single = hi == null || hi === lo
  if (job.salaryType === 'annual') {
    return single ? `£${lo.toLocaleString()}/yr` : `£${lo.toLocaleString()}–£${hi.toLocaleString()}/yr`
  }
  return single ? `£${lo}/hr` : `£${lo}–£${hi}/hr`
}
