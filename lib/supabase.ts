import { createClient } from '@supabase/supabase-js'
import Cookies from 'js-cookie'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const isBrowser = typeof window !== 'undefined'

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: isBrowser ? hybridStorage : undefined,
  },
})
