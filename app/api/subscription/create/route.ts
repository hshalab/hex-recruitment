import { NextRequest, NextResponse } from 'next/server'

// Creates a placeholder employer subscription row. The actual Stripe
// subscription is created by /api/stripe/confirm-trial after the employer
// saves their card on the payment page. This route is still called by
// the email-registration flow to bootstrap the row before payment.

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('employer_subscriptions')
      .upsert(
        {
          user_id: userId,
          subscription_status: 'inactive',
          subscription_tier: 'standard',
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
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
