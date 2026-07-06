'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId, getEmployerCapabilities } from '@/lib/employer'
import { ROLE_GROUPS, RATE_TYPES, DISCLAIMER } from '@/lib/tempWork'

const C = { border: '#e2e8f0', sub: '#64748b', ink: '#0f172a', yellow: '#ffe500' }
const label: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.3rem' }
const input: React.CSSProperties = { width: '100%', padding: '0.6rem 0.75rem', border: `1px solid ${C.border}`, borderRadius: 9, fontSize: '0.9rem', boxSizing: 'border-box' }
const group: React.CSSProperties = { marginBottom: '1rem' }

export default function PostTempWorkPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'denied' | 'ready'>('loading')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [isOngoing, setIsOngoing] = useState(false)
  const [shiftDate, setShiftDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [locationArea, setLocationArea] = useState('')
  const [postcode, setPostcode] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [rateType, setRateType] = useState<'hour' | 'shift' | 'day'>('hour')
  const [headcount, setHeadcount] = useState('1')
  const [externalLink, setExternalLink] = useState('')

  const [imageUrl, setImageUrl] = useState('')
  const [imgUploading, setImgUploading] = useState(false)
  const [imgError, setImgError] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push(`/login/employer?redirect=${encodeURIComponent('/temp-work/post')}`); return }
      if (session.user.user_metadata?.role !== 'employer') { router.push('/dashboard'); return }
      const caps = await getEmployerCapabilities(supabase)
      if (!caps.manage_jobs) { setPhase('denied'); return }
      const oid = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
      setOwnerId(oid)
      // Denormalise poster identity so the public feed can show it without
      // reading employer_profiles (which isn't publicly readable).
      const { data: prof } = await supabase.from('employer_profiles').select('company_name, logo_url').eq('user_id', oid).maybeSingle()
      setCompanyName(prof?.company_name || session.user.user_metadata?.company_name || null)
      setCompanyLogo(prof?.logo_url || null)
      setPhase('ready')
    }
    init()
  }, [router])

  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgUploading(true); setImgError('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('bucket', 'temp-posts')
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setImgError(json.error || 'Upload failed'); return }
      setImageUrl(json.url || json.dataUrl || '')
    } catch { setImgError('Upload failed. Please try again.') }
    finally { setImgUploading(false) }
  }

  const submit = async () => {
    setError('')
    if (!title.trim()) { setError('Add a title.'); return }
    if (!category) { setError('Pick a category.'); return }
    if (!locationArea.trim()) { setError('Add a location.'); return }
    if (!ownerId) return
    setBusy(true)
    const { data, error: insErr } = await supabase.from('temp_posts').insert({
      employer_id: ownerId,
      title: title.trim(),
      category,
      description: description.trim() || null,
      is_ongoing: isOngoing,
      shift_date: isOngoing || !shiftDate ? null : shiftDate,
      start_time: isOngoing || !startTime ? null : startTime,
      end_time: isOngoing || !endTime ? null : endTime,
      location_area: locationArea.trim(),
      postcode: postcode.trim() || null,
      hourly_rate: hourlyRate ? Number(hourlyRate) : null,
      rate_type: rateType,
      headcount: Math.max(1, Number(headcount) || 1),
      image_url: imageUrl || null,
      external_link: externalLink.trim() || null,
      company_name: companyName,
      company_logo: companyLogo,
      status: 'open',
    }).select('id').maybeSingle()
    setBusy(false)
    if (insErr) { setError(insErr.message || 'Could not post.'); return }
    router.push('/temp-work/manage')
  }

  const wrap: React.CSSProperties = { maxWidth: 620, margin: '2rem auto', padding: '0 1rem' }

  if (phase === 'loading') return <main><Header /><div style={{ ...wrap, textAlign: 'center', color: C.sub }}>Loading…</div></main>
  if (phase === 'denied') return (
    <main><Header /><div style={{ ...wrap, textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Post temp work</h1>
      <p style={{ color: C.sub }}>You need the “manage jobs” permission to post. Ask your account owner for access.</p>
      <Link href="/temp-work" style={{ color: '#334155' }}>← Back to Temp Work</Link>
    </div></main>
  )

  return (
    <main>
      <Header />
      <div style={wrap}>
        <Link href="/temp-work" style={{ color: C.sub, fontSize: '0.85rem', textDecoration: 'none' }}>← Temp Work</Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.4rem 0 0.25rem', color: C.ink }}>Post temp work</h1>
        <p style={{ color: C.sub, fontSize: '0.9rem', marginBottom: '1.5rem' }}>Post a shift or short-term gig. Workers browse and tap “I’m available”; you take it from there.</p>

        <div style={group}>
          <label style={label}>Title</label>
          <input style={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Bar staff for Saturday event" />
        </div>

        <div style={group}>
          <label style={label}>Role</label>
          <select style={input} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Choose a role…</option>
            {ROLE_GROUPS.map(g => (
              <optgroup key={g.key} label={`${g.icon} ${g.label}`}>
                {g.roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div style={group}>
          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isOngoing} onChange={e => setIsOngoing(e.target.checked)} />
            Ongoing / flexible (no fixed date)
          </label>
        </div>

        {!isOngoing && (
          <div style={{ display: 'flex', gap: '0.75rem', ...group }}>
            <div style={{ flex: 1 }}><label style={label}>Date</label><input style={input} type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={label}>Start</label><input style={input} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={label}>End</label><input style={input} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', ...group }}>
          <div style={{ flex: 2 }}><label style={label}>Location / area</label><input style={input} value={locationArea} onChange={e => setLocationArea(e.target.value)} placeholder="e.g. Shoreditch, London" /></div>
          <div style={{ flex: 1 }}><label style={label}>Postcode</label><input style={input} value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="EC1A" /></div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', ...group }}>
          <div style={{ flex: 1 }}><label style={label}>Rate (£)</label><input style={input} type="number" min="0" step="0.5" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="14" /></div>
          <div style={{ flex: 1 }}><label style={label}>Per</label>
            <select style={input} value={rateType} onChange={e => setRateType(e.target.value as any)}>
              {RATE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}><label style={label}>Headcount</label><input style={input} type="number" min="1" value={headcount} onChange={e => setHeadcount(e.target.value)} /></div>
        </div>

        <div style={group}>
          <label style={label}>Description</label>
          <textarea style={{ ...input, resize: 'vertical' }} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="What's the shift, who are you after, anything they should know…" />
        </div>

        <div style={group}>
          <label style={label}>Image (optional)</label>
          {imageUrl && <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 10, marginBottom: 8, display: 'block' }} />}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onImage} disabled={imgUploading} />
          {imgUploading && <span style={{ marginLeft: 8, color: C.sub, fontSize: '0.82rem' }}>Uploading…</span>}
          {imgError && <p style={{ color: '#b91c1c', fontSize: '0.82rem', margin: '0.3rem 0 0' }}>{imgError}</p>}
        </div>

        <div style={group}>
          <label style={label}>External link (optional)</label>
          <input style={input} value={externalLink} onChange={e => setExternalLink(e.target.value)} placeholder="https://…" />
        </div>

        {error && <p style={{ color: '#b91c1c', fontSize: '0.88rem', marginBottom: '0.75rem' }}>{error}</p>}

        <button onClick={submit} disabled={busy} style={{ padding: '0.7rem 1.4rem', background: C.yellow, color: C.ink, fontWeight: 700, fontSize: '0.95rem', border: 'none', borderRadius: 10, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Posting…' : 'Post to Temp Work'}
        </button>

        <p style={{ marginTop: '1.5rem', fontSize: '0.78rem', lineHeight: 1.5, color: '#94a3b8' }}>{DISCLAIMER}</p>
      </div>
    </main>
  )
}
