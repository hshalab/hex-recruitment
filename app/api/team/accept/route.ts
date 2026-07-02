import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Accept a team invitation. Runs accept_employer_invite AS THE CALLER (the
 * SECURITY DEFINER RPC validates the token, expiry, invited-email match and the
 * one-active-employer rule). On success we also stamp user_metadata.role =
 * 'employer' via the admin API so the invitee can reach the employer area — the
 * client refreshes its session afterwards so the new role propagates.
 *
 * Returns the RPC's own {ok,error} shape so the accept page can show a precise
 * message (invalid / expired / already_used / email_mismatch / already_in_account).
 */
export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!bearer) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 })
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(bearer)
  if (authErr || !user) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 })

  let body: { token?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 }) }
  const inviteToken = (body.token || '').toString()
  if (!inviteToken) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

  const asUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data, error } = await asUser.rpc('accept_employer_invite', { p_token: inviteToken })
  if (error) return NextResponse.json({ ok: false, error: 'server_error' }, { status: 400 })

  const result = (data || {}) as { ok?: boolean; error?: string; employer_id?: string }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error || 'invalid' })

  // Grant employer-side access. Preserve existing metadata.
  try {
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata || {}), role: 'employer' },
    })
  } catch { /* non-fatal: membership is set; role can be re-synced on next login */ }

  return NextResponse.json({ ok: true, employer_id: result.employer_id })
}
