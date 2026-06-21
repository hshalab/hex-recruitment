'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import JobSeekerProfileForm from '@/components/JobSeekerProfileForm'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import LinkedInSignInButton from '@/components/LinkedInSignInButton'
import loginStyles from '../../login/page.module.css'
import styles from './page.module.css'

function RegisterEmployeePageContent() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  return (
    <main className={styles.main}>
      <Header />
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Create Your Job Seeker Profile</h1>
          <p className={styles.subtitle}>
            Join Thrive and connect with top employers across the UK
          </p>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto 1.5rem' }}>
          <GoogleSignInButton role="employee" className={loginStyles.googleBtn} label="Sign up with Google" next={redirectTo || undefined} />
          <div style={{ marginTop: '0.6rem' }}>
            <LinkedInSignInButton role="employee" className={loginStyles.googleBtn} label="Sign up with LinkedIn" next={redirectTo || undefined} />
          </div>
          <div className={loginStyles.divider}><span>or</span></div>
        </div>

        <JobSeekerProfileForm mode="register" />

        <div className={styles.loginLink}>
          <p>Already have an account?</p>
          <Link href="/login/employee">Log in here</Link>
        </div>
      </div>
    </main>
  )
}

// Wrap in Suspense for useSearchParams (used by JobSeekerProfileForm)
export default function RegisterEmployeePage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          Loading...
        </div>
      </main>
    }>
      <RegisterEmployeePageContent />
    </Suspense>
  )
}
