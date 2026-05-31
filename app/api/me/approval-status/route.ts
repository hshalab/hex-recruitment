import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Cookie-authenticated readout of the caller's own employer_profiles
// approval_status. Used by the /account-under-review client polling to
// detect when Paul approves the signup, without falling back to the
// browser supabase client (whose localStorage isn't reliably populated
// after the /auth/confirm server redirect — that's bug B2).
//
// Returns:
//   { status: 'pending' | 'rejected' | 'waitlisted' | 'approved' | 'legacy_or_missing' | null }
//
// 'legacy_or_missing' = there's no employer_profiles row at all. The
// under-review page does NOT auto-redirect on that state (B2 fix);
// only an explicit 'approved' triggers the bounce-to-dashboard.

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(_name: string, _value: string, _options: CookieOptions) {},
        remove(_name: string, _options: CookieOptions) {},
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ status: null, error: 'no_session' }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await supabase
    .from('employer_profiles')
    .select('approval_status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileErr) {
    // RLS error or transient — surface, don't silently treat as approved.
    return NextResponse.json({ status: null, error: profileErr.message }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json({ status: 'legacy_or_missing' })
  }

  return NextResponse.json({ status: profile.approval_status ?? 'legacy_or_missing' })
}
