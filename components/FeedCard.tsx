'use client'

import type { ReactNode } from 'react'
import CompanyLogo from '@/components/CompanyLogo'
import BrandedJobFallback from '@/components/BrandedJobFallback'
import BrandedLogoFallback from '@/components/BrandedLogoFallback'

// THE card. One shape, one set of rules, used by /jobs and by both card types in
// the /temp-work feed.
//
// Why this exists: the temp feed put a short white text card next to a tall dark
// photo card and it read as two products in one column. The fix isn't to style
// the shift card LIKE the job card — that's the arrangement that drifts apart
// the moment either page is touched. It's for there to be one card that takes a
// model, and for a job and a shift to be two ways of filling that model in.
//
// Anything genuinely per-page is a prop: the controls in the top-right corner
// (bookmark on /jobs, like + comment on a shift) come in as `controls`, and the
// card knows nothing about what they do.
//
// ON THE STYLESHEET: this imports app/jobs/page.module.css rather than owning a
// copy — same trade as before, kept deliberately. Sharing the sheet is what makes
// visual drift between the pages impossible, which is the property being bought.
import styles from '@/app/jobs/page.module.css'

export interface FeedCardBadge {
  label: string
  /** Yellow-outlined, for the one badge that is a call to action. */
  accent?: boolean
}

export interface FeedCardModel {
  /** Used to seed the branded fallback so an employer's card looks the same each time. */
  id: string
  banner: string | null
  logo: string | null
  company: string
  /** Appended to the company in dimmer text, e.g. "· via recruiter". */
  companyNote?: string | null
  title: string
  /** The location line. */
  where: string
  /** Already formatted — the card never does money. */
  pay?: string | null
  badges: FeedCardBadge[]
  isNew?: boolean
}

export interface FeedCardProps {
  model: FeedCardModel
  onSelect?: () => void
  /** Top-right overlay controls. */
  controls?: ReactNode
  /** Top-left/other stamps, e.g. "Applied ✓", "SHORTLISTED", "Example". */
  stamps?: ReactNode
  boosted?: boolean
  /** Dashed outline for illustrative content. */
  example?: boolean
}

export default function FeedCard({
  model, onSelect, controls, stamps, boosted, example,
}: FeedCardProps) {
  const initial = (model.company || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className={`${styles.jobCard} ${model.banner ? '' : styles.jobCardFallback} ${boosted ? styles.jobCardBoosted : ''}`}
      style={example ? { outline: '2px dashed rgba(148,163,184,.9)', outlineOffset: -2 } : undefined}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={e => { if (onSelect && e.key === 'Enter') onSelect() }}
    >
      {model.banner
        ? <div className={styles.cardBg} style={{ backgroundImage: `url(${model.banner})` }} aria-hidden="true" />
        : model.logo
          ? <BrandedLogoFallback logoUrl={model.logo} company={model.company} seed={model.id} />
          : <BrandedJobFallback company={model.company} seed={model.id} />}
      <div className={styles.cardScrim} aria-hidden="true" />

      {model.isNew && <span className={styles.cardNew}>New</span>}
      {controls}

      <div className={styles.cardContent}>
        <div className={styles.cardCompanyRow}>
          <span className={styles.cardChip}>
            {model.logo
              ? <CompanyLogo src={model.logo} alt={model.company} className={styles.cardChipImg} />
              : initial}
          </span>
          <span className={styles.cardCompany}>
            {model.company}
            {model.companyNote && <span className={styles.cardViaRecruiter}> {model.companyNote}</span>}
          </span>
        </div>
        <h3 className={styles.cardRole}>{model.title}</h3>
        <div className={styles.cardMeta}>
          <span>{model.where}</span>
          {model.pay && <>
            <span className={styles.cardDot}>·</span>
            <span className={styles.cardSalary}>{model.pay}</span>
          </>}
        </div>
        <div className={styles.cardBadges}>
          {model.badges.map((b, i) => (
            <span key={i} className={`${styles.cardBadge} ${b.accent ? styles.cardBadgeApply : ''}`}>{b.label}</span>
          ))}
        </div>
      </div>

      {stamps}
    </div>
  )
}
