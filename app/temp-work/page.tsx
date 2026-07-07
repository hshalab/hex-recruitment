'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import {
  ROLE_GROUPS, roleMeta, rolesInGroup, formatWhen, formatRate, timeAgo, initialsOf, DISCLAIMER,
  type TempPost, type TempComment,
} from '@/lib/tempWork'
import { EXAMPLE_TEMP_POSTS } from '@/lib/tempExamples'
import styles from './page.module.css'

interface Me { name: string; avatar: string | null }

export default function TempWorkPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<TempPost[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<Me>({ name: '', avatar: null })
  const [canPost, setCanPost] = useState(false)

  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())
  const [busyLike, setBusyLike] = useState<string | null>(null)

  const [openThread, setOpenThread] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, TempComment[]>>({})
  const [draft, setDraft] = useState('')
  const [busyComment, setBusyComment] = useState(false)

  const [group, setGroup] = useState('')
  const [role, setRole] = useState('')
  const [loc, setLoc] = useState('')
  const [date, setDate] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('temp_posts').select('*').eq('status', 'open').order('created_at', { ascending: false })
    setPosts((data as TempPost[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id || null
      setUserId(uid)
      setCanPost(session?.user?.user_metadata?.role === 'employer')
      await load()
      if (uid) {
        // Which posts I've already liked.
        const { data: likes } = await supabase.from('temp_post_likes').select('post_id').eq('user_id', uid)
        setMyLikes(new Set((likes || []).map((r: { post_id: string }) => r.post_id)))
        // My display identity for comments — candidate name (shown as initials, no
        // stored photo by design), else employer company + logo, else metadata.
        const [{ data: cand }, { data: emp }] = await Promise.all([
          supabase.from('candidate_profiles').select('full_name').eq('user_id', uid).maybeSingle(),
          supabase.from('employer_profiles').select('company_name, logo_url').eq('user_id', uid).maybeSingle(),
        ])
        const name = cand?.full_name || emp?.company_name || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'You'
        const avatar = emp?.logo_url || null
        setMe({ name, avatar })
      }
    }
    init()
  }, [load])

  const usingExamples = !loading && posts.length === 0
  const visible: TempPost[] = usingExamples ? EXAMPLE_TEMP_POSTS : posts

  const matchesDate = (p: TempPost) => {
    if (!date) return true
    if (!p.date_from) return false
    const end = p.date_to || p.date_from
    return date >= p.date_from && date <= end
  }

  const filtered = useMemo(() => visible.filter(p => {
    if (usingExamples) return true
    if (role && p.category !== role) return false
    if (!role && group && !rolesInGroup(group).includes(p.category)) return false
    if (loc && !(`${p.location_area} ${p.postcode || ''}`.toLowerCase().includes(loc.toLowerCase()))) return false
    if (!matchesDate(p)) return false
    return true
  }), [visible, usingExamples, group, role, loc, date]) // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }
  const requireLogin = () => router.push(`/login/employee?redirect=${encodeURIComponent('/temp-work')}`)

  const toggleLike = async (post: TempPost) => {
    if (post.isExample) return
    if (!userId) { requireLogin(); return }
    if (busyLike === post.id) return
    setBusyLike(post.id)
    const liked = myLikes.has(post.id)
    // Optimistic
    setMyLikes(prev => { const n = new Set(prev); liked ? n.delete(post.id) : n.add(post.id); return n })
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, like_count: Math.max(0, p.like_count + (liked ? -1 : 1)) } : p))
    const { error } = liked
      ? await supabase.from('temp_post_likes').delete().eq('post_id', post.id).eq('user_id', userId)
      : await supabase.from('temp_post_likes').insert({ post_id: post.id, user_id: userId })
    if (error && (error as { code?: string }).code !== '23505') {
      // Roll back on a real failure.
      setMyLikes(prev => { const n = new Set(prev); liked ? n.add(post.id) : n.delete(post.id); return n })
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) } : p))
      flash('Could not update your like. Please try again.')
    }
    setBusyLike(null)
  }

  const openComments = async (post: TempPost) => {
    if (post.isExample) return
    if (openThread === post.id) { setOpenThread(null); return }
    setOpenThread(post.id); setDraft('')
    if (!comments[post.id]) {
      const { data } = await supabase
        .from('temp_post_comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true })
      setComments(prev => ({ ...prev, [post.id]: (data as TempComment[]) || [] }))
    }
  }

  const sendComment = async (post: TempPost) => {
    if (!userId) { requireLogin(); return }
    const body = draft.trim()
    if (!body) return
    setBusyComment(true)
    const { data, error } = await supabase.from('temp_post_comments').insert({
      post_id: post.id, user_id: userId, body, author_name: me.name, author_avatar: me.avatar,
    }).select('*').single()
    if (!error && data) {
      setComments(prev => ({ ...prev, [post.id]: [...(prev[post.id] || []), data as TempComment] }))
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, comment_count: p.comment_count + 1 } : p))
      setDraft('')
    } else {
      flash(error?.message || 'Could not post your comment.')
    }
    setBusyComment(false)
  }

  const deleteComment = async (post: TempPost, c: TempComment) => {
    const { error } = await supabase.from('temp_post_comments').delete().eq('id', c.id)
    if (!error) {
      setComments(prev => ({ ...prev, [post.id]: (prev[post.id] || []).filter(x => x.id !== c.id) }))
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p))
    } else flash('Could not remove the comment.')
  }

  const anyFilter = !!(group || role || loc || date)

  return (
    <main>
      <Header />
      <div className={styles.page}>
        <div className={styles.grid}>
          {/* Left rail — filters (inline, not a nested component, so inputs keep focus) */}
          <aside className={styles.leftRail}>
            <div className={styles.filterTitle}>Category</div>
            <div className={styles.catCol}>
              <button className={`${styles.catBtn} ${!group ? styles.catBtnOn : ''}`} onClick={() => { setGroup(''); setRole('') }}>All shifts</button>
              {ROLE_GROUPS.map(g => (
                <div key={g.key}>
                  <button className={`${styles.catBtn} ${group === g.key ? styles.catBtnOn : ''}`} onClick={() => { setGroup(group === g.key ? '' : g.key); setRole('') }}>
                    <span aria-hidden>{g.icon}</span> {g.label}
                  </button>
                  {group === g.key && (
                    <div className={styles.roleChips}>
                      <button className={`${styles.roleChip} ${!role ? styles.roleChipOn : ''}`} onClick={() => setRole('')}>All {g.label.toLowerCase()}</button>
                      {g.roles.map(r => (
                        <button key={r.key} className={`${styles.roleChip} ${role === r.key ? styles.roleChipOn : ''}`} onClick={() => setRole(role === r.key ? '' : r.key)}>{r.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.filterTitle} style={{ marginTop: '1rem' }}>Where & when</div>
            <input className={styles.filterInput} placeholder="Location or postcode" value={loc} onChange={e => setLoc(e.target.value)} />
            <input className={styles.filterInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
            {anyFilter && <button className={styles.clearBtn} onClick={() => { setGroup(''); setRole(''); setLoc(''); setDate('') }}>Clear filters</button>}
          </aside>

          {/* Centre feed */}
          <div className={styles.feed}>
            <div className={styles.feedHead}>
              <div>
                <h1 className={styles.h1}>Temp Work</h1>
                <p className={styles.h1sub}>Shifts and short-term gigs. Like the ones you fancy, and comment to put yourself forward.</p>
              </div>
              {canPost && <Link href="/temp-work/post" className={styles.feedPostBtn}>+ Post</Link>}
            </div>

            {toast && <div className={styles.toast}>{toast}</div>}
            {usingExamples && <div className={styles.exNote}>No live shifts yet — here’s what posts look like. Real shifts replace these the moment one is posted.</div>}

            {loading ? (
              <div className={styles.empty}>Loading shifts…</div>
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>No open shifts match your filters right now.</div>
            ) : filtered.map(post => {
              const rm = roleMeta(post.category)
              const rate = formatRate(post)
              const liked = myLikes.has(post.id)
              const isEx = !!post.isExample
              const thread = comments[post.id] || []
              const threadOpen = openThread === post.id
              return (
                <article key={post.id} className={`${styles.card} ${isEx ? styles.cardExample : ''}`}>
                  <div className={styles.posterRow}>
                    <span className={styles.avatar}>
                      {post.company_logo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={post.company_logo} alt="" className={styles.avatarImg} />
                        : <span className={styles.avatarInitials}>{initialsOf(post.company_name || 'Thrive')}</span>}
                    </span>
                    <div className={styles.posterMeta}>
                      <span className={styles.posterName}>{post.company_name || 'A hospitality employer'}</span>
                      <span className={styles.posterSub}>{rm.icon} {rm.label} · {timeAgo(post.created_at)}</span>
                    </div>
                    {isEx && <span className={styles.exampleBadge}>Example</span>}
                  </div>

                  <h2 className={styles.cardTitle}>{post.title}</h2>

                  <div className={styles.metaRow}>
                    <span>📅 {formatWhen(post)}</span>
                    <span>📍 {post.location_area}{post.postcode ? ` · ${post.postcode}` : ''}</span>
                    {rate && <span className={styles.rate}>{rate}</span>}
                    {post.headcount > 1 && <span>👥 {post.headcount} needed</span>}
                  </div>

                  {post.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.image_url} alt="" className={styles.cardImg} />
                  )}
                  {post.description && <p className={styles.desc}>{post.description}</p>}
                  {post.external_link && <a href={post.external_link} target="_blank" rel="noopener noreferrer" className={styles.extLink}>More details ↗</a>}

                  {/* engagement summary */}
                  {(post.like_count > 0 || post.comment_count > 0) && (
                    <div className={styles.engRow}>
                      {post.like_count > 0 && <span>❤️ {post.like_count}</span>}
                      {post.comment_count > 0 && (
                        <button className={styles.engCount} onClick={() => openComments(post)} disabled={isEx}>
                          {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}
                        </button>
                      )}
                    </div>
                  )}

                  <div className={styles.actionBar}>
                    <button
                      className={`${styles.actionBtn} ${liked ? styles.actionBtnOn : ''}`}
                      onClick={() => toggleLike(post)}
                      disabled={isEx || busyLike === post.id}
                      title={isEx ? 'This is an example post' : liked ? 'Unlike' : 'Like'}
                    >
                      {liked ? '❤️' : '🤍'} Like
                    </button>
                    <button
                      className={`${styles.actionBtn} ${threadOpen ? styles.actionBtnOn : ''}`}
                      onClick={() => openComments(post)}
                      disabled={isEx}
                      title={isEx ? 'This is an example post' : 'Comment'}
                    >
                      💬 Comment
                    </button>
                  </div>

                  {threadOpen && !isEx && (
                    <div className={styles.thread}>
                      {thread.length === 0 && <p className={styles.threadEmpty}>Be the first to comment — say when you’re free.</p>}
                      {thread.map(c => (
                        <div key={c.id} className={styles.comment}>
                          <span className={styles.cAvatar}>
                            {c.author_avatar
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={c.author_avatar} alt="" className={styles.avatarImg} />
                              : <span className={styles.cInitials}>{initialsOf(c.author_name || '?')}</span>}
                          </span>
                          <div className={styles.cBubble}>
                            <div className={styles.cHead}>
                              <span className={styles.cName}>{c.author_name || 'Someone'}{c.hidden ? ' · hidden' : ''}</span>
                              <span className={styles.cTime}>{timeAgo(c.created_at)}</span>
                            </div>
                            <p className={styles.cBody}>{c.body}</p>
                            {c.user_id === userId && (
                              <button className={styles.cDelete} onClick={() => deleteComment(post, c)}>Delete</button>
                            )}
                          </div>
                        </div>
                      ))}

                      <div className={styles.commentBox}>
                        <textarea
                          className={styles.commentInput}
                          rows={2}
                          placeholder={userId ? 'Add a comment — e.g. “I’m free Saturday, happy to help”' : 'Log in to comment'}
                          value={draft}
                          onFocus={() => { if (!userId) requireLogin() }}
                          onChange={e => setDraft(e.target.value)}
                        />
                        <button className={styles.commentSend} disabled={busyComment || !draft.trim()} onClick={() => sendComment(post)}>
                          {busyComment ? 'Posting…' : 'Comment'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}

            <p className={styles.disclaimer}>{DISCLAIMER}</p>
          </div>

          {/* Right rail — CTA / helper */}
          <aside className={styles.rightRail}>
            {canPost ? (
              <div className={styles.ctaCard}>
                <div className={styles.ctaTitle}>Hiring for a shift?</div>
                <p className={styles.ctaSub}>Post it to the feed and see who likes and comments.</p>
                <Link href="/temp-work/post" className={styles.ctaBtn}>+ Post temp work</Link>
                <Link href="/temp-work/manage" className={styles.ctaLink}>Your posts & comments →</Link>
              </div>
            ) : (
              <div className={styles.ctaCard}>
                <div className={styles.ctaTitle}>How it works</div>
                <p className={styles.ctaSub}>Like the shifts you fancy and comment to put yourself forward. The employer reads the comments and gets in touch to book you directly.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
