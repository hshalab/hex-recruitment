'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * Global session guard that runs on every page (mounted in layout.tsx).
 *
 * Handles two scenarios:
 * 1. Volatile session cleanup on browser restart
 * 2. OAuth code landing on wrong page — if ?code= arrives on the homepage
 *    (because Supabase's redirect allowlist doesn't include /auth/callback/*),
 *    the client-side Supabase processes the code via detectSessionInUrl,
 *    fires SIGNED_IN, and this guard routes the user to the right place.
 *    For new users without a role, it reads the oauth_intended_role cookie
 *    and calls the profile/subscription creation endpoints.
 */
export default function SessionGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const handled = useRef(false)

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

  useEffect(() => {
    if (pathname?.startsWith('/employer/dashboard') || pathname?.startsWith('/dashboard') || pathname?.startsWith('/auth/callback')) return

    const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/register') || pathname === '/'
    if (!isAuthPage) return

    handled.current = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (handled.current) return
      if (event !== 'SIGNED_IN' || !session?.user) return
      handled.current = true

      const user = session.user
      const role = user.user_metadata?.role as string | undefined

      // Returning user with role already set
      if (role === 'employer') {
        router.replace('/employer/dashboard')
        return
      }
      if (role === 'employee') {
        router.replace('/dashboard')
        return
      }

      // New OAuth user — no role yet. Read intended role from cookie.
      const cookieMatch = document.cookie.match(/oauth_intended_role=(employer|employee)/)
      const intendedRole = cookieMatch?.[1] as 'employer' | 'employee' | undefined
      if (!intendedRole) return

      // Clear cookie
      document.cookie = 'oauth_intended_role=; path=/; max-age=0'

      const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'

      // Stamp role (client-side updateUser — session is established at this point)
      await supabase.auth.updateUser({ data: { role: intendedRole, full_name: displayName } })

      // Create profile + subscription via server endpoints
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

        router.replace('/employer/dashboard')
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

        router.replace('/dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  return null
}
