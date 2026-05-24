import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// .env.test sets BASE_URL=https://thrivecareer.co.uk for general
// regression runs against production. This spec MUST run against the
// local dev server because the pipeline-mobile redesign lives on a
// feature branch that isn't deployed yet — asserting against prod's
// stylesheet would always read the OLD mobile grid. Use the dedicated
// PIPELINE_TEST_URL override only if you really need to point at
// something other than localhost:3000.
const BASE = process.env.PIPELINE_TEST_URL || 'http://localhost:3000'
const EMPLOYER_EMAIL = process.env.EMPLOYER_EMAIL!
const EMPLOYER_PASS = process.env.EMPLOYER_PASS!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Pre-flight skip if credentials are missing — surfaces a clearer
// failure mode than a `null` deref deep inside loginAsEmployer.
test.skip(
  !EMPLOYER_EMAIL || !EMPLOYER_PASS || !SUPABASE_URL || !SERVICE_KEY,
  'EMPLOYER_EMAIL / EMPLOYER_PASS / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.test or .env.local',
)

const MOBILE_VIEWPORT = { width: 375, height: 812 } // iPhone 13 mini
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

async function dismissCookieBanner(page: Page) {
  const btn = page.locator('button:has-text("Accept All")')
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(300)
  }
}

async function loginAsEmployer(page: Page) {
  await page.goto(`${BASE}/login/employer`)
  await dismissCookieBanner(page)
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="email"]').first().fill(EMPLOYER_EMAIL)
  await page.locator('input[type="password"]').first().fill(EMPLOYER_PASS)
  await page.locator('button[type="submit"]').first().click()
  // Wait for the URL to leave /login/* entirely. The earlier substring
  // regex `/employer/` matched `/login/employer` too and resolved
  // immediately — before the submit had completed.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
  await dismissCookieBanner(page)
}

test.describe('Pipeline mobile redesign — horizontal scroll + stage-picker sheet', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page
  let supabase: SupabaseClient
  // Self-seeded fixtures: a throwaway job + eight reviewing applications
  // belonging to the configured EMPLOYER_EMAIL. The test employer in
  // .env.test (pauldavies.gbr+thrive-test4) has zero baseline data, so
  // the test owns its own data lifecycle. Cleanup happens in afterAll
  // regardless of outcome.
  //
  // We seed EIGHT (not two) because the vertical-scroll regression test
  // needs enough cards to overflow the iPhone 13 mini viewport
  // (375x812). Earlier tests use seededAppA / seededAppB which are just
  // aliases for the first two entries — the other six exist to make the
  // Reviewing column tall enough to require an internal scroll.
  let seededJobId: string | null = null
  let seededApps: string[] = []
  let seededAppA: string | null = null // primary card (tapped in card-tap tests)
  let seededAppB: string | null = null // secondary card (dragged in desktop test)

  test.beforeAll(async ({ browser }) => {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // Resolve the test employer's user id.
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 200 })
    const employer = usersData?.users.find(
      (u) => u.email?.toLowerCase() === EMPLOYER_EMAIL.toLowerCase(),
    )
    if (!employer) throw new Error(`Test employer ${EMPLOYER_EMAIL} not found`)

    // Pick eight arbitrary candidate profiles to attach seeded apps to.
    // We don't care WHICH candidates — the test only inspects pipeline
    // mechanics, not candidate-specific UI. Eight is the minimum that
    // reliably overflows the iPhone 13 mini column-height budget.
    const { data: candidates } = await supabase
      .from('candidate_profiles')
      .select('user_id')
      .limit(8)
    if (!candidates || candidates.length < 8) {
      throw new Error(`Need at least 8 candidate_profiles rows in the DB to seed the test; found ${candidates?.length ?? 0}`)
    }

    // Insert a throwaway job for the test employer.
    const { data: jobRow, error: jobErr } = await supabase
      .from('jobs')
      .insert({
        employer_id: employer.id,
        title: '__e2e_pipeline_mobile__ Test Role',
        company: 'E2E Test Co',
        location: 'London',
        salary_min: 30000,
        salary_max: 40000,
      })
      .select('id')
      .single()
    if (jobErr || !jobRow) throw new Error(`Job seed failed: ${jobErr?.message}`)
    seededJobId = jobRow.id

    // Insert eight reviewing apps against the seeded job.
    for (let i = 0; i < 8; i++) {
      const { data: app, error: appErr } = await supabase
        .from('job_applications')
        .insert({
          job_id: seededJobId,
          candidate_id: candidates[i].user_id,
          job_title: '__e2e_pipeline_mobile__ Test Role',
          status: 'reviewing',
        })
        .select('id')
        .single()
      if (appErr || !app) throw new Error(`App ${i} seed failed: ${appErr?.message}`)
      seededApps.push(app.id)
    }
    seededAppA = seededApps[0]
    seededAppB = seededApps[1]

    page = await browser.newPage({ viewport: MOBILE_VIEWPORT })
    await loginAsEmployer(page)
  })

  test.afterAll(async () => {
    // Tear down in dependency order: applications, then job. Service-role
    // client bypasses RLS, so deletes go through cleanly even if the test
    // moved them into states that the candidate has read access to.
    for (const id of seededApps) {
      await supabase.from('job_applications').delete().eq('id', id)
    }
    if (seededJobId) await supabase.from('jobs').delete().eq('id', seededJobId)
    if (page) await page.close()
  })

  test('1-2. Mobile viewport — pipeline page loads at 375x812', async () => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await page.goto(`${BASE}/pipeline`)
    await dismissCookieBanner(page)
    await page.waitForLoadState('networkidle')
    // Page-load proxy: wait for the topBar heading and the seeded job
    // option in the filter dropdown. Both being present means
    // loadData() returned the seeded fixtures.
    await expect(page.locator('h1', { hasText: 'Hiring Pipeline' })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('option', { hasText: '__e2e_pipeline_mobile__' })).toHaveCount(1, { timeout: 15000 })
    // Board element. CSS Modules compile .board → page_board__<hash>;
    // [class*="page_board__"] picks the one element with that pattern.
    // (data-testid would've been more obvious but Next.js 14.1.0 strips
    // data-testid attrs through SWC even in dev — confirmed via page
    // content scan; see commit message for the diagnostic that nailed it.)
    await expect(page.locator('[class*="page_board__"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('3-4. .board is not display:grid + is horizontally scrollable on mobile', async () => {
    // Functional check. The load-bearing assertion is scrollWidth >
    // clientWidth — that's the real signal the redesign delivers
    // (you can swipe between columns). display:not('grid') guards
    // against a regression to the prior 3×2 wrap layout. The
    // overflow-x value is a browser-detail so we accept either
    // 'auto' or 'scroll'.
    const result = await page.locator('[class*="page_board__"]').first().evaluate((el) => {
      const cs = window.getComputedStyle(el)
      return {
        display: cs.display,
        overflowX: cs.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }
    })
    expect(result.display).not.toBe('grid')
    expect(result.scrollWidth).toBeGreaterThan(result.clientWidth)
    expect(['auto', 'scroll']).toContain(result.overflowX)
  })

  test('5. Horizontal scroll reveals the next column', async () => {
    const board = page.locator('[class*="page_board__"]').first()
    const { scrollWidth, clientWidth } = await board.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(scrollWidth).toBeGreaterThan(clientWidth)

    // Scroll one column-width to the right and confirm scrollLeft moved.
    const before = await board.evaluate((el) => el.scrollLeft)
    await board.evaluate((el) => el.scrollBy({ left: 300, behavior: 'instant' as ScrollBehavior }))
    await page.waitForTimeout(200)
    const after = await board.evaluate((el) => el.scrollLeft)
    expect(after).toBeGreaterThan(before)
  })

  test('6. Vertical scroll inside Reviewing column reveals the 8th card', async () => {
    // Regression for the pan-x → pan-y cascade bug: the board has
    // `touch-action: pan-x` for horizontal column-switching, which
    // (without an explicit override) blocks vertical pan inside the
    // columns. After the fix, .column on mobile has its own
    // `touch-action: pan-y`, `overflow-y: auto`, and a bounded
    // max-height — making each column an internal scroll container.
    //
    // Why programmatic scrollTo instead of mouse-wheel: Playwright's
    // mouse.wheel() doesn't reliably trigger Chromium's touch-action
    // gesture logic. Setting el.scrollTop directly mirrors what an
    // actual touch pan-y produces on a working CSS surface — if the
    // .column isn't a scroll container, scrollTop stays at 0 and the
    // bottom card stays out of view, which is exactly what we'd see
    // on the broken pre-fix CSS.

    // Reset horizontal board scroll — test 5 scrolled right to reveal
    // the next column, which leaves Reviewing's cards off-screen
    // horizontally. The bottom card's bounding rect is then "in viewport"
    // by y but clipped by x. intersectionObserver reports ratio 0 for a
    // wholly-clipped element.
    const board = page.locator('[class*="page_board__"]').first()
    await board.evaluate((el) => { el.scrollLeft = 0 })
    await page.waitForTimeout(150)

    // All 8 seeded cards must be present in the DOM.
    for (const id of seededApps) {
      await expect(page.locator(`[data-rfd-draggable-id="${id}"]`)).toHaveCount(1)
    }

    // Pick the Reviewing column (first in DOM order) — it's the .column
    // div that wraps the Droppable that holds the cards.
    const reviewingColumn = page.locator('[class*="page_column__"]').first()

    // The Reviewing column must have a bounded height AND overflow content.
    // If `scrollHeight > clientHeight`, the column has more content than
    // its visible viewport — this is the load-bearing precondition.
    const measure = await reviewingColumn.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTopBefore: el.scrollTop,
      computedTouchAction: window.getComputedStyle(el).touchAction,
      computedOverflowY: window.getComputedStyle(el).overflowY,
    }))
    expect(measure.scrollHeight).toBeGreaterThan(measure.clientHeight)
    expect(measure.computedOverflowY).toMatch(/^(auto|scroll)$/)
    expect(['pan-y', 'manipulation', 'auto']).toContain(measure.computedTouchAction)

    // The bottom-most card in DOM is the one we want — rendering-order-
    // independent. The page sorts apps by created_at DESC, so the
    // earliest-seeded card lands at the bottom; using `seededApps[N]`
    // directly would tie the test to seed order and break the moment
    // the page's sort changes.
    const cardsInColumn = reviewingColumn.locator('[data-rfd-draggable-id]')
    const bottomCard = cardsInColumn.last()
    await expect(bottomCard).not.toBeInViewport()

    // Pan-y the column to its bottom. On a working CSS surface this
    // mirrors the touch-pan-y gesture; on a broken one (no overflow,
    // unbounded height) scrollTop stays at 0.
    await reviewingColumn.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await page.waitForTimeout(300)

    const scrollTopAfter = await reviewingColumn.evaluate((el) => el.scrollTop)
    expect(scrollTopAfter).toBeGreaterThan(measure.scrollTopBefore)

    // Bottom card should now be in the viewport.
    await expect(bottomCard).toBeInViewport({ timeout: 3000 })
  })

  test('7. Tap a card in Reviewing — StagePickerSheet opens with 4 destination rows', async () => {
    // Programmatic click on the card root via JS — bypasses
    // Playwright's positional click, which can land on the inner
    // "Review →" anchor or the Details toggle. We want the card-body
    // onClick (the one that opens the sheet) specifically.
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-rfd-draggable-id="${id}"]`) as HTMLElement | null
      el?.click()
    }, seededAppA)

    const sheet = page.locator('div[role="dialog"][aria-label^="Move "]')
    await expect(sheet).toBeVisible({ timeout: 3000 })

    // 4 destination rows = 6 stages − current (Reviewing) − rejected.
    // Build-spec asked for "5 rows" but the math gives 4 destinations
    // plus 1 Cancel = 5 buttons total. Asserting the 4 destinations
    // explicitly since that's the load-bearing count.
    const rows = sheet.locator('button[aria-label^="Move to "]')
    await expect(rows).toHaveCount(4)
    await expect(sheet.locator('button[aria-label="Move to Declined"]')).toHaveCount(0)
    await expect(sheet.locator('button[aria-label="Move to Reviewing"]')).toHaveCount(0)
  })

  test('8. Tap Interview row — ScheduleInterviewModal opens (gate fires)', async () => {
    const interviewRow = page.locator('button[aria-label="Move to Interview"]')
    await expect(interviewRow).toBeVisible()
    await interviewRow.click()

    // Sheet should close.
    await expect(page.locator('div[role="dialog"][aria-label^="Move "]')).not.toBeVisible({ timeout: 3000 })

    // ScheduleInterviewModal is a dialog with the Interview-scheduling form;
    // the modal title text is the most stable signal across implementations.
    const modal = page.locator('div').filter({ hasText: /Schedule Interview|Set up interview|Interview details/i }).first()
    await expect(modal).toBeVisible({ timeout: 5000 })

    // DB status should NOT have changed yet — the gate is awaiting schedule.
    const { data: dbRow } = await supabase
      .from('job_applications')
      .select('status')
      .eq('id', seededAppA!)
      .single()
    expect(dbRow?.status).toBe('reviewing')

    // Close the modal so the next test can interact with the page.
    // Try a few common close-button selectors used elsewhere in the codebase.
    const closeBtn = page.locator('[aria-label="Close"], button:has-text("Cancel"), button:has-text("✕")').first()
    if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await closeBtn.click()
    } else {
      // Fallback: press Escape.
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(500)
  })

  test('9. Tap Shortlisted row — card moves, status updates in DB', async () => {
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-rfd-draggable-id="${id}"]`) as HTMLElement | null
      el?.click()
    }, seededAppA)

    await expect(page.locator('div[role="dialog"][aria-label^="Move "]')).toBeVisible({ timeout: 3000 })
    await page.locator('button[aria-label="Move to Shortlisted"]').click()

    // Sheet closes immediately on pick; applyMove writes to Supabase
    // optimistically then awaits the round-trip. Poll briefly for the
    // DB to reflect the move.
    await expect(async () => {
      const { data } = await supabase
        .from('job_applications')
        .select('status')
        .eq('id', seededAppA!)
        .single()
      expect(data?.status).toBe('shortlisted')
    }).toPass({ timeout: 10000 })
  })

  test('10. Desktop viewport (1280x800) — drag scaffolding intact + drag-handle present', async () => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.goto(`${BASE}/pipeline`)
    await dismissCookieBanner(page)
    await page.waitForLoadState('networkidle')

    const board = page.locator('[class*="page_board__"]').first()
    await expect(board).toBeVisible({ timeout: 10000 })

    // Desktop pattern: columns are fixed-width (not 85vw) and the board
    // uses display:flex (not the mobile @media override).
    const computed = await board.evaluate((el) => {
      const cs = window.getComputedStyle(el)
      return { display: cs.display, overflowX: cs.overflowX }
    })
    expect(computed.display).toBe('flex')
    expect(computed.overflowX).toBe('auto')

    // Drag handle still wired by @hello-pangea/dnd on every card.
    const draggables = page.locator('[data-rfd-drag-handle-draggable-id]')
    const dragHandleCount = await draggables.count()
    expect(dragHandleCount).toBeGreaterThan(0)

    // Keyboard-driven drag is the reliable way to exercise @hello-pangea/dnd
    // in Playwright — mouse-emulated drag is flaky against the library's
    // pointer-event state machine. Pick the top-of-column card (newest
    // by created_at DESC = first rendered = least vertical-scroll
    // burden) so the library's auto-scroll-on-drag doesn't need to
    // chase a card buried in a 7-card column. Space lifts, ArrowRight
    // moves one column right to 'shortlisted', Space drops. Forward
    // non-Interview move requires no gate; status flips via applyMove.
    const desktopDragId = seededApps[seededApps.length - 1]
    const handle = page.locator(`[data-rfd-drag-handle-draggable-id="${desktopDragId}"]`)
    await handle.scrollIntoViewIfNeeded()
    await handle.focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
    await page.keyboard.press('Space')

    await expect(async () => {
      const { data } = await supabase
        .from('job_applications')
        .select('status')
        .eq('id', desktopDragId)
        .single()
      expect(data?.status).toBe('shortlisted')
    }).toPass({ timeout: 10000 })
  })

  test('11. Static-analysis regression — applyMove is only called from intentToMove or post-gate handlers', () => {
    // The contract lives in app/pipeline/page.tsx: applyMove is the
    // no-gate write path; every transport-layer call site must go
    // through intentToMove first. This test reads the source and
    // verifies the contract holds.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/pipeline/page.tsx'),
      'utf8',
    )

    // handleDragEnd (drag transport) MUST route through intentToMove
    // and MUST NOT call applyMove directly.
    const handleDragEndMatch = src.match(/const handleDragEnd = async[\s\S]+?\n  \}\n/)
    expect(handleDragEndMatch, 'handleDragEnd block not found').toBeTruthy()
    const dragBody = handleDragEndMatch![0]
    expect(dragBody).toContain('intentToMove(')
    expect(dragBody).not.toContain('applyMove(')

    // StagePickerSheet wiring (tap transport) MUST route through
    // intentToMove and MUST NOT call applyMove directly.
    const sheetMatch = src.match(/<StagePickerSheet[\s\S]+?\/>/)
    expect(sheetMatch, 'StagePickerSheet usage block not found').toBeTruthy()
    const sheetBody = sheetMatch![0]
    expect(sheetBody).toContain('intentToMove(')
    expect(sheetBody).not.toContain('applyMove(')

    // intentToMove itself MUST be the only function above applyMove
    // that contains the inline cascade-confirm trigger. Defensive: if
    // someone duplicates the gating elsewhere they'll bypass this guard.
    const intentMatches = (src.match(/setBackwardMove\(\{/g) || []).length
    expect(intentMatches).toBe(1)
  })
})
