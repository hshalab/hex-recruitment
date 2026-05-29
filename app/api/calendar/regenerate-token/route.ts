import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const token = crypto.randomUUID()

    // UPSERT (not UPDATE): same defensive shape as the Google OAuth
    // callback — UPDATE silently returns zero rows when the employer
    // is missing an employer_profiles row (which can happen for email/
    // password signups; see lib/authCallback.ts). With UPSERT, the row
    // is created on the fly if missing and the ics_feed_token is set
    // either way. Idempotent for returning users — running again just
    // overwrites ics_feed_token, which is exactly the intent.
    const { error } = await supabaseAdmin
      .from('employer_profiles')
      .upsert(
        { user_id: userId, ics_feed_token: token },
        { onConflict: 'user_id' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
    const feedUrl = `${siteUrl}/api/calendar/feed/${token}.ics`
    return NextResponse.json({ feedUrl, token })
  } catch (err: any) {
    console.error('[calendar/regenerate-token] error', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
