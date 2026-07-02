import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getCurrentEmployerOwnerId } from '@/lib/employer'

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
        // Write through to the Next 14 cookie store. @supabase/ssr calls
        // set/remove when it silently rotates a near-expiry access_token
        // server-side; if we no-op these, the rotated tokens never persist,
        // the next request keeps presenting the stale cookies, and a
        // returning user gets stuck in the same client↔server disagreement
        // loop that fix-password-login-cookies is closing on the password
        // path.
        // cookies().set() in a server component is technically a Next 14
        // edge case (the docs note it's only fully supported in route
        // handlers + server actions). Wrapping in try/catch keeps the
        // read path working when the runtime forbids the write — we still
        // get a correct getUser() result, we just can't persist the
        // rotation that pass.
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }) } catch {}
        },
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
  //
  // Multi-user: resolve the OWNER of the employer this user is active in and
  // read THAT profile's approval_status — so an invited team member inherits
  // the employer's approval and reaches the shell. For an owner the helper
  // returns their own id (unchanged); null (RPC miss / no membership yet, e.g.
  // a brand-new owner before their member row exists) falls back to user.id so
  // owner behaviour is never regressed.
  const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? user.id
  const { data: profile, error: profileErr } = await supabase
    .from('employer_profiles')
    .select('approval_status')
    .eq('user_id', ownerId)
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
