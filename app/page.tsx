'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import HoneycombLogo from '@/components/HoneycombLogo'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

function useCountUp(end: number, duration: number = 2000, startCounting: boolean = false) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!startCounting) return
    let startTime: number | null = null
    let animationFrame: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * end))
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [end, duration, startCounting])

  return count
}

export default function Home() {
  const router = useRouter()
  const statsRef = useRef<HTMLElement>(null)
  const [statsVisible, setStatsVisible] = useState(false)
  const [authRedirecting, setAuthRedirecting] = useState(false)
  const [jobsTarget, setJobsTarget] = useState(0)
  const [candidatesTarget, setCandidatesTarget] = useState(0)
  const [employerCount, setEmployerCount] = useState<number | null>(null)

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

  // Fetch real counts from DB, use fallbacks if too low or on error
  useEffect(() => {
    supabase.from('jobs').select('id', { count: 'exact', head: true }).then(({ count, error }) => {
      if (!error && count !== null) setJobsTarget(count)
    })

    supabase.from('candidate_profiles').select('id', { count: 'exact', head: true }).then(({ count, error }) => {
      if (!error && count !== null) setCandidatesTarget(count)
    })

    fetch('/api/stats')
      .then(r => r.json())
      .then(d => setEmployerCount(d.employerCount ?? 0))
      .catch(() => {})
  }, [])

  // Observe stats bar
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    if (statsRef.current) observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])


  const jobsCount = useCountUp(jobsTarget, 2000, statsVisible)
  const candidatesCount = useCountUp(candidatesTarget, 2000, statsVisible)
  const sectorsCount = useCountUp(20, 1500, statsVisible)

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
            Find a job. Post a job.
          </h1>
          <p className={styles.heroSubtitle}>
            Post jobs, search candidates, manage your pipeline, schedule interviews —
            one platform, all UK sectors. 6 months free for the first 600 employers.
          </p>
          <div className={styles.spotsCounter}>
            <div className={styles.spotsBar}>
              <div className={styles.spotsBarFill} style={{ width: `${Math.min((employerCount ?? 0) / 600 * 100, 100)}%` }} />
            </div>
            <p className={styles.spotsText}>
              <span className={styles.spotsFree}>{employerCount ?? '—'} of 600</span> free spots claimed — <span className={styles.spotsFree}>no card needed</span>
            </p>
          </div>
          <div className={styles.heroCtas}>
            <Link href="/register/employer-free" className={styles.ctaPrimary}>
              Claim your free spot →
            </Link>
            <Link href="/jobs" className={styles.ctaSecondary}>
              Browse jobs (free for candidates)
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className={`${styles.statsBar}`} ref={statsRef}>
        <div className={styles.statsInner}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{jobsCount.toLocaleString()}+</span>
            <span className={styles.statLabel}>Jobs Posted</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>{candidatesCount.toLocaleString()}+</span>
            <span className={styles.statLabel}>Candidates</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>{sectorsCount}</span>
            <span className={styles.statLabel}>UK Sectors</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>Free</span>
            <span className={styles.statLabel}>For Job Seekers</span>
          </div>
        </div>
      </section>

      {/* How It Works — employer focused */}
      <section className={`${styles.howItWorks}`}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Post a job in 3 minutes. Get applicants the same day.</h2>
          <p className={styles.sectionSubtitle}>No agencies, no long contracts — just a simple hiring toolkit</p>

          <div className={`${styles.stepsGrid}`}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Post your job</h3>
              <p className={styles.stepText}>Describe the role, set the salary, and publish. It goes live across all UK sectors instantly.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Review candidates</h3>
              <p className={styles.stepText}>Applications arrive in your dashboard. View CVs, shortlist, and message candidates directly.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Interview & hire</h3>
              <p className={styles.stepText}>Schedule interviews, send offers, and manage your entire pipeline — all in one place.</p>
            </div>
          </div>
        </div>
      </section>

      {/* What You Get — free launch offer */}
      <section className={`${styles.benefits}`}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Everything you need to hire — completely free</h2>
          <p className={styles.sectionSubtitle}>The first 600 employers get 6 months free. No card. No catch.</p>
          <div className={`${styles.benefitsGrid}`}>
            <div className={styles.benefitCard}>
              <div className={styles.benefitIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Post unlimited jobs</h3>
              <p className={styles.stepText}>Publish across all 20 UK sectors. Jobs go live instantly and reach candidates searching in your area.</p>
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
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h3 className={styles.benefitTitle}>Manage your full pipeline</h3>
              <p className={styles.stepText}>Track applications, schedule interviews, send offers, and hire — all from one dashboard. No spreadsheets.</p>
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

      {/* Objection Handling */}
      <section className={`${styles.howItWorks}`}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Why employers switch to Thrive</h2>
          <div className={`${styles.stepsGrid}`}>
            <div className={styles.step}>
              <div className={styles.stepNumber} style={{ background: '#dc2626' }}>✕</div>
              <h3 className={styles.stepTitle}>No more spreadsheets</h3>
              <p className={styles.stepText}>Stop juggling emails, calendars and job boards. Thrive handles your entire hiring pipeline in one place — post, interview, offer, hire.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber} style={{ background: '#dc2626' }}>✕</div>
              <h3 className={styles.stepTitle}>No CV black holes</h3>
              <p className={styles.stepText}>On Indeed and Reed, candidates apply and never hear back. On Thrive, you manage every application with a clear pipeline and direct messaging.</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber} style={{ background: '#dc2626' }}>✕</div>
              <h3 className={styles.stepTitle}>No per-listing costs</h3>
              <p className={styles.stepText}>Other boards charge per job post. On Thrive, post as many jobs as you need — included in your account.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Sectors */}
      <section className={`${styles.sectors}`}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>All UK Sectors Covered</h2>
          <p className={styles.sectionSubtitle}>From accountancy to transport — we cover every industry</p>
          <div className={styles.sectorPills}>
            {['Accountancy & Finance', 'Business & Management', 'Charity', 'Creative & Design', 'Digital & IT', 'Energy & Utilities', 'Engineering', 'Environment & Agriculture', 'Healthcare', 'Hospitality & Tourism', 'Law & Legal', 'Marketing & PR', 'Media', 'Property & Construction', 'Public Services', 'Recruitment & HR', 'Retail & Sales', 'Science', 'Teaching & Education', 'Transport & Logistics'].map(sector => (
              <Link key={sector} href={`/jobs?sector=${encodeURIComponent(sector)}`} className={styles.sectorPill}>{sector}</Link>
            ))}
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
              Claim your free spot →
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
              name: 'Thrive',
              url: 'https://thrivecareers.co.uk',
              potentialAction: {
                '@type': 'SearchAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: 'https://thrivecareers.co.uk/jobs?search={search_term_string}',
                },
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Thrive',
              url: 'https://thrivecareers.co.uk',
              logo: 'https://thrivecareers.co.uk/icon.svg',
              sameAs: ['https://www.linkedin.com/company/thrivecareers'],
            },
          ]),
        }}
      />

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <HoneycombLogo size={24} color="#FFE500" />
            <div className={styles.footerBrandText}>
              <span className={styles.footerLogo}>Thrive</span>
              <span className={styles.footerTagline}>Talent Recruitment</span>
            </div>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
            <Link href="/privacy-policy" className={styles.footerLink}>Privacy Policy</Link>
            <button onClick={() => (window as any).__openCookiePreferences?.()} className={styles.footerLink} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>Cookie Settings</button>
            <Link href="/jobs" className={styles.footerLink}>Browse Jobs</Link>
            <Link href="/subscribe" className={styles.footerLink}>Employer Plans</Link>
            <a href="mailto:contact@thrivecareers.co.uk" className={styles.footerLink}>Contact Us</a>
          </div>
          <p className={styles.footerCopy}>&copy; 2026 Thrive. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
