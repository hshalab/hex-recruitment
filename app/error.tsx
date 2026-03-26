'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '0.75rem' }}>Something went wrong</h1>
      <p style={{ fontSize: '0.95rem', color: '#6b7280', marginBottom: '1.5rem', maxWidth: '400px' }}>
        We encountered an unexpected error. Please try again.
      </p>
      <button
        onClick={reset}
        style={{ background: '#0f172a', color: '#FFE500', border: 'none', borderRadius: '8px', padding: '0.625rem 1.5rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  )
}
