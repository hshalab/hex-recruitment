'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { supabase } from '@/lib/supabase'
import { isValidEmail } from '@/lib/validateEmail'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { foundingPhraseShort } from '@/lib/trialUtils'
import loginStyles from '../../login/page.module.css'
import styles from './page.module.css'

export default function RegisterEmployerFreePage() {
  const router = useRouter()

  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreeAll, setAgreeAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.user_metadata?.role === 'employer') {
        router.replace('/employer/dashboard')
      }
    })

    fetch('/api/check-spots')
      .then(r => r.json())
      .then(d => {
        if (d.isFull) {
          router.push('/waitlist?reason=full')
        } else {
          setSpotsRemaining(d.spotsRemaining ?? null)
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!agreeAll) {
      setError('Please agree to our Terms of Service and Privacy Policy to continue.')
      return
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address (e.g. you@company.com).')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    // Check if free spots are still available
    try {
      const spotsRes = await fetch('/api/check-spots')
      const spotsData = await spotsRes.json()
      if (spotsData.isFull) {
        router.push('/waitlist?reason=full')
        return
      }
    } catch {
      // If check fails, proceed anyway — server-side uniqueness will catch duplicates
    }

    try {
      // Server-side signup wrapper enforces the disposable-domain block
      // and stamps the freemail/business classification into user_metadata
      // before Supabase creates the auth.users row. See app/api/auth/
      // employer-signup/route.ts.
      // Profile + subscription bootstrap rows are NOT written here — they
      // land in lib/authCallback.ts once email confirmation completes, so
      // an abandoned signup doesn't consume a founding spot.
      const res = await fetch('/api/auth/employer-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, companyName, contactName }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data?.error || 'Something went wrong. Please try again.')
        return
      }

      setEmailSent(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <Header />
      <div className={loginStyles.container}>
        <div className={loginStyles.formCard}>
          {/* Free banner */}
          <div className={styles.freeBanner}>
            {spotsRemaining === null
              ? `\ud83c\udf89 Join the first ${EMPLOYER_COHORT_CAP} employers on Thrive \u2014 ${foundingPhraseShort()}, no card needed.`
              : spotsRemaining <= 10
                ? `\ud83d\udd34 Only ${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} left \u2014 claim yours now before they\u2019re gone.`
                : `\ud83d\udfe1 ${spotsRemaining} of ${EMPLOYER_COHORT_CAP} free spots remaining \u2014 no card needed.`}
          </div>

          {emailSent ? (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.75rem' }}>Check your email</h2>
              <p style={{ fontSize: '1rem', color: '#475569', lineHeight: 1.6, margin: '0 0 1rem', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
                We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to activate your account and start hiring.
              </p>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Can&apos;t find it? Check your spam folder.
              </p>
            </div>
          ) : (
          <>
          <h1 className={loginStyles.title}>Start hiring for free</h1>
          <p className={loginStyles.subtitle}>Join the first {EMPLOYER_COHORT_CAP} employers on Thrive — {foundingPhraseShort()}, no card needed.</p>

          {error && <div className={loginStyles.error}>{error}</div>}

          <GoogleSignInButton role="employer" className={loginStyles.googleBtn} label="Sign up with Google" />
          <div className={loginStyles.divider}><span>or</span></div>

          <form className={loginStyles.form} onSubmit={handleSubmit}>
            <div className={loginStyles.formGroup}>
              <label htmlFor="companyName">Company name *</label>
              <input
                id="companyName"
                type="text"
                className={loginStyles.input}
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                required
                autoComplete="organization"
              />
            </div>

            <div className={loginStyles.formGroup}>
              <label htmlFor="contactName">Your name *</label>
              <input
                id="contactName"
                type="text"
                className={loginStyles.input}
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            <div className={loginStyles.formGroup}>
              <label htmlFor="email">Email address *</label>
              <input
                id="email"
                type="email"
                className={loginStyles.input}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className={loginStyles.formGroup}>
              <label htmlFor="password">Password *</label>
              <PasswordInput
                id="password"
                className={loginStyles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>

            <div className={styles.checkboxGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={agreeAll}
                  onChange={e => setAgreeAll(e.target.checked)}
                />
                <span>I agree to the <Link href="/terms" target="_blank" className={styles.legalLink}>Terms of Service</Link> and <Link href="/privacy-policy" target="_blank" className={styles.legalLink}>Privacy Policy</Link></span>
              </label>
            </div>

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading}
            >
              {loading ? 'Claiming your spot...' : 'Claim my free spot →'}
            </button>

            <div className={styles.trustRow}>
              <span><span className={styles.trustCheck}>✓</span> No credit card</span>
              <span><span className={styles.trustCheck}>✓</span> Cancel anytime</span>
              <span><span className={styles.trustCheck}>✓</span> Free for first {EMPLOYER_COHORT_CAP} employers</span>
            </div>
          </form>

          <div className={loginStyles.links}>
            <span>Already have an account? <Link href="/login/employer" className={loginStyles.link}>Log in</Link></span>
          </div>
          </>
          )}
        </div>
      </div>
    </main>
  )
}
