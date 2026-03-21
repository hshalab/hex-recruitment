'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import StarRating from '@/components/StarRating'
import styles from './page.module.css'

interface FeedbackItem {
  id: string
  rating: number
  comment: string | null
  page_url: string | null
  created_at: string
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminFeedbackPage() {
  const token = useAdminToken()
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<number | null>(null)

  useEffect(() => {
    if (!token) return
    const fetchFeedback = async () => {
      setLoading(true)
      const res = await fetch('/api/admin/feedback', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (Array.isArray(data)) setFeedback(data)
      setLoading(false)
    }
    fetchFeedback()
  }, [token])

  const stats = useMemo(() => {
    const total = feedback.length
    const avg = total > 0
      ? (feedback.reduce((sum, f) => sum + f.rating, 0) / total).toFixed(1)
      : '0.0'
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const thisWeek = feedback.filter(f => new Date(f.created_at).getTime() >= weekAgo).length
    return { total, avg, thisWeek }
  }, [feedback])

  const filtered = filter !== null
    ? feedback.filter(f => f.rating === filter)
    : feedback

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.heading}>User Feedback</h1>
        <p className={styles.loadingText}>Loading feedback...</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>User Feedback</h1>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>Total Responses</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.avg}</div>
          <div className={styles.statLabel}>Average Rating</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.thisWeek}</div>
          <div className={styles.statLabel}>This Week</div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className={styles.filterRow}>
        <button
          className={`${styles.filterPill} ${filter === null ? styles.filterPillActive : ''}`}
          onClick={() => setFilter(null)}
        >
          All
        </button>
        {[5, 4, 3, 2, 1].map(star => (
          <button
            key={star}
            className={`${styles.filterPill} ${filter === star ? styles.filterPillActive : ''}`}
            onClick={() => setFilter(filter === star ? null : star)}
          >
            {star}★
          </button>
        ))}
      </div>

      {/* Feedback List */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>No feedback yet</div>
      ) : (
        <div className={styles.feedbackList}>
          {filtered.map(item => (
            <div key={item.id} className={styles.feedbackCard}>
              <div className={styles.feedbackTop}>
                <StarRating rating={item.rating} size="sm" />
                {item.page_url && (
                  <span className={styles.pagePill}>{item.page_url}</span>
                )}
                <span className={styles.feedbackTime}>{formatRelativeTime(item.created_at)}</span>
              </div>
              {item.comment ? (
                <p className={styles.feedbackComment}>{item.comment}</p>
              ) : (
                <p className={styles.feedbackNoComment}>No comment</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
