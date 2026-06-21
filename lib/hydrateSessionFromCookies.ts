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
  // Match the attributes @supabase/ssr writes (SameSite=Lax; Secure on HTTPS).
  // WebKit/Mobile Safari refuse to overwrite a Secure cookie unless the clear
  // also carries Secure — same attribute-mismatch trap as the server route.
  const clear = (n: string) => { document.cookie = `${n}=; path=/; max-age=0; SameSite=Lax; Secure` }
  clear(cookieName)
  for (let i = 0; i <= 10; i++) clear(`${cookieName}.${i}`)
  clear(`${cookieName}-code-verifier`)
}

/**
 * After an OAuth redirect, @supabase/ssr has written the session as chunked
 * cookies on the server, but the client's localStorage is still empty. This
 * reads those cookies and INSTALLS the session into the browser client with
 * setSession({ access_token, refresh_token }).
 *
 * Why setSession and not refreshSession: the access_token in the cookie was
 * just minted by the server's exchangeCodeForSession and is still valid, so
 * setSession persists the session WITHOUT calling /token — i.e. without
 * consuming/rotating the single-use refresh_token. refreshSession() did consume
 * it, and when anything else (auto-refresh, a second hydrate, a re-render) had
 * already spent that token, the second /token call came back 400
 * "refresh_token_already_used" (Supabase reuse-detection), hydration returned
 * null, and the employer dashboard bounced to /login — the LinkedIn flash-then-
 * bounce. setSession sidesteps that entirely. (supabase-js only falls back to a
 * network refresh if the access_token is already expired, which it isn't here.)
 *
 * Returns the hydrated Session, or null if there were no cookies or the install
 * failed (in which case stale cookies are cleared). Falls back to refreshSession
 * only if the cookie somehow lacks an access_token.
 */
export async function hydrateSessionFromCookies(): Promise<Session | null> {
  const cookieSession = readChunkedCookie()
  if (!cookieSession?.refresh_token) return null

  if (cookieSession.access_token) {
    console.log('[hydrate] installing session from chunked cookies via setSession')
    const { data, error } = await supabase.auth.setSession({
      access_token: cookieSession.access_token,
      refresh_token: cookieSession.refresh_token,
    })
    if (error) {
      console.error('[hydrate] setSession error:', error.message)
      clearStaleAuthCookies()
      return null
    }
    return data.session ?? null
  }

  // Fallback: no access_token in the cookie — refresh from the refresh_token.
  console.log('[hydrate] no access_token in cookie; refreshing session')
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
