import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const PROJECT_REF = 'aaljufxcniacfggqiuls'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

/**
 * Decode the `base64-` payload @supabase/ssr writes. It uses base64URL (the
 * `-`/`_` alphabet, no `=` padding), which the browser's atob() — standard
 * base64 only — rejects with "InvalidCharacterError: not correctly encoded".
 * Convert to standard base64, re-pad, then UTF-8-decode the bytes (session
 * metadata such as names can be non-ASCII). Works for standard base64 too, so
 * it is safe regardless of which alphabet the cookie used.
 */
function decodeSupabaseBase64(b64: string): string {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)
  const bin = atob(s)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
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

    // Cookie values are percent-encoded in document.cookie; decode first so a
    // plain-JSON cookie parses and the `base64-` prefix is detectable.
    let raw = combined
    try { raw = decodeURIComponent(combined) } catch { /* not encoded */ }

    const jsonStr = raw.startsWith('base64-')
      ? decodeSupabaseBase64(raw.slice(7))
      : raw

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

  // NEVER overwrite a session the client already holds.
  //
  // setSession() below replaces the browser client's localStorage session. This
  // function exists for the post-OAuth case where the client has NOTHING and the
  // server has just written the cookies — but it is also called from both
  // dashboards on every load, where that assumption does not hold. In the
  // returning-user case the cookie has drifted while localStorage is still
  // valid, so installing the cookie's tokens replaces a good live session with a
  // dead one. The login page's repair then bridges those dead tokens and is
  // correctly rejected with a 401, and the user is bounced out.
  //
  // For a signed-in user the live client session is the source of truth; the
  // cookie is a shadow of it, never the authority. So if the client already has
  // a session, hand that back untouched and leave the cookie alone.
  const { data: { session: existing } } = await supabase.auth.getSession()
  if (existing) {
    console.log('[hydrate] client already has a session — not overwriting it from cookies')
    return existing
  }

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
