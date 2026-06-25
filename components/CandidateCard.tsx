'use client'

import type { CSSProperties } from 'react'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import { FileDown, Camera, X } from 'lucide-react'
import { Candidate } from '@/lib/mockCandidates'
import { fallbackVariant } from '@/lib/jobBanner'
import styles from './CandidateCard.module.css'

function initialsOf(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}
function availClass(availability: string | undefined) {
  if (!availability) return styles.availGrey
  const l = availability.toLowerCase()
  if (l.includes('immediately') || l.includes('available') || l.includes('now')) return styles.availGreen
  if (l.includes('open') || l.includes('considering') || l.includes('notice')) return styles.availYellow
  return styles.availGrey
}

export interface MissingPrompt { key: string; label: string; onAdd: () => void }

/**
 * One candidate card, two modes from one data source (candidate_profiles).
 * - employer: completed fields only, faded-initials watermark (NEVER a personal
 *   photo), a CV tag instead of skills. Click opens the detail.
 * - dashboard: a large EDITABLE photo (dashboard_photo_url, dashboard-only),
 *   faded "Add" prompts for missing fields, and a visibility toggle.
 * Dashboard-only props/UI are gated behind mode==='dashboard'.
 */
export default function CandidateCard(props: {
  candidate: Candidate
  mode: 'employer' | 'dashboard'
  // employer
  matchScore?: number
  featured?: boolean
  onOpen?: () => void
  // dashboard
  dashboardPhotoUrl?: string | null
  photoUploading?: boolean
  onPhotoClick?: () => void
  onPhotoRemove?: () => void
  completionPct?: number
  missingFields?: MissingPrompt[]
  isDiscoverable?: boolean
  onToggleDiscoverable?: (next: boolean) => void
}) {
  const { candidate: c, mode } = props
  const v = fallbackVariant(c.id || c.fullName || 'thrive')
  const bgVars = { ['--fb-angle' as any]: `${v.angle}deg`, ['--fb-glow-x' as any]: `${v.glowX}%` } as CSSProperties
  const initials = initialsOf(c.fullName)

  // ─────────── EMPLOYER MODE ───────────
  if (mode === 'employer') {
    return (
      <div
        className={`${styles.card} ${styles.cardEmployer}`}
        onClick={props.onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && props.onOpen?.()}
      >
        <div className={styles.backdrop} style={bgVars} aria-hidden="true">
          <span className={styles.ghostInitials}>{initials}</span>
        </div>
        <div className={styles.scrim} aria-hidden="true" />

        {(props.matchScore || props.featured) && (
          <div className={styles.topBadges}>
            {props.matchScore ? <span className={styles.matchBadge}>{props.matchScore}% match</span> : null}
            {props.featured ? <span className={styles.featuredBadge}>⚡ Featured</span> : null}
          </div>
        )}

        <div className={styles.identity}>
          <span className={styles.chip}>{initials}</span>
          <span className={styles.identityName}>{c.fullName}</span>
        </div>

        <div className={styles.content}>
          <h3 className={styles.role}>{c.jobTitle}</h3>
          {c.headline && <p className={styles.cardHeadline}>{c.headline}</p>}
          <div className={styles.meta}>
            {c.location && <span>{c.location}</span>}
            {c.location && <span className={styles.dot}>·</span>}
            <span>{c.yearsExperience} yrs exp</span>
          </div>
          <div className={styles.badges}>
            {c.availability && (
              <span className={`${styles.badge} ${styles.availBadge} ${availClass(c.availability)}`}>
                <span className={styles.availDot} />{c.availability}
              </span>
            )}
            {c.cvUrl ? (
              <SignedLink src={c.cvUrl} download className={`${styles.badge} ${styles.cvTag}`} onClick={(e: any) => e.stopPropagation()}>
                <FileDown size={12} /> CV
              </SignedLink>
            ) : (
              <span className={`${styles.badge} ${styles.cvTagEmpty}`}><FileDown size={12} /> No CV</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─────────── DASHBOARD MODE ───────────
  const pct = props.completionPct ?? 0
  return (
    <div className={`${styles.card} ${styles.cardDashboard}`}>
      <div className={styles.backdrop} style={bgVars} aria-hidden="true" />
      <div className={styles.dashScrim} aria-hidden="true" />

      {/* Large editable photo */}
      <div className={styles.dashPhotoWrap}>
        <button
          type="button"
          className={styles.dashPhoto}
          onClick={props.onPhotoClick}
          disabled={props.photoUploading}
          aria-label={props.dashboardPhotoUrl ? 'Change your profile photo' : 'Add a profile photo'}
          title={props.dashboardPhotoUrl ? 'Change your profile photo' : 'Add a profile photo'}
        >
          {props.dashboardPhotoUrl ? (
            <SignedImage src={props.dashboardPhotoUrl} alt={c.fullName} className={styles.dashPhotoImg} />
          ) : (
            <span className={styles.dashPhotoInitials}>{initials}</span>
          )}
          <span className={styles.dashPhotoOverlay} aria-hidden="true">
            {props.photoUploading ? <span className={styles.dashSpinner} /> : <Camera size={22} />}
          </span>
        </button>
        {props.dashboardPhotoUrl && !props.photoUploading && (
          <button type="button" className={styles.dashPhotoRemove} onClick={props.onPhotoRemove} aria-label="Remove your profile photo" title="Remove photo"><X size={13} /></button>
        )}
      </div>

      <h3 className={styles.dashName}>{c.fullName}</h3>
      <p className={styles.dashTitle}>{c.jobTitle || 'Add your job title'}{c.location ? ` · ${c.location}` : ''}</p>

      {/* Progress */}
      <div className={styles.dashProgress}>
        <div className={styles.dashProgressBar}><div className={styles.dashProgressFill} style={{ width: `${pct}%` }} /></div>
        <span className={styles.dashProgressLabel}>{pct}% complete</span>
      </div>

      {/* Missing-field Add prompts */}
      {props.missingFields && props.missingFields.length > 0 && (
        <div className={styles.dashPrompts}>
          {props.missingFields.map(f => (
            <button key={f.key} type="button" className={styles.dashPrompt} onClick={f.onAdd}>
              + {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Visibility toggle */}
      <div className={styles.dashToggleRow}>
        <label className={styles.dashToggle}>
          <input
            type="checkbox"
            checked={!!props.isDiscoverable}
            onChange={(e) => props.onToggleDiscoverable?.(e.target.checked)}
          />
          <span className={styles.dashToggleTrack}><span className={styles.dashToggleThumb} /></span>
          <span className={styles.dashToggleText}>
            <strong>Make my profile visible to employers</strong>
            <span className={styles.dashToggleHelp}>When on, employers can find your profile in candidate search and contact you.</span>
          </span>
        </label>
      </div>
    </div>
  )
}
