import { createClient } from '@supabase/supabase-js'
import Cookies from 'js-cookie'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const isBrowser = typeof window !== 'undefined'

// Use cookie-based storage so the PKCE code verifier (written during
// signInWithOAuth on the client) is available to the server-side route
// handler in /auth/callback/employer|employee. localStorage is not
// accessible server-side — cookies are.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: isBrowser
      ? {
          getItem: (key: string) => Cookies.get(key) ?? null,
          setItem: (key: string, value: string) => {
            Cookies.set(key, value, {
              expires: 365,
              sameSite: 'lax',
              secure: location.protocol === 'https:',
              path: '/',
            })
          },
          removeItem: (key: string) => Cookies.remove(key, { path: '/' }),
        }
      : undefined,
  },
})
