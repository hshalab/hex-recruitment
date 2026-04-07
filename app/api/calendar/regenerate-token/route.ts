import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const token = crypto.randomUUID()

    const { error } = await supabaseAdmin
      .from('employer_profiles')
      .update({ ics_feed_token: token })
      .eq('user_id', userId)

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
