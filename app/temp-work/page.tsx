'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { ThumbsUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  ROLE_GROUPS, roleMeta, rolesInGroup, roleKeyFromTitle, formatWhen, formatRate, timeAgo, initialsOf, DISCLAIMER,
  type TempPost, type TempComment,
} from '@/lib/tempWork'
import { EXAMPLE_TEMP_POSTS } from '@/lib/tempExamples'
import JobCard from '@/components/JobCard'
import { supabaseJobToJob } from '@/lib/types'
import type { Job } from '@/lib/mockJobs'
import styles from './page.module.css'

// WHAT THIS PAGE READS, and why it reads two things.
//
// TEMP-FLAGGED JOBS — jobs rows with 'Temporary' in employment_type. These are
// ongoing vacancies that happen to be casual or hourly, and they belong in
// `jobs`: same row, same source of truth, so the weekly reconcile keeps them
// honest. Copying them into temp_posts would take them out of that reconcile
// and leave a filled role sitting here forever.
//
// SHIFTS — temp_posts. A dated shift ("Saturday 7am–3pm, three chefs") carries
// dates, times and a headcount that a jobs row has nowhere to put, so it keeps
// its own table and its own card. Nothing is copied between the two.
//
// They render in one feed, each in the card its data can actually fill. A
// vacancy gets the job-board card so this page and /jobs read as one product; a
// shift gets the shift card because a job card has no slot for "three needed,
// 7am–3pm".
type FeedItem =
  | { kind: 'job'; at: string; job: Job }
  | { kind: 'shift'; at: string; post: TempPost }

export default function TempWorkPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<TempPost[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
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
  const [minRate, setMinRate] = useState(0) // min £/hr; only applies to hourly posts
  const [toast, setToast] = useState('')

  const RATE_PRESETS = [12, 15, 18, 20]

  // Job.postedAt is a humanised string ("3 days ago") by the time it reaches a
  // card, so the raw timestamp is kept alongside for sorting the mixed feed.
  const [tempJobs, setTempJobs] = useState<{ job: Job; at: string }[]>([])

  const load = useCallback(async () => {
    const [shifts, jobs] = await Promise.all([
      supabase.from('temp_posts').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      // 'Temporary' rather than 'Flexible' or salary_type='hourly'. It says what
      // it means: Flexible misses the one Temporary role that isn't flagged
      // flexible, and salary_type describes how someone is PAID, not what the
      // work is — a salaried three-month contract is temp and hourly would miss it.
      supabase.from('jobs').select('*').eq('status', 'active')
        .contains('employment_type', ['Temporary'])
        .order('created_at', { ascending: false }),
    ])
    setPosts((shifts.data as TempPost[]) || [])
    setTempJobs(((jobs.data as { created_at?: string }[]) || [])
      .map(r => ({ job: supabaseJobToJob(r), at: r.created_at || '' })))
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
        // Which posts I've already liked (comment identity is resolved server-side).
        const { data: likes } = await supabase.from('temp_post_likes').select('post_id').eq('user_id', uid)
        setMyLikes(new Set((likes || []).map((r: { post_id: string }) => r.post_id)))
      }
    }
    init()
  }, [load])

  // Examples only when there is genuinely NOTHING — no shifts AND no temp jobs.
  // With six real roles on the board they can no longer fire.
  const usingExamples = !loading && posts.length === 0 && tempJobs.length === 0
  const visible: TempPost[] = usingExamples ? EXAMPLE_TEMP_POSTS : posts

  const matchesGroupRole = (roleKey: string) => {
    if (role) return roleKey === role
    if (group) return rolesInGroup(group).includes(roleKey)
    return true
  }

  const filteredPosts = useMemo(() => visible.filter(p => {
    if (usingExamples) return true
    if (!matchesGroupRole(p.category)) return false
    if (loc && !(`${p.location_area} ${p.postcode || ''}`.toLowerCase().includes(loc.toLowerCase()))) return false
    // Min £/hr is an hourly-only filter: a per-shift/day rate can't be compared to
    // an hourly minimum, so applying a minimum hides non-hourly posts entirely.
    if (minRate > 0 && !(p.rate_type === 'hour' && p.hourly_rate != null && p.hourly_rate >= minRate)) return false
    return true
  }), [visible, usingExamples, group, role, loc, minRate]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredJobs = useMemo(() => tempJobs.filter(({ job: j }) => {
    if (!matchesGroupRole(roleKeyFromTitle(j.title))) return false
    if (loc && !(`${j.location || ''} ${j.area || ''}`.toLowerCase().includes(loc.toLowerCase()))) return false
    // Same rule as shifts: an hourly minimum can only judge an hourly role.
    if (minRate > 0 && !(j.salaryPeriod === 'hour' && (j.salaryMax ?? j.salaryMin) >= minRate)) return false
    return true
  }), [tempJobs, group, role, loc, minRate]) // eslint-disable-line react-hooks/exhaustive-deps

  /** One feed, newest first, each item in the card its data can fill. */
  const feed: FeedItem[] = useMemo(() => ([
    ...filteredJobs.map(({ job, at }) => ({ kind: 'job' as const, at, job })),
    ...filteredPosts.map(post => ({ kind: 'shift' as const, at: post.created_at || '', post })),
  ]).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
  [filteredJobs, filteredPosts])

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
    // author_name/author_avatar are set server-side (BEFORE INSERT trigger) from
    // the commenter's own profile — never trusted from the client — so we don't
    // send them. The returned row carries the authoritative identity.
    const { data, error } = await supabase.from('temp_post_comments').insert({
      post_id: post.id, user_id: userId, body,
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

  const anyFilter = !!(group || role || loc || minRate)

  return (
    <main>
      <Header />
      <div className={styles.page}>
        <div className={styles.grid}>
          {/* Left rail — filters (inline, not a nested component, so inputs keep focus) */}
          <aside className={styles.leftRail}>
            <div className={styles.filterTitle}>Category</div>
            <div className={styles.catCol}>
              <button className={`${styles.catBtn} ${!group ? styles.catBtnOn : ''}`} onClick={() => { setGroup(''); setRole('') }}>All temp work</button>
              {ROLE_GROUPS.map(g => (
                <div key={g.key}>
                  <button className={`${styles.catBtn} ${group === g.key ? styles.catBtnOn : ''}`} onClick={() => { setGroup(group === g.key ? '' : g.key); setRole('') }}>
                    {g.label}
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
            <div className={styles.filterTitle} style={{ marginTop: '1rem' }}>Where</div>
            <input className={styles.filterInput} placeholder="Location or postcode" value={loc} onChange={e => setLoc(e.target.value)} />
            {/* THE DATE FILTER IS GONE, deliberately. It could only ever match a
                dated shift, and every role on this page today is an ongoing
                vacancy with no date to match — so it filtered everything out the
                moment it was touched. A control that silently empties the page
                is worse than one that isn't there. It comes back with shifts. */}

            <div className={styles.filterTitle} style={{ marginTop: '1rem' }}>Min pay (£/hr)</div>
            <div className={styles.rateChips}>
              {RATE_PRESETS.map(r => (
                <button key={r} className={`${styles.roleChip} ${minRate === r ? styles.roleChipOn : ''}`} onClick={() => setMinRate(minRate === r ? 0 : r)}>
                  £{r}+
                </button>
              ))}
            </div>
            <p className={styles.rateHint}>Hourly shifts only</p>

            {anyFilter && <button className={styles.clearBtn} onClick={() => { setGroup(''); setRole(''); setLoc(''); setMinRate(0) }}>Clear filters</button>}
          </aside>

          {/* Centre feed */}
          <div className={styles.feed}>
            <div className={styles.feedHead}>
              <div>
                <h1 className={styles.h1}>Temp Work</h1>
                <p className={styles.h1sub}>Short-term roles and casual shifts. Apply to a role, or comment on a shift to put your name forward.</p>
              </div>
              {canPost && <Link href="/temp-work/post" className={styles.feedPostBtn}>+ Post</Link>}
            </div>

            {toast && <div className={styles.toast}>{toast}</div>}
            {usingExamples && <div className={styles.exNote}>No live shifts yet — here’s what posts look like. Real shifts replace these the moment one is posted.</div>}

            {loading ? (
              <div className={styles.empty}>Loading shifts…</div>
            ) : feed.length === 0 ? (
              <div className={styles.empty}>No temp work matches your filters right now.</div>
            ) : feed.map(item => item.kind === 'job' ? (
              <div key={`job-${item.job.id}`} className={styles.jobCardWrap}>
                <JobCard job={item.job} onSelect={j => router.push(`/jobs?id=${j.id}`)} />
              </div>
            ) : (() => {
              const post = item.post
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
                      {post.like_count > 0 && (
                        <span className={styles.engLikes}><ThumbsUp size={13} strokeWidth={2.4} /> {post.like_count}</span>
                      )}
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
                      <ThumbsUp size={16} strokeWidth={2.2} fill={liked ? 'currentColor' : 'none'} /> Like
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
                      {thread.map(c => {
                        // Only candidates have a profile page; the route enforces the
                        // app's existing employer-only gate, so we just link to it.
                        const profileHref = c.author_role === 'candidate' ? `/candidates/${c.user_id}` : null
                        const avatarInner = c.author_avatar
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={c.author_avatar} alt="" className={styles.avatarImg} />
                          : <span className={styles.cInitials}>{initialsOf(c.author_name || '?')}</span>
                        return (
                          <div key={c.id} className={styles.comment}>
                            {profileHref
                              ? <Link href={profileHref} className={styles.cAvatar} title={`View ${c.author_name || 'profile'}`}>{avatarInner}</Link>
                              : <span className={styles.cAvatar}>{avatarInner}</span>}
                            <div className={styles.cBubble}>
                              <div className={styles.cHead}>
                                {profileHref
                                  ? <Link href={profileHref} className={styles.cNameLink}>{c.author_name || 'Someone'}</Link>
                                  : <span className={styles.cName}>{c.author_name || 'Someone'}</span>}
                                {c.hidden && <span className={styles.cName}> · hidden</span>}
                                <span className={styles.cTime}>{timeAgo(c.created_at)}</span>
                              </div>
                              <p className={styles.cBody}>{c.body}</p>
                              {c.user_id === userId && (
                                <button className={styles.cDelete} onClick={() => deleteComment(post, c)}>Delete</button>
                              )}
                            </div>
                          </div>
                        )
                      })}

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
            })())}

            <p className={styles.disclaimer}>{DISCLAIMER}</p>
          </div>

          {/* Right rail — CTA / helper */}
          <aside className={styles.rightRail}>
            {canPost ? (
              <div className={styles.ctaCard}>
                <div className={styles.ctaTitle}>Hiring temp staff?</div>
                <p className={styles.ctaSub}>Post a dated shift and see who likes and comments. Ongoing casual roles go on the job board.</p>
                <Link href="/temp-work/post" className={styles.ctaBtn}>+ Post temp work</Link>
                <Link href="/temp-work/manage" className={styles.ctaLink}>Your posts & comments →</Link>
              </div>
            ) : (
              <div className={styles.ctaCard}>
                <div className={styles.ctaTitle}>How it works</div>
                {/* Two lines, one per card type. The label carries the weight so a
                    reader scanning on a phone can find their own case without
                    reading both. */}
                <p className={styles.ctaStep}>
                  <span className={styles.ctaStepLabel}>Short-term roles:</span> apply as you would any job.
                </p>
                <p className={styles.ctaStep}>
                  <span className={styles.ctaStepLabel}>Posted shifts:</span> like and comment — the employer reads the comments and gets in touch to book you.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
