import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const PROJECT_REF = 'aaljufxcniacfggqiuls'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

/**
 * Parse the chunked session cookie written by @supabase/ssr on the server.
 * Cookies are split across `sb-<ref>-auth-token.0`, `.1`, … and contain a
 * JSON payload with access_token + refresh_token (base64-prefixed).
 */
function readChunkedCookie(): { access_token?: string; refresh_token?: string } | null {
  if (typeof document === 'undefined') return null
  try {
    const cookieName = `sb-${PROJECT_REF}-auth-token`
    let combined = ''
    const single = getCookie(cookieName)
    if (single) {
      combined = single
    } else {
      for (let i = 0; i <= 10; i++) {
        const chunk = getCookie(`${cookieName}.${i}`)
        if (!chunk) break
        combined += chunk
      }
    }
    if (!combined) return null

    const jsonStr = combined.startsWith('base64-')
      ? atob(combined.slice(7))
      : decodeURIComponent(combined)

    return JSON.parse(jsonStr)
  } catch (e) {
    console.error('[hydrate] cookie parse error:', e)
    return null
  }
}

function clearStaleAuthCookies() {
  if (typeof document === 'undefined') return
  const cookieName = `sb-${PROJECT_REF}-auth-token`
  const clear = (n: string) => { document.cookie = `${n}=; path=/; max-age=0` }
  clear(cookieName)
  for (let i = 0; i <= 10; i++) clear(`${cookieName}.${i}`)
  clear(`${cookieName}-code-verifier`)
}

/**
 * After an OAuth redirect, @supabase/ssr has written the session as chunked
 * cookies on the server, but the client's localStorage is still empty. This
 * reads those cookies and calls refreshSession — using the refresh_token to
 * mint a fresh access_token and persist the session to localStorage.
 *
 * Returns the hydrated Session, or null if there were no cookies or the
 * refresh failed (in which case stale cookies are cleared).
 */
export async function hydrateSessionFromCookies(): Promise<Session | null> {
  const cookieSession = readChunkedCookie()
  if (!cookieSession?.refresh_token) return null

  console.log('[hydrate] refreshing session from chunked cookies')
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: cookieSession.refresh_token,
  })

  if (error) {
    console.error('[hydrate] refreshSession error:', error.message)
    clearStaleAuthCookies()
    return null
  }

  return data.session ?? null
}
