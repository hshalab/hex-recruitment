'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

const STAGES = [
  { id: 'reviewing', label: 'Reviewing', color: '#3b82f6' },
  { id: 'shortlisted', label: 'Shortlisted', color: '#8b5cf6' },
  { id: 'interview', label: 'Interview', color: '#06b6d4' },
  { id: 'offered', label: 'Offered', color: '#10b981' },
  { id: 'hired', label: 'Hired', color: '#16a34a' },
]

interface PipelineCard {
  id: string
  candidateId: string
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
}

export default function PipelinePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<PipelineCard[]>([])
  const [filterJob, setFilterJob] = useState<string>('all')
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([])
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login/employer')
      return
    }

    const employerId = session.user.id

    // Fetch active (non-rejected, non-pending) applications for this employer's jobs.
    // 'pending' lives on the Applicants page; Pipeline only tracks candidates actively
    // moving through stages.
    const { data: appData } = await supabase
      .from('job_applications')
      .select('id, candidate_id, job_id, job_title, status, cover_letter, created_at, status_updated_at')
      .in('job_id', (
        await supabase.from('jobs').select('id').eq('employer_id', employerId)
      ).data?.map((j: any) => j.id) || [])
      .not('status', 'in', '(rejected,pending)')
      .order('created_at', { ascending: false })

    if (!appData) { setLoading(false); return }

    // Fetch candidate details
    const candidateIds = Array.from(new Set(appData.map(a => a.candidate_id).filter(Boolean)))
    let profileMap: Record<string, { name: string; photo: string | null; location: string; experience: number; cvUrl: string | null }> = {}

    if (candidateIds.length > 0) {
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('user_id, full_name, profile_picture_url, city, location, years_experience, cv_url')
        .in('user_id', candidateIds)

      for (const p of profiles || []) {
        profileMap[p.user_id] = {
          name: p.full_name || 'Candidate',
          photo: p.profile_picture_url || null,
          location: p.city || p.location || '',
          experience: p.years_experience || 0,
          cvUrl: p.cv_url || null,
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

    // Map to pipeline cards
    const mapped: PipelineCard[] = appData.map(a => {
      const profile = profileMap[a.candidate_id] || { name: 'Candidate', photo: null, location: '', experience: 0, cvUrl: null }
      const stageDate = a.status_updated_at || a.created_at
      return {
        id: a.id,
        candidateId: a.candidate_id,
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
      }
    })

    setCards(mapped)
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // Handle drag and drop
  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, destination, source } = result
    if (!destination || destination.droppableId === source.droppableId) return

    const newStatus = destination.droppableId
    const card = cards.find(c => c.id === draggableId)
    if (!card) return

    // Block drag-back out of the Interview column. If an interview is booked
    // the employer must cancel or reschedule it explicitly — silently
    // undoing a stage change would leave the interview orphaned.
    if (
      source.droppableId === 'interview' &&
      (newStatus === 'reviewing' || newStatus === 'shortlisted')
    ) {
      alert(
        `This candidate has a scheduled interview. To change course, open their ` +
        `application and use Reschedule or Cancel Interview — those actions will ` +
        `notify the candidate properly.`
      )
      return
    }

    // Optimistic update
    setCards(prev => prev.map(c => c.id === draggableId ? { ...c, status: newStatus, daysInStage: 0 } : c))

    // Update DB
    const { error } = await supabase
      .from('job_applications')
      .update({ status: newStatus, status_updated_at: new Date().toISOString() })
      .eq('id', draggableId)

    if (error) {
      // Revert on failure
      setCards(prev => prev.map(c => c.id === draggableId ? { ...c, status: source.droppableId } : c))
      return
    }

    // Send notification to candidate at every stage transition.
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
            return (
              <div key={stage.id} className={styles.column}>
                <div className={styles.columnHeader} style={{ borderTopColor: stage.color }}>
                  <span className={styles.columnTitle}>{stage.label}</span>
                  <span className={styles.columnCount} style={{ background: stage.color }}>{stageCards.length}</span>
                </div>
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`${styles.columnBody} ${snapshot.isDraggingOver ? styles.columnBodyDragOver : ''}`}
                    >
                      {stageCards.map((card, index) => (
                        <Draggable key={card.id} draggableId={card.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`${styles.card} ${snapshot.isDragging ? styles.cardDragging : ''}`}
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
                              </div>
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
    </main>
  )
}
