'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import SignedLink from '@/components/SignedLink'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'

type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

interface OfferRow {
  id: string
  applicationId: string
  jobId: string
  jobTitle: string
  candidateId: string
  candidateName: string
  salary: string
  startDate: string
  contractType: string
  status: OfferStatus
  sentAt: string
  signedAt: string | null
  employerSignedAt: string | null
  offerLetterUrl: string | null
}

const STATUS_LABEL: Record<OfferStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending', bg: '#fef3c7', fg: '#92400e' },
  accepted: { label: 'Accepted', bg: '#dcfce7', fg: '#166534' },
  declined: { label: 'Declined', bg: '#fee2e2', fg: '#b91c1c' },
  withdrawn: { label: 'Withdrawn', bg: '#f1f5f9', fg: '#334155' },
}

function csvEscape(value: string): string {
  // Standard RFC 4180 field escaping — quote and double-up internal quotes
  // whenever the value contains a comma, quote, or line break.
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export default function OffersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [statusFilter, setStatusFilter] = useState<OfferStatus | 'all'>('all')
  const [jobFilter, setJobFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const load = async () => {
      const session = await getSessionWithRetry()
      if (!session || session.user.user_metadata?.role !== 'employer') {
        router.push('/login/employer')
        return
      }

      const { data, error } = await supabase
        .from('job_offers')
        .select('id, application_id, job_id, candidate_id, salary, start_date, contract_type, status, offer_letter_url, created_at, signature_timestamp, employer_signature_timestamp, jobs ( title )')
        .eq('employer_id', session.user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load offers:', error)
        setOffers([])
        setLoading(false)
        return
      }

      // Candidate FK points at auth.users, not candidate_profiles, so we
      // can't join it via PostgREST. Batch-fetch the needed profiles.
      const candidateIds = Array.from(new Set((data || []).map((r: any) => r.candidate_id).filter(Boolean)))
      const nameById: Record<string, string> = {}
      if (candidateIds.length > 0) {
        const { data: profiles } = await supabase
          .from('candidate_profiles')
          .select('user_id, full_name')
          .in('user_id', candidateIds)
        for (const p of profiles || []) nameById[p.user_id as string] = p.full_name || '—'
      }

      const rows: OfferRow[] = (data || []).map((r: any) => {
        const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs
        return {
          id: r.id,
          applicationId: r.application_id,
          jobId: r.job_id,
          jobTitle: job?.title || '—',
          candidateId: r.candidate_id,
          candidateName: nameById[r.candidate_id] || '—',
          salary: r.salary,
          startDate: r.start_date,
          contractType: r.contract_type,
          status: r.status,
          sentAt: r.created_at,
          signedAt: r.signature_timestamp,
          employerSignedAt: r.employer_signature_timestamp,
          offerLetterUrl: r.offer_letter_url,
        }
      })

      setOffers(rows)
      setLoading(false)
    }

    load()
  }, [router])

  // Derive the job-filter options from the loaded offers so the dropdown only
  // lists jobs that actually have offers on them.
  const jobOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const o of offers) seen.set(o.jobId, o.jobTitle)
    return Array.from(seen.entries()).map(([id, title]) => ({ id, title }))
  }, [offers])

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom).getTime() : null
    const to = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null
    const q = search.trim().toLowerCase()

    return offers.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (jobFilter !== 'all' && o.jobId !== jobFilter) return false
      if (q && !o.candidateName.toLowerCase().includes(q) && !o.jobTitle.toLowerCase().includes(q)) return false
      const sent = new Date(o.sentAt).getTime()
      if (from !== null && sent < from) return false
      if (to !== null && sent > to) return false
      return true
    })
  }, [offers, statusFilter, jobFilter, search, dateFrom, dateTo])

  const exportCsv = () => {
    const header = ['Candidate', 'Job', 'Salary', 'Start Date', 'Contract', 'Status', 'Sent', 'Employer Signed', 'Candidate Signed']
    const lines = [header.map(csvEscape).join(',')]
    for (const o of filtered) {
      lines.push([
        o.candidateName,
        o.jobTitle,
        o.salary,
        o.startDate,
        o.contractType,
        o.status,
        o.sentAt,
        o.employerSignedAt || '',
        o.signedAt || '',
      ].map(v => csvEscape(String(v || ''))).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `offers-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setStatusFilter('all')
    setJobFilter('all')
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = statusFilter !== 'all' || jobFilter !== 'all' || search || dateFrom || dateTo

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return iso
    }
  }

  return (
    <main>
      <Header />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>Offers</h1>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.95rem', color: '#64748b' }}>
              Every offer you've sent, across every job. Filter, export, or download the signed PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            style={{
              padding: '0.625rem 1rem', border: '1px solid #e2e8f0', borderRadius: 8,
              background: filtered.length === 0 ? '#f1f5f9' : '#fff',
              cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: 600, color: '#334155',
            }}
          >
            ⬇ Export CSV ({filtered.length})
          </button>
        </div>

        {/* Filter row */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.875rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <input
            type="search"
            placeholder="Search candidate or job..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '2 1 220px', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem' }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OfferStatus | 'all')}
            style={{ flex: '1 1 140px', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem', background: '#fff' }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            style={{ flex: '1 1 180px', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem', background: '#fff' }}
          >
            <option value="all">All jobs</option>
            {jobOptions.map(j => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flex: '1 1 240px' }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Sent:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ flex: 1, padding: '0.45rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.8rem' }}
            />
            <span style={{ color: '#94a3b8' }}>→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ flex: 1, padding: '0.45rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.8rem' }}
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              style={{ padding: '0.5rem 0.75rem', background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading offers...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, color: '#64748b' }}>
            {offers.length === 0
              ? 'You haven\'t sent any offers yet. They\'ll show up here once you do.'
              : 'No offers match the current filters.'}
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Candidate</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#334155' }}>Job</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Salary</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Start</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#334155' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Sent</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Candidate signed</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 600, color: '#334155' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const badge = STATUS_LABEL[o.status] || STATUS_LABEL.pending
                  return (
                    <tr
                      key={o.id}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                      onClick={() => router.push(`/my-jobs/${o.jobId}/applications?applicationId=${o.applicationId}`)}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{o.candidateName}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>{o.jobTitle}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap' }}>{o.salary}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(o.startDate)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 99, background: badge.bg, color: badge.fg, fontSize: '0.72rem', fontWeight: 600 }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(o.sentAt)}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(o.signedAt)}</td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        {o.offerLetterUrl ? (
                          <SignedLink src={o.offerLetterUrl} download style={{ color: '#0369a1', fontSize: '0.8rem', textDecoration: 'underline' }}>
                            ⬇ Download
                          </SignedLink>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
