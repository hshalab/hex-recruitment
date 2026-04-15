'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

/**
 * Global session guard — runs on every page (mounted in layout.tsx).
 *
 * 1. Detects ?code= in the URL (PKCE auth code from Supabase/Google OAuth)
 *    and exchanges it for a session client-side. This handles the case where
 *    Supabase redirects to the homepage instead of /auth/callback/employer.
 *
 * 2. After exchange (or if session already exists), reads the role and
 *    redirects to the correct dashboard.
 *
 * 3. For new OAuth users, reads the oauth_intended_role cookie, stamps
 *    the role, and creates profile + subscription.
 *
 * 4. Volatile session cleanup on browser restart.
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

  // OAuth code exchange + redirect
  useEffect(() => {
    console.log('[SessionGuard] useEffect fired', {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash ? '#(present)' : '#(empty)',
      handled: handled.current,
      cookies: document.cookie.split(';').map(c => c.trim().split('=')[0]).join(', '),
    })

    if (handled.current) {
      console.log('[SessionGuard] already handled — skipping')
      return
    }

    const handleAuth = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      console.log('[SessionGuard] code param:', code ? code.substring(0, 10) + '...' : 'null')
      console.log('[SessionGuard] PKCE verifier cookie:', document.cookie.includes('code-verifier') ? 'FOUND' : 'NOT FOUND')

      if (code) {
        console.log('[SessionGuard] Exchanging code for session...')
        handled.current = true

        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)

          console.log('[SessionGuard] Exchange result:', {
            hasSession: !!data?.session,
            hasUser: !!data?.session?.user,
            error: error?.message || null,
            role: data?.session?.user?.user_metadata?.role || null,
          })

          // Clean the URL regardless of outcome
          window.history.replaceState({}, '', window.location.pathname)

          if (error) {
            console.error('[SessionGuard] Exchange error:', error.message)
            return
          }

          if (!data.session?.user) {
            console.error('[SessionGuard] No session after exchange')
            return
          }

          await routeUser(data.session.user)
        } catch (err: any) {
          console.error('[SessionGuard] Exchange threw:', err?.message || err)
          window.history.replaceState({}, '', window.location.pathname)
        }
        return
      }

      // No ?code= — check for existing session (e.g. returning user on login page)
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[SessionGuard] Existing session check:', {
        hasSession: !!session,
        role: session?.user?.user_metadata?.role || null,
        pathname: window.location.pathname,
      })

      if (session?.user) {
        const role = session.user.user_metadata?.role as string | undefined
        const isAuthPage = ['/', '/login', '/register'].some(p =>
          window.location.pathname === p || window.location.pathname.startsWith(p + '/')
        )
        if (isAuthPage && role) {
          console.log('[SessionGuard] Redirecting existing user:', role)
          handled.current = true
          if (role === 'employer') {
            window.location.href = '/employer/dashboard'
          } else {
            window.location.href = '/dashboard'
          }
        }
      }
    }

    handleAuth()
  }, [])

  return null
}

async function routeUser(user: any) {
  const role = user.user_metadata?.role as string | undefined

  // Returning user with role set
  if (role === 'employer') {
    window.location.href = '/employer/dashboard'
    return
  }
  if (role === 'employee') {
    window.location.href = '/dashboard'
    return
  }

  // New user — read intended role from cookie
  const intendedRole = getCookie('oauth_intended_role') as 'employer' | 'employee' | null
  if (!intendedRole) {
    console.warn('[SessionGuard] New user but no oauth_intended_role cookie')
    return
  }

  // Clear cookie
  document.cookie = 'oauth_intended_role=; path=/; max-age=0'

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'

  console.log('[SessionGuard] New user — stamping role:', intendedRole)

  // Stamp role
  await supabase.auth.updateUser({ data: { role: intendedRole, full_name: displayName } })

  // Create profile + subscription
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
