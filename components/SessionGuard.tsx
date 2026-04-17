'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { hydrateSessionFromCookies } from '@/lib/hydrateSessionFromCookies'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function isAuthPage(): boolean {
  const p = window.location.pathname
  return p === '/' || p.startsWith('/login') || p.startsWith('/register')
}

/**
 * Global session guard — runs on every page (mounted in layout.tsx).
 *
 * After Google OAuth with PKCE, the server callback writes the session as
 * chunked cookies via @supabase/ssr. The client-side Supabase uses
 * localStorage and can't see those cookies via getSession(). On auth pages
 * (/, /login/*, /register/*) this guard hydrates the client from the
 * chunked cookies and redirects the user to their dashboard.
 *
 * Non-auth pages do their own hydration (see app/employer/dashboard) so
 * users landing directly on a protected route after OAuth don't have to
 * bounce through an auth page.
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
      const hydrated = await hydrateSessionFromCookies()
      if (hydrated?.user) {
        const role = hydrated.user.user_metadata?.role as string | undefined
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
          await routeNewUser(hydrated.user, intendedRole)
          return
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

    await fetch('/api/profile/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, table: 'employer_profiles', profile: { company_name: companyName, contact_name: displayName, email: user.email || '' } }),
    }).catch(() => {})

    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
    }).catch(() => {})

    // New employer → payment page (trial subscription created there)
    window.location.href = '/register/employer/payment'
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
