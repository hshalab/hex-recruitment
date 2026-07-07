'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
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
        <p style={{ color: C.sub, fontSize: '0.9rem', marginBottom: '1.5rem' }}>Your posts, their likes, and everyone who’s commented — the commenters are the people putting themselves forward. Book directly with them.</p>

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
                    <div style={{ fontSize: '0.82rem', color: C.sub, marginTop: 4 }}>
                      ❤️ {post.like_count} like{post.like_count === 1 ? '' : 's'} · 💬 {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}
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
                  {rows.length} comment{rows.length === 1 ? '' : 's'}
                </div>
                {rows.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>No comments yet — sit tight.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    {rows.map(c => (
                      <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderTop: `1px solid #f1f5f9`, paddingTop: '0.6rem', opacity: c.hidden ? 0.55 : 1 }}>
                        <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.yellow, display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
                          {c.author_avatar
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={c.author_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontWeight: 800, color: C.ink, fontSize: '0.72rem' }}>{initialsOf(c.author_name || '?')}</span>}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: C.ink, fontSize: '0.88rem' }}>{c.author_name || 'Someone'}</span>
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
                          </div>
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
