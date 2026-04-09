import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

// Clears the employer's Google Calendar tokens. Uses the service-role
// client so RLS on employer_profiles can't block the disconnect.
// The caller must be authenticated — we read their session from the
// incoming auth header / cookie and only clear their own row.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const cookieHeader = req.headers.get('cookie') || ''

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader, cookie: cookieHeader } },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { error } = await supabaseAdmin
    .from('employer_profiles')
    .update({
      gcal_access_token: null,
      gcal_refresh_token: null,
      gcal_calendar_id: null,
    })
    .eq('user_id', user.id)

  if (error) {
    console.error('[gcal disconnect] update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
