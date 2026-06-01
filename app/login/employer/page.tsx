'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { foundingPhraseShort } from '@/lib/trialUtils'
import styles from '../page.module.css'

function EmployerLoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState(() => {
    if (searchParams.get('error') === 'wrong_account') {
      return 'This Google account is registered as a candidate. Please use the candidate login.'
    }
    return ''
  })
  const [loading, setLoading] = useState(false)

  // If already authenticated as employer, redirect
  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session && session.user.user_metadata?.role === 'employer') {
        router.push('/employer/dashboard')
      }
    }
    checkExistingSession()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      setError(loginError.message)
      setLoading(false)
      return
    }

    // Check if user is an employer
    if (data.user?.user_metadata?.role !== 'employer') {
      setError('This login is for employers only. Please use the employee login.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    // Sync subscription status to localStorage if employer has a plan
    const existingStatus = localStorage.getItem('subscriptionStatus')
    if (!existingStatus || (existingStatus !== 'trial' && existingStatus !== 'active')) {
      const plan = data.user.user_metadata?.subscription_plan
      if (plan) {
        localStorage.setItem('subscriptionStatus', 'trial')
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + 14)
        localStorage.setItem('trialEndDate', trialEnd.toISOString())
      }
    }

    if (!rememberMe) {
      sessionStorage.setItem('hex_session_volatile', '1')
      localStorage.setItem('hex_prev_volatile', '1')
    } else {
      sessionStorage.removeItem('hex_session_volatile')
      localStorage.removeItem('hex_prev_volatile')
    }

    // Bridge the just-minted session into the @supabase/ssr cookies so
    // the server-side employer-layout guard sees the session on the
    // next navigation. signInWithPassword only writes localStorage —
    // without this POST the layout's getUser() returns null and bounces
    // back to /login/employer, causing an infinite client↔server loop.
    // AWAIT before navigating: the dashboard request must not fire
    // before the cookies are set on the response.
    try {
      const bridgeRes = await fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: data.session?.access_token,
          refresh_token: data.session?.refresh_token,
        }),
      })
      if (!bridgeRes.ok) {
        setError('Could not establish session. Please try again.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }
    } catch {
      setError('Could not establish session. Please try again.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    router.push('/employer/dashboard')
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.loginHeader}>
            <span className={styles.loginIcon}>🏢</span>
            <h1 className={styles.title}>Employer Login</h1>
          </div>
          <p className={styles.subtitle}>Access your recruitment dashboard</p>

          <GoogleSignInButton role="employer" className={styles.googleBtn} />
          <div className={styles.divider}><span>or</span></div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.formGroup}>
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={styles.input}
                placeholder="employer@company.com"
                autoComplete="email"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={styles.input}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <div className={styles.rememberRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className={styles.checkbox}
                />
                Remember me
              </label>
              <Link href="/forgot-password" className={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>

            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <div className={styles.signupSection}>
            <p className={styles.signupText}>New employer?</p>
            <Link href="/register/employer-free" className={styles.signupBtn}>
              Create free account
            </Link>
          </div>

          <div className={styles.benefits}>
            <h3 className={styles.benefitsTitle}>Employer Benefits</h3>
            <ul className={styles.benefitsList}>
              <li>{foundingPhraseShort()} for first {EMPLOYER_COHORT_CAP} employers</li>
              <li>Post unlimited jobs</li>
              <li>Search &amp; message candidates</li>
              <li>Full hiring pipeline</li>
            </ul>
          </div>

          <div className={styles.switchLogin}>
            <p>Looking for work?</p>
            <Link href="/login/employee" className={styles.switchLink}>
              Employee Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function EmployerLoginPage() {
  return (
    <Suspense fallback={<main><Header /><div style={{ textAlign: 'center', padding: '4rem' }}>Loading…</div></main>}>
      <EmployerLoginPageContent />
    </Suspense>
  )
}
