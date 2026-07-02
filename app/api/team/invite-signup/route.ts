import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Minimal STAFF signup for an invited teammate. Creates an employer-side auth
 * account for the token's invited email — no candidate profile, no company
 * creation, no employer_profiles row. The member JOINS the existing employer via
 * accept_employer_invite (called by the client right after it signs in).
 *
 * The invite token is the authorisation: an account can only be created for the
 * exact email the owner invited. Email confirmation is skipped (email_confirm)
 * because holding the token already proves control of the invitation.
 */
export async function POST(req: NextRequest) {
  let body: { token?: string; name?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid' }, { status: 400 }) }

  const token = (body.token || '').toString()
  const name = (body.name || '').toString().trim()
  const password = (body.password || '').toString()
  if (!token) return NextResponse.json({ error: 'This invitation link is invalid.' }, { status: 400 })
  if (name.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  // Validate the invite and read the (locked) invited email.
  const { data: member } = await supabaseAdmin
    .from('employer_members')
    .select('invited_email, status, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'This invitation link is invalid or has been revoked.' }, { status: 400 })
  if (member.status !== 'invited') return NextResponse.json({ error: 'This invitation has already been accepted.' }, { status: 409 })
  if (member.invite_expires_at && new Date(member.invite_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation has expired.' }, { status: 410 })
  }
  const email = (member.invited_email || '').toLowerCase()
  if (!email) return NextResponse.json({ error: 'This invitation link is invalid.' }, { status: 400 })

  // Create the employer-side account (confirmed). NOT a candidate account.
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'employer', full_name: name },
  })
  if (error) {
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return NextResponse.json({ error: 'account_exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message || 'Could not create your account.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, email })
}
