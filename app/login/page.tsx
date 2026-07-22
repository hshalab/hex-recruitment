import Link from 'next/link'
import Header from '@/components/Header'
import { safeInternalPath } from '@/lib/safeRedirect'
import styles from './page.module.css'

// Server-rendered role chooser. /login used to be a client stub that painted a
// "Redirecting..." shell and then router.replace('/')'d — a visible flash, and a
// dead end for the ~19 places that send a signed-out user here. Now it renders on
// the server (no client redirect, no flash) and routes people to the real login
// pages that already exist: /login/employee and /login/employer. Mirrors the
// header's two paths — "Hire People" / "Find a Job".
export default function LoginChooserPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  // Routes that can't tell which role you are send you here WITH a ?redirect=.
  // Forward it to both cards, otherwise the returnTo dies at the chooser and
  // the whole point of the redirect is lost. Validated here so a hostile value
  // is dropped before it's ever rendered into an href.
  const raw = searchParams?.redirect
  const redirect = safeInternalPath(Array.isArray(raw) ? raw[0] : raw)
  const qs = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard}>
          <h1 className={styles.title}>Log in to Thrive</h1>
          <p className={styles.subtitle}>How would you like to continue?</p>

          <div className={styles.loginChoices}>
            <Link href={`/login/employer${qs}`} className={styles.choiceCard}>
              <span className={styles.choiceIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </span>
              <span className={styles.choiceTitle}>Hire People</span>
              <span className={styles.choiceDesc}>Log in to your employer account</span>
            </Link>

            <Link href={`/login/employee${qs}`} className={styles.choiceCard}>
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
