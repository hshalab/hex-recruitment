'use client'

import { daysInStage } from '@/lib/stageDuration'

// "N days in [Stage]" badge that renders on every pipeline card. Live-
// computed from stage_entered_at — never stored as an integer so the
// label is always current relative to the user's clock rather than
// the moment the card was loaded.
//
// The pill always takes the column's stage colour for visual
// consistency across the board (every column reads the same regardless
// of how long the card has sat). The 7d / 14d thresholds remain on the
// element as data-emphasis attributes so tests / sorts / future
// styling tweaks can still detect a stale card without inspecting
// computed styles, but they no longer override the colour — earlier
// passes used amber for that, which made staleness visible at the cost
// of leaving Interview / Offered / Hired pills the wrong colour for
// their column. If we want staleness signalling back, prefer a small
// ⏱ glyph / weight bump / pulse rather than swapping the colour.

const SUBTLE_EMPHASIS_DAYS = 7
const STRONGER_EMPHASIS_DAYS = 14

interface StageDurationBadgeProps {
  stageEnteredAt: string
  stageLabel: string
  /**
   * Stage accent colour (e.g. '#3b82f6' for Reviewing). When supplied,
   * the default tier renders as a quiet stage-tinted pill — soft
   * background, full-saturation text, thin matching border. Without
   * it (or in the >=7d / >=14d tiers) the original grey/amber visuals
   * still apply so the urgency cue is preserved.
   */
  stageColor?: string
}

export default function StageDurationBadge({ stageEnteredAt, stageLabel, stageColor }: StageDurationBadgeProps) {
  // Moved to lib/stageDuration.ts so the phone pipeline's "waiting 4d" note is
  // the SAME number as this badge's "4 days in Shortlisted" rather than a
  // second implementation of it. The local-midnight semantics are subtle
  // enough that two copies would have drifted.
  const days = daysInStage(stageEnteredAt)

  let label: string
  if (days === 0) label = 'Today'
  else if (days === 1) label = `1 day in ${stageLabel}`
  else label = `${days} days in ${stageLabel}`

  // Quiet stage-tinted pill — every column renders identically:
  // 12 % tinted bg, 30 % matching border, full-saturation text. If no
  // stageColor is supplied (legacy callers), fall back to the neutral
  // grey that pre-dates the restyle. The 7d/14d thresholds still drive
  // data-emphasis below for tests, but no longer change the colour.
  const style: React.CSSProperties = stageColor
    ? {
        background: `color-mix(in srgb, ${stageColor} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${stageColor} 30%, transparent)`,
        color: stageColor,
        fontWeight: 600,
      }
    : {
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        color: '#64748b',
        fontWeight: 500,
      }

  return (
    <span
      data-testid="stage-duration-badge"
      data-stage-days={days}
      // data-emphasis lets e2e + visual tests assert the threshold
      // crossings without inspecting computed styles. 'none' < 'subtle'
      // < 'stronger' — only one tier is active at a time.
      data-emphasis={days >= STRONGER_EMPHASIS_DAYS ? 'stronger' : days >= SUBTLE_EMPHASIS_DAYS ? 'subtle' : 'none'}
      title={`Entered ${stageLabel} on ${new Date(stageEnteredAt).toLocaleDateString()}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.15rem 0.5rem',
        borderRadius: 999,
        fontSize: '0.7rem',
        lineHeight: 1.4,
        ...style,
      }}
    >
      {label}
    </span>
  )
}
