import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import Header from '@/components/Header'
import UnderReviewClient from './UnderReviewClient'

// Server component: reads approval_status from the cookie-based session
// via @supabase/ssr. This is the fix for B2 — the previous client
// component read via browser supabase (localStorage), which wasn't
// populated immediately after the /auth/confirm server redirect, so
// the page received approval_status===null and fell through its
// "approved or null → bounce to dashboard" branch, sending a pending
// user straight into the dashboard.
//
// Crucially: only an EXPLICIT 'approved' triggers the bounce-to-dashboard.
// A missing row, an unreadable row, or a NULL approval_status (legacy
// pre-pivot row) all KEEP the user on the under-review page (the
// /employer layout's safe default sends those cases here too — no
// redirect loop because nothing here pushes back).

export const dynamic = 'force-dynamic'

export default async function AccountUnderReviewPage() {
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
    redirect('/login/employer')
  }

  // Multi-user: an invited member has no profile of their own — resolve the
  // owner of the employer they belong to so an approved employer bounces the
  // member to the dashboard too. Owner → own id (unchanged); null → user.id.
  const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? user.id
  const { data: profile } = await supabase
    .from('employer_profiles')
    .select('approval_status')
    .eq('user_id', ownerId)
    .maybeSingle()

  // ONLY explicit 'approved' bounces to the dashboard. Pre-pivot
  // legacy rows (NULL approval_status) used to also bounce here, but
  // under the new flow every confirmed employer has an explicit status,
  // so we keep them on under-review for safety. The /employer layout
  // server-guard allows NULL-row legacy users in elsewhere.
  if (profile?.approval_status === 'approved') {
    redirect('/employer/dashboard')
  }

  const rawStatus = profile?.approval_status as string | null | undefined
  const status: 'pending' | 'rejected' | 'waitlisted' | 'approved' | 'legacy_or_missing' | null =
    rawStatus === 'pending' || rawStatus === 'rejected' || rawStatus === 'waitlisted' || rawStatus === 'approved'
      ? rawStatus
      : profile
        ? null // row present, approval_status NULL (pre-pivot legacy)
        : 'legacy_or_missing'
  const email = user.email ?? ''

  return (
    <main>
      <Header />
      <UnderReviewClient initialStatus={status} email={email} />
    </main>
  )
}
