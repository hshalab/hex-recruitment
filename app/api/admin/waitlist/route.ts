import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'

// Admin queries live data — must not be statically prerendered.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { authorized } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const [waitlistResult, spotsResult] = await Promise.all([
    supabase
      .from('waitlist')
      .select('id, name, company, email, type, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('employer_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_tier', 'free'),
  ])

  if (waitlistResult.error) {
    return NextResponse.json({ error: 'Failed to fetch waitlist' }, { status: 500 })
  }

  const freeSpotsClaimed = spotsResult.count ?? 0

  return NextResponse.json({
    entries: waitlistResult.data || [],
    freeSpotsClaimed,
    spotsRemaining: Math.max(0, EMPLOYER_COHORT_CAP - freeSpotsClaimed),
  })
}
