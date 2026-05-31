'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'

// Friendly landing page for founding signups whose account is awaiting
// manual approval (free-mail address). The auth callback routes here
// when employer_profiles.approval_status is 'pending', 'rejected', or
// 'waitlisted'. Polls the status periodically so a freshly-approved
// user gets bounced to the dashboard without re-login.

type ApprovalStatus = 'pending' | 'rejected' | 'waitlisted' | 'approved' | null

export default function AccountUnderReviewPage() {
  const router = useRouter()
  const [status, setStatus] = useState<ApprovalStatus>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.replace('/login/employer')
        return
      }
      setEmail(session.user.email || '')

      const { data: profile } = await supabase
        .from('employer_profiles')
        .select('approval_status')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (cancelled) return
      const s = (profile?.approval_status as ApprovalStatus) || null
      setStatus(s)
      setLoading(false)

      if (s === 'approved' || s === null) {
        router.replace('/employer/dashboard')
      }
    }

    check()
    // Poll every 20 s so an approval grant lands without manual reload.
    const interval = setInterval(check, 20000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [router])

  if (loading) {
    return (
      <main>
        <Header />
        <div style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
          <p style={{ color: '#64748b' }}>Checking your account status…</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
        {status === 'pending' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🕒</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Account under review</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>
              Thanks for signing up! Because your email address (<strong>{email}</strong>) is from a personal-mail provider, your founding-cohort account needs a quick manual check before we open up posting and candidate access.
            </p>
            <p style={{ color: '#475569', lineHeight: 1.6, marginTop: '1rem' }}>
              We usually review applications within a few hours during UK business hours. You'll get an email the moment your account is approved.
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '2rem' }}>
              In a hurry? Reply to your confirmation email or contact <a href="mailto:hello@thrivecareer.co.uk" style={{ color: '#16a34a' }}>hello@thrivecareer.co.uk</a> with your company name and we'll prioritise.
            </p>
          </>
        )}
        {status === 'rejected' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Account not approved</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>
              We weren't able to approve your founding-cohort signup. If you think this is a mistake, please reply to your confirmation email or contact <a href="mailto:hello@thrivecareer.co.uk" style={{ color: '#16a34a' }}>hello@thrivecareer.co.uk</a> with your company name and we'll take another look.
            </p>
          </>
        )}
        {status === 'waitlisted' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📋</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>You're on the waitlist</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>
              The founding cohort is currently full, but we've reserved your spot in the waitlist. We'll email you the moment a place opens up.
            </p>
          </>
        )}
        <div style={{ marginTop: '2.5rem' }}>
          <Link href="/" style={{ color: '#64748b', fontSize: '0.9rem' }}>← Back to home</Link>
        </div>
      </div>
    </main>
  )
}
