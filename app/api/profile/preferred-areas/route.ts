import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parsePreferredAreas,
  regionToken,
  countyToken,
  describePreferredAreas,
} from '@/lib/areas'

// The one and only writer of candidate_profiles.preferred_areas.
//
// Deliberately a dedicated route rather than a field bolted onto a general
// profile save: the areas the candidate will work in drive which jobs they see
// and which digest emails they get, so the save path is owned, validated and
// auditable. Nothing about areas is stored in auth user_metadata.
//
//   GET  → { preferredAreas: string[], labels: string[] }
//   PUT  { areas: string[] } → normalised, validated, stored
//
// Tokens are canonicalised on write: whatever the client sends, only
// 'region:<id>' / 'county:<id>' values from the known taxonomy are persisted.
// An empty array is valid and means "no area filter" (the feature is opt-in).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const MAX_AREAS = 60 // whole taxonomy is ~55 entries; anything beyond is junk

async function authenticate(request: NextRequest) {
  const admin = createClient(supabaseUrl, supabaseServiceKey)
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { admin, userId: null as string | null }
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { admin, userId: null as string | null }
  return { admin, userId: user.id }
}

export async function GET(request: NextRequest) {
  const { admin, userId } = await authenticate(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await admin
    .from('candidate_profiles')
    .select('preferred_areas')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to load preferred areas' }, { status: 500 })
  if (!data) return NextResponse.json({ preferredAreas: [], labels: [], profile: false })

  const stored: string[] = data.preferred_areas || []
  return NextResponse.json({
    preferredAreas: stored,
    labels: describePreferredAreas(stored),
    profile: true,
  })
}

export async function PUT(request: NextRequest) {
  const { admin, userId } = await authenticate(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const incoming = body?.areas

  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: 'areas must be an array' }, { status: 400 })
  }
  if (incoming.length > MAX_AREAS) {
    return NextResponse.json({ error: `Too many areas (max ${MAX_AREAS})` }, { status: 400 })
  }
  if (incoming.some((a: unknown) => typeof a !== 'string')) {
    return NextResponse.json({ error: 'areas must be strings' }, { status: 400 })
  }

  // Canonicalise: unknown ids are dropped, prefixes normalised, order stable
  // (regions then counties), duplicates collapsed.
  const parsed = parsePreferredAreas(incoming as string[])
  const areas = [
    ...Array.from(parsed.regions).sort().map(regionToken),
    ...Array.from(parsed.counties).sort().map(countyToken),
  ]
  const dropped = (incoming as string[]).length - areas.length

  const { data, error } = await admin
    .from('candidate_profiles')
    .update({ preferred_areas: areas })
    .eq('user_id', userId)
    .select('user_id, preferred_areas')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Failed to save preferred areas' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
  }

  return NextResponse.json({
    preferredAreas: data.preferred_areas || [],
    labels: describePreferredAreas(data.preferred_areas || []),
    dropped,
  })
}
