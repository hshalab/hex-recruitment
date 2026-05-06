'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  onDismiss: () => void
  durationMs?: number
}

export default function Toast({ message, onDismiss, durationMs = 4000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [onDismiss, durationMs])

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9000,
        background: '#0f172a',
        color: '#fff',
        padding: '0.75rem 1.25rem',
        borderRadius: 10,
        fontSize: '0.875rem',
        fontWeight: 500,
        lineHeight: 1.4,
        maxWidth: 360,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
      }}
    >
      {message}
    </div>
  )
}
