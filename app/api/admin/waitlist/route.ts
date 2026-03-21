import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

export async function GET(req: Request) {
  const { authorized } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('waitlist')
    .select('id, name, company, email, type, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch waitlist' }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
