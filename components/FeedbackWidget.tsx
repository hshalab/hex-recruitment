'use client'

import { useState } from 'react'
import StarRating from './StarRating'
import styles from './FeedbackWidget.module.css'

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

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

  const handleOpen = () => {
    setIsOpen(true)
    setError('')
    setSubmitted(false)
  }

  return (
    <div className={styles.wrapper}>
      {isOpen && (
        <div className={styles.panel}>
          {submitted ? (
            <div className={styles.thanks}>Thanks for your feedback! 🎉</div>
          ) : (
            <>
              <button className={styles.closeBtn} onClick={() => setIsOpen(false)} aria-label="Close">×</button>
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
              <button
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Sending...' : 'Send feedback'}
              </button>
            </>
          )}
        </div>
      )}
      <button className={styles.pill} onClick={handleOpen}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Feedback
      </button>
    </div>
  )
}
