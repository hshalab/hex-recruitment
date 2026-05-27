import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy, shared service-role Supabase client. The same 7-line block of
// `const supabaseAdmin = createClient(...)` was duplicated at module
// scope across 27 files (3 lib/*, 24 app/api/**) — each one threw
// "supabaseUrl is required" during Next.js page-data collection when
// NEXT_PUBLIC_SUPABASE_URL wasn't on the env, blocking every Vercel
// Preview build. This file is the single source of truth.
//
// SECURITY POSTURE
// This client bypasses Row Level Security whenever
// SUPABASE_SERVICE_ROLE_KEY is present. `server-only` means importing
// this module from a client component throws a build error — RLS
// bypass cannot accidentally leak to a browser bundle.
//
// FALLBACK
// If SUPABASE_SERVICE_ROLE_KEY is missing, falls back to the anon key.
// This matches the prior per-file behaviour: in local dev or a
// service-key-less preview, calls that genuinely need RLS bypass will
// fail at the row-policy layer rather than throw at import time. The
// alternative — hard-throwing here when the service key is absent —
// would re-introduce the build-time bug for any environment that
// only has the anon key.

let _admin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase admin client: NEXT_PUBLIC_SUPABASE_URL plus either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY must be set at request time',
    )
  }
  _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

// Proxy preserves the `supabaseAdmin.<method>` call shape that 27
// callers already use, so each migrates by changing only its import
// line. Property accesses route through getSupabaseAdmin(), so the
// env read happens at first request — not at module import / build
// time. Methods are bound to the real client so internal `this`
// references on the Supabase SDK stay intact.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get: (_target, prop, receiver) => {
    const client = getSupabaseAdmin()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
