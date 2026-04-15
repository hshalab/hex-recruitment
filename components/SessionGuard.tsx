'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

const PROJECT_REF = 'aaljufxcniacfggqiuls'
const CHUNKED_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token.0`

function isAuthPage(): boolean {
  const p = window.location.pathname
  return p === '/' || p.startsWith('/login') || p.startsWith('/register')
}

/**
 * Global session guard — runs on every page (mounted in layout.tsx).
 *
 * After Google OAuth with PKCE, the server-side callback (/auth/callback/
 * employer) writes the session as chunked cookies (sb-*-auth-token.0, .1).
 * The client-side Supabase (localStorage-based) doesn't see those cookies
 * via getSession(). This guard detects the mismatch and reloads once so
 * the Supabase client picks up the cookie session on the next render.
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
      // 1. Check for existing session in localStorage
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        const role = session.user.user_metadata?.role as string | undefined
        console.log('[SessionGuard] session found, role:', role)
        if (role) {
          handled.current = true
          window.location.href = role === 'employer' ? '/employer/dashboard' : '/dashboard'
          return
        }

        // Session exists but no role — new user. Check cookie for intended role.
        const intendedRole = getCookie('oauth_intended_role') as 'employer' | 'employee' | null
        if (intendedRole) {
          handled.current = true
          await routeNewUser(session.user, intendedRole)
          return
        }
        return
      }

      // 2. No session in localStorage — check if server wrote chunked cookies
      //    (from the /auth/callback/employer route handler via @supabase/ssr)
      const hasChunkedCookie = !!getCookie(CHUNKED_COOKIE_NAME)
      console.log('[SessionGuard] no localStorage session, chunked cookie:', hasChunkedCookie ? 'FOUND' : 'NOT FOUND')

      if (hasChunkedCookie) {
        // Server wrote the session as cookies but the client doesn't know.
        // Reload once — on the next render the Supabase client will pick
        // up the cookies (with detectSessionInUrl + persistSession).
        // Use a sessionStorage flag to prevent infinite reload loops.
        const reloadKey = 'session_guard_reloaded'
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, '1')
          console.log('[SessionGuard] Reloading to sync cookie session...')
          window.location.reload()
          return
        }
        // Already reloaded once — session still not found. The chunked
        // cookies might be from a stale/deleted session. Clear the flag
        // and let the user proceed to the login page.
        sessionStorage.removeItem(reloadKey)
        console.log('[SessionGuard] Already reloaded — stale cookies, proceeding')
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
