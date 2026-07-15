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

export interface MissingPrompt { key: string; label: string; onAdd: () => void; benefit?: string }

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
  mode: 'employer' | 'dashboard' | 'directory'
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
  fieldsComplete?: number
  fieldsTotal?: number
  missingFields?: MissingPrompt[]
  isDiscoverable?: boolean
  onToggleDiscoverable?: (next: boolean) => void
}) {
  const { candidate: c, mode } = props
  const v = fallbackVariant(c.id || c.fullName || 'thrive')
  const bgVars = { ['--fb-angle' as any]: `${v.angle}deg`, ['--fb-glow-x' as any]: `${v.glowX}%` } as CSSProperties
  const initials = initialsOf(c.fullName)

  // ─────────── DIRECTORY MODE (/candidates) ───────────
  // Compact, light card: a prominent initials avatar with the name stacked
  // directly above the role, then location/experience and the availability + CV
  // pills tucked tightly beneath. No watermark; no personal photo (privacy —
  // employers see initials only, same as the banner card).
  if (mode === 'directory') {
    return (
      <div
        className={`${styles.card} ${styles.cardDirectory}`}
        onClick={props.onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && props.onOpen?.()}
      >
        {(props.matchScore || props.featured) && (
          <div className={styles.dirTopBadges}>
            {props.matchScore ? <span className={styles.matchBadge}>{props.matchScore}% match</span> : null}
            {props.featured ? <span className={styles.dirFeatured}>⚡ Featured</span> : null}
          </div>
        )}

        <div className={styles.dirHeader}>
          <span className={styles.dirAvatar} aria-hidden="true">{initials}</span>
          <div className={styles.dirNameRole}>
            <span className={styles.dirName}>{c.fullName}</span>
            {c.jobTitle && <span className={styles.dirRole}>{c.jobTitle}</span>}
          </div>
        </div>

        <div className={styles.dirMeta}>
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
    )
  }

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
  // Compact card: identity top-left, toggle top-right, the completion bar as the
  // centrepiece (no watermark), then employer-style data + Add to-dos at the
  // bottom. Flows to its own height — no large empty centre.
  const pct = Math.max(0, Math.min(100, Math.round(props.completionPct ?? 0)))
  const showCount = props.fieldsTotal != null && props.fieldsComplete != null
  return (
    <div className={`${styles.card} ${styles.cardDashboard}`}>
      <div className={styles.dashInner}>
        {/* Top row: identity (editable chip + name) left, visibility toggle right */}
        <div className={styles.dashTop}>
          <div className={styles.dashId}>
            <span className={styles.dashChipWrap}>
              <button
                type="button"
                className={styles.dashChip}
                onClick={props.onPhotoClick}
                disabled={props.photoUploading}
                aria-label={props.dashboardPhotoUrl ? 'Change your profile photo' : 'Add a profile photo'}
                title={props.dashboardPhotoUrl ? 'Change your profile photo' : 'Add a profile photo'}
              >
                {props.dashboardPhotoUrl ? (
                  <SignedImage src={props.dashboardPhotoUrl} alt={c.fullName} className={styles.dashChipImg} />
                ) : (
                  <span className={styles.dashChipInitials}>{initials}</span>
                )}
                <span className={styles.dashChipOverlay} aria-hidden="true">
                  {props.photoUploading ? <span className={styles.dashSpinner} /> : <Camera size={24} />}
                </span>
              </button>
              {props.dashboardPhotoUrl && !props.photoUploading && (
                <button type="button" className={styles.dashChipRemove} onClick={props.onPhotoRemove} aria-label="Remove your profile photo" title="Remove photo"><X size={12} /></button>
              )}
            </span>
            <span className={styles.identityName}>{c.fullName}</span>
          </div>

          <label className={styles.dashToggleCompact} title="When on, employers can find your profile in candidate search and contact you.">
            <input
              type="checkbox"
              checked={!!props.isDiscoverable}
              onChange={(e) => props.onToggleDiscoverable?.(e.target.checked)}
            />
            <span className={styles.dashToggleTrack}><span className={styles.dashToggleThumb} /></span>
            <span className={styles.dashToggleLabel}>{props.isDiscoverable ? 'Visible to employers' : 'Hidden from employers'}</span>
          </label>
        </div>

        {/* Middle: completion bar centrepiece, with the Add to-dos right below it */}
        <div className={styles.dashMid}>
          <div className={styles.dashProgress}>
            <div className={styles.dashProgressTrack}><div className={styles.dashProgressFill} style={{ width: `${pct}%` }} /></div>
            <div className={styles.dashProgressMeta}>
              <span className={styles.dashProgressPct}>{pct === 100 ? 'Profile complete' : `${pct}% complete`}</span>
              {showCount && <span className={styles.dashProgressCount}>{props.fieldsComplete} of {props.fieldsTotal} fields</span>}
            </div>
          </div>
          {props.missingFields && props.missingFields.length > 0 && (
            <div className={styles.dashPrompts}>
              {props.missingFields.map(f => (
                <button key={f.key} type="button" className={styles.dashPrompt} onClick={f.onAdd} title={f.benefit ? `Add ${f.label} — ${f.benefit}` : undefined}>+ {f.label}{f.benefit && <span style={{ opacity: 0.6, fontWeight: 400 }}> → {f.benefit}</span>}</button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom: employer-style data */}
        <div className={styles.dashBottom}>
          <h3 className={styles.dashRole}>{c.jobTitle || 'Add your job title'}</h3>
          <div className={styles.dashMeta}>
            {c.location && <span>{c.location}</span>}
            {c.location && <span className={styles.dot}>·</span>}
            <span>{c.yearsExperience} yrs</span>
            {c.availability && (
              <span className={`${styles.badge} ${styles.availBadge} ${availClass(c.availability)}`}>
                <span className={styles.availDot} />{c.availability}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
