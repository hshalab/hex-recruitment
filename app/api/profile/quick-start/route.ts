import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// The three-field welcome step's save path: job title and job sector.
//
// Desired areas are NOT handled here — they go through
// /api/profile/preferred-areas, which is already the single owned writer of
// that column. One field, one owner; this route deliberately doesn't duplicate
// it just to save the welcome screen a second request.
//
//   POST { jobTitle?, jobSector? } → writes job_title / job_sector
//
// Every field is optional: the step is skippable by design, and a partial
// answer is worth more than an abandoned form.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const MAX_LEN = 120

export async function POST(request: NextRequest) {
  const admin = createClient(supabaseUrl, supabaseServiceKey)

  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const update: Record<string, string | null> = {}

  if (body.jobTitle !== undefined) {
    if (typeof body.jobTitle !== 'string') {
      return NextResponse.json({ error: 'jobTitle must be a string' }, { status: 400 })
    }
    const v = body.jobTitle.trim().slice(0, MAX_LEN)
    update.job_title = v || null
  }

  if (body.jobSector !== undefined) {
    if (typeof body.jobSector !== 'string') {
      return NextResponse.json({ error: 'jobSector must be a string' }, { status: 400 })
    }
    const v = body.jobSector.trim().slice(0, MAX_LEN)
    update.job_sector = v || null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('candidate_profiles')
    .update(update)
    .eq('user_id', user.id)
    .select('job_title, job_sector')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })

  return NextResponse.json({ jobTitle: data.job_title, jobSector: data.job_sector })
}
