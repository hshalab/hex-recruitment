import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Live counter — must not be statically prerendered. See
// /api/check-spots for the same rationale.
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { count, error } = await supabase
    .from('employer_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_tier', 'free')

  const employerCount = error ? 0 : (count ?? 0)

  return NextResponse.json({ employerCount }, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate' },
  })
}
