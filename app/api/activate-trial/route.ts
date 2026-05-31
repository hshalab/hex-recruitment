import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { FREE_FOUNDING_MODE } from '@/lib/constants/cohort'

export async function POST(req: NextRequest) {
  // Under free-founding-mode this endpoint is the entitlement-leak path
  // the audit flagged: a direct POST would mint a tier='standard',
  // status='trialing' row that opens the gate without going through the
  // domain-classification / approval flow. Neuter it with a 410 Gone so
  // it's auditable and reversible (delete this guard if Stripe is revived).
  if (FREE_FOUNDING_MODE) {
    return NextResponse.json(
      { error: 'This endpoint is disabled under free-founding-mode. Use /register/employer-free.' },
      { status: 410 },
    )
  }

  try {
    // Auth check: verify the caller is authenticated
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (token) {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { userId, trialEndsAt, companyName, contactName, email } = await req.json()

    if (!userId || !trialEndsAt) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, trialEndsAt' },
        { status: 400 }
      )
    }

    // Upsert employer_subscriptions row with trialing status
    const { error: subError } = await supabaseAdmin
      .from('employer_subscriptions')
      .upsert({
        user_id: userId,
        subscription_status: 'trialing',
        subscription_tier: 'standard',
        trial_ends_at: trialEndsAt,
      }, {
        onConflict: 'user_id',
      })

    if (subError) {
      console.error('Error upserting employer_subscriptions:', subError)
      return NextResponse.json({ error: subError.message }, { status: 500 })
    }

    // Upsert employer_profiles row
    if (companyName || contactName || email) {
      await supabaseAdmin
        .from('employer_profiles')
        .upsert({
          user_id: userId,
          company_name: companyName || '',
          contact_name: contactName || '',
          email: email || '',
        }, {
          onConflict: 'user_id',
        })
      // Ignore profile upsert errors — subscription row is the critical one
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error activating trial:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to activate trial' },
      { status: 500 }
    )
  }
}
