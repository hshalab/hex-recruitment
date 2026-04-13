'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * Global session guard that runs on every page (mounted in layout.tsx).
 *
 * 1. Volatile session cleanup — signs out users who logged in without
 *    "Remember me" when the browser is closed and reopened.
 *
 * 2. OAuth landing handler — after Google OAuth, Supabase may redirect
 *    to a page that doesn't know the user's role. This listener detects
 *    a SIGNED_IN event and routes new OAuth users to the correct dashboard
 *    based on the oauth_intended_role cookie set by GoogleSignInButton.
 *    It also stamps the role on user_metadata and creates the profile +
 *    subscription for new employer sign-ups.
 */
export default function SessionGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Volatile session cleanup
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
    // Skip if already on a dashboard or callback page
    if (pathname?.startsWith('/employer/dashboard') || pathname?.startsWith('/dashboard') || pathname?.startsWith('/auth/callback')) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return

      const user = session.user
      const role = user.user_metadata?.role as string | undefined

      // If role is already set, the user is a returning sign-in.
      // Check if they just completed OAuth and are on a login/register page.
      if (role) {
        const isOnAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/register') || pathname === '/'
        if (isOnAuthPage) {
          router.replace(role === 'employer' ? '/employer/dashboard' : '/dashboard')
        }
        return
      }

      // New OAuth user with no role — check the cookie set by GoogleSignInButton
      const cookieMatch = document.cookie.match(/oauth_intended_role=(employer|employee)/)
      const intendedRole = cookieMatch ? cookieMatch[1] as 'employer' | 'employee' : null

      if (!intendedRole) return // No cookie — can't determine role, let the page handle it

      const displayName = user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0] || 'User'

      // Stamp the role
      await supabase.auth.updateUser({
        data: { role: intendedRole, full_name: displayName },
      })

      // Clear the cookie
      document.cookie = 'oauth_intended_role=; path=/; max-age=0'

      if (intendedRole === 'employer') {
        // Create employer profile + subscription via server endpoints
        const domain = user.email?.split('@')[1]?.split('.')[0] || ''
        const isGeneric = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(domain.toLowerCase())
        const companyName = isGeneric ? 'My Company' : domain.charAt(0).toUpperCase() + domain.slice(1)

        fetch('/api/profile/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            table: 'employer_profiles',
            profile: { company_name: companyName, contact_name: displayName, email: user.email || '' },
          }),
        }).catch(() => {})

        fetch('/api/subscription/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }).catch(() => {})

        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: user.email, type: 'welcome', data: { contactName: displayName, companyName } }),
        }).catch(() => {})

        router.replace('/employer/dashboard')
      } else {
        fetch('/api/profile/create', {
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
