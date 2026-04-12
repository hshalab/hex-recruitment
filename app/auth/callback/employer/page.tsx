'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

// Client-side callback for employer Google OAuth.
// The Supabase client automatically exchanges the code fragment for a
// session (using the PKCE verifier stored in localStorage). We then
// stamp role='employer' on the user metadata and create the profile.
export default function EmployerCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Setting up your employer account…')

  useEffect(() => {
    const setup = async () => {
      try {
        // Wait for Supabase to process the auth hash/code from the URL
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !session?.user) {
          console.error('[employer-callback] no session', sessionError)
          router.replace('/login/employer?error=auth_failed')
          return
        }

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

        // Create employer profile via server endpoint (bypasses RLS)
        const companyName = user.email?.split('@')[1]?.split('.')[0] || 'My Company'
        const isGeneric = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail'].includes(companyName.toLowerCase())

        await fetch('/api/profile/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            table: 'employer_profiles',
            profile: {
              company_name: isGeneric ? 'My Company' : companyName.charAt(0).toUpperCase() + companyName.slice(1),
              contact_name: displayName,
              email: user.email || '',
            },
          }),
        }).catch(() => {})

        // Create subscription
        try {
          const subRes = await fetch('/api/subscription/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          })
          if (!subRes.ok) {
            const subErr = await subRes.json().catch(() => ({}))
            console.error('[employer-callback] subscription create failed', subRes.status, subErr)
          }
        } catch (subErr) {
          console.error('[employer-callback] subscription create error', subErr)
        }

        // Welcome email
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
        fetch(`${siteUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.email,
            type: 'welcome',
            data: { contactName: displayName, companyName: isGeneric ? 'My Company' : companyName },
          }),
        }).catch(() => {})

        router.replace('/employer/dashboard')
      } catch (err: any) {
        console.error('[employer-callback] error', err)
        router.replace('/login/employer?error=setup_failed')
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
