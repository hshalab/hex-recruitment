'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import RichTextEditor from './RichTextEditor'
import { sanitizeNoteHtml, NOTE_MAX_HTML } from '@/lib/sanitizeNoteHtml'
import styles from './PrepNotesModal.module.css'

interface PrepNotesModalProps {
  isOpen: boolean
  onClose: () => void
  interviewId: string
  candidateName: string
  jobTitle: string
}

type SaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export default function PrepNotesModal({
  isOpen,
  onClose,
  interviewId,
  candidateName,
  jobTitle,
}: PrepNotesModalProps) {
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [dirty, setDirty] = useState(false)

  // Refs so the debounce/close/blur paths always see current values without
  // re-creating callbacks.
  const bodyRef = useRef('')
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const savedRef = useRef('') // last successfully persisted value
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tooLong = (bodyRef.current?.length ?? 0) > NOTE_MAX_HTML

  // Load the existing note when the modal opens.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoaded(false)
    setStatus('loading')
    setDirty(false)
    dirtyRef.current = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const res = await fetch(`/api/interviews/${interviewId}/notes`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        // Sanitise on render too (defence-in-depth before it reaches the editor).
        const clean = sanitizeNoteHtml(json?.body ?? '')
        setBody(clean)
        bodyRef.current = clean
        savedRef.current = clean
        setStatus('idle')
        setLoaded(true)
      } catch {
        if (cancelled) return
        setStatus('error')
        setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, interviewId])

  const saveNow = useCallback(async () => {
    if (savingRef.current) return
    const current = bodyRef.current
    // Nothing to do if unchanged since the last successful save.
    if (current === savedRef.current) { setDirty(false); dirtyRef.current = false; return }
    if ((current?.length ?? 0) > NOTE_MAX_HTML) { setStatus('error'); return }

    savingRef.current = true
    setStatus('saving')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/interviews/${interviewId}/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body: current }),
      })
      if (!res.ok) throw new Error(`save failed ${res.status}`)
      const json = await res.json().catch(() => ({}))
      // Adopt the server's sanitised value as the source of truth.
      const persisted = typeof json?.body === 'string' ? json.body : current
      savedRef.current = persisted
      setStatus('saved')
      setDirty(false)
      dirtyRef.current = false
    } catch {
      setStatus('error')
    } finally {
      savingRef.current = false
    }
  }, [interviewId])

  const handleChange = useCallback((html: string) => {
    setBody(html)
    bodyRef.current = html
    const changed = html !== savedRef.current
    setDirty(changed)
    dirtyRef.current = changed
    if (changed) setStatus('idle')
    // Debounced autosave.
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void saveNow() }, 900)
  }, [saveNow])

  // Save-on-blur of the editor area.
  const handleBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (dirtyRef.current) void saveNow()
  }, [saveNow])

  // Save-on-close, then close.
  const handleClose = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (dirtyRef.current && !tooLong) await saveNow()
    onClose()
  }, [onClose, saveNow, tooLong])

  // Flush a pending debounce if the modal unmounts.
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  if (!isOpen) return null

  const statusLabel =
    status === 'saving' ? 'Saving…'
    : status === 'saved' && !dirty ? 'Saved'
    : status === 'error' ? "Couldn't save"
    : dirty ? 'Unsaved changes'
    : ''

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Prep notes</h2>
            <p className={styles.subtitle}>{candidateName} · {jobTitle}</p>
          </div>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.hint}>
            Private to you — the candidate never sees this. Jot the questions or
            things you want to cover in this interview.
          </p>

          {!loaded ? (
            <div className={styles.loading}>Loading note…</div>
          ) : (
            <div onBlur={handleBlur}>
              <RichTextEditor
                value={body}
                onChange={handleChange}
                placeholder="Add prep questions or notes for this interview…"
              />
            </div>
          )}

          {tooLong && (
            <p className={styles.tooLong}>
              This note is too long ({body.length.toLocaleString()} / {NOTE_MAX_HTML.toLocaleString()} characters of formatting). Trim it to save.
            </p>
          )}
        </div>

        <div className={styles.footer}>
          <span
            className={`${styles.status} ${
              status === 'saved' && !dirty ? styles.statusSaved
              : status === 'error' ? styles.statusError
              : status === 'saving' ? styles.statusSaving
              : ''
            }`}
            aria-live="polite"
          >
            {status === 'saved' && !dirty && <span aria-hidden="true">✓ </span>}
            {statusLabel}
          </span>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => void saveNow()}
              disabled={!dirty || status === 'saving' || tooLong}
            >
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={styles.doneBtn} onClick={handleClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
