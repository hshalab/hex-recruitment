'use client'

import { useEffect, useRef, useState } from 'react'
import SignaturePad from './SignaturePad'

export interface ReviewAndSignProps {
  /** Letter body — rendered verbatim with whitespace-pre-wrap */
  bodyText: string
  /** Role-aware copy and behavior */
  role: 'employer' | 'candidate'
  /** Sub-header copy beneath the title */
  subCopy: string
  /** Label above the signer name input (e.g. "Hiring Manager name") */
  signerNameLabel: string
  /** Required declaration sentence — caller MUST supply role-appropriate wording */
  declarationText: string
  /** Sign button label (e.g. "Sign and send" / "Counter-sign offer") */
  signButtonLabel: string
  /** Controlled: typed full name */
  signerName: string
  onSignerNameChange: (value: string) => void
  /** Controlled: drawn signature PNG data URL (or null when cleared) */
  signatureDataUrl: string | null
  onSignatureChange: (dataUrl: string | null) => void
  /** Triggered when the user clicks the Sign button — caller does the work */
  onSign: () => void
  /** Triggered when the user clicks Cancel */
  onCancel: () => void
  /** Disables Sign/Cancel during async work */
  submitting?: boolean
  /**
   * Optional: download-link handler. If provided, a "Download PDF copy" link
   * appears near the header. Caller is responsible for generating + delivering
   * the file (employer side builds on demand; candidate side uses signed URL).
   */
  onDownloadPdf?: () => void | Promise<void>
}

const SCROLL_THRESHOLD_PX = 50

export default function ReviewAndSign({
  bodyText,
  role,
  subCopy,
  signerNameLabel,
  declarationText,
  signButtonLabel,
  signerName,
  onSignerNameChange,
  signatureDataUrl,
  onSignatureChange,
  onSign,
  onCancel,
  submitting = false,
  onDownloadPdf,
}: ReviewAndSignProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false)
  const [acceptedDeclaration, setAcceptedDeclaration] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Evaluate whether the panel is already fully visible (short letter case).
  // Runs on mount AND on resize so a user resizing the window mid-review
  // doesn't get stuck behind the gate when content shrinks to fit.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const evaluateFit = () => {
      if (el.scrollHeight <= el.clientHeight + SCROLL_THRESHOLD_PX) {
        setHasScrolledToEnd(true)
      }
    }
    evaluateFit()

    const ro = new ResizeObserver(evaluateFit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [bodyText])

  // The 'scroll' event fires for ALL scroll mechanisms — wheel, touch,
  // keyboard (PageDown/Space/arrows), trackpad pinch — so listening here
  // covers every input modality.
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || hasScrolledToEnd) return
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
    if (distanceFromBottom <= SCROLL_THRESHOLD_PX) {
      setHasScrolledToEnd(true)
    }
  }

  const handleDownload = async () => {
    if (!onDownloadPdf || downloading) return
    setDownloading(true)
    try { await onDownloadPdf() } finally { setDownloading(false) }
  }

  const canSign =
    hasScrolledToEnd
    && acceptedDeclaration
    && !!signatureDataUrl
    && signerName.trim().length > 0
    && !submitting

  return (
    <div data-testid="review-and-sign" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            Review the offer letter
          </h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
            {subCopy}
          </p>
        </div>
        {onDownloadPdf && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            data-testid="download-pdf-link"
            style={{
              fontSize: '0.75rem',
              color: '#0369a1',
              background: 'none',
              border: 'none',
              cursor: downloading ? 'wait' : 'pointer',
              textDecoration: 'underline',
              padding: 0,
              alignSelf: 'flex-start',
            }}
          >
            {downloading ? 'Preparing…' : '⬇ Download PDF copy'}
          </button>
        )}
      </div>

      {/* Scrollable letter body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        tabIndex={0}
        data-testid="review-scroll-panel"
        style={{
          maxHeight: '60vh',
          minHeight: 240,
          overflowY: 'auto',
          background: '#fff',
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          padding: '1rem 1.125rem',
          whiteSpace: 'pre-wrap',
          fontFamily: 'Georgia, serif',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          color: '#1e293b',
          outline: 'none',
        }}
      >
        {bodyText}
      </div>

      {/* Scroll-gate hint (visible only when gate is closed) */}
      {!hasScrolledToEnd && (
        <p
          data-testid="scroll-gate-hint"
          style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}
        >
          Scroll to the end of the letter to enable signing.
        </p>
      )}

      {/* Signer name + signature pad (locked until gate is open) */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '0.875rem',
          opacity: hasScrolledToEnd ? 1 : 0.5,
          transition: 'opacity 200ms ease',
        }}
      >
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
          {signerNameLabel} *
        </label>
        <input
          type="text"
          value={signerName}
          onChange={(e) => onSignerNameChange(e.target.value)}
          disabled={!hasScrolledToEnd || submitting}
          placeholder={role === 'employer' ? 'e.g. Paul Davies, HR Manager' : 'Type your full legal name'}
          data-testid="signer-name-input"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: '0.85rem',
            boxSizing: 'border-box',
            marginBottom: '0.625rem',
          }}
        />

        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
          Draw your signature *
        </label>
        <SignaturePad
          onChange={onSignatureChange}
          height={140}
          disabled={!hasScrolledToEnd || submitting}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
            marginTop: '0.75rem',
            fontSize: '0.78rem',
            color: '#334155',
            cursor: hasScrolledToEnd ? 'pointer' : 'not-allowed',
          }}
        >
          <input
            type="checkbox"
            checked={acceptedDeclaration}
            onChange={(e) => setAcceptedDeclaration(e.target.checked)}
            disabled={!hasScrolledToEnd || submitting}
            data-testid="declaration-checkbox"
            style={{ marginTop: 2 }}
          />
          <span>{declarationText}</span>
        </label>
      </div>

      {/* Action buttons — sticky on small viewports for thumb reach */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          background: 'rgba(255,255,255,0.95)',
          paddingTop: '0.5rem',
          display: 'flex',
          gap: '0.625rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          data-testid="cancel-button"
          style={{
            flex: '1 1 30%',
            padding: '0.625rem',
            background: '#fff',
            color: '#334155',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSign}
          disabled={!canSign}
          data-testid="sign-button"
          title={!canSign && hasScrolledToEnd ? 'Type your name, draw your signature and tick the declaration to enable.' : undefined}
          style={{
            flex: '1 1 60%',
            padding: '0.625rem',
            background: canSign ? '#0f172a' : '#94a3b8',
            color: canSign ? '#FFE500' : '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: canSign ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Sending…' : signButtonLabel}
        </button>
      </div>
    </div>
  )
}
