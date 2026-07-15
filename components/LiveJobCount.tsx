'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Small, reusable trust cue: "N roles live now" with a pulsing green dot.
// Reads the real active-job count via the anon client (same public read the
// homepage + feed use). Fail-soft: renders nothing on error or a zero/failed
// count, so it never shows a broken or "0 roles" state. Respects
// prefers-reduced-motion for the pulse.
export default function LiveJobCount({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { count: n, error } = await supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
        if (!cancelled && !error && typeof n === 'number' && n > 0) setCount(n)
      } catch {
        /* fail-soft: show nothing */
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (count === null) return null

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.95rem', ...style }}
    >
      <span aria-hidden="true" className="liveDot" />
      <span>
        <strong>{count.toLocaleString('en-GB')}</strong> roles live now
      </span>
      <style jsx>{`
        .liveDot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6);
          animation: livePulse 2s infinite;
          flex: none;
        }
        @keyframes livePulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
          70% { box-shadow: 0 0 0 7px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .liveDot { animation: none; }
        }
      `}</style>
    </div>
  )
}
