import { NextRequest, NextResponse } from 'next/server'

// Bootstraps an employer_subscriptions row at signup. Under
// FREE_FOUNDING_MODE the row is stamped as tier='free' with a 12-month
// founding_period_ends_at — no Stripe subscription is created, so
// subscription_status honestly stays 'inactive'. The gate sites consult
// founding-cohort signals via isEmployerEntitled().

import { supabaseAdmin } from '@/lib/supabase-admin'
import { FREE_FOUNDING_MODE } from '@/lib/constants/cohort'
import { calculateFoundingPeriodEnd } from '@/lib/foundingEntitlement'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const row = FREE_FOUNDING_MODE
      ? {
          user_id: userId,
          subscription_status: 'inactive',
          subscription_tier: 'free',
          founding_period_ends_at: calculateFoundingPeriodEnd().toISOString(),
        }
      : {
          user_id: userId,
          subscription_status: 'inactive',
          subscription_tier: 'standard',
        }

    const { data, error } = await supabaseAdmin
      .from('employer_subscriptions')
      .upsert(row, { onConflict: 'user_id', ignoreDuplicates: true })
      .select('user_id')

    if (error) {
      console.error('[subscription/create] upsert failed', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, userId: data?.[0]?.user_id })
  } catch (err: any) {
    console.error('[subscription/create] error', err)
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
