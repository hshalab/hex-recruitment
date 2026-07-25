import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveJobArea } from '@/lib/areas'

// Resolve a job's text location to a canonical area (region + county) and store
// it, for preferred-areas matching (Phase 2). Called on post and by the backfill.
//   POST { jobId }  → owner (or CRON_SECRET) only.
// A null region is a valid result (un-resolvable location); such jobs are never
// hidden by the area filter.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`

    const admin = createClient(supabaseUrl, supabaseServiceKey)

    let userId: string | null = null
    if (!isCron) {
      const token = authHeader?.replace('Bearer ', '')
      if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const { data: { user }, error } = await admin.auth.getUser(token)
      if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const { jobId } = await request.json().catch(() => ({}))
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

    const { data: job, error: jobErr } = await admin
      .from('jobs')
      .select('id, employer_id, location, area')
      .eq('id', jobId)
      .single()
    if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (!isCron && job.employer_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const area = await resolveJobArea(job)
    await admin
      .from('jobs')
      .update({ area_region: area.region, area_county: area.county })
      .eq('id', jobId)

    return NextResponse.json({ region: area.region, county: area.county, method: area.method })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
