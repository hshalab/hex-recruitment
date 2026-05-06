'use client'

export type BackwardToInterviewChoice = 'cancel' | 'move-only' | 'move-and-schedule'

interface BackwardToInterviewModalProps {
  candidateName: string
  previousStageLabel: string
  onChoose: (choice: BackwardToInterviewChoice) => void
}

export default function BackwardToInterviewModal({
  candidateName,
  previousStageLabel,
  onChoose,
}: BackwardToInterviewModalProps) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={() => onChoose('cancel')}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', padding: '1.5rem' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
          Move {candidateName} back to Interview?
        </h3>
        <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
          They were at <strong>{previousStageLabel}</strong>. What's happening?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={() => onChoose('move-and-schedule')}
            style={{ padding: '0.7rem 1rem', border: 'none', borderRadius: 8, background: '#0f172a', color: '#FFE500', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', textAlign: 'left' }}
          >
            Move back + schedule new interview
          </button>
          <button
            onClick={() => onChoose('move-only')}
            style={{ padding: '0.7rem 1rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem', textAlign: 'left', color: '#0f172a' }}
          >
            Move back, no new interview
          </button>
          <button
            onClick={() => onChoose('cancel')}
            style={{ padding: '0.7rem 1rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem', textAlign: 'left', color: '#64748b' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
