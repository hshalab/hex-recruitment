'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { hydrateSessionFromCookies } from '@/lib/hydrateSessionFromCookies'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import { useMessages } from '@/lib/MessagesContext'
import Header from '@/components/Header'
import styles from './page.module.css'

// ── Helpers ─────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatDate(): { day: string; full: string } {
  const now = new Date()
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const full = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return { day, full }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Applied',
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
}

const PIPELINE_STAGES = ['pending', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'] as const

function getStatusStyle(status: string): string {
  if (status === 'pending') return 'statusPending'
  if (status === 'reviewing' || status === 'shortlisted') return 'statusReviewing'
  if (status === 'interview' || status === 'offered' || status === 'hired') return 'statusInterview'
  if (status === 'rejected') return 'statusRejected'
  return 'statusPending'
}



// ── Skeleton placeholder ────────────────────────────────
function SkeletonCard({ height = 120 }: { height?: number }) {
  return <div className={`${styles.skeleton} ${styles.skeletonCard}`} style={{ height }} />
}

// ═════════════════════════════════════════════════════════
// ── Pipeline touch slider (non-passive touch listeners) ──
function PipelineSlider({ stages, stageColors, statusCounts, candidatesByStage, styles }: {
  stages: readonly string[]
  stageColors: Record<string, string>
  statusCounts: Record<string, number>
  candidatesByStage: Record<string, any[]>
  styles: Record<string, string>
}) {
  const router = useRouter()
  const CARD_W = 163
  const VISIBLE = 2.2
  const maxOffset = Math.max(0, (stages.length - VISIBLE) * CARD_W)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const state = React.useRef({ offset: 0, startX: 0, startY: 0, startOffset: 0, lastX: 0, lastT: 0, vel: 0, isHoriz: null as boolean | null, didMove: false, rafId: 0 })

  const clamp = (v: number) => Math.max(0, Math.min(maxOffset, v))
  const setTransform = (x: number) => { if (trackRef.current) trackRef.current.style.transform = `translateX(-${x}px)` }
  const snapTo = (target: number) => {
    const snapped = clamp(Math.round(target / CARD_W) * CARD_W)
    let cur = state.current.offset
    const step = () => {
      cur += (snapped - cur) * 0.12
      if (Math.abs(snapped - cur) < 0.5) { state.current.offset = snapped; setTransform(snapped); return }
      state.current.offset = cur; setTransform(cur)
      state.current.rafId = requestAnimationFrame(step)
    }
    state.current.rafId = requestAnimationFrame(step)
  }

  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const s = state.current
    const onStart = (e: TouchEvent) => {
      cancelAnimationFrame(s.rafId)
      s.startX = e.touches[0].clientX; s.startY = e.touches[0].clientY
      s.startOffset = s.offset; s.lastX = s.startX; s.lastT = Date.now()
      s.vel = 0; s.isHoriz = null; s.didMove = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = s.startX - e.touches[0].clientX
      const dy = s.startY - e.touches[0].clientY
      if (s.isHoriz === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        s.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2
      }
      if (!s.isHoriz) return
      e.preventDefault()
      s.didMove = true
      const now = Date.now(); const dt = now - s.lastT
      if (dt > 0) s.vel = (s.lastX - e.touches[0].clientX) / dt
      s.lastX = e.touches[0].clientX; s.lastT = now
      s.offset = clamp(s.startOffset + dx); setTransform(s.offset)
    }
    const onEnd = (e: TouchEvent) => {
      if (!s.isHoriz) return
      if (!s.didMove || Math.abs(s.startX - e.changedTouches[0].clientX) < 8) {
        const idx = Math.round(s.offset / CARD_W)
        const stage = stages[idx]
        if (stage) router.push(`/my-jobs?filter=${stage === 'interview' ? 'interviewing' : stage === 'offered' ? 'offers' : stage}`)
        return
      }
      snapTo(s.offset + s.vel * 350)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [maxOffset, stages, router])

  return (
    <div style={{ overflow: 'hidden', margin: '0 -1rem', padding: '0 1rem' }}>
      <div ref={trackRef} style={{ display: 'flex', gap: '0.5rem', willChange: 'transform' }}>
        {stages.map(s => {
          const count = statusCounts[s] || 0
          const candidates = candidatesByStage[s] || []
          const color = stageColors[s] || '#6b7280'
          return (
            <Link key={s} href={`/my-jobs?filter=${s === 'interview' ? 'interviewing' : s === 'offered' ? 'offers' : s}`} className={styles.pipelineCard} style={{ borderTopColor: color }}>
              <div className={styles.pipelineCardTop}>
                <span className={styles.pipelineCardCount} style={{ color }}>{count}</span>
                <span className={styles.pipelineCardStage}>{STATUS_LABELS[s]}</span>
              </div>
              <div className={styles.pipelineCardCandidates}>
                {candidates.length === 0 ? (
                  <span className={styles.pipelineCardEmpty}>No candidates</span>
                ) : (
                  candidates.slice(0, 2).map((app: any, i: number) => (
                    <div key={i} className={styles.pipelineCardCandidate}>
                      <span className={styles.pipelineCardName}>{app.candidate_name || 'Candidate'}</span>
                      <span className={styles.pipelineCardJob}>{app.job_title || ''}</span>
                    </div>
                  ))
                )}
                {candidates.length > 3 && (
                  <span className={styles.pipelineCardMore}>+{candidates.length - 3} more</span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Candidate profile card slider (swipe one at a time) ──
function CandidateCardSlider({ apps, totalApplications, styles }: {
  apps: any[]
  totalApplications: number
  styles: Record<string, string>
}) {
  const [current, setCurrent] = React.useState(0)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const state = React.useRef({ startX: 0, startY: 0, isHoriz: null as boolean | null, didMove: false })
  const getInitials = (name: string) => (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const avatarColors = ['#06b6d4','#8b5cf6','#10b981','#f59e0b','#3b82f6','#ec4899','#14b8a6','#e11d48']
  const statusColors: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#fef3c7', text: '#92400e' }, reviewing: { bg: '#dbeafe', text: '#1e40af' },
    shortlisted: { bg: '#ede9fe', text: '#5b21b6' }, interview: { bg: '#cffafe', text: '#0e7490' },
    offered: { bg: '#d1fae5', text: '#065f46' }, hired: { bg: '#dcfce7', text: '#14532d' },
    rejected: { bg: '#fee2e2', text: '#991b1b' },
  }
  const statusLabels: Record<string, string> = {
    pending: 'Applied', reviewing: 'Reviewing', shortlisted: 'Shortlisted',
    interview: 'Interview', offered: 'Offered', hired: 'Hired', rejected: 'Rejected',
  }
  React.useEffect(() => {
    const el = trackRef.current; if (!el) return
    const s = state.current
    const onStart = (e: TouchEvent) => { s.startX = e.touches[0].clientX; s.startY = e.touches[0].clientY; s.isHoriz = null; s.didMove = false }
    const onMove = (e: TouchEvent) => {
      const dx = s.startX - e.touches[0].clientX; const dy = s.startY - e.touches[0].clientY
      if (s.isHoriz === null) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; s.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2 }
      if (!s.isHoriz) return; e.preventDefault(); s.didMove = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!s.isHoriz || !s.didMove) return
      const dx = s.startX - e.changedTouches[0].clientX
      if (dx > 40 && current < apps.length - 1) setCurrent(c => c + 1)
      if (dx < -40 && current > 0) setCurrent(c => c - 1)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd) }
  }, [current, apps.length])

  if (apps.length === 0) return null
  const app = apps[current]
  const initials = getInitials(app.candidate_name || 'C')
  const bgColor = avatarColors[current % avatarColors.length]
  const sc = statusColors[app.status] || { bg: '#f3f4f6', text: '#374151' }
  const label = statusLabels[app.status] || app.status
  const skills = Array.isArray(app.candidate_skills) ? app.candidate_skills.slice(0, 3) : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.75rem' }}>
        <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500 }}>
          {current + 1} of {apps.length}  &middot;  {totalApplications} total
        </span>
        {apps.length > 1 && (
          <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>&larr; swipe &rarr;</span>
        )}
      </div>
      <div ref={trackRef} style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' as const, overflow: 'hidden' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' as const }}>
          {/* ── HEADER: Photo + Name + Facts ── */}
          <div style={{ display: 'flex', gap: '0.75rem', padding: '1.25rem 1rem 1rem', alignItems: 'flex-start' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
              {app.candidate_photo ? <img src={app.candidate_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{app.candidate_name || 'Candidate'}</div>
              {app.candidate_job_title && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{app.candidate_job_title}</div>}
              <span style={{ display: 'inline-block', fontSize: '0.62rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 4, background: sc.bg, color: sc.text, marginTop: '0.2rem' }}>{label}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.4rem', flexShrink: 0, textAlign: 'right' as const }}>
              {app.candidate_city && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>📍 {app.candidate_city}</span>}
              {app.candidate_years_exp && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>⏳ {app.candidate_years_exp} yrs exp</span>}
              {app.candidate_availability && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>✅ {app.candidate_availability}</span>}
              {app.candidate_sector && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>🏢 {app.candidate_sector}</span>}
            </div>
          </div>

          {/* ── BIO ── */}
          <div style={{ padding: '0 1rem 1rem' }}>
            {app.candidate_bio ? (
              <p style={{ fontSize: '0.8rem', color: '#334155', fontStyle: 'italic', lineHeight: 1.5, margin: 0, padding: '0.75rem', background: '#f8fafc', borderRadius: 8, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                &ldquo;{app.candidate_bio.slice(0, 150)}{app.candidate_bio.length > 150 ? '...' : ''}&rdquo;
              </p>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#cbd5e1', fontStyle: 'italic', margin: 0 }}>No bio added — candidate hasn&apos;t completed their profile yet</p>
            )}
          </div>

          {/* ── SKILLS ── */}
          {skills.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', padding: '0 1rem 0.875rem' }}>
              {skills.map((skill: string, i: number) => (
                <span key={i} style={{ fontSize: '0.68rem', padding: '4px 12px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>{skill}</span>
              ))}
            </div>
          )}

          {/* ── APPLIED FOR ── */}
          <div style={{ padding: '0 1rem 1rem' }}>
            <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: 0 }}>
              Applied for: {app.job_title || ''} &middot; {formatRelativeTime(app.created_at)}
            </p>
          </div>

          {/* ── ACTIONS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #e5e7eb' }}>
            <Link href={`/candidates/${app.candidate_id}`} onClick={(e: any) => e.stopPropagation()} style={{ padding: '0.875rem', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', textDecoration: 'none', borderRight: '1px solid #e5e7eb', borderBottomLeftRadius: '16px' }}>View Profile</Link>
            <Link href={`/messages?candidate=${app.candidate_id}`} onClick={(e: any) => e.stopPropagation()} style={{ padding: '0.875rem', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: '#FFE500', background: '#0f172a', textDecoration: 'none', display: 'block', borderBottomRightRadius: '16px' }}>Message</Link>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.3rem', marginTop: '0.75rem' }}>
        {apps.map((_: any, i: number) => (
          <button key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? '20px' : '7px', height: '7px', borderRadius: '4px', background: i === current ? '#0f172a' : '#cbd5e1', border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.2s' }} />
        ))}
      </div>
    </div>
  )
}

// ── Job swipe cards slider (non-passive touch) ──
function JobSlider({ jobs }: { jobs: any[] }) {
  const CARD_W = 176
  const maxOffset = Math.max(0, (jobs.length - 2.2) * CARD_W)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const state = React.useRef({ offset: 0, startX: 0, startY: 0, startOffset: 0, lastX: 0, lastT: 0, vel: 0, isHoriz: null as boolean | null, didMove: false, rafId: 0 })

  const clamp = (v: number) => Math.max(0, Math.min(maxOffset, v))
  const setTransform = (x: number) => { if (trackRef.current) trackRef.current.style.transform = `translateX(-${x}px)` }
  const snapTo = (target: number) => {
    const snapped = clamp(Math.round(target / CARD_W) * CARD_W)
    let cur = state.current.offset
    const step = () => {
      cur += (snapped - cur) * 0.12
      if (Math.abs(snapped - cur) < 0.5) { state.current.offset = snapped; setTransform(snapped); return }
      state.current.offset = cur; setTransform(cur)
      state.current.rafId = requestAnimationFrame(step)
    }
    state.current.rafId = requestAnimationFrame(step)
  }

  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const s = state.current
    const onStart = (e: TouchEvent) => {
      cancelAnimationFrame(s.rafId)
      s.startX = e.touches[0].clientX; s.startY = e.touches[0].clientY
      s.startOffset = s.offset; s.lastX = s.startX; s.lastT = Date.now()
      s.vel = 0; s.isHoriz = null; s.didMove = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = s.startX - e.touches[0].clientX
      const dy = s.startY - e.touches[0].clientY
      if (s.isHoriz === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        s.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2
      }
      if (!s.isHoriz) return
      e.preventDefault()
      s.didMove = true
      const now = Date.now(); const dt = now - s.lastT
      if (dt > 0) s.vel = (s.lastX - e.touches[0].clientX) / dt
      s.lastX = e.touches[0].clientX; s.lastT = now
      s.offset = clamp(s.startOffset + dx); setTransform(s.offset)
    }
    const onEnd = () => {
      if (!s.isHoriz || !s.didMove) return
      snapTo(s.offset + s.vel * 350)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [maxOffset])

  return (
    <div style={{ overflow: 'hidden', margin: '0 -1.25rem', paddingBottom: '0.75rem' }}>
      <div ref={trackRef} style={{ display: 'flex', gap: '0.5rem', willChange: 'transform', paddingLeft: '1.25rem', paddingRight: '3rem', paddingBottom: '0.75rem' }}>
        {jobs.map(job => {
          const appCount = job.application_count || 0
          const fillPct = Math.min((appCount / 20) * 100, 100)
          return (
            <Link key={job.id} href="/my-jobs" style={{ flex: '0 0 164px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.75rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {job.title}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{job.views || 0}</div>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase' as const }}>Views</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{appCount}</div>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase' as const }}>Apps</div>
                </div>
              </div>
              <div style={{ height: 3, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#FFE500', borderRadius: 2, width: `${fillPct}%` }} />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── Messages slider ──
function MessagesSlider({ conversations }: { conversations: any[] }) {
  const CARD_W = 230
  const maxOffset = Math.max(0, (conversations.length - 1.4) * CARD_W)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const state = React.useRef({ offset: 0, startX: 0, startY: 0, startOffset: 0, lastX: 0, lastT: 0, vel: 0, isHoriz: null as boolean | null, didMove: false, rafId: 0 })
  const clamp = (v: number) => Math.max(0, Math.min(maxOffset, v))
  const setTransform = (x: number) => { if (trackRef.current) trackRef.current.style.transform = `translateX(-${x}px)` }
  const snapTo = (target: number) => {
    const snapped = clamp(Math.round(target / CARD_W) * CARD_W)
    let cur = state.current.offset
    const step = () => {
      cur += (snapped - cur) * 0.12
      if (Math.abs(snapped - cur) < 0.5) { state.current.offset = snapped; setTransform(snapped); return }
      state.current.offset = cur; setTransform(cur)
      state.current.rafId = requestAnimationFrame(step)
    }
    state.current.rafId = requestAnimationFrame(step)
  }
  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const s = state.current
    const onStart = (e: TouchEvent) => {
      cancelAnimationFrame(s.rafId)
      s.startX = e.touches[0].clientX; s.startY = e.touches[0].clientY
      s.startOffset = s.offset; s.lastX = s.startX; s.lastT = Date.now()
      s.vel = 0; s.isHoriz = null; s.didMove = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = s.startX - e.touches[0].clientX
      const dy = s.startY - e.touches[0].clientY
      if (s.isHoriz === null) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; s.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2 }
      if (!s.isHoriz) return
      e.preventDefault(); s.didMove = true
      const now = Date.now(); const dt = now - s.lastT
      if (dt > 0) s.vel = (s.lastX - e.touches[0].clientX) / dt
      s.lastX = e.touches[0].clientX; s.lastT = now
      s.offset = clamp(s.startOffset + dx); setTransform(s.offset)
    }
    const onEnd = () => { if (!s.isHoriz || !s.didMove) return; snapTo(s.offset + s.vel * 350) }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd) }
  }, [maxOffset])
  const getInitials = (name: string) => (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ overflow: 'hidden', margin: '0 -1rem', padding: '0 1rem' }}>
      <div ref={trackRef} style={{ display: 'flex', gap: '0.5rem', willChange: 'transform' }}>
        {conversations.map(conv => (
          <Link key={conv.id} href={`/messages?conversation=${conv.id}`} style={{ flex: '0 0 220px', minWidth: 220, background: conv.unreadCount > 0 ? '#fffbeb' : '#fff', border: conv.unreadCount > 0 ? '1px solid #fde68a' : '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem', textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#FFE500' }}>
                  {getInitials(conv.participantName)}
                </div>
                {conv.unreadCount > 0 && (
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '0.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.participantName}</div>
                <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{formatRelativeTime(conv.lastMessageAt)}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
              {conv.lastMessage || 'No messages yet'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// MAIN COMPONENT
// ═════════════════════════════════════════════════════════

export default function EmployerDashboardPage() {
  const router = useRouter()
  const { conversations, totalUnreadCount } = useMessages()

  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 960)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [companyDescription, setCompanyDescription] = useState('')
  const [hasAvailability, setHasAvailability] = useState(false)
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null)
  const [freeUntil, setFreeUntil] = useState<string | null>(null)
  const [dismissChecklist, setDismissChecklist] = useState(false)

  // Stats
  const [totalJobs, setTotalJobs] = useState(0)
  const [activeJobs, setActiveJobs] = useState(0)
  const [totalApplications, setTotalApplications] = useState(0)
  const [totalViews, setTotalViews] = useState(0)
  const [newJobsThisWeek, setNewJobsThisWeek] = useState(0)
  const [newAppsThisWeek, setNewAppsThisWeek] = useState(0)

  // Data
  const [applications, setApplications] = useState<any[]>([])
  const [jobsData, setJobsData] = useState<any[]>([])

  // ── Load data ───────────────────────────────────────────
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let safetyTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const loadDashboardData = async (session: Session) => {
      if (cancelled) return
      if (session.user.user_metadata?.role !== 'employer') {
        router.replace('/dashboard')
        return
      }

      setUser(session.user)
      const userId = session.user.id
      setCompanyName(session.user.user_metadata?.company_name || 'Your Company')

      // Fetch company logo from employer_profiles, fallback to user_metadata
      try {
        const { data: empProfile } = await supabase
          .from('employer_profiles')
          .select('logo_url, description')
          .eq('user_id', userId)
          .maybeSingle()
        if (empProfile?.logo_url) {
          setCompanyLogo(empProfile.logo_url)
        } else if (session.user.user_metadata?.logo_url) {
          setCompanyLogo(session.user.user_metadata.logo_url)
        }
        if (empProfile?.description) {
          setCompanyDescription(empProfile.description)
        }
      } catch { /* employer_profiles may not exist */ }

      // Fetch availability — any active rows mean the employer is set up
      try {
        const { count } = await supabase
          .from('employer_availability')
          .select('id', { count: 'exact', head: true })
          .eq('employer_id', userId)
          .eq('is_active', true)
        setHasAvailability((count || 0) > 0)
      } catch { /* table may not exist */ }

      // Fetch subscription tier
      try {
        const { data: subData } = await supabase
          .from('employer_subscriptions')
          .select('subscription_tier, trial_ends_at')
          .eq('user_id', userId)
          .maybeSingle()
        if (subData) {
          setSubscriptionTier(subData.subscription_tier || null)
          if (subData.subscription_tier === 'free') {
            setFreeUntil(subData.trial_ends_at || null)
          }
        }
      } catch { /* subscription table may not exist */ }

      // Fetch employer's jobs
      try {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, title, status, views, posted_at')
          .eq('employer_id', userId)
          .order('posted_at', { ascending: false })

        if (jobs) {
          setTotalJobs(jobs.length)
          setActiveJobs(jobs.filter(j => j.status === 'active').length)

          const views = jobs.reduce((sum: number, j: any) => sum + (j.views || 0), 0)
          setTotalViews(views)

          // Compute "new jobs this week" badge
          const now = new Date()
          const dayOfWeek = now.getDay() // 0=Sun
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
          const weekStart = new Date(now)
          weekStart.setHours(0, 0, 0, 0)
          weekStart.setDate(now.getDate() + mondayOffset)
          const jobsThisWeek = jobs.filter(j => j.posted_at && new Date(j.posted_at) >= weekStart).length
          setNewJobsThisWeek(jobsThisWeek)

          // Fetch ALL applications for these jobs (no limit — need accurate total count)
          const jobIds = jobs.map(j => j.id)
          if (jobIds.length > 0) {
            try {
              const { data: appData } = await supabase
                .from('job_applications')
                .select('id, job_id, job_title, company, status, created_at, candidate_id')
                .in('job_id', jobIds)
                .order('created_at', { ascending: false })

              if (appData) {
                setTotalApplications(appData.length)

                // Compute "new apps this week" badge
                const appsThisWeek = appData.filter(a => a.created_at && new Date(a.created_at) >= weekStart).length
                setNewAppsThisWeek(appsThisWeek)

                // Build per-job application count map for enriching jobsData
                const appCountByJob: Record<string, number> = {}
                appData.forEach((a: any) => {
                  appCountByJob[a.job_id] = (appCountByJob[a.job_id] || 0) + 1
                })

                // Enrich jobs with real application counts
                const enrichedJobs = jobs.map(j => ({
                  ...j,
                  application_count: appCountByJob[j.id] || 0,
                }))
                setJobsData(enrichedJobs)

                // Keep only the most recent 50 for the pipeline/recent apps display
                const recentApps = appData.slice(0, 50)
                setApplications(recentApps)

                // Enrich with candidate names
                const candidateIds = Array.from(new Set(recentApps.map((a: any) => a.candidate_id).filter(Boolean)))
                if (candidateIds.length > 0) {
                  try {
                    const { data: profiles } = await supabase
                      .from('candidate_profiles')
                      .select('user_id, full_name, profile_picture_url, city, availability, years_experience, job_title, job_sector, skills, bio')
                      .in('user_id', candidateIds)

                    if (profiles) {
                      const nameMap: Record<string, string> = {}
                      const profileExtras: Record<string, any> = {}
                      profiles.forEach((p: any) => {
                        nameMap[p.user_id] = p.full_name
                        profileExtras[p.user_id] = {
                          photo: p.profile_picture_url || null,
                          city: p.city || null,
                          availability: p.availability || null,
                          yearsExp: p.years_experience || null,
                          jobTitle: p.job_title || null,
                          sector: p.job_sector || null,
                          skills: p.skills || [],
                          bio: p.bio || null,
                        }
                      })
                      setApplications(prev => prev.map(a => ({
                        ...a,
                        candidate_name: nameMap[a.candidate_id] || 'Candidate',
                        candidate_photo: profileExtras[a.candidate_id]?.photo || null,
                        candidate_city: profileExtras[a.candidate_id]?.city || null,
                        candidate_availability: profileExtras[a.candidate_id]?.availability || null,
                        candidate_years_exp: profileExtras[a.candidate_id]?.yearsExp || null,
                        candidate_job_title: profileExtras[a.candidate_id]?.jobTitle || null,
                        candidate_sector: profileExtras[a.candidate_id]?.sector || null,
                        candidate_skills: profileExtras[a.candidate_id]?.skills || [],
                        candidate_bio: profileExtras[a.candidate_id]?.bio || null,
                      })))
                    }
                  } catch { /* candidate_profiles may not exist */ }
                }
              } else {
                // No applications — still set jobsData with zero counts
                setJobsData(jobs.map(j => ({ ...j, application_count: 0 })))
              }
            } catch {
              // job_applications table may not exist — set jobsData with zero counts
              setJobsData(jobs.map(j => ({ ...j, application_count: 0 })))
            }
          } else {
            setJobsData([])
          }
        }
      } catch { /* jobs table query failed */ }

      setLoading(false)
    }

    const init = async () => {
      // DEV MODE
      if (DEV_MODE) {
        const mockUser = getMockUser()
        const userType = getMockUserType()

        if (userType !== 'employer') {
          router.replace('/dashboard')
          return
        }

        setUser(mockUser)
        setCompanyName(mockUser?.user_metadata?.company_name || 'Your Company')

        // Load company logo from localStorage profile
        const savedProfile = localStorage.getItem('employerProfile')
        if (savedProfile) {
          const profile = JSON.parse(savedProfile)
          if (profile.logoUrl) setCompanyLogo(profile.logoUrl)
        }

        setTotalJobs(8)
        setActiveJobs(5)
        setTotalApplications(34)
        setTotalViews(287)
        setApplications([
          { id: '1', candidate_name: 'Sarah Johnson', job_title: 'Head Chef', status: 'pending', created_at: new Date(Date.now() - 3600000).toISOString() },
          { id: '2', candidate_name: 'Michael Brown', job_title: 'Sous Chef', status: 'shortlisted', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
          { id: '3', candidate_name: 'Emma Wilson', job_title: 'Pastry Chef', status: 'interview', created_at: new Date(Date.now() - 4 * 86400000).toISOString() },
          { id: '4', candidate_name: 'James Taylor', job_title: 'Kitchen Porter', status: 'hired', created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
          { id: '5', candidate_name: 'Olivia Davis', job_title: 'Waitress', status: 'rejected', created_at: new Date(Date.now() - 8 * 86400000).toISOString() },
        ])
        setJobsData([
          { id: 'j1', title: 'Head Chef', status: 'active', views: 84, application_count: 12 },
          { id: 'j2', title: 'Sous Chef', status: 'active', views: 67, application_count: 9 },
          { id: 'j3', title: 'Pastry Chef', status: 'active', views: 52, application_count: 7 },
        ])
        setLoading(false)
        return
      }

      // PRODUCTION MODE
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        await loadDashboardData(session)
        return
      }

      // No localStorage session — try to hydrate from the chunked cookies
      // written by the server OAuth callback. This is the common case on the
      // first load after Google sign-in: server cookies are present but
      // localStorage is empty until we call refreshSession.
      const hydrated = await hydrateSessionFromCookies()
      if (hydrated) {
        await loadDashboardData(hydrated)
        return
      }

      // No cookies either — check if we're still inside an OAuth flow (the
      // oauth_intended_role cookie is set by the sign-in button and cleared
      // when the callback completes).
      const oauthCookie = typeof window !== 'undefined'
        ? document.cookie.includes('oauth_intended_role')
        : false

      if (!oauthCookie) {
        router.push('/login/employer')
        return
      }

      // Still mid-OAuth — fall back to auth-state subscription as a last resort
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, authSession) => {
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && authSession) {
            subscription.unsubscribe()
            if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
            await loadDashboardData(authSession)
          }
        }
      )
      unsubscribe = () => subscription.unsubscribe()

      // Safety timeout — if no session after 15s, redirect
      safetyTimer = setTimeout(() => {
        subscription.unsubscribe()
        if (!cancelled) router.push('/login/employer')
      }, 15000)
    }

    init()
    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
      if (safetyTimer) clearTimeout(safetyTimer)
    }
  }, [router])

  // ── Derived data ────────────────────────────────────────

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    PIPELINE_STAGES.forEach(s => { counts[s] = 0 })
    applications.forEach(a => {
      const s = (a.status || 'pending').toLowerCase()
      if (counts[s] !== undefined) counts[s]++
      else counts['pending']++
    })
    return counts
  }, [applications])

  const candidatesByStage = useMemo(() => {
    const map: Record<string, typeof applications> = {}
    PIPELINE_STAGES.forEach(s => { map[s] = [] })
    applications.forEach(app => {
      const s = (app.status || 'pending').toLowerCase()
      if (map[s]) map[s].push(app)
      else map['pending'].push(app)
    })
    return map
  }, [applications])

  const recentApps = useMemo(() => applications.slice(0, 10), [applications])

  const activeJobsList = useMemo(() =>
    jobsData.filter(j => j.status === 'active').slice(0, 10)
  , [jobsData])

  const recentConversations = useMemo(() =>
    [...conversations]
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)
  , [conversations])

  const staleApplications = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
    return applications.filter(a =>
      a.status === 'pending' && new Date(a.created_at || a.appliedAt || '').getTime() < cutoff
    ).length
  }, [applications])

  const dateInfo = formatDate()

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <main className={styles.pageBackground}>
        <Header />
        <div className={styles.dashboardWrap}>
          <div className={styles.welcomeHeader}>
            <div className={styles.welcomeLeft}>
              <div className={`${styles.skeleton} ${styles.skeletonCircle}`} />
              <div style={{ flex: 1 }}>
                <div className={`${styles.skeleton} ${styles.skeletonLine}`} style={{ width: '220px' }} />
                <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} style={{ width: '150px' }} />
              </div>
            </div>
          </div>
          <SkeletonCard height={60} />
          <div className={styles.grid}>
            <div className={styles.colLeft}>
              <SkeletonCard height={260} />
              <SkeletonCard height={200} />
            </div>
            <div className={styles.colRight}>
              <SkeletonCard height={200} />
              <SkeletonCard height={180} />
            </div>
          </div>
        </div>
      </main>
    )
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'

  return (
    <main className={styles.pageBackground}>
      <Header />

      <div className={styles.dashboardWrap}>
        {/* ── WELCOME HEADER ─────────────────────────────── */}
        <div className={styles.welcomeHeader}>
          <div className={styles.welcomeLeft}>
            <div className={styles.avatarPlaceholder}>
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className={styles.avatarImage} />
              ) : (
                getInitials(companyName || displayName)
              )}
            </div>
            <div className={styles.welcomeText}>
              <h1>{getGreeting()}, {displayName.split(' ')[0]}</h1>
              <p className={styles.companyLabel}>{companyName}</p>
              <p className={styles.welcomeSub}>Here&apos;s what&apos;s happening with your jobs today</p>
            </div>
          </div>
          <div className={styles.welcomeDate}>
            <span className={styles.welcomeDateDay}>{dateInfo.day}</span>
            {dateInfo.full}
          </div>
        </div>

        {/* ── STATS STRIP ── */}
        <div className={styles.statsStrip}>
          <button className={styles.statPill} onClick={() => router.push('/my-jobs')}>
            <span className={styles.statPillNum}>{activeJobs}</span>
            <span className={styles.statPillLabel}>Active Jobs</span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/my-jobs')}>
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span className={styles.statPillNum}>{totalApplications}</span>
              {newAppsThisWeek > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -12, minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: '0.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #fff' }}>
                  {newAppsThisWeek > 99 ? '99+' : newAppsThisWeek}
                </span>
              )}
            </span>
            <span className={styles.statPillLabel}>Applications</span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/my-jobs?filter=interviewing')}>
            <span className={styles.statPillNum}>{statusCounts['interviewing'] || 0}</span>
            <span className={styles.statPillLabel}>Interviewing</span>
          </button>
          <div className={styles.statPillDivider} />
          <button className={styles.statPill} onClick={() => router.push('/messages')}>
            <span className={styles.statPillNum}>{totalViews}</span>
            <span className={styles.statPillLabel}>Views</span>
          </button>
        </div>

        {/* ── GETTING STARTED CHECKLIST ───────────────── */}
        {(() => {
          const hasLogo = !!companyLogo
          const hasJob = totalJobs > 0
          const hasDescription = companyDescription.length > 50
          const allDone = hasLogo && hasJob && hasDescription && hasAvailability
          if (dismissChecklist || allDone) return null
          const completed = [hasLogo, hasJob, hasDescription, hasAvailability].filter(Boolean).length
          return (
            <div className={styles.checklistCard}>
              <button className={styles.checklistDismiss} onClick={() => setDismissChecklist(true)} aria-label="Dismiss">×</button>
              <h3 className={styles.checklistHeading}>Get started with Thrive</h3>
              <p className={styles.checklistSub}>Complete these steps to start finding great candidates</p>
              <div className={styles.checklistItems}>
                <div className={styles.checklistItem}>
                  <span className={`${styles.checklistDot} ${hasLogo ? styles.checklistDotDone : ''}`} />
                  <span className={styles.checklistLabel}>Add your company logo</span>
                  {!hasLogo && <Link href="/settings/company" className={styles.checklistAction}>Add logo →</Link>}
                </div>
                <div className={styles.checklistItem}>
                  <span className={`${styles.checklistDot} ${hasJob ? styles.checklistDotDone : ''}`} />
                  <span className={styles.checklistLabel}>Post your first job</span>
                  {!hasJob && <Link href="/post-job" className={styles.checklistAction}>Post a job →</Link>}
                </div>
                <div className={styles.checklistItem}>
                  <span className={`${styles.checklistDot} ${hasDescription ? styles.checklistDotDone : ''}`} />
                  <span className={styles.checklistLabel}>Complete your company profile</span>
                  {!hasDescription && <Link href="/settings/company" className={styles.checklistAction}>Complete profile →</Link>}
                </div>
                <div className={styles.checklistItem}>
                  <span className={`${styles.checklistDot} ${hasAvailability ? styles.checklistDotDone : ''}`} />
                  <span className={styles.checklistLabel}>Set up interview availability</span>
                  {!hasAvailability && <Link href="/settings/availability" className={styles.checklistAction}>Set up →</Link>}
                </div>
              </div>
              <p className={styles.checklistProgress}>{completed} of 4 steps complete</p>
            </div>
          )
        })()}

        {/* ── STALE APPLICATIONS NUDGE ────────────────── */}
        {staleApplications > 0 && (
          <div className={styles.staleNudge}>
            <span className={styles.staleNudgeIcon}>⏳</span>
            <div className={styles.staleNudgeText}>
              <strong>{staleApplications} application{staleApplications !== 1 ? 's' : ''}</strong> {staleApplications !== 1 ? 'have' : 'has'} been waiting for review for over 2 weeks.
            </div>
            <Link href="/my-jobs" className={styles.staleNudgeLink}>Review now →</Link>
          </div>
        )}

        {/* ── AVAILABILITY NUDGE ─────────────────────────── */}
        {!hasAvailability && totalJobs > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              padding: '0.85rem 1.1rem',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '10px',
              marginBottom: '1.25rem',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>📅</span>
            <div style={{ flex: 1, fontSize: '0.9rem', color: '#92400e' }}>
              <strong>Enable interview scheduling.</strong> Set your available hours so candidates can book interviews directly through Thrive.
            </div>
            <Link
              href="/settings/availability"
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#b45309',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Set up availability →
            </Link>
          </div>
        )}


        <div className={styles.grid}>

          {/* ── FULL WIDTH: Pipeline ── */}
          <div className={styles.colFull}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Application Pipeline</h2>
                <Link href="/pipeline" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.pipelineScroller}>
                  {PIPELINE_STAGES.filter(s => s !== 'rejected').map(s => {
                    const count = statusCounts[s] || 0
                    const candidates = candidatesByStage[s] || []
                    const stageColors: Record<string, string> = {
                      pending: '#f59e0b', reviewing: '#3b82f6', shortlisted: '#8b5cf6',
                      interview: '#06b6d4', offered: '#10b981', hired: '#16a34a',
                    }
                    const color = stageColors[s] || '#6b7280'
                    return (
                      <Link key={s} href={`/my-jobs?filter=${s === 'interview' ? 'interviewing' : s === 'offered' ? 'offers' : s}`} className={styles.pipelineCard} style={{ borderTopColor: color }}>
                        <div className={styles.pipelineCardTop}>
                          <span className={styles.pipelineCardCount} style={{ color }}>{count}</span>
                          <span className={styles.pipelineCardStage}>{STATUS_LABELS[s]}</span>
                        </div>
                        <div className={styles.pipelineCardCandidates}>
                          {candidates.length === 0 ? (
                            <span className={styles.pipelineCardEmpty}>No candidates</span>
                          ) : (
                            candidates.slice(0, 2).map((app: any, i: number) => (
                              <div key={i} className={styles.pipelineCardCandidate}>
                                <span className={styles.pipelineCardName}>{app.candidate_name || 'Candidate'}</span>
                                <span className={styles.pipelineCardJob}>{app.job_title || ''}</span>
                              </div>
                            ))
                          )}
                          {candidates.length > 2 && <span className={styles.pipelineCardMore}>+{candidates.length - 2} more</span>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>


          {/* ── LEFT COLUMN: Active Jobs ── */}
          <div className={styles.colLeft}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Active Jobs</h2>
                <Link href="/my-jobs" className={styles.cardLink}>Manage Jobs</Link>
              </div>
              <div className={styles.cardBody}>
                {activeJobsList.length > 0 ? (
                  <div className={styles.jobList}>
                    {activeJobsList.map((job: any) => {
                      const appCount = job.application_count || 0
                      const fillPct = Math.min((appCount / 20) * 100, 100)
                      return (
                        <Link href="/my-jobs" key={job.id} className={styles.jobItem}>
                          <div className={styles.jobItemInfo}>
                            <h4>{job.title}</h4>
                            <div className={styles.jobItemMeta}>
                              <div className={styles.jobProgressWrap}>
                                <div className={styles.jobProgressLabel}>{appCount} apps</div>
                                <div className={styles.jobProgressBar}>
                                  <div className={styles.jobProgressFill} style={{ width: `${fillPct}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className={styles.jobItemStats}>
                            <div className={styles.jobItemStat}>
                              <span className={styles.jobItemStatNum}>{job.views || 0}</span>
                              <span className={styles.jobItemStatLabel}>Views</span>
                            </div>
                            <div className={styles.jobItemStat}>
                              <span className={styles.jobItemStatNum}>{appCount}</span>
                              <span className={styles.jobItemStatLabel}>Apps</span>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128188;</div>
                    <p>No active jobs. Post your first listing!</p>
                    <Link href="/post-job" className={styles.cardLink}>Post a Job &rarr;</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Messages + Applicants (desktop only via CSS) ── */}
          <div className={styles.colRight}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Messages</h2>
                <Link href="/messages" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {recentConversations.length > 0 ? (
                  <div className={styles.msgList}>
                    {recentConversations.map((conv: any) => (
                      <Link href="/messages" key={conv.id} className={styles.msgItem}>
                        <div className={styles.msgAvatarWrap}>
                          <div className={styles.msgAvatar}>
                            {conv.participantName ? getInitials(conv.participantName) : '?'}
                          </div>
                          <span className={conv.unreadCount > 0 ? styles.msgOnline : styles.msgOffline} />
                        </div>
                        <div className={styles.msgContent}>
                          <p className={styles.msgSender}>
                            {conv.unreadCount > 0 && <span className={styles.unreadDot} />}
                            {conv.participantName}
                          </p>
                          <p className={styles.msgPreview}>{conv.lastMessage}</p>
                        </div>
                        <span className={styles.msgTime}>{formatRelativeTime(conv.lastMessageAt)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128172;</div>
                    <p>No messages yet.</p>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Applicants</h2>
                <Link href="/my-jobs" className={styles.cardLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {applications.length > 0 ? (
                  <div className={styles.recentApps}>
                    <p className={styles.previewLabel}>{totalApplications} total applications</p>
                    {recentApps.map((app: any) => (
                      <Link href={`/my-jobs/${app.job_id}/applications`} key={app.id} className={styles.appCard}>
                        <div className={styles.appCardInfo}>
                          <h4>{app.candidate_name || 'Candidate'}</h4>
                          <p>{app.job_title || 'Position'} &middot; {formatRelativeTime(app.created_at)}</p>
                        </div>
                        <div className={styles.appCardRight}>
                          <span className={`${styles.statusBadge} ${styles[getStatusStyle(app.status)]}`}>
                            {STATUS_LABELS[app.status] || app.status}
                          </span>
                          <span className={styles.appChevron}>&rsaquo;</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>&#128196;</div>
                    <p>No applications yet.</p>
                    <Link href="/post-job" className={styles.cardLink}>Post a Job &rarr;</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── MOBILE ONLY: Active Jobs 2-col grid ── */}
          {isMobile && (
            <div className={styles.colFull}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Active Jobs</h2>
                  <Link href="/my-jobs" className={styles.cardLink}>Manage Jobs</Link>
                </div>
                <div className={styles.cardBody}>
                  {activeJobsList.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.375rem', width: '100%', boxSizing: 'border-box' as const }}>
                      {activeJobsList.map((job: any) => {
                        const appCount = job.application_count || 0
                        const fillPct = Math.min((appCount / 20) * 100, 100)
                        return (
                          <Link key={job.id} href="/my-jobs" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.625rem', textDecoration: 'none', color: 'inherit', boxSizing: 'border-box' as const, width: '100%', overflow: 'hidden' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
                              <div style={{ height: 3, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', marginTop: '0.25rem' }}><div style={{ height: '100%', background: '#FFE500', borderRadius: 2, width: `${fillPct}%` }} /></div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                              <div style={{ textAlign: 'center' as const }}><div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>{job.views || 0}</div><div style={{ fontSize: '0.5rem', color: '#94a3b8', textTransform: 'uppercase' as const }}>Views</div></div>
                              <div style={{ textAlign: 'center' as const }}><div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>{appCount}</div><div style={{ fontSize: '0.5rem', color: '#94a3b8', textTransform: 'uppercase' as const }}>Apps</div></div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>&#128188;</div>
                      <p>No active jobs.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── MOBILE ONLY: Candidate card slider ── */}
          {isMobile && (
            <div className={styles.colFull}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Recent Applicants</h2>
                  <Link href="/my-jobs" className={styles.cardLink}>View All</Link>
                </div>
                <div className={styles.cardBody}>
                  {applications.length > 0 ? (
                    <CandidateCardSlider apps={recentApps} totalApplications={totalApplications} styles={styles} />
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>&#128196;</div>
                      <p>No applications yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── MOBILE ONLY: Messages stacked list ── */}
          {isMobile && (
            <div className={styles.colFull}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Recent Messages</h2>
                  <Link href="/messages" className={styles.cardLink}>View All</Link>
                </div>
                <div className={styles.cardBody}>
                  {recentConversations.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', width: '100%' }}>
                      {recentConversations.map((conv: any) => (
                        <Link href="/messages" key={conv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: conv.unreadCount > 0 ? '#fffbeb' : '#fff', border: conv.unreadCount > 0 ? '1px solid #fde68a' : '1px solid #e5e7eb', borderRadius: '12px', textDecoration: 'none', color: 'inherit', boxSizing: 'border-box' as const, width: '100%', overflow: 'hidden' }}>
                          <div style={{ position: 'relative' as const, flexShrink: 0 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#FFE500' }}>
                              {(conv.participantName || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            {conv.unreadCount > 0 && <div style={{ position: 'absolute' as const, top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: '0.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{conv.unreadCount}</div>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>{conv.participantName}</div>
                            <div style={{ fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'calc(100vw - 140px)' }}>{conv.lastMessage || 'No messages yet'}</div>
                          </div>
                          <span style={{ fontSize: '0.62rem', color: '#94a3b8', flexShrink: 0 }}>{formatRelativeTime(conv.lastMessageAt)}</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>&#128172;</div>
                      <p>No messages yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  )
}
