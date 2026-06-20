'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { fallbackVariant } from '@/lib/jobBanner'
import BrandedJobFallback from './BrandedJobFallback'
import styles from './BrandedLogoFallback.module.css'

/**
 * The "no uploaded photo, but the employer HAS a logo" state for a job banner.
 * Renders the same branded navy panel as <BrandedJobFallback> (with the same
 * per-company gradient variation) but makes the employer's own logo the
 * centrepiece instead of the generic Thrive lockup.
 *
 * The treatment is picked automatically per logo so it always reads, and is
 * NEVER allowed to look worse than the plain Thrive card:
 *   - 'bare'   logo sits straight on the navy — for light/white logos and for
 *              opaque logos whose own dark background melts into the panel
 *              (e.g. a gold-on-near-black crest).
 *   - 'plaque' logo on a clean white card floating on the navy — for dark or
 *              coloured logos on transparent/light backgrounds, where direct-
 *              on-navy contrast can't be guaranteed.
 *   - reject   if the logo can't be read, is too small/low-res, near-empty, or
 *              awkwardly shaped → fall back to <BrandedJobFallback> unchanged.
 *
 * Analysis is a tiny client-side canvas sample of the logo (dominant luminance
 * + transparency + background colour). If the canvas read is blocked (cross-
 * origin), we can't reject on content but we DO keep the size check, and we
 * default to the plaque — the safest choice for the common (dark/coloured) case.
 */

type Decision = 'pending' | 'reject' | { mode: 'bare' | 'plaque' }

const MIN_DIM = 48          // px: anything smaller than this is too low-res to feature
const MAX_ASPECT = 5        // reject extreme letterbox/strip logos
const SAMPLE = 64           // downscale longest edge to this for the pixel sample
const ALPHA_OPAQUE = 32     // alpha above this counts as "ink"
const MIN_CONTENT = 0.02    // reject if <2% of pixels are ink (essentially empty)
const LUM_SPLIT = 135       // content/background luminance split for light vs dark
const BG_DARK = 120         // opaque-bg luminance below this melts into the navy

function lum(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Inspect the logo pixels and decide how (or whether) to feature it. */
function analyzeLogo(url: string): Promise<Decision> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let settled = false
    const done = (d: Decision) => { if (!settled) { settled = true; resolve(d) } }

    img.onerror = () => done('reject')
    img.onload = () => {
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      if (!nw || !nh || Math.min(nw, nh) < MIN_DIM) return done('reject')
      if (Math.max(nw, nh) / Math.min(nw, nh) > MAX_ASPECT) return done('reject')

      // Size check passed. Try to read pixels; if blocked, default to plaque.
      try {
        const scale = SAMPLE / Math.max(nw, nh)
        const w = Math.max(1, Math.round(nw * scale))
        const h = Math.max(1, Math.round(nh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return done({ mode: 'plaque' })
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)

        let inkCount = 0
        let inkLum = 0
        let cornerAlpha = 0
        let cornerLum = 0
        let cornerCount = 0
        const edge = (x: number, y: number) =>
          x < 2 || y < 2 || x > w - 3 || y > h - 3

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            const a = data[i + 3]
            const l = lum(data[i], data[i + 1], data[i + 2])
            if (a > ALPHA_OPAQUE) { inkCount++; inkLum += l }
            if (edge(x, y)) { cornerCount++; cornerAlpha += a; cornerLum += l }
          }
        }

        const total = w * h
        if (inkCount / total < MIN_CONTENT) return done('reject')

        const avgInkLum = inkLum / inkCount
        const transparentBg = cornerCount > 0 && cornerAlpha / cornerCount < 40

        if (transparentBg) {
          // Transparent PNG: choose by the ink's own luminance.
          return done({ mode: avgInkLum < LUM_SPLIT ? 'plaque' : 'bare' })
        }
        // Opaque image with a baked-in background: a dark background melts into
        // the navy (logo pops 'bare'); a light/coloured one frames better on a
        // white plaque.
        const avgCornerLum = cornerLum / cornerCount
        return done({ mode: avgCornerLum < BG_DARK ? 'bare' : 'plaque' })
      } catch {
        // Cross-origin canvas read blocked — keep the size check, default safe.
        return done({ mode: 'plaque' })
      }
    }

    img.src = url
  })
}

export default function BrandedLogoFallback({
  logoUrl,
  company,
  seed,
  className,
}: {
  logoUrl: string
  company?: string | null
  seed?: string | null
  className?: string
}) {
  const [decision, setDecision] = useState<Decision>('pending')
  const [shown, setShown] = useState(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    setDecision('pending')
    setShown(false)
    analyzeLogo(logoUrl).then((d) => {
      if (!alive) return
      setDecision(d)
      if (typeof d === 'object') {
        // next frame so the fade-in transition actually runs
        rafRef.current = requestAnimationFrame(() => alive && setShown(true))
      }
    })
    return () => {
      alive = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [logoUrl])

  // Unsuitable → the plain Thrive card, identical to the no-logo path.
  if (decision === 'reject') {
    return <BrandedJobFallback company={company} seed={seed} className={className} />
  }

  const v = fallbackVariant(seed || company || 'thrive')
  const vars = {
    '--fb-angle': `${v.angle}deg`,
    '--fb-glow-x': `${v.glowX}%`,
  } as CSSProperties
  const mode = typeof decision === 'object' ? decision.mode : null

  return (
    <div className={`${styles.fallback} ${className || ''}`} style={vars} aria-hidden="true">
      {mode && (
        <div className={`${styles.logoLayer} ${shown ? styles.show : ''}`}>
          {mode === 'plaque' ? (
            <div className={styles.plaque}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className={styles.plaqueLogo} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className={styles.bareLogo} />
          )}
        </div>
      )}
    </div>
  )
}
