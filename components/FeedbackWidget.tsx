'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import StarRating from './StarRating'
import styles from './FeedbackWidget.module.css'

const BETA_TESTERS = ['sarah.ludbrook@fenwayxn.com']

type ChecklistItem = {
  id: string
  label: string
  note?: string
  rating: 'good' | 'warn' | 'bad' | null
  checked: boolean
}

const CHECKLIST_SECTIONS: { title: string; items: Omit<ChecklistItem, 'rating' | 'checked'>[] }[] = [
  {
    title: 'Registration & login',
    items: [
      { id: 'r1', label: 'Register as a new candidate at /register/employee', note: 'Check welcome email arrives' },
      { id: 'r2', label: 'Log out and back in — tick Remember me', note: 'Close browser, reopen — should stay logged in' },
      { id: 'r3', label: 'Use Forgot password on the login page', note: 'Email should arrive with working reset link' },
    ],
  },
  {
    title: 'Candidate dashboard',
    items: [
      { id: 'd1', label: 'Dashboard loads with your name and profile info' },
      { id: 'd2', label: 'Search bar on dashboard — search for a job title', note: 'Should take you to jobs page with results' },
      { id: 'd3', label: 'Profile completion section shows correctly' },
      { id: 'd4', label: 'Recommended jobs section shows relevant roles' },
    ],
  },
  {
    title: 'Job search',
    items: [
      { id: 'j1', label: 'Browse all jobs — 2-column card grid loads', note: 'Cards should be compact and consistent' },
      { id: 'j2', label: 'Click a job card — detail panel slides in from right' },
      { id: 'j3', label: 'Filter by Remote / Hybrid / On-site pills' },
      { id: 'j4', label: 'Search by keyword and location' },
      { id: 'j5', label: 'Save a job using the star icon', note: 'Check it appears in Saved Jobs' },
      { id: 'j6', label: 'Apply Now — complete the full application flow', note: 'CV attached, cover note, confirmation shown' },
      { id: 'j7', label: 'Jobs page works correctly on mobile', note: 'Single column, modal slides up from bottom' },
    ],
  },
  {
    title: 'Profile & settings',
    items: [
      { id: 'p1', label: 'Complete your profile at /settings/profile', note: 'Photo, bio, skills, work history' },
      { id: 'p2', label: 'Upload a CV — check it saves correctly' },
      { id: 'p3', label: 'Set up a job alert for a role type' },
    ],
  },
  {
    title: 'Messaging',
    items: [
      { id: 'm1', label: 'Messages page loads — conversations visible' },
      { id: 'm2', label: 'Send a message — appears in thread correctly' },
    ],
  },
  {
    title: 'Overall UX & design',
    items: [
      { id: 'u1', label: 'Homepage — professional look, CTA buttons visible above fold' },
      { id: 'u2', label: 'Navigation — all menu items work correctly' },
      { id: 'u3', label: 'Test on your phone — general mobile feel', note: 'Header, dashboard, job search on mobile' },
      { id: 'u4', label: 'Feedback widget visible — sits left of Hex chatbot icon' },
      { id: 'u5', label: 'Hex chatbot — opens and responds correctly' },
      { id: 'u6', label: 'Page load speed feels fast throughout' },
    ],
  },
]

const TOTAL_ITEMS = CHECKLIST_SECTIONS.reduce((sum, s) => sum + s.items.length, 0)

function buildInitialChecklist(): ChecklistItem[] {
  return CHECKLIST_SECTIONS.flatMap(s =>
    s.items.map(i => ({ ...i, rating: null, checked: false }))
  )
}

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Beta tester state
  const [isBetaTester, setIsBetaTester] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [activeTab, setActiveTab] = useState<'feedback' | 'checklist'>('checklist')
  const [checklist, setChecklist] = useState<ChecklistItem[]>(buildInitialChecklist)
  const [additionalNotes, setAdditionalNotes] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email || ''
      setUserEmail(email)
      setIsBetaTester(BETA_TESTERS.includes(email.toLowerCase()))
    })
  }, [])

  const checkedCount = checklist.filter(i => i.checked).length

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a rating')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || null,
          pageUrl: window.location.pathname,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setSubmitted(true)
      setTimeout(() => {
        setIsOpen(false)
        setSubmitted(false)
        setRating(0)
        setComment('')
      }, 2000)
    } catch {
      setError('Something went wrong, please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChecklistSubmit = async () => {
    setError('')
    setSubmitting(true)
    try {
      const goodCount = checklist.filter(i => i.rating === 'good').length
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'beta-checklist',
          testerEmail: userEmail,
          rating: Math.round((goodCount / TOTAL_ITEMS) * 5),
          comment: JSON.stringify({
            results: checklist.map(i => ({ id: i.id, label: i.label, checked: i.checked, rating: i.rating })),
            notes: additionalNotes.trim(),
            completedAt: new Date().toISOString(),
          }),
          pageUrl: window.location.pathname,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setSubmitted(true)
      setTimeout(() => {
        setIsOpen(false)
        setSubmitted(false)
      }, 3000)
    } catch {
      setError('Something went wrong, please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const updateItem = (id: string, updates: Partial<ChecklistItem>) => {
    setChecklist(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
  }

  const handleOpen = () => {
    setIsOpen(true)
    setError('')
    setSubmitted(false)
    if (isBetaTester) setActiveTab('checklist')
  }

  const renderFeedbackTab = () => (
    <>
      <h3 className={styles.heading}>Share your feedback</h3>
      <p className={styles.subtext}>How&apos;s your experience on this page?</p>
      <StarRating rating={rating} interactive size="md" onRate={r => { setRating(r); setError('') }} />
      {error && <p className={styles.error}>{error}</p>}
      <textarea
        className={styles.textarea}
        placeholder="What do you like or dislike? (optional)"
        maxLength={500}
        rows={4}
        value={comment}
        onChange={e => setComment(e.target.value)}
      />
      <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Sending...' : 'Send feedback'}
      </button>
    </>
  )

  const renderChecklistTab = () => {
    let itemIndex = 0
    return (
      <>
        {/* Progress bar */}
        <div className={styles.clProgress}>
          <div className={styles.clProgressBar}>
            <div className={styles.clProgressFill} style={{ width: `${(checkedCount / TOTAL_ITEMS) * 100}%` }} />
          </div>
          <span className={styles.clProgressText}>{checkedCount} of {TOTAL_ITEMS} items checked</span>
        </div>

        {/* Sections */}
        {CHECKLIST_SECTIONS.map(section => (
          <div key={section.title} className={styles.clSection}>
            <h4 className={styles.clSectionTitle}>{section.title}</h4>
            {section.items.map(sectionItem => {
              itemIndex++
              const item = checklist.find(c => c.id === sectionItem.id)!
              return (
                <div key={item.id} className={styles.clItem}>
                  <div className={styles.clItemTop}>
                    <label className={styles.clCheckLabel}>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => updateItem(item.id, { checked: !item.checked })}
                        className={styles.clCheckbox}
                      />
                      <span className={item.checked ? styles.clLabelDone : undefined}>{item.label}</span>
                    </label>
                  </div>
                  {item.note && <p className={styles.clNote}>{item.note}</p>}
                  <div className={styles.clRatings}>
                    {(['good', 'warn', 'bad'] as const).map(r => (
                      <button
                        key={r}
                        className={`${styles.clRatingBtn} ${item.rating === r ? styles[`clRating_${r}`] : ''}`}
                        onClick={() => updateItem(item.id, { rating: item.rating === r ? null : r, checked: true })}
                      >
                        {r === 'good' ? 'Works great' : r === 'warn' ? 'Minor issue' : 'Broken'}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {/* Additional notes */}
        <div className={styles.clSection}>
          <h4 className={styles.clSectionTitle}>Notes</h4>
          <textarea
            className={styles.textarea}
            placeholder="Any additional comments or suggestions..."
            rows={4}
            value={additionalNotes}
            onChange={e => setAdditionalNotes(e.target.value)}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.submitBtn} onClick={handleChecklistSubmit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit beta feedback'}
        </button>
      </>
    )
  }

  return (
    <div className={styles.wrapper}>
      {isOpen && (
        <div className={`${styles.panel} ${isBetaTester && activeTab === 'checklist' ? styles.panelWide : ''}`}>
          {submitted ? (
            <div className={styles.thanks}>
              {isBetaTester && activeTab === 'checklist'
                ? 'Thanks Sarah! Your feedback has been submitted. Paul will review it shortly.'
                : 'Thanks for your feedback! \ud83c\udf89'}
            </div>
          ) : (
            <>
              <button className={styles.closeBtn} onClick={() => setIsOpen(false)} aria-label="Close">\u00d7</button>

              {isBetaTester && (
                <div className={styles.tabBar}>
                  <button
                    className={`${styles.tab} ${activeTab === 'feedback' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('feedback')}
                  >
                    Quick Feedback
                  </button>
                  <button
                    className={`${styles.tab} ${activeTab === 'checklist' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('checklist')}
                  >
                    Beta Checklist
                  </button>
                </div>
              )}

              {activeTab === 'feedback' || !isBetaTester ? renderFeedbackTab() : renderChecklistTab()}
            </>
          )}
        </div>
      )}
      <button className={styles.pill} onClick={handleOpen}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Feedback
      </button>
    </div>
  )
}
