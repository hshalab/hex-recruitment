'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface GoogleSignInButtonProps {
  role: 'employer' | 'employee'
  className?: string
  label?: string
}

/**
 * Renders the official Google "Continue with Google" button that kicks
 * off the Supabase OAuth flow. The role is carried through the redirect
 * URL so /auth/callback can stamp the right user_metadata.role and
 * create the matching profile row for first-time sign-ins.
 */
export default function GoogleSignInButton({ role, className, label }: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setError('')
    setLoading(true)
    try {
      // Use the env var for a stable, known-good origin — window.location.origin
      // can be unreliable during SSR or in edge cases.
      const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      const redirectTo = `${siteUrl}/auth/callback/${role}`
      console.log('[GoogleSignIn] redirectTo:', redirectTo)
      // Store intended role in a cookie so SessionGuard can pick it up
      // on whichever page the user lands on after OAuth (Supabase may
      // redirect to a different page if the callback URL isn't in the
      // allowlist).
      document.cookie = `oauth_intended_role=${role}; path=/; max-age=600; SameSite=Lax`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'email profile',
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      }
      // On success, the browser is navigated to Google — nothing to do.
    } catch (err: any) {
      setError(err?.message || 'Failed to start Google sign-in')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={className}
        aria-label="Continue with Google"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
        </svg>
        {loading ? 'Connecting…' : (label || 'Continue with Google')}
      </button>
      {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}
    </>
  )
}
