'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * Global session guard that runs on every page (mounted in layout.tsx).
 *
 * 1. Volatile session cleanup — signs out users who logged in without
 *    "Remember me" when the browser is closed and reopened.
 *
 * 2. OAuth landing redirect — after Google OAuth, if the user lands on
 *    a login/register page with a valid session, redirect them to the
 *    correct dashboard. Does NOT call updateUser or any Supabase API
 *    that hits the network — uses only the local session from getSession()
 *    to avoid CORS issues during the OAuth redirect transition.
 *
 *    Role stamping and profile creation happen in the dedicated callback
 *    pages (/auth/callback/employer, /auth/callback/employee).
 */
export default function SessionGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const handled = useRef(false)

  // Volatile session cleanup (runs once on mount)
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

  // OAuth landing redirect — listen for SIGNED_IN event and route
  // to the correct dashboard. Only uses local session data (getSession),
  // never calls updateUser/getUser to avoid CORS on Supabase endpoints.
  useEffect(() => {
    if (pathname?.startsWith('/employer/dashboard') || pathname?.startsWith('/dashboard') || pathname?.startsWith('/auth/callback')) return

    const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/register') || pathname === '/'
    if (!isAuthPage) return

    handled.current = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (handled.current) return
      if (event !== 'SIGNED_IN' || !session?.user) return
      handled.current = true

      const role = session.user.user_metadata?.role as string | undefined

      if (role === 'employer') {
        router.replace('/employer/dashboard')
      } else if (role === 'employee') {
        router.replace('/dashboard')
      }
      // If no role yet (new OAuth user), don't redirect — let the
      // callback page handle it. If the callback page wasn't reached,
      // the user will see the login page and can try again.
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  return null
}
