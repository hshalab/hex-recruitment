import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Public (token-gated) lookup for the /invite/accept page so a logged-out
 * invitee sees which company invited them and to which email — before they can
 * read the row under RLS. The token IS the secret; we return only display data.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ status: 'invalid' })

  const { data: member } = await supabaseAdmin
    .from('employer_members')
    .select('employer_id, invited_email, status, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!member) return NextResponse.json({ status: 'invalid' })
  if (member.status !== 'invited') return NextResponse.json({ status: 'used' })
  if (member.invite_expires_at && new Date(member.invite_expires_at) < new Date()) {
    return NextResponse.json({ status: 'expired' })
  }

  const { data: prof } = await supabaseAdmin
    .from('employer_profiles')
    .select('company_name')
    .eq('id', member.employer_id)
    .maybeSingle()

  return NextResponse.json({
    status: 'valid',
    company: prof?.company_name || 'a team',
    email: member.invited_email || '',
  })
}
