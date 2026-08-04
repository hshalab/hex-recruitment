import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Record that a job advert was opened.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A CLIENT INSERT.
 *
 * The client used to insert into job_views directly. That works for a signed-in
 * user and CANNOT work for a signed-out one: job_views has a single INSERT
 * policy, "Anyone can insert job views", granted to `authenticated` only — so
 * RLS rejects anon — and `anon` has no EXECUTE on increment_job_views either.
 * A signed-out visitor failed twice, silently, which is why every shared link
 * has counted for nothing.
 *
 * The obvious fix is to grant anon both. That opens an unauthenticated public
 * write to a number the business makes decisions from, with no way to throttle
 * it later without another migration. Doing it here instead means:
 *
 *   • NO DATABASE CHANGE AT ALL — no policy, no grant, no migration. The whole
 *     change is code, so it can sit on a branch and be reviewed before it is
 *     live, which a migration cannot.
 *   • one place to add rate limiting when it is needed, rather than a permission
 *     that has to be revoked.
 *
 * NOTHING IDENTIFYING IS STORED. viewer_id is the signed-in user when there is
 * one and null otherwise. No cookie is set, no IP is recorded, no fingerprint is
 * derived. An anonymous view is a bare increment.
 *
 * NOT RATE LIMITED YET. It is exactly as abusable as the authenticated path it
 * replaces — anyone can call it in a loop and inflate a count. Worth doing
 * before the number is used for anything beyond curiosity.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: 'bad job id' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    // Tracking must never be the reason a page breaks.
    return NextResponse.json({ ok: false, reason: 'not-configured' })
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  // Resolve the viewer only if the caller sent a token. No token is the normal
  // case here, not an error.
  let viewerId: string | null = null
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data } = await db.auth.getUser(auth.slice(7))
    viewerId = data?.user?.id ?? null
  }

  let body: { source?: string; device?: string } = {}
  try { body = await req.json() } catch { /* body is optional */ }

  // The job must exist. Without this the endpoint would happily increment
  // nothing and return success, and a typo'd id would look like a working call.
  const { data: job } = await db.from('jobs').select('id').eq('id', jobId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'no such job' }, { status: 404 })

  const { error } = await db.from('job_views').insert({
    job_id: jobId,
    viewer_id: viewerId,
    source: body.source || 'direct',
    device_type: body.device || null,
  })
  if (error) {
    console.error('[view] insert failed:', error.message)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  await db.rpc('increment_job_views', { p_job_id: jobId })

  return NextResponse.json({ ok: true, anonymous: viewerId === null })
}
