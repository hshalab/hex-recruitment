'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

type Phase =
  | 'loading'
  | 'need-auth'
  | 'mismatch'
  | 'accepting'
  | 'done'
  | 'invalid'
  | 'expired'
  | 'used'
  | 'error'

const ERROR_COPY: Record<string, string> = {
  expired: 'This invitation has expired. Ask your team to send you a new one.',
  already_used: 'This invitation has already been accepted.',
  invalid: 'This invitation link is invalid or has been revoked.',
  email_mismatch: 'This invitation is for a different email address.',
  already_in_account: "You're already part of a team on Thrive. Leave that account before joining another.",
  server_error: 'Something went wrong accepting the invitation. Please try again.',
}

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [phase, setPhase] = useState<Phase>('loading')
  const [company, setCompany] = useState('a team')
  const [invitedEmail, setInvitedEmail] = useState('')
  const [currentEmail, setCurrentEmail] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const accept = useCallback(async () => {
    setPhase('accepting')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPhase('need-auth'); return }

    const res = await fetch('/api/team/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ token }),
    })
    const json = await res.json().catch(() => ({ ok: false, error: 'server_error' }))

    if (!json.ok) {
      if (json.error === 'expired') setPhase('expired')
      else if (json.error === 'already_used') setPhase('used')
      else if (json.error === 'invalid') setPhase('invalid')
      else { setErrorMsg(ERROR_COPY[json.error] || ERROR_COPY.server_error); setPhase('error') }
      return
    }

    // Role was set to 'employer' server-side. Refresh the session so the new
    // metadata is in the token, then bridge it to the SSR cookies the employer
    // layout reads — otherwise the guard sees the stale role and bounces.
    try {
      const { data: refreshed } = await supabase.auth.refreshSession()
      const s = refreshed?.session
      if (s?.access_token && s?.refresh_token) {
        await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }),
        })
      }
    } catch { /* best effort */ }

    setPhase('done')
    router.push('/employer/dashboard')
  }, [token, router])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      if (!token) { setPhase('invalid'); return }

      const infoRes = await fetch(`/api/team/invite-info?token=${encodeURIComponent(token)}`)
      const info = await infoRes.json().catch(() => ({ status: 'invalid' }))
      if (cancelled) return

      if (info.status !== 'valid') {
        setPhase(info.status === 'expired' ? 'expired' : info.status === 'used' ? 'used' : 'invalid')
        return
      }
      setCompany(info.company || 'a team')
      setInvitedEmail((info.email || '').toLowerCase())

      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { setPhase('need-auth'); return }

      const email = (session.user.email || '').toLowerCase()
      setCurrentEmail(email)
      if (email !== (info.email || '').toLowerCase()) { setPhase('mismatch'); return }

      accept()
    }
    init()
    return () => { cancelled = true }
  }, [token, accept])

  const acceptUrl = `/invite/accept?token=${encodeURIComponent(token)}`
  const emailQ = invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ''

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Image src="/logo/thrive-mark-192.png" alt="Thrive" width={46} height={46} className={styles.mark} />
        {children}
      </div>
    </div>
  )

  if (phase === 'loading' || phase === 'accepting' || phase === 'done') {
    return (
      <Shell>
        <p className={styles.eyebrow}>Team invitation</p>
        <h1 className={styles.title}>{phase === 'loading' ? 'Checking your invitation…' : 'Joining the team…'}</h1>
        <div className={styles.spinner} />
      </Shell>
    )
  }

  if (phase === 'need-auth') {
    return (
      <Shell>
        <p className={styles.eyebrow}>Team invitation</p>
        <h1 className={styles.title}>Join <span className={styles.company}>{company}</span> on Thrive</h1>
        <p className={styles.body}>
          You've been invited to help with hiring{invitedEmail ? <> at this email: <span className={styles.email}>{invitedEmail}</span></> : null}.
        </p>
        <p className={styles.body}>Sign in or create your account to accept.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href={`/register/employee?redirect=${encodeURIComponent(acceptUrl)}${emailQ}`}>
            Create your account
          </Link>
          <Link className={styles.secondary} href={`/login/employer?redirect=${encodeURIComponent(acceptUrl)}${emailQ}`}>
            I already have an account
          </Link>
        </div>
      </Shell>
    )
  }

  if (phase === 'mismatch') {
    return (
      <Shell>
        <p className={styles.eyebrow}>Team invitation</p>
        <h1 className={styles.title}>Wrong account</h1>
        <p className={styles.body}>
          This invitation is for <span className={styles.email}>{invitedEmail}</span>, but you're signed in as <span className={styles.email}>{currentEmail}</span>.
        </p>
        <div className={styles.actions}>
          <button
            className={styles.primary}
            onClick={async () => { await supabase.auth.signOut(); router.refresh(); setPhase('need-auth') }}
          >
            Sign out and switch account
          </button>
        </div>
      </Shell>
    )
  }

  // Terminal error states
  const heading =
    phase === 'expired' ? 'Invitation expired'
    : phase === 'used' ? 'Already accepted'
    : phase === 'error' ? 'Something went wrong'
    : 'Invalid invitation'
  const message =
    phase === 'expired' ? ERROR_COPY.expired
    : phase === 'used' ? ERROR_COPY.already_used
    : phase === 'error' ? errorMsg
    : ERROR_COPY.invalid

  return (
    <Shell>
      <div className={styles.errorIcon}>{phase === 'used' ? '✅' : '⚠️'}</div>
      <h1 className={styles.title}>{heading}</h1>
      <p className={styles.body}>{message}</p>
      <Link className={styles.link} href="/">Back to Thrive</Link>
    </Shell>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className={styles.wrap}><div className={styles.card} /></div>}>
      <AcceptInviteContent />
    </Suspense>
  )
}
