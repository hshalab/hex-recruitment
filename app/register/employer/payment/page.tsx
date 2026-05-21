'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { supabase } from '@/lib/supabase'
import { hydrateSessionFromCookies } from '@/lib/hydrateSessionFromCookies'
import Header from '@/components/Header'
import { EMPLOYER_SUBSCRIPTION_PRICE, TRIAL_DURATION_DAYS, TRIAL_MONTHS } from '@/lib/trialUtils'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

function trialEndDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + TRIAL_DURATION_DAYS)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Inner form (has access to Stripe context) ──────────────
function PaymentForm({ customerId, userId }: { customerId: string; userId: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    try {
      // Confirm the SetupIntent to save the card
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      })

      if (stripeError) {
        setError(stripeError.message || 'Card setup failed')
        setLoading(false)
        return
      }

      if (!setupIntent || setupIntent.status !== 'succeeded') {
        setError('Card setup did not complete. Please try again.')
        setLoading(false)
        return
      }

      // Create the trial subscription
      const res = await fetch('/api/stripe/confirm-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          customerId,
          paymentMethodId: setupIntent.payment_method,
        }),
      })

      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setLoading(false)
        return
      }

      // Success — go to dashboard
      router.push('/employer/dashboard')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />

      {error && (
        <div style={{ color: '#dc2626', background: '#fef2f2', padding: '0.75rem 1rem', borderRadius: 8, marginTop: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || loading}
        style={{
          width: '100%',
          marginTop: '1.5rem',
          padding: '0.875rem',
          background: loading ? '#94a3b8' : '#16a34a',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: '1rem',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Processing...' : `Start ${TRIAL_MONTHS}-month free trial`}
      </button>

      <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#64748b', marginTop: '0.75rem' }}>
        No charge until {trialEndDate()}. Cancel anytime.
      </p>
    </form>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function EmployerPaymentPage() {
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      // Get session — try localStorage first, then hydrate from SSR cookies
      // (after OAuth redirect, localStorage is empty but cookies are set)
      let session = (await supabase.auth.getSession()).data.session
      if (!session) {
        session = await hydrateSessionFromCookies()
      }
      if (!session?.user) {
        router.push('/login/employer')
        return
      }

      const uid = session.user.id
      const email = session.user.email || ''
      setUserId(uid)

      // Check if employer already has a subscription
      const { data: sub } = await supabase
        .from('employer_subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', uid)
        .maybeSingle()

      if (sub?.stripe_subscription_id) {
        // Already subscribed — skip payment
        router.push('/employer/dashboard')
        return
      }

      // Fetch SetupIntent
      try {
        const res = await fetch('/api/stripe/setup-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, email }),
        })

        const data = await res.json()

        if (data.error) {
          setInitError(data.error)
          setPageLoading(false)
          return
        }

        setClientSecret(data.clientSecret)
        setCustomerId(data.customerId)
      } catch (err: any) {
        setInitError(err.message || 'Failed to initialize payment')
      }

      setPageLoading(false)
    }

    init()
  }, [router])

  if (pageLoading) {
    return (
      <main>
        <Header />
        <div style={{ maxWidth: 480, margin: '4rem auto', textAlign: 'center', padding: '0 1rem' }}>
          <p style={{ color: '#64748b' }}>Setting up your account...</p>
        </div>
      </main>
    )
  }

  if (initError) {
    return (
      <main>
        <Header />
        <div style={{ maxWidth: 480, margin: '4rem auto', textAlign: 'center', padding: '0 1rem' }}>
          <h2 style={{ color: '#dc2626' }}>Setup Error</h2>
          <p style={{ color: '#64748b' }}>{initError}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div style={{ maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Start your {TRIAL_MONTHS}-month free trial
          </h1>
          <p style={{ color: '#64748b', marginTop: '0.5rem', fontSize: '0.95rem' }}>
            Add a payment method to get started. You won&apos;t be charged until {trialEndDate()}.
          </p>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 600, color: '#15803d', fontSize: '0.95rem' }}>What&apos;s included</div>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', color: '#166534', fontSize: '0.875rem', lineHeight: 1.8 }}>
            <li>Unlimited job listings</li>
            <li>Browse and contact candidates</li>
            <li>Full analytics dashboard</li>
            <li>Interview scheduling and offers</li>
            <li>Cancel anytime — no commitment</li>
          </ul>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.5rem' }}>
          {clientSecret && customerId && userId ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: { colorPrimary: '#16a34a' },
                },
              }}
            >
              <PaymentForm customerId={customerId} userId={userId} />
            </Elements>
          ) : (
            <p style={{ textAlign: 'center', color: '#94a3b8' }}>Loading payment form...</p>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '1.5rem' }}>
          After your free trial, your plan is £{EMPLOYER_SUBSCRIPTION_PRICE}/month. Cancel anytime from your dashboard.
        </p>
      </div>
    </main>
  )
}
