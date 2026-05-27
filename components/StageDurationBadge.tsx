'use client'

// "N days in [Stage]" badge that renders on every pipeline card. Live-
// computed from stage_entered_at — never stored as an integer so the
// label is always current relative to the user's clock rather than
// the moment the card was loaded.
//
// Thresholds are global, not per-stage. 7+ days bumps the visual
// emphasis (subtle amber tint); 14+ days strengthens it (full amber
// border + bolder text). The two breakpoints are deliberately small
// and small — the badge is informational, not alarming. Per-stage
// thresholds (e.g. "1 day in Offered is stale, 7 days in Reviewing
// is fine") are post-launch tuning, intentionally out of scope.

const SUBTLE_EMPHASIS_DAYS = 7
const STRONGER_EMPHASIS_DAYS = 14

interface StageDurationBadgeProps {
  stageEnteredAt: string
  stageLabel: string
}

// Date-only days between (UTC midnight semantics) so a card moved at
// 23:59 yesterday reads as "1 day" rather than "Today" through to
// "23:59 today". Math.floor on ms-since-epoch can off-by-one for
// cards that cross local midnight; toDateString() collapses to the
// calendar day in the local timezone, which is what employers expect.
function dayDifference(fromIso: string, now: Date = new Date()): number {
  const from = new Date(fromIso)
  // Normalise both to the local calendar day. UTC math would split
  // cards by the timezone offset, e.g. a card moved at 01:00 GMT
  // shows as "1 day" rather than "Today" for a UK user immediately
  // after the move.
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((nowMidnight - fromMidnight) / 86400000)
  return Math.max(0, days)
}

export default function StageDurationBadge({ stageEnteredAt, stageLabel }: StageDurationBadgeProps) {
  const days = dayDifference(stageEnteredAt)

  let label: string
  if (days === 0) label = 'Today'
  else if (days === 1) label = `1 day in ${stageLabel}`
  else label = `${days} days in ${stageLabel}`

  // Three tiers. Default → grey neutral. 7+ → soft amber tint, slight
  // border darkening, label stays the same. 14+ → fuller amber bg,
  // saturated border, slightly heavier text weight. The progression
  // is informational; no warning copy, no badge change.
  let style: React.CSSProperties
  if (days >= STRONGER_EMPHASIS_DAYS) {
    style = {
      background: '#fef3c7',
      border: '1px solid #f59e0b',
      color: '#78350f',
      fontWeight: 600,
    }
  } else if (days >= SUBTLE_EMPHASIS_DAYS) {
    style = {
      background: '#fefce8',
      border: '1px solid #fde68a',
      color: '#854d0e',
      fontWeight: 500,
    }
  } else {
    style = {
      background: '#f1f5f9',
      border: '1px solid #e2e8f0',
      color: '#64748b',
      fontWeight: 500,
    }
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
