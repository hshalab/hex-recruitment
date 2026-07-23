import { createBrowserClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'

// Browser-side Supabase client. PHASE E1 of the dual-store removal.
//
// This client now stores its session in COOKIES via @supabase/ssr's
// createBrowserClient, instead of the previous createClient + custom
// hybridStorage (localStorage for the session, cookies only for the PKCE
// code-verifier). The server already reads that same cookie via
// createServerClient, so client and server now share ONE store — which is what
// removes the drift/poisoning/repair-race class of bug the interim only
// contained. createBrowserClient writes the standard chunked
// `sb-<ref>-auth-token` cookie in base64url, matching what the server writes.
//
// Still lazy: the env read used to happen at module scope and would throw
// "supabaseUrl is required" during Next.js page-data collection on any Preview
// env without NEXT_PUBLIC_* set. See lib/supabase-admin.ts for the parallel
// service-role client. createBrowserClient gates autoRefreshToken /
// detectSessionInUrl on its own isBrowser() check, so an SSR-context call
// degrades safely rather than touching document.cookie.
//
// NOTE: the old cookie-bridge machinery (hydrateSessionFromCookies, the
// set-session route, repair/guard helpers) is now redundant but left in place
// deliberately — it is removed in a separate step once this store change is
// proven. See the accompanying report.

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase browser client: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set at request time',
    )
  }
  _supabase = createBrowserClient(url, key, {
    cookieOptions: { sameSite: 'lax', secure: true, path: '/' },
  })
  return _supabase
}

// Proxy preserves the existing `import { supabase } from '@/lib/supabase'`
// surface used across the app. Property accesses route through
// getSupabase() so the env read happens at first use rather than at
// module import / build time. Methods are bound to the real client so
// internal `this` references on the Supabase SDK stay intact.
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_target, prop, receiver) => {
    const client = getSupabase()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
