'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

// Client-side callback for candidate Google OAuth.
export default function EmployeeCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Setting up your account…')

  useEffect(() => {
    const setup = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !session?.user) {
          console.error('[employee-callback] no session', sessionError)
          router.replace('/login/employee?error=auth_failed')
          return
        }

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
          body: JSON.stringify({
            userId: user.id,
            profile: {
              full_name: displayName,
              email: user.email || '',
            },
          }),
        }).catch(() => {})

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
        fetch(`${siteUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.email,
            type: 'candidate_welcome',
            data: { candidateName: displayName },
          }),
        }).catch(() => {})

        router.replace('/dashboard')
      } catch (err: any) {
        console.error('[employee-callback] error', err)
        router.replace('/login/employee?error=setup_failed')
      }
    }
    setup()
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
