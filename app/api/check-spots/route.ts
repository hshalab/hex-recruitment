import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const FREE_CAP = 1000

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { count, error } = await supabase
    .from('employer_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_tier', 'free')

  const claimed = error ? 0 : (count ?? 0)
  const spotsRemaining = Math.max(0, FREE_CAP - claimed)

  return NextResponse.json({ spotsRemaining, isFull: spotsRemaining === 0 })
}
