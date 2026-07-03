'use client'

// Guided employer onboarding tour (driver.js). Coach-mark steps over the real
// dashboard + the display-only ExampleShowcase. Auto-starts once for a new,
// unflagged, EMPTY employer; replayable anytime via the "Take the tour" button.
// Completion/skip is persisted per USER (user_onboarding) so we never re-nag.

import { useCallback, useEffect, useRef } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { supabase } from '@/lib/supabase'
import './tour.css'

// Steps keyed to data-tour anchors. The example-* anchors only exist when the
// account is empty (ExampleShowcase rendered); we filter to present anchors at
// run time, so a replay on a populated dashboard just shows what's there.
const STEP_DEFS: { el?: string; title: string; description: string }[] = [
  { el: '[data-tour="stats"]', title: 'Your dashboard at a glance', description: 'Live jobs, applications, interviews and views — your key numbers always sit here.' },
  { el: '[data-tour="example-job"]', title: 'Post a job', description: 'This is an example listing. Post your first job and candidates start applying within hours.' },
  { el: '[data-tour="example-pipeline"]', title: 'Track your pipeline', description: 'Every applicant moves through your stages — from Applied to Offered — with a simple drag.' },
  { el: '[data-tour="example-interview"]', title: 'Schedule interviews', description: 'Set your availability and candidates book a slot themselves — no back-and-forth.' },
  { el: '[data-tour="example-offer"]', title: 'Send offers', description: 'Make an offer, and the candidate signs it right here on Thrive.' },
  { title: "You're all set", description: 'Post your first job to get started — you can replay this tour anytime from “Take the tour”.' },
]

function buildSteps(): DriveStep[] {
  const steps: DriveStep[] = []
  for (const s of STEP_DEFS) {
    if (s.el) {
      if (typeof document !== 'undefined' && !document.querySelector(s.el)) continue
      steps.push({ element: s.el, popover: { title: s.title, description: s.description } })
    } else {
      steps.push({ popover: { title: s.title, description: s.description } })
    }
  }
  return steps
}

export default function EmployerTour({ isEmpty }: { isEmpty: boolean }) {
  const userIdRef = useRef<string | null>(null)
  const autoStartedRef = useRef(false)

  const persistCompleted = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) return
    try {
      await supabase.from('user_onboarding').upsert(
        { user_id: uid, employer_tour_completed_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    } catch { /* non-fatal: worst case the tour offers once more */ }
  }, [])

  const startTour = useCallback(() => {
    const steps = buildSteps()
    if (steps.length === 0) return
    const d = driver({
      showProgress: true,
      allowClose: true, // Esc / overlay closes
      overlayColor: 'rgba(15,23,42,0.6)',
      popoverClass: 'thrive-tour',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      steps,
      // Fires on finish AND on skip/close — mark done either way so we don't re-nag.
      onDestroyed: () => { persistCompleted() },
    })
    d.drive()
  }, [persistCompleted])

  // Auto-start once for a new, unflagged, empty employer.
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      userIdRef.current = user.id

      if (!isEmpty) return // examples aren't on screen; don't auto-run
      const { data } = await supabase
        .from('user_onboarding')
        .select('employer_tour_completed_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (data?.employer_tour_completed_at) return // already completed/skipped
      if (autoStartedRef.current) return
      autoStartedRef.current = true
      // Let the dashboard + showcase finish painting so the anchors exist.
      setTimeout(() => { if (!cancelled) startTour() }, 700)
    }
    init()
    return () => { cancelled = true }
  }, [isEmpty, startTour])

  return (
    <button type="button" className="thrive-tour-trigger" onClick={startTour}>
      <span aria-hidden>🧭</span> Take the tour
    </button>
  )
}
