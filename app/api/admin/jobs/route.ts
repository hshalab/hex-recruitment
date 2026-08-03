import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'
import { resolveAndStoreJobArea } from '@/lib/jobAreaSync'

const PAGE_SIZE = 20

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId')
  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const sector = searchParams.get('sector') || ''
  const sort = searchParams.get('sort') || 'posted_at'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const db = createAdminClient(token)

  // Single job detail
  if (jobId) {
    try {
      const { data: job } = await db
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

      // Get applications for this job
      const { data: applications } = await db
        .from('job_applications')
        .select('id, candidate_id, status, applied_at, cover_letter')
        .eq('job_id', jobId)
        .order('applied_at', { ascending: false })
        .limit(50)

      // Get candidate names for applications
      const candidateIds = (applications || []).map(a => a.candidate_id).filter(Boolean)
      let candidateMap: Record<string, string> = {}
      if (candidateIds.length > 0) {
        const { data: candidates } = await db
          .from('candidate_profiles')
          .select('user_id, full_name, email')
          .in('user_id', candidateIds)
        ;(candidates || []).forEach(c => {
          candidateMap[c.user_id] = c.full_name || c.email || 'Unknown'
        })
      }

      const enrichedApps = (applications || []).map(a => ({
        ...a,
        candidate_name: candidateMap[a.candidate_id] || 'Unknown',
      }))

      return NextResponse.json({ job, applications: enrichedApps })
    } catch (error: any) {
      console.error('[Admin Job Detail]', error.message)
      return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 })
    }
  }

  // Job list
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  try {
    // READS THE COLUMNS THE APP ACTUALLY MAINTAINS.
    //
    // This selected application_count and view_count. NOTHING WRITES EITHER.
    // Across 284 jobs both are zero on every real row, so the admin console has
    // shown 0 views and 0 applications for every job since it was built — while
    // the employer dashboard, reading jobs.views off the same rows, showed the
    // true figure. Two consoles, two columns, one of them dead.
    //
    // jobs.views is the live one: 64 jobs carry a value summing to 122, against
    // 123 rows in job_views. Applications have no counter at all, so they are
    // counted from job_applications directly.
    //
    // The dead columns are left in place — dropping them is a migration and can
    // ride with the next one. This just stops reading them.
    let query = db
      .from('jobs')
      .select('id, title, company, category, location, status, posted_at, expires_at, views, urgent, employer_id', { count: 'exact' })

    if (search) {
      query = query.or(`title.ilike.%${search}%,company.ilike.%${search}%`)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (sector) {
      query = query.eq('category', sector)
    }

    // Applications have no maintained counter, so sorting by them cannot be
    // done in the database without an aggregate the client can't express. The
    // count map is small — one row per application that exists, 33 today — so
    // it is built up front and used for both the display value and the sort.
    const { data: appRows } = await db.from('job_applications').select('job_id')
    const appCounts = new Map<string, number>()
    for (const r of (appRows || [])) appCounts.set(r.job_id, (appCounts.get(r.job_id) || 0) + 1)

    const sortField = sort === 'title' ? 'title' : sort === 'company' ? 'company' : sort === 'view_count' || sort === 'views' ? 'views' : 'posted_at'

    let data: any[] | null = null
    let count: number | null = null

    if (sort === 'application_count') {
      // Sorting by a computed value means the whole filtered set has to be
      // ordered before it can be paged — sorting one page would only reorder
      // the twenty rows that happened to arrive. Fine at 284 jobs; revisit if
      // this table ever reaches five figures.
      const { data: all, error: allErr, count: allCount } = await query.order('posted_at', { ascending: false })
      if (allErr) throw allErr
      const sorted = (all || []).sort((a, b) => {
        const d = (appCounts.get(a.id) || 0) - (appCounts.get(b.id) || 0)
        return dir === 'asc' ? d : -d
      })
      data = sorted.slice(from, to + 1)
      count = allCount ?? sorted.length
    } else {
      const res = await query.order(sortField, { ascending: dir === 'asc' }).range(from, to)
      if (res.error) throw res.error
      data = res.data
      count = res.count
    }

    // Keep the response shape the table already expects, so the column keys and
    // the sort parameters do not have to change in two places.
    data = (data || []).map(j => ({
      ...j,
      view_count: j.views || 0,
      application_count: appCounts.get(j.id) || 0,
    }))

    // Get distinct sectors for filter dropdown
    const { data: sectors } = await db.from('jobs').select('category').not('category', 'is', null)
    const uniqueSectors = Array.from(new Set((sectors || []).map(s => s.category).filter(Boolean)))

    // Quick stats
    const [activeCount, filledCount, archivedCount] = await Promise.all([
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active').then(r => r.count || 0),
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'filled').then(r => r.count || 0),
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'archived').then(r => r.count || 0),
    ])

    return NextResponse.json({
      jobs: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      sectors: uniqueSectors,
      stats: { active: activeCount, filled: filledCount, archived: archivedCount },
    })
  } catch (error: any) {
    console.error('[Admin Jobs]', error.message)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { action, jobId, jobIds } = body
  const db = createAdminClient(token)

  try {
    switch (action) {
      case 'remove': {
        const { error } = await db.from('jobs').update({ status: 'archived' }).eq('id', jobId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Job removed' })
      }
      case 'feature': {
        const { data: job } = await db.from('jobs').select('urgent').eq('id', jobId).single()
        const { error } = await db.from('jobs').update({ urgent: !job?.urgent }).eq('id', jobId)
        if (error) throw error
        return NextResponse.json({ success: true, message: job?.urgent ? 'Job unfeatured' : 'Job featured' })
      }
      case 'expire': {
        const { error } = await db.from('jobs').update({ status: 'filled' }).eq('id', jobId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Job marked as filled' })
      }
      case 'reactivate': {
        const { error } = await db.from('jobs').update({ status: 'active' }).eq('id', jobId)
        if (error) throw error
        // A job that was filled before preferred-areas shipped (or whose
        // location has since become resolvable) comes back with no area, which
        // would make it un-filterable. Resolve it now it's live again.
        // Non-blocking: the reactivation itself has already succeeded, and a
        // job with no area is shown to everyone rather than hidden.
        const area = await resolveAndStoreJobArea(db, jobId).catch(() => null)
        if (!area?.ok) {
          console.warn('[admin/jobs] area resolve failed on reactivate', jobId, area?.reason)
        }
        return NextResponse.json({ success: true, message: 'Job reactivated' })
      }
      case 'bulk_archive': {
        const ids = jobIds || []
        const { error } = await db.from('jobs').update({ status: 'archived' }).in('id', ids)
        if (error) throw error
        return NextResponse.json({ success: true, message: `${ids.length} jobs archived` })
      }
      case 'bulk_feature': {
        const ids = jobIds || []
        const { error } = await db.from('jobs').update({ urgent: true }).in('id', ids)
        if (error) throw error
        return NextResponse.json({ success: true, message: `${ids.length} jobs featured` })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Admin Jobs Action]', error.message)
    return NextResponse.json({ error: error.message || 'Action failed' }, { status: 500 })
  }
}
