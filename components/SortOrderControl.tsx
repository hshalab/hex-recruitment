'use client'

import { supabase } from '@/lib/supabase'

// The two sort orders the pipeline page honours. Persisted on
// employer_profiles.pipeline_sort_order as a TEXT column with a CHECK
// constraint — if you add a third value here you must also extend the
// CHECK in the migration.
export type PipelineSortOrder = 'oldest_in_stage' | 'newest_first'

export const PIPELINE_SORT_ORDERS: { id: PipelineSortOrder; label: string; shortLabel: string }[] = [
  { id: 'oldest_in_stage', label: 'Oldest in stage', shortLabel: 'Oldest' },
  { id: 'newest_first', label: 'Newest first', shortLabel: 'Newest' },
]

interface SortOrderControlProps {
  value: PipelineSortOrder
  // Caller flips local state immediately (optimistic) so the pipeline
  // re-sorts without waiting on the round-trip. Persistence happens in
  // the background — if it fails the local state is already authoritative
  // until reload, when the un-persisted preference falls back to the DB.
  onChange: (next: PipelineSortOrder) => void
  // The signed-in employer's user_id, needed for the persistence UPDATE.
  // If undefined the control is still interactive but the persistence
  // call is skipped — handles the "still loading session" beat without
  // racing.
  employerId: string | null
}

export default function SortOrderControl({ value, onChange, employerId }: SortOrderControlProps) {
  const handleClick = async (next: PipelineSortOrder) => {
    if (next === value) return
    onChange(next)
    if (!employerId) return
    await supabase
      .from('employer_profiles')
      .update({ pipeline_sort_order: next })
      .eq('user_id', employerId)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Pipeline sort order"
      data-testid="sort-order-control"
      style={{
        display: 'inline-flex',
        background: '#f1f5f9',
        borderRadius: 999,
        padding: 3,
        gap: 0,
        // Don't expand to fill — the topBar lays this out next to the
        // job filter on desktop and stacks it underneath on mobile.
        // A fixed inline-flex stops it stretching to fill.
        flexShrink: 0,
      }}
    >
      {PIPELINE_SORT_ORDERS.map(o => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            data-testid={`sort-order-${o.id}`}
            data-active={active ? 'true' : 'false'}
            onClick={() => handleClick(o.id)}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 999,
              border: 'none',
              background: active ? '#0f172a' : 'transparent',
              color: active ? '#FFE500' : '#475569',
              fontSize: '0.8rem',
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
