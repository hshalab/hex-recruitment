import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

/**
 * Get the current session, retrying a few times with a short delay.
 *
 * Needed on the first render after an OAuth redirect: the server-written
 * Supabase cookies take a moment to hydrate into the client's localStorage,
 * so an immediate getSession() can return null even though we're signed in.
 */
export async function getSessionWithRetry(retries = 3, delay = 500): Promise<Session | null> {
  for (let i = 0; i < retries; i++) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) return session
    if (i < retries - 1) await new Promise(r => setTimeout(r, delay))
  }
  return null
}
