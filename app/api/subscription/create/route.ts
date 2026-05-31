import { NextRequest, NextResponse } from 'next/server'

// LEGACY / DORMANT under FREE_FOUNDING_MODE.
//
// This route was originally the form-submit bootstrap site that wrote
// employer_subscriptions(tier='free', founding_period_ends_at) before
// email confirmation. Under the new founding-signup flow (signed up
// 2026-05-31), the founding row is provisioned at confirmation time by
// lib/foundingSignup.provisionFoundingEmployer, with classification
// (business / freemail / disposable) decided server-side. Form submit
// no longer calls this endpoint, and no other caller exists in the app.
//
// Left writable, the endpoint would be an entitlement-leak path
// (audit-identical to the now-410'd /api/activate-trial): any
// authenticated client could POST { userId } and mint a tier='free' +
// founding_period_ends_at row, bypassing the disposable-domain reject,
// the freemail-manual-approval gate, and the 100-spot cap. So we 410
// it under FREE_FOUNDING_MODE — code preserved so a future Stripe
// revival can drop the guard rather than re-implement the endpoint.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { FREE_FOUNDING_MODE } from '@/lib/constants/cohort'
import { calculateFoundingPeriodEnd } from '@/lib/foundingEntitlement'

export async function POST(req: NextRequest) {
  if (FREE_FOUNDING_MODE) {
    return NextResponse.json(
      { error: 'This endpoint is disabled under free-founding-mode. Founding rows are provisioned at email confirmation via /auth/confirm.' },
      { status: 410 },
    )
  }

  try {
    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const row = {
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
