'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const PROJECT_REF = 'aaljufxcniacfggqiuls'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function isAuthPage(): boolean {
  const p = window.location.pathname
  return p === '/' || p.startsWith('/login') || p.startsWith('/register')
}

/**
 * Parse the chunked session cookies written by @supabase/ssr on the
 * server side. These are split across sb-*-auth-token.0, .1, .2 etc.
 * and contain a JSON object with access_token + refresh_token.
 */
function getChunkedSession(): { access_token: string; refresh_token: string } | null {
  try {
    const cookieName = `sb-${PROJECT_REF}-auth-token`

    // Collect cookie value — single or chunked
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

    // @supabase/ssr stores cookies with a "base64-" prefix
    let jsonStr: string
    if (combined.startsWith('base64-')) {
      jsonStr = atob(combined.slice(7))
    } else {
      jsonStr = decodeURIComponent(combined)
    }

    return JSON.parse(jsonStr)
  } catch (e) {
    console.error('[SessionGuard] Cookie parse error:', e)
  }
  return null
}

/**
 * Global session guard — runs on every page (mounted in layout.tsx).
 *
 * After Google OAuth with PKCE, the server callback writes the session
 * as chunked cookies via @supabase/ssr. The client-side Supabase uses
 * localStorage and can't see those cookies via getSession(). This guard
 * parses the chunked cookies directly and hydrates the client session
 * via setSession().
 */
export default function SessionGuard() {
  const handled = useRef(false)

  // Volatile session cleanup
  useEffect(() => {
    const sessionStarted = sessionStorage.getItem('hex_session_started')
    if (!sessionStarted) {
      const prevVolatile = localStorage.getItem('hex_prev_volatile')
      if (prevVolatile === '1') {
        supabase.auth.signOut()
        localStorage.removeItem('hex_prev_volatile')
      }
      sessionStorage.setItem('hex_session_started', '1')
    }
  }, [])

  // Session detection + redirect
  useEffect(() => {
    if (handled.current) return
    if (!isAuthPage()) return

    const handleAuth = async () => {
      // 1. Check localStorage session first
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        const role = session.user.user_metadata?.role as string | undefined
        if (role) {
          handled.current = true
          window.location.href = role === 'employer' ? '/employer/dashboard' : '/dashboard'
          return
        }
        // Session but no role — new user, check cookie
        const intendedRole = getCookie('oauth_intended_role') as 'employer' | 'employee' | null
        if (intendedRole) {
          handled.current = true
          await routeNewUser(session.user, intendedRole)
          return
        }
        return
      }

      // 2. No localStorage session — try to hydrate from chunked SSR cookies
      const cookieSession = getChunkedSession()
      if (cookieSession?.access_token && cookieSession?.refresh_token) {
        console.log('[SessionGuard] Hydrating session from chunked cookies')
        const { data, error } = await supabase.auth.setSession({
          access_token: cookieSession.access_token,
          refresh_token: cookieSession.refresh_token,
        })

        if (error) {
          console.error('[SessionGuard] setSession error:', error.message)
          return
        }

        if (data.session?.user) {
          const role = data.session.user.user_metadata?.role as string | undefined
          console.log('[SessionGuard] Session hydrated, role:', role)

          if (role) {
            handled.current = true
            window.location.href = role === 'employer' ? '/employer/dashboard' : '/dashboard'
            return
          }

          // New user — check intended role cookie
          const intendedRole = getCookie('oauth_intended_role') as 'employer' | 'employee' | null
          if (intendedRole) {
            handled.current = true
            await routeNewUser(data.session.user, intendedRole)
            return
          }
        }
      }
    }

    handleAuth()
  }, [])

  return null
}

async function routeNewUser(user: any, intendedRole: 'employer' | 'employee') {
  document.cookie = 'oauth_intended_role=; path=/; max-age=0'

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
  console.log('[SessionGuard] New user — stamping role:', intendedRole)

  await supabase.auth.updateUser({ data: { role: intendedRole, full_name: displayName } })

  if (intendedRole === 'employer') {
    const domain = user.email?.split('@')[1]?.split('.')[0] || ''
    const isGeneric = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(domain.toLowerCase())
    const companyName = isGeneric ? 'My Company' : domain.charAt(0).toUpperCase() + domain.slice(1)

    await Promise.allSettled([
      fetch('/api/profile/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, table: 'employer_profiles', profile: { company_name: companyName, contact_name: displayName, email: user.email || '' } }),
      }),
      fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      }),
    ])

    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
    }).catch(() => {})

    window.location.href = '/employer/dashboard'
  } else {
    await fetch('/api/profile/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, profile: { full_name: displayName, email: user.email || '' } }),
    }).catch(() => {})

    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: user.email, type: 'candidate_welcome', data: { candidateName: displayName } }),
    }).catch(() => {})

    window.location.href = '/dashboard'
  }
}
