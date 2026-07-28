'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  parseNudgeState,
  pickNudge,
  canShowNudge,
  contextFromState,
  type NudgeKey,
  type NudgeState,
} from '@/lib/nudges'
import { missingKeys, satisfiedKeys, specFor, type NudgeCandidate } from '@/lib/nudgeFields'

// ONE contextual nudge, at most, on the candidate dashboard.
//
// Renders in the normal page flow — never a modal, never an overlay, never
// anything the candidate has to dismiss before using the product. If the rules
// in lib/nudges.ts say no, or the migration isn't applied, or anything at all
// fails, this renders nothing: a missed prompt costs far less than a page that
// won't load or a user who feels nagged.

interface Props {
  candidate: NudgeCandidate | null
}

export default function ProfileNudge({ candidate }: Props) {
  const router = useRouter()
  const [key, setKey] = useState<NudgeKey | null>(null)
  const [dismissing, setDismissing] = useState(false)

  const post = useCallback(async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    return fetch('/api/profile/nudge-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    }).catch(() => null)
  }, [])

  useEffect(() => {
    if (!candidate) return
    let cancelled = false

    ;(async () => {
      try {
        // One request: records this dashboard load and starts a new session if
        // it's been long enough. Sessions are counted server-side now, so a
        // candidate who never closes their tab still gets one, and opening
        // extra tabs can't manufacture them.
        const res = await post({ action: 'seen' })
        if (!res || !res.ok) return
        const json = await res.json()
        // Migration not applied → nudges are simply off.
        if (json?.available === false) return

        let state: NudgeState = parseNudgeState(json?.nudgeState)

        // Retire anything they've since filled in, so a completed field can
        // never come back round. ONE request for all of them — see the note in
        // the route about the lost update this used to cause.
        const done = satisfiedKeys(candidate).filter(k => !state.completed[k])
        if (done.length > 0) {
          const updated = await post({ action: 'completed', keys: done })
          if (updated?.ok) state = parseNudgeState((await updated.json())?.nudgeState)
        }

        const outstanding = missingKeys(candidate)
        const ctx = contextFromState(state)

        if (process.env.NODE_ENV !== 'production') {
          // The rules decline silently by design — a nudge must never break the
          // dashboard — which makes "why is nothing showing?" unanswerable from
          // the browser. In development, say so.
          console.info('[nudge]', {
            sessionCount: ctx.sessionCount,
            shownThisSession: ctx.shownThisSession,
            outstanding,
            decisions: outstanding.map(k => `${k}: ${canShowNudge(k, state, ctx).reason ?? 'ALLOWED'}`),
          })
        }

        if (outstanding.length === 0 || cancelled) return

        const chosen = pickNudge(outstanding, state, ctx)
        if (!chosen || cancelled) return

        setKey(chosen)
        void post({ action: 'shown', key: chosen })
      } catch {
        /* never let a nudge break the dashboard */
      }
    })()

    return () => { cancelled = true }
  }, [candidate, post])

  if (!key) return null
  const spec = specFor(key)
  if (!spec) return null

  const dismiss = () => {
    setDismissing(true)
    void post({ action: 'dismissed', key })
    setKey(null)
  }

  return (
    <div className="nudge" role="status">
      <div className="nudgeText">
        <p className="nudgeTitle">{spec.title}</p>
        <p className="nudgeBody">{spec.body}</p>
      </div>
      <div className="nudgeActions">
        <button type="button" className="nudgeCta" onClick={() => router.push(spec.link)}>
          {spec.cta}
        </button>
        <button
          type="button"
          className="nudgeDismiss"
          onClick={dismiss}
          disabled={dismissing}
          aria-label="Not now"
          title="Not now"
        >
          ✕
        </button>
      </div>

      <style jsx>{`
        .nudge {
          display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
          background: #fffdf0; border: 1px solid #ffe500; border-radius: 12px;
          padding: 0.9rem 1rem; margin: 0 0 1.25rem;
        }
        .nudgeText { flex: 1 1 260px; min-width: 0; }
        .nudgeTitle { margin: 0 0 0.15rem; font-size: 0.98rem; font-weight: 700; color: #0f172a; }
        .nudgeBody { margin: 0; font-size: 0.88rem; line-height: 1.45; color: #475569; }
        .nudgeActions { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
        .nudgeCta {
          background: #ffe500; color: #0f172a; border: none; border-radius: 8px;
          padding: 0.55rem 1rem; font-size: 0.88rem; font-weight: 700; cursor: pointer; white-space: nowrap;
        }
        .nudgeDismiss {
          background: transparent; border: none; color: #94a3b8;
          font-size: 0.95rem; line-height: 1; padding: 0.45rem; cursor: pointer; border-radius: 6px;
        }
        .nudgeDismiss:hover { color: #475569; background: #f1f5f9; }
        .nudgeDismiss:disabled { opacity: 0.5; cursor: default; }
        @media (max-width: 520px) {
          .nudgeActions { margin-left: 0; width: 100%; }
          .nudgeCta { flex: 1; }
        }
      `}</style>
    </div>
  )
}
