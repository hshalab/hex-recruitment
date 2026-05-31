import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Server-side entitlement guard for the /employer/* area.
//
// Defence in depth on top of the per-page checks at /post-job, /messages,
// /candidates. The dashboard at /employer/dashboard used to admit any
// logged-in user whose user_metadata.role==='employer', skipping the
// approval_status check entirely — a real-prod gmail signup (pending
// approval, no founding row) reached the dashboard via that gap.
//
// This layout runs on the server before the page, reads the session
// from HTTP-only cookies via @supabase/ssr (reliable IMMEDIATELY after
// the /auth/confirm redirect — unlike the browser supabase client,
// whose localStorage hasn't been populated yet at that point), and
// makes the entitlement decision once for every employer route.
//
// Behaviour:
//   - not logged in              → /login/employer
//   - logged in, role != employer → /dashboard
//   - approval_status 'approved' OR NULL with row present (pre-pivot
//     legacy users) → allow
//   - approval_status 'pending'/'rejected'/'waitlisted' → /account-under-review
//   - no employer_profiles row (signup failed mid-flow, or hostile
//     manual /employer/dashboard hit) → /account-under-review (safe
//     default; if the user belongs in, the under-review page will
//     bounce them back to the dashboard server-side once approval is
//     visible).
//
// Do NOT cover /account-under-review with this layout (it lives at
// app/account-under-review, outside /employer/*) or the user would be
// caught in a redirect loop. Same for /login/employer.

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        // No-ops: this layout doesn't mutate session, just reads it.
        set(_name: string, _value: string, _options: CookieOptions) {},
        remove(_name: string, _options: CookieOptions) {},
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login/employer')
  }

  if (user.user_metadata?.role !== 'employer') {
    redirect('/dashboard')
  }

  // Read approval_status with the same cookie-based session (RLS sees
  // auth.uid()=user.id). Returning users from pre-pivot accounts may not
  // have an approval_status row at all — that's the "legacy" case
  // covered by the row-present-but-status-null branch below.
  const { data: profile, error: profileErr } = await supabase
    .from('employer_profiles')
    .select('approval_status')
    .eq('user_id', user.id)
    .maybeSingle()

  // No row at all → safe default. A signup that completed the auth flow
  // but failed to write a profile row should NOT silently get into the
  // dashboard. Bounce to under-review where the user can be inspected.
  if (profileErr || !profile) {
    redirect('/account-under-review')
  }

  const status = profile.approval_status as string | null

  if (status === 'pending' || status === 'rejected' || status === 'waitlisted') {
    redirect('/account-under-review')
  }

  // 'approved' or NULL (legacy/pre-pivot) → allow.
  return <>{children}</>
}
