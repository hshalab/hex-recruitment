'use client'

// Guided employer onboarding tour (driver.js). Runs entirely on the dashboard —
// no navigation — over the real stats and the display-only ExampleShowcase. The
// "post a job" portion fills the example job's fields one at a time (via window
// events the showcase listens for) so a new employer sees how it's done.
//
// Auto-starts once for a new, unflagged, EMPTY employer; replayable via the
// "Take the tour" button. Completion OR skip is persisted per USER so we never
// re-nag.

import { useCallback, useEffect, useRef } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { supabase } from '@/lib/supabase'
import './tour.css'

// Tell the ExampleShowcase how much of the example job to reveal.
const jobReset = () => window.dispatchEvent(new Event('thrive-tour:job-reset'))
const jobDone = () => window.dispatchEvent(new Event('thrive-tour:job-done'))
const jobReveal = (n: number) => window.dispatchEvent(new CustomEvent('thrive-tour:job-reveal', { detail: n }))

type StepDef = { el?: string; title: string; description: string; onHi?: () => void; noInteract?: boolean }

// The example-* anchors only exist when the account is empty (ExampleShowcase
// rendered); we filter to present anchors at run time, so a replay on a
// populated dashboard just shows what's there.
const STEP_DEFS: StepDef[] = [
  { el: '[data-tour="stats"]', title: 'Your dashboard at a glance', description: 'Live jobs, applications, interviews and views — your key numbers always sit here.', onHi: jobReset },
  { el: '[data-tour="ex-title"]', title: 'Posting a job — 1. Title', description: 'Start with the role you\'re hiring for, like “Bartender”. Watch the example fill in as we go.', noInteract: true, onHi: () => jobReveal(1) },
  { el: '[data-tour="ex-pay"]', title: '2. Pay', description: 'Add an hourly or annual rate so candidates know what to expect.', noInteract: true, onHi: () => jobReveal(2) },
  { el: '[data-tour="ex-location"]', title: '3. Location', description: 'Where is the role based? Candidates filter by area.', noInteract: true, onHi: () => jobReveal(3) },
  { el: '[data-tour="ex-desc"]', title: '4. Description', description: 'A short summary of the role — and that\'s the essentials. Posting your own takes under a minute.', noInteract: true, onHi: () => jobReveal(4) },
  { el: '[data-tour="example-pipeline"]', title: 'Track your pipeline', description: 'Every applicant moves through your stages — from Applied to Offered — with a simple drag.', onHi: jobDone },
  { el: '[data-tour="example-interview"]', title: 'Schedule interviews', description: 'Set your availability and candidates book a slot themselves — no back-and-forth.' },
  { el: '[data-tour="example-offer"]', title: 'Send offers', description: 'Make an offer, and the candidate signs it right here on Thrive.' },
  { title: "You're all set", description: 'Post your first job to get started — you can replay this tour anytime from “Take the tour”.' },
]

function buildSteps(): DriveStep[] {
  const steps: DriveStep[] = []
  for (const s of STEP_DEFS) {
    if (s.el && typeof document !== 'undefined' && !document.querySelector(s.el)) continue
    const step: DriveStep = {
      popover: { title: s.title, description: s.description },
    }
    if (s.el) step.element = s.el
    if (s.noInteract) step.disableActiveInteraction = true
    if (s.onHi) step.onHighlightStarted = s.onHi
    steps.push(step)
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
    jobReset() // start the example job blank so it fills in during the tour
    const d = driver({
      showProgress: true,
      allowClose: true, // Esc / overlay closes
      overlayColor: 'rgba(15,23,42,0.6)',
      popoverClass: 'thrive-tour',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      steps,
      // Fires on finish AND on skip/close — leave the example complete and mark
      // done either way so we don't re-nag.
      onDestroyed: () => { jobDone(); persistCompleted() },
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
