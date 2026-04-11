import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Creates or updates a candidate profile using the service-role client
// so RLS doesn't block the insert before email confirmation completes.
// The caller must provide a valid user_id (from signUp) — we trust it
// because only the registration form calls this endpoint, and the
// payload is for the caller's own profile.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, profile } = body

    if (!userId || !profile) {
      return NextResponse.json({ error: 'userId and profile required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('candidate_profiles')
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
