'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import loginStyles from '../../login/page.module.css'
import styles from './page.module.css'

export default function RegisterEmployerFreePage() {
  const router = useRouter()

  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [postcode, setPostcode] = useState('')
  const [addressData, setAddressData] = useState<AddressData | null>(null)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAddressFound = (address: AddressData) => {
    setAddressData(address)
    setPostcode(address.postcode)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!agreeTerms || !agreePrivacy) {
      setError('Please agree to the Terms of Service and Privacy Policy')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

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
            postcode: addressData?.postcode || postcode,
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
          phone: phone || null,
          location: addressData
            ? [addressData.addressLine1, addressData.city, addressData.postcode].filter(Boolean).join(', ')
            : postcode || null,
          business_address: addressData
            ? {
                address_line_1: addressData.addressLine1,
                address_line_2: addressData.addressLine2,
                city: addressData.city,
                county: addressData.county,
                postcode: addressData.postcode,
              }
            : postcode ? { postcode } : null,
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
            🎉 You&apos;re claiming one of the first 100 free employer spots — 12 months free, no card needed.
          </div>

          <h1 className={loginStyles.title}>Create your employer account</h1>
          <p className={loginStyles.subtitle}>Start hiring for free — takes under 2 minutes</p>

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

            <div className={loginStyles.formGroup}>
              <label htmlFor="phone">Phone number (optional)</label>
              <input
                id="phone"
                type="tel"
                className={loginStyles.input}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="+44 7XXX XXXXXX"
              />
            </div>

            <div className={loginStyles.formGroup}>
              <label>Postcode *</label>
              <PostcodeLookup onAddressFound={handleAddressFound} />
            </div>

            <div className={styles.checkboxGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={e => setAgreeTerms(e.target.checked)}
                />
                <span>I agree to the <Link href="/terms" target="_blank" className={styles.legalLink}>Terms of Service</Link></span>
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={e => setAgreePrivacy(e.target.checked)}
                />
                <span>I agree to the <Link href="/privacy-policy" target="_blank" className={styles.legalLink}>Privacy Policy</Link></span>
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
