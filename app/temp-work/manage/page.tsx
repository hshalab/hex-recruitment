'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId, getEmployerCapabilities } from '@/lib/employer'
import { categoryMeta, formatWhen, formatRate, timeAgo, type TempPost, type TempInterest } from '@/lib/tempWork'

const C = { border: '#e2e8f0', sub: '#64748b', ink: '#0f172a', yellow: '#ffe500' }

interface InterestRow extends TempInterest { name: string; jobTitle: string | null }

export default function ManageTempWorkPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'denied' | 'ready'>('loading')
  const [posts, setPosts] = useState<TempPost[]>([])
  const [interests, setInterests] = useState<Record<string, InterestRow[]>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const ownerId = (await getCurrentEmployerOwnerId(supabase))
    const { data: { session } } = await supabase.auth.getSession()
    const eid = ownerId ?? session?.user?.id
    if (!eid) return
    const { data: postRows } = await supabase
      .from('temp_posts').select('*').eq('employer_id', eid).order('created_at', { ascending: false })
    const ps = (postRows as TempPost[]) || []
    setPosts(ps)

    if (ps.length) {
      const { data: intRows } = await supabase
        .from('temp_interest').select('*').in('temp_post_id', ps.map(p => p.id)).order('created_at', { ascending: false })
      const ints = (intRows as TempInterest[]) || []
      const uids = Array.from(new Set(ints.map(i => i.candidate_user_id)))
      const nameMap: Record<string, { name: string; jobTitle: string | null }> = {}
      if (uids.length) {
        const { data: profs } = await supabase.from('candidate_profiles').select('user_id, full_name, job_title').in('user_id', uids)
        for (const p of (profs || []) as { user_id: string; full_name: string | null; job_title: string | null }[]) {
          nameMap[p.user_id] = { name: p.full_name || 'Candidate', jobTitle: p.job_title }
        }
      }
      const grouped: Record<string, InterestRow[]> = {}
      for (const i of ints) {
        const nm = nameMap[i.candidate_user_id] || { name: 'Candidate', jobTitle: null }
        ;(grouped[i.temp_post_id] ||= []).push({ ...i, name: nm.name, jobTitle: nm.jobTitle })
      }
      setInterests(grouped)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push(`/login/employer?redirect=${encodeURIComponent('/temp-work/manage')}`); return }
      if (session.user.user_metadata?.role !== 'employer') { router.push('/dashboard'); return }
      const caps = await getEmployerCapabilities(supabase)
      if (!caps.manage_jobs) { setPhase('denied'); return }
      await load()
      setPhase('ready')
    }
    init()
  }, [router, load])

  const setInterestStatus = async (row: InterestRow, status: InterestRow['status']) => {
    setBusy(row.id)
    await supabase.from('temp_interest').update({ status }).eq('id', row.id)
    await load(); setBusy(null)
  }
  const setPostStatus = async (post: TempPost, status: TempPost['status']) => {
    setBusy(post.id)
    await supabase.from('temp_posts').update({ status }).eq('id', post.id)
    await load(); setBusy(null)
  }

  const wrap: React.CSSProperties = { maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }
  const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: '0.7rem', fontWeight: 700, color, background: bg, padding: '0.15rem 0.5rem', borderRadius: 6 })
  const btn = (color: string): React.CSSProperties => ({ padding: '5px 10px', border: `1px solid ${C.border}`, background: '#fff', color, borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' })

  if (phase === 'loading') return <main><Header /><div style={{ ...wrap, textAlign: 'center', color: C.sub }}>Loading…</div></main>
  if (phase === 'denied') return <main><Header /><div style={{ ...wrap, textAlign: 'center' }}><p style={{ color: C.sub }}>You need the “manage jobs” permission to manage temp work.</p></div></main>

  return (
    <main>
      <Header />
      <div style={wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: '0.35rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: C.ink }}>Your temp work</h1>
          <Link href="/temp-work/post" style={{ padding: '9px 16px', background: C.yellow, color: C.ink, fontWeight: 700, fontSize: '0.9rem', borderRadius: 9, textDecoration: 'none' }}>+ Post</Link>
        </div>
        <p style={{ color: C.sub, fontSize: '0.9rem', marginBottom: '1.5rem' }}>Your posts and everyone who’s said they’re available. Bookings are arranged directly with them.</p>

        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2.5rem 1rem' }}>
            No temp posts yet. <Link href="/temp-work/post" style={{ color: '#334155' }}>Post your first shift →</Link>
          </div>
        ) : posts.map(post => {
          const rows = interests[post.id] || []
          const meta = categoryMeta(post.category)
          const rate = formatRate(post)
          return (
            <div key={post.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: '1rem', overflow: 'hidden' }}>
              <div style={{ padding: '0.9rem 1rem', background: '#fbfcfd', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: C.ink, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{meta.icon} {post.title}</span>
                      {post.status !== 'open' && <span style={pill('#f1f5f9', '#475569')}>{post.status}</span>}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: C.sub, marginTop: 2 }}>
                      {formatWhen(post)} · {post.location_area}{rate ? ` · ${rate}` : ''} · posted {timeAgo(post.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {post.status === 'open'
                      ? <>
                          <button disabled={busy === post.id} style={btn('#166534')} onClick={() => setPostStatus(post, 'filled')}>Mark filled</button>
                          <button disabled={busy === post.id} style={btn('#991b1b')} onClick={() => setPostStatus(post, 'closed')}>Close</button>
                        </>
                      : <button disabled={busy === post.id} style={btn('#334155')} onClick={() => setPostStatus(post, 'open')}>Re-open</button>}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
                  {rows.length} interested
                </div>
                {rows.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>No one yet — sit tight.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {rows.map(r => (
                      <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between', borderTop: `1px solid #f1f5f9`, paddingTop: '0.6rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Link href={`/candidates/${r.candidate_user_id}`} style={{ fontWeight: 600, color: C.ink, textDecoration: 'none', fontSize: '0.92rem' }}>{r.name}</Link>
                            {r.jobTitle && <span style={{ fontSize: '0.8rem', color: C.sub }}>· {r.jobTitle}</span>}
                            {r.status === 'shortlisted' && <span style={pill('#e0e7ff', '#3730a3')}>Shortlisted</span>}
                            {r.status === 'booked' && <span style={pill('#dcfce7', '#166534')}>Booked</span>}
                            {r.status === 'declined' && <span style={pill('#fee2e2', '#991b1b')}>Declined</span>}
                          </div>
                          {r.message && <p style={{ fontSize: '0.85rem', color: '#334155', margin: '0.25rem 0 0' }}>“{r.message}”</p>}
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{timeAgo(r.created_at)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button disabled={busy === r.id} style={btn('#3730a3')} onClick={() => setInterestStatus(r, 'shortlisted')}>Shortlist</button>
                          <button disabled={busy === r.id} style={btn('#166534')} onClick={() => setInterestStatus(r, 'booked')}>Book</button>
                          <button disabled={busy === r.id} style={btn('#991b1b')} onClick={() => setInterestStatus(r, 'declined')}>Decline</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
