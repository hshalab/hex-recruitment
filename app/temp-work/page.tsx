'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import {
  TEMP_CATEGORIES, categoryMeta, formatWhen, formatRate, timeAgo, DISCLAIMER,
  type TempPost,
} from '@/lib/tempWork'
import styles from './page.module.css'

export default function TempWorkPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<TempPost[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [canPost, setCanPost] = useState(false)
  const [myInterests, setMyInterests] = useState<Set<string>>(new Set())

  // filters
  const [cat, setCat] = useState<string>('')
  const [loc, setLoc] = useState('')
  const [date, setDate] = useState('')

  // per-card interest note
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('temp_posts')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
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
        const { data: mine } = await supabase
          .from('temp_interest')
          .select('temp_post_id')
          .eq('candidate_user_id', uid)
        setMyInterests(new Set((mine || []).map((r: { temp_post_id: string }) => r.temp_post_id)))
      }
    }
    init()
  }, [load])

  const filtered = useMemo(() => posts.filter(p => {
    if (cat && p.category !== cat) return false
    if (loc && !(`${p.location_area} ${p.postcode || ''}`.toLowerCase().includes(loc.toLowerCase()))) return false
    if (date && p.shift_date !== date) return false
    return true
  }), [posts, cat, loc, date])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const openInterest = (postId: string) => {
    if (!userId) { router.push(`/login/employee?redirect=${encodeURIComponent('/temp-work')}`); return }
    setNoteFor(postId); setNote('')
  }

  const sendInterest = async (post: TempPost) => {
    if (!userId) return
    setBusy(post.id)
    const { error } = await supabase.from('temp_interest').insert({
      temp_post_id: post.id,
      candidate_user_id: userId,
      message: note.trim() || null,
    })
    if (!error) {
      // Notify the poster (notifications insert is open; user_id = the post owner).
      supabase.from('notifications').insert({
        user_id: post.employer_id,
        type: 'temp_interest',
        title: 'New interest in your shift',
        message: `Someone is available for “${post.title}”.`,
        read: false,
        related_id: post.id,
        related_type: 'temp_post',
        link: '/temp-work/manage',
      }).then(() => {})
      setMyInterests(prev => new Set(prev).add(post.id))
      flash("You're on the list — the poster can see you're available.")
    } else if ((error as { code?: string }).code === '23505') {
      setMyInterests(prev => new Set(prev).add(post.id))
    } else {
      flash(error.message || 'Could not register interest.')
    }
    setBusy(null); setNoteFor(null); setNote('')
  }

  return (
    <main>
      <Header />
      <div className={styles.wrap}>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>Temp Work</h1>
            <p className={styles.sub}>Shifts and short-term gigs from hospitality employers. See one that fits? Tap “I’m available”.</p>
          </div>
          {canPost && (
            <Link href="/temp-work/post" className={styles.postBtn}>+ Post temp work</Link>
          )}
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <div className={styles.catRow}>
            <button className={`${styles.catChip} ${!cat ? styles.catChipOn : ''}`} onClick={() => setCat('')}>All</button>
            {TEMP_CATEGORIES.map(c => (
              <button key={c.key} className={`${styles.catChip} ${cat === c.key ? styles.catChipOn : ''}`} onClick={() => setCat(cat === c.key ? '' : c.key)}>
                <span aria-hidden>{c.icon}</span> {c.label}
              </button>
            ))}
          </div>
          <div className={styles.filterRow}>
            <input className={styles.filterInput} placeholder="Location or postcode" value={loc} onChange={e => setLoc(e.target.value)} />
            <input className={styles.filterInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
            {(cat || loc || date) && <button className={styles.clearBtn} onClick={() => { setCat(''); setLoc(''); setDate('') }}>Clear</button>}
          </div>
        </div>

        {toast && <div className={styles.toast}>{toast}</div>}

        {/* Feed */}
        {loading ? (
          <div className={styles.empty}>Loading shifts…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>No open shifts match your filters right now. Check back soon.</div>
        ) : (
          <div className={styles.feed}>
            {filtered.map(post => {
              const meta = categoryMeta(post.category)
              const interested = myInterests.has(post.id)
              const rate = formatRate(post)
              return (
                <article key={post.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.catBadge}><span aria-hidden>{meta.icon}</span> {meta.label}</span>
                    <span className={styles.posted}>{timeAgo(post.created_at)}</span>
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

                  {post.external_link && (
                    <a href={post.external_link} target="_blank" rel="noopener noreferrer" className={styles.extLink}>More details ↗</a>
                  )}

                  <div className={styles.actions}>
                    {interested ? (
                      <span className={styles.interested}>✓ You’re available</span>
                    ) : noteFor === post.id ? (
                      <div className={styles.noteBox}>
                        <textarea className={styles.noteInput} placeholder="Add a short note (optional) — e.g. your experience or availability" value={note} onChange={e => setNote(e.target.value)} rows={2} />
                        <div className={styles.noteBtns}>
                          <button className={styles.sendBtn} disabled={busy === post.id} onClick={() => sendInterest(post)}>{busy === post.id ? 'Sending…' : "I'm available"}</button>
                          <button className={styles.cancelBtn} onClick={() => { setNoteFor(null); setNote('') }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className={styles.availBtn} onClick={() => openInterest(post.id)}>I’m available</button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <p className={styles.disclaimer}>{DISCLAIMER}</p>
      </div>
    </main>
  )
}
