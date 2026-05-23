'use client'

// Bottom-sheet stage picker for the pipeline page. Opens when an
// employer taps a card body on mobile (the horizontal-scroll board
// makes drag-drop impractical on touch). Picking a destination calls
// onPick — the consumer is expected to route that through intentToMove
// so the same three drag-era gates fire on tap as on drag.
//
// The sheet is presentation-only: it does NOT write to the DB, does
// NOT open the schedule / backward-to-interview / cascade-confirm
// modals itself, and does NOT carry any business logic about which
// destinations are legal. The parent owns all of that — this file just
// renders five rows and reports which one the user picked.
//
// Style is inline rather than a CSS Module because the sheet inherits
// design tokens directly from the inline pattern used by the other
// pipeline-page modals (BackwardToInterviewModal, the inline restore /
// backward-move confirms). Keeping all four pipeline-page modals in
// the same visual style without a fresh .module.css is the lower-
// surface-area choice.

interface Stage {
  id: string
  label: string
  color: string
}

interface StagePickerSheetProps {
  candidateName: string
  currentStageLabel: string
  currentStageId: string
  stages: Stage[]
  stageOrder: readonly string[]
  onPick: (newStatusId: string) => void
  onClose: () => void
}

export default function StagePickerSheet({
  candidateName,
  currentStageLabel,
  currentStageId,
  stages,
  stageOrder,
  onPick,
  onClose,
}: StagePickerSheetProps) {
  const currentIdx = stageOrder.indexOf(currentStageId)

  // Destinations = all stages except the card's current stage AND
  // except 'rejected' (which is reachable only via kebab → Decline so
  // the candidate email gets sent). For a card in any of the 5 non-
  // rejected stages, that leaves 4 destinations.
  const destinations = stages.filter(
    (s) => s.id !== currentStageId && s.id !== 'rejected',
  )

  // Surface the gate-shape per destination so the employer knows what
  // a tap will trigger. Forward-into-Interview always opens scheduling
  // (regardless of where the card came from). Backward moves either
  // preserve audit (from Hired/Offered) or open a plain cascade-confirm
  // (the rest). Forward-non-interview moves are silent — no sub-label.
  const subLabelFor = (targetId: string): string | null => {
    if (targetId === 'interview') return 'Opens scheduling'
    const targetIdx = stageOrder.indexOf(targetId)
    const isBackward = currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx
    if (!isBackward) return null
    if (currentStageId === 'hired' || currentStageId === 'offered') {
      return 'Backward move — preserves audit log'
    }
    return 'Backward move — opens confirm'
  }

  return (
    <div
      data-testid="stage-picker-sheet"
      role="dialog"
      aria-label={`Move ${candidateName}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          width: '100%',
          maxWidth: 520,
          borderRadius: '16px 16px 0 0',
          padding: '0.875rem 1.25rem 1.5rem',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.12)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 4,
            background: '#cbd5e1',
            borderRadius: 2,
            margin: '0 auto 0.875rem',
          }}
        />
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
          Move {candidateName}
        </h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748b' }}>
          Currently in {currentStageLabel}. Pick a destination.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {destinations.map((d) => {
            const sub = subLabelFor(d.id)
            return (
              <button
                key={d.id}
                type="button"
                data-testid={`stage-picker-row-${d.id}`}
                aria-label={`Move to ${d.label}`}
                onClick={() => onPick(d.id)}
                style={{
                  padding: '0.75rem 0.875rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  background: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: d.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#0f172a' }}>
                    {d.label}
                  </div>
                  {sub && (
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                      {sub}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
          <button
            type="button"
            data-testid="stage-picker-cancel"
            onClick={onClose}
            style={{
              padding: '0.65rem',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              background: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem',
              color: '#64748b',
              marginTop: '0.25rem',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
