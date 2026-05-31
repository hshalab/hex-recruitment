import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'

// Live counter — must not be statically prerendered, or the build-time
// value would be served forever. Without this flag, Next.js attempts
// prerender, the createClient call runs against an env-less build env,
// and the build dies. Force-dynamic makes the route always SSR fresh.
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Counts rows that ACTUALLY consume a founding spot via the
// count_founding_spots_claimed() Postgres function, which JOINs
// auth.users (for email_confirmed_at) with employer_subscriptions
// (tier='free') and employer_profiles (approval_status). See
// supabase/migrations/20260531180100_count_founding_spots_claimed.sql.
// Doing the JOIN server-side avoids N+1 RTT and keeps RLS on
// auth.users intact (function is SECURITY DEFINER).
export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data, error } = await supabase.rpc('count_founding_spots_claimed')
  const claimed = error ? 0 : (typeof data === 'number' ? data : 0)
  const spotsRemaining = Math.max(0, EMPLOYER_COHORT_CAP - claimed)

  return NextResponse.json({ spotsRemaining, isFull: spotsRemaining === 0 })
}
