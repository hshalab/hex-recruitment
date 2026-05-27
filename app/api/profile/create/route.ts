import { NextRequest, NextResponse } from 'next/server'

// Creates or updates a profile using the service-role client so RLS
// doesn't block the insert before email confirmation completes.
// Supports both candidate_profiles and employer_profiles via the
// optional `table` field (defaults to candidate_profiles).

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, profile, table } = body

    if (!userId || !profile) {
      return NextResponse.json({ error: 'userId and profile required' }, { status: 400 })
    }

    const tableName = table === 'employer_profiles' ? 'employer_profiles' : 'candidate_profiles'

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .upsert(
        { user_id: userId, ...profile },
        { onConflict: 'user_id' }
      )
      .select('user_id')

    if (error) {
      console.error('[profile/create] upsert failed', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, userId: data?.[0]?.user_id })
  } catch (err: any) {
    console.error('[profile/create] error', err)
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
