import Link from 'next/link'
import Header from '@/components/Header'
import styles from './page.module.css'

// Server-rendered role chooser. /login used to be a client stub that painted a
// "Redirecting..." shell and then router.replace('/')'d — a visible flash, and a
// dead end for the ~19 places that send a signed-out user here. Now it renders on
// the server (no client redirect, no flash) and routes people to the real login
// pages that already exist: /login/employee and /login/employer. Mirrors the
// header's two paths — "Hire People" / "Find a Job".
export default function LoginChooserPage() {
  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          <h1 className={styles.title}>Log in to Thrive</h1>
          <p className={styles.subtitle}>How would you like to continue?</p>

          <div className={styles.loginChoices}>
            <Link href="/login/employer" className={styles.choiceCard}>
              <span className={styles.choiceIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </span>
              <span className={styles.choiceTitle}>Hire People</span>
              <span className={styles.choiceDesc}>Log in to your employer account</span>
            </Link>

            <Link href="/login/employee" className={styles.choiceCard}>
              <span className={styles.choiceIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <span className={styles.choiceTitle}>Find a Job</span>
              <span className={styles.choiceDesc}>Log in to your job seeker account</span>
            </Link>
          </div>

          <div className={styles.links}>
            <p className={styles.signupText}>New to Thrive?</p>
            <div className={styles.signupLinks}>
              <Link href="/register/employer-free" className={styles.link}>Create an employer account →</Link>
              <Link href="/register/employee" className={styles.link}>Create a job seeker account →</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
