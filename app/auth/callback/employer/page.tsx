'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

// Client-side callback for employer Google OAuth.
//
// Strategy: try getSession() immediately (the Supabase client may
// have already processed the hash fragment). If no session, fall back
// to onAuthStateChange which fires once the hash is processed. This
// avoids the timeout that occurred when getSession() raced the hash
// processing.
export default function EmployerCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Setting up your employer account…')
  const handled = useRef(false)

  const handleSession = async (session: { user: any } | null) => {
    if (handled.current) return
    if (!session?.user) return
    handled.current = true

    try {
      const user = session.user
      const existingRole = user.user_metadata?.role as string | undefined

      if (existingRole && existingRole !== 'employer') {
        await supabase.auth.signOut()
        router.replace('/login/employer?error=wrong_account&have=' + existingRole)
        return
      }

      if (existingRole === 'employer') {
        router.replace('/employer/dashboard')
        return
      }

      // New user — stamp role + create profile
      setStatus('Creating your employer profile…')

      const displayName = user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0] || 'User'

      // Stamp role — uses getSession token, not getUser network call
      await supabase.auth.updateUser({
        data: { role: 'employer', full_name: displayName },
      })

      const domain = user.email?.split('@')[1]?.split('.')[0] || ''
      const isGeneric = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(domain.toLowerCase())
      const companyName = isGeneric ? 'My Company' : domain.charAt(0).toUpperCase() + domain.slice(1)

      // Create profile + subscription via server endpoints (bypass RLS)
      const [profileRes, subRes] = await Promise.allSettled([
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

      if (profileRes.status === 'rejected' || (profileRes.status === 'fulfilled' && !profileRes.value.ok)) {
        console.error('[employer-callback] profile create failed')
      }
      if (subRes.status === 'rejected' || (subRes.status === 'fulfilled' && !subRes.value.ok)) {
        console.error('[employer-callback] subscription create failed')
      }

      // Welcome email (fire and forget)
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

  useEffect(() => {
    // 1. Try getSession immediately — the hash may already be processed
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        handleSession(session)
      }
    })

    // 2. Also listen for SIGNED_IN as a fallback — fires once the hash
    //    fragment is processed if it wasn't ready for getSession above
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        handleSession(session)
      }
    })

    // 3. Timeout fallback — 15 seconds
    const timeout = setTimeout(() => {
      if (!handled.current) {
        console.error('[employer-callback] timeout — no session after 15s')
        router.replace('/login/employer?error=timeout')
      }
    }, 15000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
