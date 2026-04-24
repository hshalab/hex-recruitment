'use client'

import { useRef, useState, useEffect } from 'react'
import SignatureCanvas from 'react-signature-canvas'

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void
  height?: number
  disabled?: boolean
}

/**
 * Touch/mouse/stylus signature capture. Renders a bordered canvas that
 * resizes to its container width. Calls onChange with a base64 PNG data URL
 * whenever the user finishes a stroke, or null if the pad is cleared.
 */
export default function SignaturePad({ onChange, height = 180, disabled }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(400)
  const [empty, setEmpty] = useState(true)

  // Keep the canvas width in sync with its container (responsive on mobile).
  // SignatureCanvas doesn't auto-resize; we also need to re-read the drawn
  // data after a resize since the internal canvas is recreated.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const measure = () => setWidth(el.clientWidth || 400)
    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleEnd = () => {
    const pad = sigRef.current
    if (!pad) return
    if (pad.isEmpty()) {
      setEmpty(true)
      onChange(null)
      return
    }
    setEmpty(false)
    // Use toDataURL directly — getTrimmedCanvas has a bundling bug with
    // react-signature-canvas 1.1.0-alpha.2 (trim-canvas default export).
    const dataUrl = pad.toDataURL('image/png')
    onChange(dataUrl)
  }

  const handleClear = () => {
    sigRef.current?.clear()
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div
        ref={wrapRef}
        style={{
          border: '1px dashed #cbd5e1',
          borderRadius: 8,
          background: '#fff',
          touchAction: 'none',
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      >
        <SignatureCanvas
          ref={sigRef}
          penColor="#0f172a"
          canvasProps={{
            width,
            height,
            style: { display: 'block', width: '100%', height, borderRadius: 8 },
          }}
          onEnd={handleEnd}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: '0.72rem', color: empty ? '#94a3b8' : '#16a34a' }}>
          {empty ? 'Sign above using your finger, mouse or stylus' : '✓ Signature captured'}
        </span>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || empty}
          style={{
            fontSize: '0.72rem',
            color: empty ? '#cbd5e1' : '#0369a1',
            background: 'none',
            border: 'none',
            cursor: empty ? 'not-allowed' : 'pointer',
            textDecoration: empty ? 'none' : 'underline',
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}
