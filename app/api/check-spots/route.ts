import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { count, error } = await supabase
    .from('employer_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_tier', 'free')

  const claimed = error ? 0 : (count ?? 0)
  const spotsRemaining = Math.max(0, EMPLOYER_COHORT_CAP - claimed)

  return NextResponse.json({ spotsRemaining, isFull: spotsRemaining === 0 })
}
