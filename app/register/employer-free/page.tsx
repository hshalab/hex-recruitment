'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import { supabase } from '@/lib/supabase'
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
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null)

  useEffect(() => {
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
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: contactName,
            company_name: companyName,
            role: 'employer',
          },
        },
      })

      if (authError) {
        if (authError.message.toLowerCase().includes('already')) {
          setError('This email is already in use. Try logging in instead.')
        } else {
          setError(authError.message)
        }
        return
      }

      if (authData.user) {
        const freeUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

        // Create employer profile
        await supabase.from('employer_profiles').upsert({
          user_id: authData.user.id,
          company_name: companyName,
          contact_name: contactName,
          email,
          phone: null,
          location: null,
          business_address: null,
        }, { onConflict: 'user_id' })

        // Create subscription record for free launch
        await supabase.from('employer_subscriptions').upsert({
          user_id: authData.user.id,
          subscription_status: 'active',
          subscription_tier: 'free',
          trial_ends_at: freeUntil,
          current_period_end: freeUntil,
        }, { onConflict: 'user_id' })

        // Send welcome email (non-blocking)
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            type: 'welcome',
            data: { companyName },
          }),
        }).catch(() => {})

        router.push('/employer/dashboard')
      }
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
              ? '🎉 You\u2019re claiming one of the first 100 free employer spots \u2014 12 months free, no card needed.'
              : spotsRemaining <= 10
                ? `\ud83d\udd34 Only ${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} left \u2014 claim yours now before they\u2019re gone.`
                : `\ud83d\udfe1 ${spotsRemaining} of 100 free spots remaining \u2014 no card needed.`}
          </div>

          <h1 className={loginStyles.title}>Create your employer account</h1>
          <p className={loginStyles.subtitle}>Takes 60 seconds — no card needed.</p>

          {error && <div className={loginStyles.error}>{error}</div>}

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
              {loading ? 'Creating account...' : 'Create free account →'}
            </button>
          </form>

          <div className={loginStyles.links}>
            <span>Already have an account? <Link href="/login/employer" className={loginStyles.link}>Log in</Link></span>
          </div>
        </div>
      </div>
    </main>
  )
}
