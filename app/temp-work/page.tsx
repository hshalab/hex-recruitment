'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import {
  ROLE_GROUPS, roleMeta, rolesInGroup, formatWhen, formatRate, timeAgo, initialsOf, DISCLAIMER,
  type TempPost,
} from '@/lib/tempWork'
import { EXAMPLE_TEMP_POSTS } from '@/lib/tempExamples'
import styles from './page.module.css'

export default function TempWorkPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<TempPost[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [canPost, setCanPost] = useState(false)
  const [myInterests, setMyInterests] = useState<Set<string>>(new Set())

  const [group, setGroup] = useState('')
  const [role, setRole] = useState('')
  const [loc, setLoc] = useState('')
  const [date, setDate] = useState('')

  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
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
        const { data: mine } = await supabase.from('temp_interest').select('temp_post_id').eq('candidate_user_id', uid)
        setMyInterests(new Set((mine || []).map((r: { temp_post_id: string }) => r.temp_post_id)))
      }
    }
    init()
  }, [load])

  const usingExamples = !loading && posts.length === 0
  const visible: TempPost[] = usingExamples ? EXAMPLE_TEMP_POSTS : posts

  const filtered = useMemo(() => visible.filter(p => {
    if (usingExamples) return true
    if (role && p.category !== role) return false
    if (!role && group && !rolesInGroup(group).includes(p.category)) return false
    if (loc && !(`${p.location_area} ${p.postcode || ''}`.toLowerCase().includes(loc.toLowerCase()))) return false
    if (date && p.shift_date !== date) return false
    return true
  }), [visible, usingExamples, group, role, loc, date])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const openInterest = (postId: string) => {
    if (!userId) { router.push(`/login/employee?redirect=${encodeURIComponent('/temp-work')}`); return }
    setNoteFor(postId); setNote('')
  }

  const sendInterest = async (post: TempPost) => {
    if (!userId) return
    setBusy(post.id)
    const { error } = await supabase.from('temp_interest').insert({
      temp_post_id: post.id, candidate_user_id: userId, message: note.trim() || null,
    })
    if (!error) {
      supabase.from('notifications').insert({
        user_id: post.employer_id, type: 'temp_interest',
        title: 'New interest in your shift', message: `Someone is available for “${post.title}”.`,
        read: false, related_id: post.id, related_type: 'temp_post', link: '/temp-work/manage',
      }).then(() => {})
      setMyInterests(prev => new Set(prev).add(post.id))
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, interest_count: p.interest_count + 1 } : p))
      flash("You're on the list — the poster can see you're available.")
    } else if ((error as { code?: string }).code === '23505') {
      setMyInterests(prev => new Set(prev).add(post.id))
    } else flash(error.message || 'Could not register interest.')
    setBusy(null); setNoteFor(null); setNote('')
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
                <p className={styles.h1sub}>Shifts and short-term gigs. See one that fits? Tap “I’m available”.</p>
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
              const interested = myInterests.has(post.id)
              const isEx = !!post.isExample
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

                  <div className={styles.cardFoot}>
                    <span className={styles.count}>{post.interest_count} interested</span>
                    {isEx ? (
                      <button className={styles.availBtn} disabled title="This is an example post">I’m available</button>
                    ) : interested ? (
                      <span className={styles.interested}>✓ You’re available</span>
                    ) : noteFor === post.id ? null : (
                      <button className={styles.availBtn} onClick={() => openInterest(post.id)}>I’m available</button>
                    )}
                  </div>

                  {!isEx && noteFor === post.id && (
                    <div className={styles.noteBox}>
                      <textarea className={styles.noteInput} rows={2} placeholder="Add a short note (optional) — your experience or availability" value={note} onChange={e => setNote(e.target.value)} />
                      <div className={styles.noteBtns}>
                        <button className={styles.sendBtn} disabled={busy === post.id} onClick={() => sendInterest(post)}>{busy === post.id ? 'Sending…' : "Send — I'm available"}</button>
                        <button className={styles.cancelBtn} onClick={() => { setNoteFor(null); setNote('') }}>Cancel</button>
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
                <p className={styles.ctaSub}>Post it to the feed and see who’s available.</p>
                <Link href="/temp-work/post" className={styles.ctaBtn}>+ Post temp work</Link>
                <Link href="/temp-work/manage" className={styles.ctaLink}>Your posts & interest →</Link>
              </div>
            ) : (
              <div className={styles.ctaCard}>
                <div className={styles.ctaTitle}>How it works</div>
                <p className={styles.ctaSub}>Browse shifts, tap “I’m available”, and the employer gets in touch to book you directly.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
