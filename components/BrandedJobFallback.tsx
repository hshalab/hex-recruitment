'use client'

import type { CSSProperties } from 'react'
import { fallbackVariant } from '@/lib/jobBanner'
import styles from './BrandedJobFallback.module.css'

/**
 * The universal "no uploaded photo" state for a job banner: a branded Thrive
 * panel (navy gradient + faded Thrive lockup + slogan) with a large ghosted
 * company initial for per-employer variation. All branding is watermark-weight
 * so that, where job text is overlaid (the card), the title/company/salary stay
 * crisp under the bottom scrim. Rendered identically in the card, the inline
 * desktop detail, and the JobDetailModal so the look is consistent everywhere.
 *
 * Sizes use container-query units so the same component scales correctly across
 * the tall card slot and the short detail-header strips. It fills its (relatively
 * positioned) parent — no scrim of its own; each slot keeps its existing scrim.
 */
export default function BrandedJobFallback({
  company,
  seed,
  className,
}: {
  company?: string | null
  seed?: string | null
  className?: string
}) {
  const initial = (company || '?').trim().charAt(0).toUpperCase() || '?'
  const v = fallbackVariant(seed || company || 'thrive')
  const vars = {
    '--fb-angle': `${v.angle}deg`,
    '--fb-glow-x': `${v.glowX}%`,
  } as CSSProperties

  return (
    <div className={`${styles.fallback} ${className || ''}`} style={vars} aria-hidden="true">
      <span className={styles.ghost}>{initial}</span>
      <div className={styles.brand}>
        <span className={styles.mark}>
          <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" />
            <path d="M7 8h10M12 8v8" stroke="#0A1628" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </span>
        <span className={styles.wordmark}>thrive</span>
        <span className={styles.slogan}>Hire faster. Apply smarter.</span>
      </div>
    </div>
  )
}
