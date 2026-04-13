'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

export default function EmployeeCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Setting up your account…')
  const handled = useRef(false)

  const handleSession = async (session: { user: any } | null) => {
    if (handled.current) return
    if (!session?.user) return
    handled.current = true

    try {
      const user = session.user
      const existingRole = user.user_metadata?.role as string | undefined

      if (existingRole && existingRole !== 'employee') {
        await supabase.auth.signOut()
        router.replace('/login/employee?error=wrong_account&have=' + existingRole)
        return
      }

      if (existingRole === 'employee') {
        router.replace('/dashboard')
        return
      }

      setStatus('Creating your profile…')

      const displayName = user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0] || 'User'

      await supabase.auth.updateUser({
        data: { role: 'employee', full_name: displayName },
      })

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
    } catch (err: any) {
      console.error('[employee-callback] error', err)
      router.replace('/login/employee?error=setup_failed')
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) handleSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        handleSession(session)
      }
    })

    const timeout = setTimeout(() => {
      if (!handled.current) {
        console.error('[employee-callback] timeout')
        router.replace('/login/employee?error=timeout')
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
