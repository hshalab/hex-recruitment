import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { geocodeJobLocation, geocodeCandidatePostcode } from '@/lib/geocode'

// Server-side geocoding endpoint (Phase 2). Writes coordinates so the util's
// postcodes.io calls happen server-side, not from the browser.
//   POST { target: 'job', jobId }  → geocode a job's text location, store lat/lng
//                                     + geo_precision (owner or CRON_SECRET only)
//   POST { target: 'candidate' }   → geocode the authed candidate's postcode
//
// Coordinates may be NULL (county/region/bare-London/un-geocodable). That is a
// valid outcome — downstream filtering must never hide a job for having null
// coords.

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

    const body = await request.json().catch(() => ({}))
    const target = body?.target

    if (target === 'candidate') {
      if (!userId) return NextResponse.json({ error: 'candidate target requires a user session' }, { status: 400 })
      const { data: prof } = await admin
        .from('candidate_profiles')
        .select('postcode')
        .eq('user_id', userId)
        .maybeSingle()
      const geo = prof?.postcode ? await geocodeCandidatePostcode(prof.postcode) : null
      await admin
        .from('candidate_profiles')
        .update({ latitude: geo?.latitude ?? null, longitude: geo?.longitude ?? null })
        .eq('user_id', userId)
      return NextResponse.json({ geocoded: !!geo, latitude: geo?.latitude ?? null, longitude: geo?.longitude ?? null })
    }

    if (target === 'job') {
      const jobId = body?.jobId
      if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
      const { data: job, error: jobErr } = await admin
        .from('jobs')
        .select('id, employer_id, location, area, full_location')
        .eq('id', jobId)
        .single()
      if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      if (!isCron && job.employer_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const geo = await geocodeJobLocation(job)
      await admin
        .from('jobs')
        .update({ latitude: geo?.latitude ?? null, longitude: geo?.longitude ?? null, geo_precision: geo?.precision ?? null })
        .eq('id', jobId)
      return NextResponse.json({ geocoded: !!geo, precision: geo?.precision ?? null })
    }

    return NextResponse.json({ error: "target must be 'job' or 'candidate'" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
