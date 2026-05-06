'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import DeclineModal from '@/components/DeclineModal'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import BackwardToInterviewModal, { type BackwardToInterviewChoice } from '@/components/BackwardToInterviewModal'
import Toast from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

// DECLINED is appended at the end and rendered with a muted neutral
// accent — the column reads as an outcome (end-state), not punishment.
// Drag is disabled both ways; status changes to/from 'rejected' happen
// only via the kebab menu (Decline opens the template-aware modal,
// Restore returns the card to Reviewing silently).
const STAGES = [
  { id: 'reviewing', label: 'Reviewing', color: '#3b82f6' },
  { id: 'shortlisted', label: 'Shortlisted', color: '#8b5cf6' },
  { id: 'interview', label: 'Interview', color: '#06b6d4' },
  { id: 'offered', label: 'Offered', color: '#10b981' },
  { id: 'hired', label: 'Hired', color: '#16a34a' },
  { id: 'rejected', label: 'Declined', color: '#6B7280' },
]

// Forward-direction order. Indices match the kanban layout above (rejected
// is intentionally excluded — it's reached via the modal, never the drag).
// Used to detect backward drags that need the confirm dialog.
const STAGE_ORDER = ['reviewing', 'shortlisted', 'interview', 'offered', 'hired'] as const

function stageIndex(status: string): number {
  return STAGE_ORDER.indexOf(status as typeof STAGE_ORDER[number])
}

// Turn the rows the cascade trigger wrote during this move into a
// human-readable toast. Empty array → silent forward move with no
// dependants → fall back to a generic "Moved to {stage}".
interface CascadeLogRow {
  cascade_kind: string
  details: { count?: number } | null
}
function summarizeCascade(rows: CascadeLogRow[], stageLabel: string): string {
  if (!rows.length) return `Moved to ${stageLabel}.`
  const parts: string[] = []
  let interviewsCompleted = 0
  let interviewsCancelled = 0
  let offerAccepted = false
  let offerWithdrawn = false
  let backward = false
  for (const r of rows) {
    const n = r.details?.count ?? 1
    if (r.cascade_kind === 'interview_completed') interviewsCompleted += n
    else if (r.cascade_kind === 'interview_cancelled') interviewsCancelled += n
    else if (r.cascade_kind === 'offer_accepted') offerAccepted = true
    else if (r.cascade_kind === 'offer_withdrawn') offerWithdrawn = true
    else if (r.cascade_kind === 'backward_move') backward = true
  }
  if (offerAccepted) parts.push('1 offer accepted')
  if (offerWithdrawn) parts.push('1 offer withdrawn')
  if (interviewsCompleted) parts.push(`${interviewsCompleted} interview${interviewsCompleted === 1 ? '' : 's'} completed`)
  if (interviewsCancelled) parts.push(`${interviewsCancelled} interview${interviewsCancelled === 1 ? '' : 's'} cancelled`)
  if (backward && parts.length === 0) return `Moved back to ${stageLabel}. Past actions preserved.`
  if (parts.length === 0) return `Moved to ${stageLabel}.`
  return `Moved to ${stageLabel}. ${parts.join(', ')}.`
}

interface PipelineCard {
  id: string
  candidateId: string
  candidateEmail: string | null
  candidateName: string
  candidatePhoto: string | null
  jobTitle: string
  jobId: string
  status: string
  appliedAt: string
  daysInStage: number
  location: string
  experience: number
  cvUrl: string | null
  hasCoverLetter: boolean
  // True if the application has at least one row in `interviews` with
  // status pending_selection|scheduled|confirmed. Drives the "needs
  // scheduling" badge on Interview-column cards. The drag-gate ensures
  // forward drags only land here after a successful schedule, but the
  // backward "move back, no new interview" path can land a card here
  // legitimately without one.
  hasLiveInterview: boolean
}

function formatDaysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

// Per-stage primary CTA label and destination. The link goes to the
// employer's per-job applications view which already hosts stage-appropriate
// modals (Schedule Interview, Make Offer, etc.). Drag still advances stages.
const STAGE_CTA: Record<string, { label: string; toApplications: boolean } | null> = {
  reviewing: { label: 'Review →', toApplications: true },
  shortlisted: { label: 'Schedule Interview →', toApplications: true },
  interview: { label: 'Make Offer →', toApplications: true },
  offered: { label: 'View Offer →', toApplications: true },
  hired: null,
  rejected: null,
}

export default function PipelinePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<PipelineCard[]>([])
  const [filterJob, setFilterJob] = useState<string>('all')
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([])
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  // Kebab + decline/restore state. employerId/employerCompany are
  // captured in loadData and passed to the shared DeclineModal so the
  // candidate email + in-app conversation message attribute correctly.
  const [openMenuCardId, setOpenMenuCardId] = useState<string | null>(null)
  const [declineCard, setDeclineCard] = useState<PipelineCard | null>(null)
  const [restoreCard, setRestoreCard] = useState<PipelineCard | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [employerId, setEmployerId] = useState<string | null>(null)
  const [employerCompany, setEmployerCompany] = useState<string>('')
  // Backward-move confirm + post-move toast. The trigger keeps the DB
  // consistent regardless; the toast describes what cascaded so the
  // employer knows interviews/offers were touched.
  const [backwardMove, setBackwardMove] = useState<{ card: PipelineCard; newStatus: string; stageLabel: string } | null>(null)
  const [backwardSubmitting, setBackwardSubmitting] = useState(false)
  // Forward drag into the Interview column gates on a successful schedule —
  // we hold the card here while ScheduleInterviewModal is open. Cancel
  // closes the modal without ever writing job_applications.status.
  const [scheduleCard, setScheduleCard] = useState<PipelineCard | null>(null)
  // Backward drag into the Interview column shows BackwardToInterviewModal
  // first so the employer can pick: cancel / move-only / move-and-schedule.
  const [backwardToInterview, setBackwardToInterview] = useState<{ card: PipelineCard; previousStageLabel: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login/employer')
      return
    }

    const sessionEmployerId = session.user.id
    setEmployerId(sessionEmployerId)
    setEmployerCompany(session.user.user_metadata?.company_name || '')

    // 'pending' lives on the Applicants page; Pipeline tracks the active
    // funnel + the DECLINED end-state. We DO want 'rejected' rows here
    // so they render in the new column.
    const { data: appData } = await supabase
      .from('job_applications')
      .select('id, candidate_id, job_id, job_title, status, cover_letter, created_at, status_updated_at')
      .in('job_id', (
        await supabase.from('jobs').select('id').eq('employer_id', sessionEmployerId)
      ).data?.map((j: any) => j.id) || [])
      .neq('status', 'pending')
      .order('created_at', { ascending: false })

    if (!appData) { setLoading(false); return }

    // Fetch candidate details (incl. email — needed by DeclineModal so
    // the decline email goes out without a server-side user lookup).
    const candidateIds = Array.from(new Set(appData.map(a => a.candidate_id).filter(Boolean)))
    let profileMap: Record<string, { name: string; photo: string | null; location: string; experience: number; cvUrl: string | null; email: string | null }> = {}

    if (candidateIds.length > 0) {
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('user_id, full_name, profile_picture_url, city, location, years_experience, cv_url, email')
        .in('user_id', candidateIds)

      for (const p of profiles || []) {
        profileMap[p.user_id] = {
          name: p.full_name || 'Candidate',
          photo: p.profile_picture_url || null,
          location: p.city || p.location || '',
          experience: p.years_experience || 0,
          cvUrl: p.cv_url || null,
          email: p.email || null,
        }
      }
    }

    // Fetch unique jobs for the filter
    const jobIds = Array.from(new Set(appData.map(a => a.job_id)))
    const { data: jobData } = await supabase
      .from('jobs')
      .select('id, title')
      .in('id', jobIds)

    setJobs(jobData || [])

    // Single batched query for live interview rows so cards in the
    // Interview column can show the "needs scheduling" badge when the
    // candidate is in stage but has no live commitment.
    const appIds = appData.map(a => a.id)
    let liveSet = new Set<string>()
    if (appIds.length > 0) {
      const { data: liveInterviews } = await supabase
        .from('interviews')
        .select('application_id')
        .in('application_id', appIds)
        .in('status', ['pending_selection', 'scheduled', 'confirmed'])
      liveSet = new Set((liveInterviews || []).map(i => i.application_id))
    }

    // Map to pipeline cards
    const mapped: PipelineCard[] = appData.map(a => {
      const profile = profileMap[a.candidate_id] || { name: 'Candidate', photo: null, location: '', experience: 0, cvUrl: null, email: null }
      const stageDate = a.status_updated_at || a.created_at
      return {
        id: a.id,
        candidateId: a.candidate_id,
        candidateEmail: profile.email,
        candidateName: profile.name,
        candidatePhoto: profile.photo,
        jobTitle: a.job_title || 'Role',
        jobId: a.job_id,
        status: a.status === 'interviewing' ? 'interview' : a.status,
        appliedAt: a.created_at,
        daysInStage: Math.floor((Date.now() - new Date(stageDate).getTime()) / 86400000),
        location: profile.location,
        experience: profile.experience,
        cvUrl: profile.cvUrl,
        hasCoverLetter: !!a.cover_letter,
        hasLiveInterview: liveSet.has(a.id),
      }
    })

    setCards(mapped)
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // Close the kebab popover on outside click or Escape.
  useEffect(() => {
    if (!openMenuCardId) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target?.closest(`.${styles.cardKebabWrap}`)) setOpenMenuCardId(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenuCardId(null) }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenuCardId])

  // Apply a stage move to the DB and surface what cascaded as a toast.
  // Used by both the forward-drag path and the backward-confirm path so
  // every move runs the same optimistic update, supabase write, candidate
  // notification, and cascade-log read.
  const applyMove = async (card: PipelineCard, newStatus: string, fromStatus: string, stageLabel: string) => {
    // Optimistic update
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: newStatus, daysInStage: 0 } : c))

    // Capture cutoff so the cascade-log read only sees rows from this move.
    const requestStartIso = new Date().toISOString()

    const { error } = await supabase
      .from('job_applications')
      .update({ status: newStatus, status_updated_at: new Date().toISOString() })
      .eq('id', card.id)

    if (error) {
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: fromStatus } : c))
      setToast({ message: 'Move failed. Please try again.', key: Date.now() })
      return
    }

    // Candidate-facing bell notification on key transitions.
    if (card.candidateId) {
      const notifMap: Record<string, { title: string; message: string }> = {
        reviewing: { title: 'Application Under Review', message: `Your application for ${card.jobTitle} is being reviewed.` },
        shortlisted: { title: 'Application Shortlisted', message: `Great news! Your application for ${card.jobTitle} has been shortlisted.` },
        interview: { title: 'Moved to Interview Stage', message: `You've been moved to the interview stage for ${card.jobTitle}. The employer will be in touch to schedule.` },
        offered: { title: 'Job Offer Received', message: `You have received a job offer for ${card.jobTitle}!` },
        hired: { title: 'Congratulations!', message: `You've been hired for ${card.jobTitle}!` },
      }
      const notif = notifMap[newStatus]
      if (notif) {
        supabase.from('notifications').insert({
          user_id: card.candidateId, type: 'application_update',
          title: notif.title, message: notif.message, read: false,
          related_id: card.id, related_type: 'application', link: '/applications',
        }).then()
      }
    }

    // Read what the cascade trigger did (if anything) so the toast is honest.
    const { data: logRows } = await supabase
      .from('pipeline_cascade_log')
      .select('cascade_kind, details')
      .eq('application_id', card.id)
      .gte('created_at', requestStartIso)
      .order('created_at', { ascending: false })

    setToast({ message: summarizeCascade((logRows as CascadeLogRow[]) || [], stageLabel), key: Date.now() })
  }

  // Handle drag and drop
  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, destination, source } = result
    if (!destination || destination.droppableId === source.droppableId) return

    // Decline must always go through the modal so the email gets sent.
    // The DECLINED column is configured isDropDisabled and its cards
    // isDragDisabled, so this branch shouldn't fire — defensive guard
    // in case those props get loosened later.
    if (destination.droppableId === 'rejected' || source.droppableId === 'rejected') return

    const newStatus = destination.droppableId
    const card = cards.find(c => c.id === draggableId)
    if (!card) return

    const fromIdx = stageIndex(source.droppableId)
    const toIdx = stageIndex(newStatus)
    const stageLabel = STAGES.find(s => s.id === newStatus)?.label || newStatus

    // Drag into Interview is gated. Forward (Reviewing/Shortlisted/etc.
    // → Interview) opens ScheduleInterviewModal; the move only happens if
    // the schedule succeeds. Backward (Offered/Hired → Interview) opens
    // BackwardToInterviewModal where the employer picks the right path.
    if (newStatus === 'interview') {
      if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
        const previousStageLabel = STAGES.find(s => s.id === source.droppableId)?.label || source.droppableId
        setBackwardToInterview({ card, previousStageLabel })
      } else {
        setScheduleCard(card)
      }
      return
    }

    // Backward drag elsewhere (e.g. Hired → Offered). The DB trigger
    // doesn't undo past actions; the user gets a confirm explaining
    // what's preserved before the move commits.
    if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
      setBackwardMove({ card, newStatus, stageLabel })
      return
    }

    await applyMove(card, newStatus, source.droppableId, stageLabel)
  }

  const filteredCards = filterJob === 'all' ? cards : cards.filter(c => c.jobId === filterJob)

  if (loading) {
    return (
      <main><Header />
        <div className={styles.loadingState}><div className={styles.spinner} /><p>Loading pipeline...</p></div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />
      <div className={styles.topBar}>
        <div>
          <h1 className={styles.title}>Hiring Pipeline</h1>
          <p className={styles.subtitle}>{cards.length} candidate{cards.length !== 1 ? 's' : ''} across {jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={styles.controls}>
          <select
            value={filterJob}
            onChange={e => setFilterJob(e.target.value)}
            className={styles.jobFilter}
          >
            <option value="all">All jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className={styles.board}>
          {STAGES.map(stage => {
            const stageCards = filteredCards.filter(c => c.status === stage.id)
            const isDeclined = stage.id === 'rejected'
            return (
              <div key={stage.id} className={`${styles.column} ${isDeclined ? styles.columnDeclined : ''}`}>
                <div className={styles.columnHeader} style={{ borderTopColor: stage.color }}>
                  <span className={styles.columnTitle}>{stage.label}</span>
                  <span className={styles.columnCount} style={{ background: stage.color }}>{stageCards.length}</span>
                </div>
                <Droppable droppableId={stage.id} isDropDisabled={isDeclined}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`${styles.columnBody} ${snapshot.isDraggingOver ? styles.columnBodyDragOver : ''}`}
                    >
                      {stageCards.map((card, index) => (
                        <Draggable key={card.id} draggableId={card.id} index={index} isDragDisabled={isDeclined}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`${styles.card} ${snapshot.isDragging ? styles.cardDragging : ''} ${isDeclined ? styles.cardDeclined : ''}`}
                            >
                              <div className={styles.cardHeader}>
                                <div className={styles.cardAvatar}>
                                  {card.candidatePhoto ? (
                                    <SignedImage src={card.candidatePhoto} alt={card.candidateName} className={styles.cardAvatarImg} />
                                  ) : (
                                    <span className={styles.cardAvatarInitial}>
                                      {card.candidateName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </span>
                                  )}
                                </div>
                                <div className={styles.cardInfo}>
                                  <span className={styles.cardName}>{card.candidateName}</span>
                                  <span className={styles.cardJob}>{card.jobTitle}</span>
                                </div>
                                <div className={styles.cardKebabWrap}>
                                  <button
                                    type="button"
                                    aria-label="Card actions"
                                    aria-expanded={openMenuCardId === card.id}
                                    className={styles.cardKebab}
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => {
                                      e.stopPropagation()
                                      setOpenMenuCardId(prev => prev === card.id ? null : card.id)
                                    }}
                                  >
                                    ⋯
                                  </button>
                                  {openMenuCardId === card.id && (
                                    <div className={styles.cardMenu} role="menu" onClick={e => e.stopPropagation()}>
                                      {card.status === 'rejected' ? (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className={styles.cardMenuItem}
                                          onClick={() => { setOpenMenuCardId(null); setRestoreCard(card) }}
                                        >
                                          Restore to Reviewing
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className={styles.cardMenuItem}
                                          onClick={() => { setOpenMenuCardId(null); setDeclineCard(card) }}
                                        >
                                          Decline
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {card.status === 'interview' && !card.hasLiveInterview && (
                                <span
                                  className={styles.needsSchedulingBadge}
                                  title="No interview scheduled yet — open the application to set one up."
                                >
                                  Needs scheduling
                                </span>
                              )}
                              {(() => {
                                const cta = STAGE_CTA[card.status]
                                if (!cta) return null
                                const href = cta.toApplications
                                  ? `/my-jobs/${card.jobId}/applications?from=pipeline&applicationId=${card.id}`
                                  : `/candidates/${card.candidateId}?from=pipeline`
                                return (
                                  <Link
                                    href={href}
                                    className={styles.cardPrimaryCta}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {cta.label}
                                  </Link>
                                )
                              })()}
                              {expandedCardId === card.id && (
                                <div className={styles.cardDetails}>
                                  {(card.location || card.experience > 0) && (
                                    <div className={styles.cardMeta}>
                                      {card.location && <span className={styles.metaBadge}>📍 {card.location}</span>}
                                      {card.experience > 0 && <span className={styles.metaBadge}>💼 {card.experience}yr{card.experience !== 1 ? 's' : ''}</span>}
                                    </div>
                                  )}
                                  <div className={styles.cardSecondaryActions}>
                                    <Link
                                      href={`/candidates/${card.candidateId}?from=pipeline`}
                                      className={styles.cardSecondaryBtn}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      View Profile
                                    </Link>
                                    {card.cvUrl && (
                                      <SignedLink
                                        src={card.cvUrl}
                                        className={styles.cardSecondaryBtn}
                                        onClick={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                      >
                                        View CV
                                      </SignedLink>
                                    )}
                                  </div>
                                </div>
                              )}
                              <div className={styles.cardFooter}>
                                <span className={styles.cardTime}>{formatDaysAgo(card.appliedAt)} in stage</span>
                                <button
                                  type="button"
                                  className={styles.cardDetailsToggle}
                                  onClick={e => {
                                    e.stopPropagation()
                                    setExpandedCardId(prev => prev === card.id ? null : card.id)
                                  }}
                                  onMouseDown={e => e.stopPropagation()}
                                >
                                  Details {expandedCardId === card.id ? '▴' : '▾'}
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {stageCards.length === 0 && (
                        <div className={styles.emptyColumn}>
                          No candidates
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {/* Decline modal — shared with /my-jobs/[jobId]/applications. Owns
          its own template/edit/send state; we react via onDeclined to
          flip the local card's status without a refetch. */}
      {declineCard && employerId && (
        <DeclineModal
          applicationId={declineCard.id}
          candidateId={declineCard.candidateId}
          candidateEmail={declineCard.candidateEmail}
          candidateName={declineCard.candidateName}
          jobTitle={declineCard.jobTitle}
          companyName={employerCompany}
          employerId={employerId}
          onClose={() => setDeclineCard(null)}
          onDeclined={() => {
            const cardId = declineCard.id
            setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'rejected', daysInStage: 0 } : c))
          }}
        />
      )}

      {/* Restore confirmation — silent move back to Reviewing. No email,
          no notification (it's an internal correction, not a candidate-
          facing event). */}
      {restoreCard && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => !restoring && setRestoreCard(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, maxWidth: 420, width: '100%', padding: '1.5rem' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Restore candidate?</h3>
            <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
              This will move <strong>{restoreCard.candidateName}</strong> back to Reviewing. No email will be sent.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setRestoreCard(null)}
                disabled={restoring}
                style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!restoreCard) return
                  setRestoring(true)
                  const cardId = restoreCard.id
                  const { error } = await supabase
                    .from('job_applications')
                    .update({ status: 'reviewing', status_updated_at: new Date().toISOString() })
                    .eq('id', cardId)
                  setRestoring(false)
                  if (error) {
                    alert('Failed to restore. Please try again.')
                    return
                  }
                  setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'reviewing', daysInStage: 0 } : c))
                  setRestoreCard(null)
                }}
                disabled={restoring}
                style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: 8, background: restoring ? '#94a3b8' : '#0f172a', color: '#FFE500', cursor: restoring ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backward-move confirmation. The DB trigger preserves past
          actions (sent emails, scheduled interviews, offer history) on
          backward moves and writes an audit row to pipeline_cascade_log
          — this dialog warns the employer before that happens. */}
      {backwardMove && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => !backwardSubmitting && setBackwardMove(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', padding: '1.5rem' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
              Move {backwardMove.card.candidateName} back to {backwardMove.stageLabel}?
            </h3>
            <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
              Their past actions stay in place — emails sent, interviews logged, offer history. Nothing is undone. The move is recorded for audit.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setBackwardMove(null)}
                disabled={backwardSubmitting}
                style={{ flex: 1, padding: '0.625rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!backwardMove) return
                  setBackwardSubmitting(true)
                  const { card, newStatus, stageLabel } = backwardMove
                  await applyMove(card, newStatus, card.status, stageLabel)
                  setBackwardSubmitting(false)
                  setBackwardMove(null)
                }}
                disabled={backwardSubmitting}
                style={{ flex: 1, padding: '0.625rem', border: 'none', borderRadius: 8, background: backwardSubmitting ? '#94a3b8' : '#0f172a', color: '#FFE500', cursor: backwardSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                {backwardSubmitting ? 'Moving…' : 'Move back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward-into-Interview gate. Card stays at source until the
          schedule succeeds; cancel = no DB write. After success, do an
          optimistic flip on hasLiveInterview so the badge never flashes,
          then refetch via loadData() for correctness. */}
      {scheduleCard && employerId && (
        <ScheduleInterviewModal
          isOpen
          onClose={() => setScheduleCard(null)}
          applicationId={scheduleCard.id}
          jobId={scheduleCard.jobId}
          jobTitle={scheduleCard.jobTitle}
          company={employerCompany}
          candidateId={scheduleCard.candidateId}
          candidateName={scheduleCard.candidateName}
          candidateEmail={scheduleCard.candidateEmail || undefined}
          onSuccess={() => {
            const cardId = scheduleCard.id
            setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'interview', daysInStage: 0, hasLiveInterview: true } : c))
            setScheduleCard(null)
            setToast({ message: `Moved to Interview. Schedule sent to ${scheduleCard.candidateName.split(' ')[0]}.`, key: Date.now() })
            loadData()
          }}
        />
      )}

      {/* Backward-into-Interview chooser. Three buttons: cancel (no
          write), move-only (status flips, no new interview row → badge
          appears), move-and-schedule (status flips then ScheduleInterviewModal opens). */}
      {backwardToInterview && (
        <BackwardToInterviewModal
          candidateName={backwardToInterview.card.candidateName}
          previousStageLabel={backwardToInterview.previousStageLabel}
          onChoose={async (choice) => {
            const { card, previousStageLabel } = backwardToInterview
            setBackwardToInterview(null)
            if (choice === 'cancel') return

            await applyMove(card, 'interview', card.status, 'Interview')
            // Optimistic: no live interview yet → badge will render. The
            // applyMove path didn't refetch, so set the field locally.
            setCards(prev => prev.map(c => c.id === card.id ? { ...c, hasLiveInterview: false } : c))

            if (choice === 'move-and-schedule') {
              // Re-open the schedule modal in the same tick. If the
              // employer cancels, the card stays in Interview with the
              // badge — they accepted the backward intent.
              setScheduleCard({ ...card, status: 'interview', hasLiveInterview: false })
            }
            // Suppress unused-warning for previousStageLabel — kept in scope
            // for clarity at the call site.
            void previousStageLabel
          }}
        />
      )}

      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </main>
  )
}
