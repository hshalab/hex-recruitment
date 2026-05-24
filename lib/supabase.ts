import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Cookies from 'js-cookie'

// Browser-side Supabase client (PKCE auth flow, persisted session,
// auto-refresh). Lazy — the env read used to happen at module scope
// and would throw "supabaseUrl is required" during Next.js page-data
// collection on any Preview env that didn't have NEXT_PUBLIC_*
// configured. See lib/supabase-admin.ts for the parallel fix on the
// service-role client. Browser-vs-admin clients stay separate per
// the brief — different env vars, different security posture.

const isBrowser = typeof window !== 'undefined'

// code-verifier values for PKCE are stored as cookies so they survive
// the OAuth redirect back from the provider; everything else stays in
// localStorage. SSR contexts get no storage at all (storage:undefined).
const hybridStorage = {
  getItem: (key: string): string | null => {
    if (key.includes('code-verifier')) {
      return Cookies.get(key) ?? null
    }
    return localStorage.getItem(key)
  },
  setItem: (key: string, value: string): void => {
    if (key.includes('code-verifier')) {
      Cookies.set(key, value, { sameSite: 'lax', secure: true, path: '/' })
    } else {
      localStorage.setItem(key, value)
    }
  },
  removeItem: (key: string): void => {
    if (key.includes('code-verifier')) {
      Cookies.remove(key, { path: '/' })
    } else {
      localStorage.removeItem(key)
    }
  },
}

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
  _supabase = createClient(url, key, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: isBrowser ? hybridStorage : undefined,
    },
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
