'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

const STAGES = [
  { id: 'pending', label: 'Applied', color: '#f59e0b' },
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
}

function formatDaysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

export default function PipelinePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<PipelineCard[]>([])
  const [filterJob, setFilterJob] = useState<string>('all')
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([])

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user.user_metadata?.role !== 'employer') {
      router.push('/login/employer')
      return
    }

    const employerId = session.user.id

    // Fetch all non-rejected applications for this employer's jobs
    const { data: appData } = await supabase
      .from('job_applications')
      .select('id, candidate_id, job_id, job_title, status, created_at, status_updated_at')
      .in('job_id', (
        await supabase.from('jobs').select('id').eq('employer_id', employerId)
      ).data?.map((j: any) => j.id) || [])
      .not('status', 'eq', 'rejected')
      .order('created_at', { ascending: false })

    if (!appData) { setLoading(false); return }

    // Fetch candidate details
    const candidateIds = Array.from(new Set(appData.map(a => a.candidate_id).filter(Boolean)))
    let profileMap: Record<string, { name: string; photo: string | null }> = {}

    if (candidateIds.length > 0) {
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('user_id, full_name, profile_picture_url')
        .in('user_id', candidateIds)

      for (const p of profiles || []) {
        profileMap[p.user_id] = { name: p.full_name || 'Candidate', photo: p.profile_picture_url || null }
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
      const profile = profileMap[a.candidate_id] || { name: 'Candidate', photo: null }
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

    // Send notification to candidate
    if (card.candidateId) {
      const notifMap: Record<string, { title: string; message: string }> = {
        reviewing: { title: 'Application Under Review', message: `Your application for ${card.jobTitle} is being reviewed.` },
        shortlisted: { title: 'Application Shortlisted', message: `Great news! Your application for ${card.jobTitle} has been shortlisted.` },
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
                              <div className={styles.cardFooter}>
                                <span className={styles.cardTime}>{formatDaysAgo(card.appliedAt)}</span>
                                <Link
                                  href={`/my-jobs/${card.jobId}/applications`}
                                  className={styles.cardLink}
                                  onClick={e => e.stopPropagation()}
                                >
                                  View →
                                </Link>
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
