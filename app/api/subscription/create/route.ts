import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Creates the free-launch employer subscription row using the
// service-role client so RLS doesn't block the insert before email
// confirmation completes. Same pattern as /api/profile/create.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, trialEndsAt } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('employer_subscriptions')
      .upsert(
        {
          user_id: userId,
          subscription_status: 'active',
          subscription_tier: 'free',
          trial_ends_at: trialEndsAt || new Date(Date.now() + 182 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'user_id' }
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
