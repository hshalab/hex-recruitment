'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type ViewSource = 'search' | 'direct' | 'recommendation' | 'saved' | 'external'

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

/**
 * Custom hook for tracking job analytics events.
 *
 * Provides three tracking functions that insert rows into
 * `job_views`, `job_click_events`, and `job_impressions`.
 *
 * `trackJobView` is debounced per job — the same user viewing
 * the same job within 30 seconds will not create a duplicate row.
 */
export function useAnalyticsTracking() {
  const [userId, setUserId] = useState<string | null>(null)

  // Map of jobId → timestamp of last tracked view (for debounce)
  const recentViews = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id)
    })
  }, [])

  const trackJobView = useCallback(
    async (jobId: string, source: ViewSource) => {
      // ANONYMOUS VIEWS COUNT NOW, and they go through the server.
      //
      // This used to return early when there was no session, so a signed-out
      // visitor was never counted on any path — and everyone arriving from a
      // shared link is signed out. The number measured signed-in browsing while
      // being read as reach.
      //
      // It also cannot be fixed on the client: the only INSERT policy on
      // job_views is granted to `authenticated`, and anon has no EXECUTE on
      // increment_job_views. A signed-out write fails twice, silently. So it
      // moved to /api/jobs/[id]/view, which needs no policy change and no
      // migration — see the long note there.
      //
      // NOTHING IDENTIFYING IS STORED. viewer_id is the signed-in user or null.
      // No cookie, no IP, no fingerprint. The debounce below is an in-memory Map
      // for the life of the page and is never persisted, so a signed-out view is
      // a bare increment.
      //
      // WHAT NOT DEDUPLICATING COSTS: a reload counts again, and the same person
      // reading an ad on two days counts twice. The figure is an honest
      // over-count of OPENS, not a count of PEOPLE. See CLAUDE.md.

      // Debounce: skip if the same job was opened in the last 30 seconds
      const now = Date.now()
      const lastView = recentViews.current.get(jobId)
      if (lastView && now - lastView < 30_000) return
      recentViews.current.set(jobId, now)

      try {
        // Read the token at call time rather than trusting the userId state.
        // The session resolves asynchronously, so a signed-in candidate who
        // opened a job quickly used to be skipped entirely — the old code's own
        // warning said "no userId yet".
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/jobs/${jobId}/view`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ source, device: getDeviceType() }),
        })
        if (!res.ok) console.error('[Analytics] trackJobView failed:', res.status)
      } catch (err) {
        // Tracking must never be the reason a page breaks.
        console.error('[Analytics] trackJobView error:', err)
      }
    },
    [],
  )

  const trackClickEvent = useCallback(
    async (jobId: string, eventType: string) => {
      if (!userId) return

      const { error } = await supabase.from('job_click_events').insert({
        job_id: jobId,
        user_id: userId,
        event_type: eventType,
      })
      if (error) {
        console.error('[Analytics] trackClickEvent failed:', error.message, { jobId, eventType })
      }
    },
    [userId],
  )

  const trackImpression = useCallback(
    async (jobId: string, searchQuery: string, position: number) => {
      if (!userId) return

      const { error } = await supabase.from('job_impressions').insert({
        job_id: jobId,
        user_id: userId,
        search_query: searchQuery,
        position,
      })
      if (error) {
        console.error('[Analytics] trackImpression failed:', error.message, { jobId, searchQuery })
      }
    },
    [userId],
  )

  return { trackJobView, trackClickEvent, trackImpression }
}
