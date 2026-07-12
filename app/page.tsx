'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import ThriveMark from '@/components/ThriveMark'
import FeaturedJobs from '@/components/FeaturedJobs'
import { supabase } from '@/lib/supabase'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/constants/brand'
import { foundingPhraseShort } from '@/lib/trialUtils'
import styles from './page.module.css'

// Product demo clips (muted screen-captures) hosted in Supabase storage.
const DEMO_BASE = 'https://aaljufxcniacfggqiuls.supabase.co/storage/v1/object/public/job-banners/site'

export default function Home() {
  const router = useRouter()
  const [authRedirecting, setAuthRedirecting] = useState(false)
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null)
  const [liveJobs, setLiveJobs] = useState<number | null>(null)

  // Redirect logged-in users to their dashboard (non-blocking — page renders immediately)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthRedirecting(true)
        const role = session.user.user_metadata?.role
        router.replace(role === 'employer' ? '/employer/dashboard' : '/dashboard')
      }
    }).catch(() => {
      // Supabase unreachable — just show landing page
    })
  }, [router])

  // Live founding-cohort counter. /api/check-spots counts rows with
  // subscription_tier='free' (the founding marker) and returns
  // spotsRemaining = EMPLOYER_COHORT_CAP - claimed. Fail-soft: on error
  // the hero falls back to the static "First N employers" copy.
  useEffect(() => {
    fetch('/api/check-spots')
      .then(r => r.json())
      .then(d => {
        if (typeof d?.spotsRemaining === 'number') setSpotsRemaining(d.spotsRemaining)
      })
      .catch(() => {})
  }, [])

  // Live inventory proof — count of active roles on the board. Active jobs are
  // publicly readable, so the anon client can count them. Fail-soft (hidden on error).
  useEffect(() => {
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active')
      .then(({ count }) => { if (typeof count === 'number') setLiveJobs(count) })
  }, [])

  // If a logged-in session was found, show minimal UI while redirecting
  if (authRedirecting) {
    return (
      <main>
        <Header />
        <div style={{ minHeight: '80vh' }} />
      </main>
    )
  }

  return (
    <main>
      <Header />

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            From job ad to signed offer, in one place.
          </h1>
          <p className={styles.heroSubtitle}>
            A modern UK recruitment platform that handles the whole hire.
          </p>

          {liveJobs !== null && liveJobs > 0 && (
            <p className={styles.heroLiveCount}>
              <span className={styles.heroLiveDot} aria-hidden="true" />
              <strong>{liveJobs.toLocaleString()}</strong> live hospitality roles on Thrive right now — and growing every week
            </p>
          )}

          <div className={styles.heroProofGrid}>
            <div className={styles.heroProofCard}>
              <svg className={styles.heroProofIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <p className={styles.heroProofHeadline}>3 minutes</p>
              <p className={styles.heroProofBody}>AI-assisted job ad, posted live</p>
            </div>
            <div className={styles.heroProofCard}>
              <svg className={styles.heroProofIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              <p className={styles.heroProofHeadline}>Track everything</p>
              <p className={styles.heroProofBody}>Every applicant, from CV to offer</p>
            </div>
            <div className={styles.heroProofCard}>
              <svg className={styles.heroProofIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <polyline points="9 15 11 17 15 13" />
              </svg>
              <p className={styles.heroProofHeadline}>Sign in-platform</p>
              <p className={styles.heroProofBody}>Offer letters, signed both sides</p>
            </div>
            <div className={styles.heroProofCard}>
              <svg className={styles.heroProofIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p className={styles.heroProofHeadline}>Sync your calendar</p>
              <p className={styles.heroProofBody}>Interviews land in Google or Outlook</p>
            </div>
          </div>

          <div className={styles.heroCtas}>
            <Link href="/register/employer-free" className={styles.ctaPrimary}>
              Hire on Thrive →
            </Link>
            <Link href="/jobs" className={styles.ctaSecondary}>
              Find a job
            </Link>
          </div>

          <p className={styles.heroBottomStrip}>
            {spotsRemaining !== null
              ? `${spotsRemaining} of ${EMPLOYER_COHORT_CAP} founding spots left · ${foundingPhraseShort()} · no card needed`
              : `First ${EMPLOYER_COHORT_CAP} employers get ${foundingPhraseShort()} · no card needed · free for candidates to apply`}
          </p>
        </div>
      </section>

      {/* Live roles strip — candidate funnel + proof of real inventory */}
      <FeaturedJobs />

      {/* See it in action — real product demos (pipeline + offer signing) */}
      <section className={styles.seeItSection}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>See Thrive in action</h2>
          <p className={styles.sectionSubtitle}>From job ad to signed offer without leaving the page — no spreadsheets, no CV black holes, no per-post fees.</p>
          <div className={styles.demoRows}>
            <div className={styles.demoRow}>
              <div className={styles.demoVideoWrap}>
                <video className={styles.demoVideo} src={`${DEMO_BASE}/pipeline.mp4`} poster={`${DEMO_BASE}/pipeline-poster.jpg`} autoPlay muted loop playsInline preload="metadata" />
              </div>
              <div className={styles.demoText}>
                <h3 className={styles.demoTitle}>Manage every applicant</h3>
                <p className={styles.demoBody}>Drag candidates through your pipeline and book interviews in a click. Every application tracked from CV to offer — no spreadsheets, no black holes.</p>
              </div>
            </div>
            <div className={styles.demoRow}>
              <div className={styles.demoVideoWrap}>
                <video className={styles.demoVideo} src={`${DEMO_BASE}/offer.mp4`} poster={`${DEMO_BASE}/offer-poster.jpg`} autoPlay muted loop playsInline preload="metadata" />
              </div>
              <div className={styles.demoText}>
                <h3 className={styles.demoTitle}>Make an offer in seconds</h3>
                <p className={styles.demoBody}>Generate a branded offer letter and sign it in-platform — signed both sides, no printing, scanning or chasing.</p>
              </div>
            </div>
            <div className={styles.demoRow}>
              <div className={styles.demoVideoWrap}>
                <video className={styles.demoVideo} src={`${DEMO_BASE}/ai-questions.mp4`} poster={`${DEMO_BASE}/ai-questions-poster.jpg`} autoPlay muted loop playsInline preload="metadata" />
              </div>
              <div className={styles.demoText}>
                <h3 className={styles.demoTitle}>AI interview questions</h3>
                <p className={styles.demoBody}>Thrive reads the CV and the role and suggests sharp, tailored questions — so you walk into every interview prepared.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What You Get — free launch offer */}
      <section className={`${styles.benefits}`}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Everything you need to hire — completely free</h2>
          <p className={styles.sectionSubtitle}>The first {EMPLOYER_COHORT_CAP} employers get {foundingPhraseShort()}. No card. No catch.</p>
          <div className={`${styles.benefitsGrid}`}>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Post unlimited jobs</h3>
              <p className={styles.stepText}>Post unlimited jobs. Reach hospitality candidates actively searching in your area.</p>
            </div>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Search candidates directly</h3>
              <p className={styles.stepText}>Browse profiles by skills, location, and availability. Message candidates before they even apply.</p>
            </div>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Easy onboarding</h3>
              <p className={styles.stepText}>Send us your live roles and we&apos;ll build your account and load them for you — in minutes. Optional premium job imagery, free.</p>
            </div>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Analytics that show what works</h3>
              <p className={styles.stepText}>See which jobs get views, where candidates come from, and how your hiring funnel performs.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`${styles.finalCta}`}>
        <div className={styles.sectionInner}>
          <h2 className={styles.finalCtaTitle}>Ready to get started?</h2>
          <p className={styles.finalCtaText}>
            Join free today. No credit card required.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/register/employer-free" className={styles.ctaPrimary}>
              Hire on Thrive →
            </Link>
            <Link href="/jobs" className={styles.ctaSecondary}>
              Or browse jobs as a candidate
            </Link>
          </div>
        </div>
      </section>

      {/* Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: BRAND_NAME,
              url: 'https://thrivecareer.co.uk',
              potentialAction: {
                '@type': 'SearchAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: 'https://thrivecareer.co.uk/jobs?search={search_term_string}',
                },
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: BRAND_NAME,
              url: 'https://thrivecareer.co.uk',
              logo: 'https://thrivecareer.co.uk/icon.svg',
              sameAs: ['https://www.linkedin.com/company/thrivecareers'],
            },
          ]),
        }}
      />

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <ThriveMark size={24} />
            <div className={styles.footerBrandText}>
              <span className={styles.footerLogo}>Thrive</span>
              <span className={styles.footerTagline}>{BRAND_TAGLINE}</span>
            </div>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
            <Link href="/privacy-policy" className={styles.footerLink}>Privacy Policy</Link>
            <button onClick={() => (window as any).__openCookiePreferences?.()} className={styles.footerLink} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>Cookie Settings</button>
            <Link href="/jobs" className={styles.footerLink}>Browse Jobs</Link>
            <a href="mailto:contact@thrivecareer.co.uk" className={styles.footerLink}>Contact Us</a>
          </div>
          <p className={styles.footerCopy}>&copy; 2026 Thrive. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
