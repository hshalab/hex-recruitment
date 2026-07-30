'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { ThumbsUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId, getEmployerCapabilities } from '@/lib/employer'
import { roleMeta, formatWhen, formatRate, timeAgo, initialsOf, type TempPost, type TempComment } from '@/lib/tempWork'

const C = { border: '#e2e8f0', sub: '#64748b', ink: '#0f172a', yellow: '#ffe500' }

export default function ManageTempWorkPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'denied' | 'ready'>('loading')
  const [posts, setPosts] = useState<TempPost[]>([])
  const [comments, setComments] = useState<Record<string, TempComment[]>>({})
  const [busy, setBusy] = useState<string | null>(null)

  // Who has put themselves forward. This is the list an agency actually works
  // from — the reason temp_interest exists and the reason a comment thread was
  // never an adequate substitute for it.
  interface InterestRow { id: string; temp_post_id: string; candidate_user_id: string; message: string | null; created_at: string; name: string }
  const [interest, setInterest] = useState<Record<string, InterestRow[]>>({})

  // Replying from here, because this is the page the notification links to and
  // until now it offered only Hide and Delete.
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

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
      const { data: cRows } = await supabase
        .from('temp_post_comments').select('*').in('post_id', ps.map(p => p.id)).order('created_at', { ascending: true })
      const grouped: Record<string, TempComment[]> = {}
      for (const c of (cRows as TempComment[]) || []) (grouped[c.post_id] ||= []).push(c)
      setComments(grouped)

      // RLS on temp_interest already restricts this to posts I have
      // manage_jobs on, so no employer-scoping filter is needed here beyond the
      // post ids — the database is the guard, not this query.
      const { data: iRows } = await supabase
        .from('temp_interest')
        .select('id, temp_post_id, candidate_user_id, message, created_at')
        .in('temp_post_id', ps.map(p => p.id))
        .order('created_at', { ascending: true })

      const rows = (iRows as Omit<InterestRow, 'name'>[]) || []
      // Names come from candidate_profiles in one read rather than per row.
      const ids = Array.from(new Set(rows.map(r => r.candidate_user_id)))
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: profs } = await supabase
          .from('candidate_profiles').select('user_id, full_name').in('user_id', ids)
        for (const p of (profs as { user_id: string; full_name: string | null }[]) || []) {
          if (p.full_name) names[p.user_id] = p.full_name
        }
      }
      const byPost: Record<string, InterestRow[]> = {}
      for (const r of rows) {
        (byPost[r.temp_post_id] ||= []).push({ ...r, name: names[r.candidate_user_id] || 'A candidate' })
      }
      setInterest(byPost)
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

  const setPostStatus = async (post: TempPost, status: TempPost['status']) => {
    setBusy(post.id)
    await supabase.from('temp_posts').update({ status }).eq('id', post.id)
    await load(); setBusy(null)
  }
  const setCommentHidden = async (c: TempComment, hidden: boolean) => {
    setBusy(c.id)
    await supabase.from('temp_post_comments').update({ hidden }).eq('id', c.id)
    setComments(prev => ({ ...prev, [c.post_id]: (prev[c.post_id] || []).map(x => x.id === c.id ? { ...x, hidden } : x) }))
    setBusy(null)
  }
  const deleteComment = async (c: TempComment) => {
    setBusy(c.id)
    await supabase.from('temp_post_comments').delete().eq('id', c.id)
    setComments(prev => ({ ...prev, [c.post_id]: (prev[c.post_id] || []).filter(x => x.id !== c.id) }))
    setPosts(prev => prev.map(p => p.id === c.post_id ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p))
    setBusy(null)
  }

  /**
   * Reply to a comment from here.
   *
   * It is an ordinary comment authored by the employer, which matters: the
   * database trigger sees the post owner commenting and routes a notification to
   * everyone waiting — the other people in the thread and anyone who registered
   * interest. No separate "reply" concept, so there is nothing to keep in step.
   */
  const sendReply = async (post: TempPost) => {
    const body = replyDraft.trim()
    if (!body) return
    setBusy(post.id)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) { setBusy(null); return }

    const { data, error } = await supabase.from('temp_post_comments').insert({
      post_id: post.id, user_id: uid, body,
    }).select('*').single()

    if (!error && data) {
      setComments(prev => ({ ...prev, [post.id]: [...(prev[post.id] || []), data as TempComment] }))
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, comment_count: p.comment_count + 1 } : p))
      setReplyDraft(''); setReplyTo(null)
    }
    setBusy(null)
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
        <p style={{ color: C.sub, fontSize: '0.9rem', marginBottom: '1.5rem' }}>Who’s available for each shift, and what’s been asked. The <strong>available</strong> list is the one to work from — comments are usually questions. Reply and they’ll be told straight away.</p>

        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2.5rem 1rem' }}>
            No temp posts yet. <Link href="/temp-work/post" style={{ color: '#334155' }}>Post your first shift →</Link>
          </div>
        ) : posts.map(post => {
          const rows = comments[post.id] || []
          const meta = roleMeta(post.category)
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
                    <div style={{ fontSize: '0.82rem', color: C.sub, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <ThumbsUp size={13} strokeWidth={2.4} style={{ color: '#2563eb' }} /> {post.like_count} like{post.like_count === 1 ? '' : 's'} · 💬 {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}
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

              {/* AVAILABLE — the list to work from. Above the comments on
                  purpose: these people have said yes, the commenters have asked
                  a question. Conflating the two is what made this page unusable. */}
              <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}`, background: '#fcfefc' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
                  {(interest[post.id] || []).length} available
                </div>
                {(interest[post.id] || []).length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>Nobody has put themselves forward yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {(interest[post.id] || []).map(r => (
                      <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 800, color: '#166534', fontSize: '0.72rem' }}>
                          {initialsOf(r.name)}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                            <Link href={`/candidates/${r.candidate_user_id}`} style={{ fontWeight: 700, color: C.ink, fontSize: '0.88rem', textDecoration: 'none' }}>{r.name}</Link>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{timeAgo(r.created_at)}</span>
                          </div>
                          {r.message && <p style={{ fontSize: '0.88rem', color: '#334155', margin: '0.2rem 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.message}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
                  {rows.length} comment{rows.length === 1 ? '' : 's'}
                </div>
                {rows.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>No comments yet — sit tight.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    {rows.map(c => {
                      // Candidates have a profile page (route enforces the employer gate); employers don't.
                      const profileHref = c.author_role === 'candidate' ? `/candidates/${c.user_id}` : null
                      const avatarBox: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', background: C.yellow, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }
                      const avatarInner = c.author_avatar
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={c.author_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontWeight: 800, color: C.ink, fontSize: '0.72rem' }}>{initialsOf(c.author_name || '?')}</span>
                      return (
                      <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderTop: `1px solid #f1f5f9`, paddingTop: '0.6rem', opacity: c.hidden ? 0.55 : 1 }}>
                        {profileHref
                          ? <Link href={profileHref} style={avatarBox} title={`View ${c.author_name || 'profile'}`}>{avatarInner}</Link>
                          : <span style={avatarBox}>{avatarInner}</span>}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                            {profileHref
                              ? <Link href={profileHref} style={{ fontWeight: 700, color: C.ink, fontSize: '0.88rem', textDecoration: 'none' }}>{c.author_name || 'Someone'}</Link>
                              : <span style={{ fontWeight: 700, color: C.ink, fontSize: '0.88rem' }}>{c.author_name || 'Someone'}</span>}
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{timeAgo(c.created_at)}</span>
                            {c.hidden && <span style={pill('#f1f5f9', '#475569')}>Hidden</span>}
                          </div>
                          <p style={{ fontSize: '0.88rem', color: '#334155', margin: '0.2rem 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</p>
                          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                            <button disabled={busy === c.id} onClick={() => setCommentHidden(c, !c.hidden)} style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.74rem', fontWeight: 600, color: C.sub, cursor: 'pointer' }}>
                              {c.hidden ? 'Unhide' : 'Hide'}
                            </button>
                            <button disabled={busy === c.id} onClick={() => deleteComment(c)} style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.74rem', fontWeight: 600, color: '#b91c1c', cursor: 'pointer' }}>
                              Delete
                            </button>
                            <button onClick={() => { setReplyTo(replyTo === post.id ? null : post.id); setReplyDraft('') }} style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.74rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                              {replyTo === post.id ? 'Cancel' : 'Reply'}
                            </button>
                          </div>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}

                {/* The reply box. An ordinary comment from the post owner, which
                    is what makes the notification to everyone waiting fire. */}
                {replyTo === post.id && (
                  <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      rows={2}
                      value={replyDraft}
                      onChange={e => setReplyDraft(e.target.value)}
                      placeholder="Reply — e.g. “Yes still open, can you do 5pm till close?”"
                      style={{ width: '100%', resize: 'vertical', padding: '0.6rem 0.7rem', border: `1px solid ${C.border}`, borderRadius: 9, font: 'inherit', fontSize: '0.88rem', color: C.ink }}
                    />
                    <button
                      disabled={busy === post.id || !replyDraft.trim()}
                      onClick={() => sendReply(post)}
                      style={{ alignSelf: 'flex-start', padding: '0.5rem 1rem', background: C.yellow, color: C.ink, fontWeight: 700, fontSize: '0.85rem', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: (busy === post.id || !replyDraft.trim()) ? 0.6 : 1 }}
                    >
                      {busy === post.id ? 'Sending…' : 'Send reply'}
                    </button>
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                      Everyone who commented or put themselves forward will be notified.
                    </span>
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
