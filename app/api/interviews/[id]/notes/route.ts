import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeNoteHtml, isNoteWithinLimit, NOTE_MAX_HTML } from '@/lib/sanitizeNoteHtml'

// Private interview prep notes — one sanitised-HTML note per interview, owned by
// the employer. Auth is derived from the @supabase/ssr cookie session (never
// trusted from the request body), then we authorise that the caller owns the
// interview before any read/write. RLS on interview_notes is the second layer:
// even the service-role reads/writes here are gated by the explicit ownership
// check below, and any DIRECT client access is owner-only via policy.

export const dynamic = 'force-dynamic'

// Reads the current user from the request — preferring the @supabase/ssr cookie
// session, falling back to an Authorization: Bearer <access_token> header (the
// client sends both). Returns null if neither yields a valid user.
async function getUserId(req: NextRequest): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        // This route never mutates the session; set/remove are no-ops.
        set(_name: string, _value: string, _options: CookieOptions) {},
        remove(_name: string, _options: CookieOptions) {},
      },
    },
  )
  const { data, error } = await supabase.auth.getUser()
  if (!error && data?.user) return data.user.id

  // Bearer fallback: validate the JWT directly.
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  const token = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null
  if (token) {
    const { data: bearerData, error: bearerErr } = await supabaseAdmin.auth.getUser(token)
    if (!bearerErr && bearerData?.user) return bearerData.user.id
  }
  return null
}

// Confirms the interview exists AND belongs to this employer. Returns true only
// when the caller owns it.
async function ownsInterview(interviewId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('interviews')
    .select('id')
    .eq('id', interviewId)
    .eq('employer_id', userId)
    .maybeSingle()
  return !error && !!data
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const interviewId = params.id
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await ownsInterview(interviewId, userId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('interview_notes')
    .select('body, updated_at')
    .eq('interview_id', interviewId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'failed to load note' }, { status: 500 })
  return NextResponse.json({ body: data?.body ?? '', updatedAt: data?.updated_at ?? null })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const interviewId = params.id
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await ownsInterview(interviewId, userId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    const json = await req.json()
    raw = json?.body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (typeof raw !== 'string') {
    return NextResponse.json({ error: 'body must be a string' }, { status: 400 })
  }

  // Reject oversized input BEFORE sanitising (cheap guard against abuse).
  if (raw.length > NOTE_MAX_HTML * 2) {
    return NextResponse.json({ error: 'note too long', maxHtml: NOTE_MAX_HTML }, { status: 413 })
  }

  // Authoritative server-side sanitisation on save.
  const body = sanitizeNoteHtml(raw)
  if (!isNoteWithinLimit(body)) {
    return NextResponse.json({ error: 'note too long', maxHtml: NOTE_MAX_HTML }, { status: 413 })
  }

  const { error } = await supabaseAdmin
    .from('interview_notes')
    .upsert(
      { interview_id: interviewId, employer_id: userId, body, updated_at: new Date().toISOString() },
      { onConflict: 'interview_id' },
    )

  if (error) return NextResponse.json({ error: 'failed to save note' }, { status: 500 })
  return NextResponse.json({ ok: true, body })
}
