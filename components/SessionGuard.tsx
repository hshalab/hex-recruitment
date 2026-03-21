'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Signs out users who logged in without "Remember me" when the browser
 * is closed and reopened. Uses localStorage to persist the volatile flag
 * across sessions, and sessionStorage to detect a fresh browser launch.
 */
export default function SessionGuard() {
  useEffect(() => {
    const sessionStarted = sessionStorage.getItem('hex_session_started')
    if (!sessionStarted) {
      // First load of this browser session — check if previous session
      // was volatile (non-remember-me login)
      const prevVolatile = localStorage.getItem('hex_prev_volatile')
      if (prevVolatile === '1') {
        supabase.auth.signOut()
        localStorage.removeItem('hex_prev_volatile')
      }
      sessionStorage.setItem('hex_session_started', '1')
    }
  }, [])

  return null
}
