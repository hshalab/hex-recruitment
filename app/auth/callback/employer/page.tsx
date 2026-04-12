'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

// Client-side callback for employer Google OAuth.
// Uses onAuthStateChange to wait for Supabase to finish processing the
// OAuth hash fragment (#access_token=...) before reading the session.
// getSession() alone races and often returns null.
export default function EmployerCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Setting up your employer account…')

  useEffect(() => {
    let handled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Only act on SIGNED_IN or INITIAL_SESSION with a valid user
      if (handled) return
      if (!session?.user) return
      handled = true

      try {
        const user = session.user
        const existingRole = user.user_metadata?.role as string | undefined

        // Already an employee? Mismatch.
        if (existingRole && existingRole !== 'employer') {
          await supabase.auth.signOut()
          router.replace('/login/employer?error=wrong_account&have=' + existingRole)
          return
        }

        // Already set up as employer? Just redirect.
        if (existingRole === 'employer') {
          router.replace('/employer/dashboard')
          return
        }

        // New user — stamp role + create profile via server endpoints
        setStatus('Creating your employer profile…')

        const displayName = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0] || 'User'

        // Update user metadata
        await supabase.auth.updateUser({
          data: { role: 'employer', full_name: displayName },
        })

        // Create employer profile
        const domain = user.email?.split('@')[1]?.split('.')[0] || ''
        const isGeneric = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(domain.toLowerCase())
        const companyName = isGeneric ? 'My Company' : domain.charAt(0).toUpperCase() + domain.slice(1)

        try {
          const profileRes = await fetch('/api/profile/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              table: 'employer_profiles',
              profile: {
                company_name: companyName,
                contact_name: displayName,
                email: user.email || '',
              },
            }),
          })
          if (!profileRes.ok) console.error('[employer-callback] profile create failed', await profileRes.text().catch(() => ''))
        } catch (e) { console.error('[employer-callback] profile create error', e) }

        // Create subscription
        try {
          const subRes = await fetch('/api/subscription/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          })
          if (!subRes.ok) console.error('[employer-callback] subscription create failed', await subRes.text().catch(() => ''))
        } catch (e) { console.error('[employer-callback] subscription create error', e) }

        // Welcome email (fire and forget)
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.email,
            type: 'welcome',
            data: { contactName: displayName, companyName },
          }),
        }).catch(() => {})

        router.replace('/employer/dashboard')
      } catch (err: any) {
        console.error('[employer-callback] error', err)
        router.replace('/login/employer?error=setup_failed')
      }
    })

    // Fallback: if no auth event fires within 10 seconds, redirect
    const timeout = setTimeout(() => {
      if (!handled) {
        console.error('[employer-callback] timeout — no auth event received')
        router.replace('/login/employer?error=timeout')
      }
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <main>
      <Header />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#FFD700', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>{status}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </main>
  )
}
