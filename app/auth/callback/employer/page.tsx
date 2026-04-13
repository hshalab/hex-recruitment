'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

// Employer Google OAuth callback — polling approach.
// Does NOT use onAuthStateChange. Polls getSession() every 300ms
// until the Supabase client finishes processing the hash fragment.
export default function EmployerCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Setting up your employer account…')
  const handled = useRef(false)

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null

    const processSession = async () => {
      if (handled.current) return

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return // Not ready yet — keep polling

      handled.current = true
      if (pollTimer) clearInterval(pollTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)

      const user = session.user
      const existingRole = user.user_metadata?.role as string | undefined

      // Wrong role — sign out and redirect
      if (existingRole && existingRole !== 'employer') {
        await supabase.auth.signOut()
        router.replace('/login/employer?error=wrong_account&have=' + existingRole)
        return
      }

      // Returning employer — go to dashboard
      if (existingRole === 'employer') {
        router.replace('/employer/dashboard')
        return
      }

      // New user — stamp role + create profile
      try {
        setStatus('Creating your employer profile…')

        const displayName = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0] || 'User'

        await supabase.auth.updateUser({
          data: { role: 'employer', full_name: displayName },
        })

        const domain = user.email?.split('@')[1]?.split('.')[0] || ''
        const isGeneric = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(domain.toLowerCase())
        const companyName = isGeneric ? 'My Company' : domain.charAt(0).toUpperCase() + domain.slice(1)

        await Promise.allSettled([
          fetch('/api/profile/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              table: 'employer_profiles',
              profile: { company_name: companyName, contact_name: displayName, email: user.email || '' },
            }),
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
      } catch (err: any) {
        console.error('[employer-callback] error', err)
        router.replace('/login/employer?error=setup_failed')
      }
    }

    // Try immediately, then poll every 300ms
    processSession()
    pollTimer = setInterval(processSession, 300)

    // Hard timeout after 10 seconds
    timeoutTimer = setTimeout(() => {
      if (!handled.current) {
        handled.current = true
        if (pollTimer) clearInterval(pollTimer)
        router.replace('/login/employer?error=timeout')
      }
    }, 10000)

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
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
