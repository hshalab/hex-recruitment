import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Permissions } from '@/lib/teamPermissions'

/**
 * List the current employer's team members for the Team settings page. Gated on
 * manage_team (or owner). Resolves each row's display name/email — from auth for
 * active members (owner + accepted), from invited_email for pending invites.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const asUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: me } = await asUser
    .from('employer_members')
    .select('employer_id, role, permissions')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!me) return NextResponse.json({ error: 'You are not part of a team.' }, { status: 403 })
  const isOwner = me.role === 'owner'
  const canManageTeam = isOwner || (me.permissions as Permissions)?.manage_team === true
  if (!canManageTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: rows, error } = await asUser
    .from('employer_members')
    .select('id, user_id, invited_email, role, status, permissions, created_at, accepted_at')
    .eq('employer_id', me.employer_id)
    .order('role', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const members = await Promise.all((rows || []).map(async (r) => {
    let email = r.invited_email as string | null
    let name = ''
    if (r.user_id) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id as string)
        email = u.user?.email || email
        name = (u.user?.user_metadata?.full_name as string) || ''
      } catch { /* fall back to invited_email */ }
    }
    return {
      id: r.id,
      role: r.role,
      status: r.status,
      permissions: r.permissions as Permissions,
      email: email || '',
      name,
      isSelf: r.user_id === user.id,
    }
  }))

  return NextResponse.json({ members, viewerIsOwner: isOwner })
}
