'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import StarRating from './StarRating'
import styles from './FeedbackWidget.module.css'

type UserRole = 'employer' | 'employee' | null

const CANDIDATE_QUESTIONS = [
  { id: 'q2', label: 'How easy was it to find relevant jobs?', options: ['Very easy', 'Easy', 'OK', 'Difficult', 'Very difficult'] },
  { id: 'q3', label: 'How straightforward was applying for a job?', options: ['Very easy', 'Easy', 'OK', 'Difficult', 'Very difficult'] },
  { id: 'q4', label: 'How does Hex compare to other job sites you\'ve used?', options: ['Much better', 'Better', 'About the same', 'Worse', 'Much worse'] },
  { id: 'q5', label: 'Would you recommend Hex to someone looking for work?', options: ['Yes definitely', 'Maybe', 'No'] },
]

const EMPLOYER_QUESTIONS = [
  { id: 'q2', label: 'How easy was posting your first job?', options: ['Very easy', 'Easy', 'OK', 'Difficult', 'Very difficult'] },
  { id: 'q3', label: 'How useful is the candidate search and pipeline?', options: ['Very useful', 'Useful', 'Somewhat', 'Not useful', 'Haven\'t used it'] },
  { id: 'q4', label: 'How does Hex compare to recruitment agencies or other tools?', options: ['Much better', 'Better', 'About the same', 'Worse', 'Much worse'] },
  { id: 'q5', label: 'Would you recommend Hex to another business owner?', options: ['Yes definitely', 'Maybe', 'No'] },
]

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [role, setRole] = useState<UserRole>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const r = session?.user?.user_metadata?.role
      if (r === 'employer' || r === 'employee') setRole(r)
    })
  }, [])

  const questions = role === 'employer' ? EMPLOYER_QUESTIONS : role === 'employee' ? CANDIDATE_QUESTIONS : []

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please leave a star rating')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      let body: Record<string, unknown>
      if (role) {
        body = {
          rating,
          comment: JSON.stringify({
            type: role === 'employer' ? 'employer-questionnaire' : 'candidate-questionnaire',
            q2: answers.q2 || null,
            q3: answers.q3 || null,
            q4: answers.q4 || null,
            q5: answers.q5 || null,
            notes: comment.trim() || null,
          }),
          pageUrl: window.location.pathname,
        }
      } else {
        body = {
          rating,
          comment: comment.trim() || null,
          pageUrl: window.location.pathname,
        }
      }
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed')
      setSubmitted(true)
      setTimeout(() => {
        setIsOpen(false)
        setSubmitted(false)
        setRating(0)
        setComment('')
        setAnswers({})
      }, 3000)
    } catch {
      setError('Something went wrong, please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpen = () => {
    setIsOpen(true)
    setError('')
    setSubmitted(false)
  }

  return (
    <div className={styles.wrapper}>
      {isOpen && (
        <div className={`${styles.panel} ${role ? styles.panelWide : ''}`}>
          {/* Sticky header */}
          <div className={styles.panelHeader}>
            <span className={styles.panelHeaderTitle}>
              {submitted ? '' : role ? (role === 'employer' ? 'How\u2019s Hex working for you?' : 'How\u2019s your experience so far?') : 'Share your feedback'}
            </span>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)} aria-label="Close">&times;</button>
          </div>

          {submitted ? (
            <div className={styles.thanks}>
              Thanks for your feedback! It helps us make Hex better.
            </div>
          ) : (
            <>
              {role ? (
                /* ── Questionnaire for logged-in users ── */
                <>
                  <p className={styles.subtext}>
                    {role === 'employer' ? 'Takes 2 minutes — helps us build what you need' : 'Takes 2 minutes — helps us improve Hex for you'}
                  </p>

                  <div className={styles.qBlock}>
                    <p className={styles.qLabel}>Overall, how would you rate Hex?</p>
                    <StarRating rating={rating} interactive size="md" onRate={r => { setRating(r); setError('') }} />
                    {error && <p className={styles.error}>{error}</p>}
                  </div>

                  {questions.map(q => (
                    <div key={q.id} className={styles.qBlock}>
                      <p className={styles.qLabel}>{q.label}</p>
                      <div className={styles.pillRow}>
                        {q.options.map(opt => (
                          <button
                            key={opt}
                            className={`${styles.optionPill} ${answers[q.id] === opt ? styles.optionPillActive : ''}`}
                            onClick={() => setAnswers(prev => ({ ...prev, [q.id]: prev[q.id] === opt ? '' : opt }))}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className={styles.qBlock}>
                    <p className={styles.qLabel}>
                      {role === 'employer'
                        ? 'What feature would make the biggest difference to you? (optional)'
                        : 'Anything we could do better? (optional)'}
                    </p>
                    <textarea
                      className={styles.textarea}
                      placeholder={role === 'employer'
                        ? 'E.g. better candidate filtering, WhatsApp notifications, video interviews...'
                        : 'Tell us what\'s missing or what could be improved...'}
                      maxLength={500}
                      rows={3}
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                    />
                  </div>

                  <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Sending...' : 'Send feedback'}
                  </button>
                </>
              ) : (
                /* ── Simple star rating for logged-out users ── */
                <>
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
              )}
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
