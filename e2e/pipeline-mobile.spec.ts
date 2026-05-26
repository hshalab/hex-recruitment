import { test, expect, devices, type Page } from '@playwright/test'
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
  // One additional card seeded directly into 'offered' status so the
  // modal-clip regression tests can trigger BackwardToInterviewModal
  // (which only fires when moving BACK from offered/hired into
  // interview). 8 reviewing seeds + 1 offered seed = 9 total.
  let seededOfferedApp: string | null = null

  test.beforeAll(async ({ browser }) => {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // Resolve the test employer's user id.
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 200 })
    const employer = usersData?.users.find(
      (u) => u.email?.toLowerCase() === EMPLOYER_EMAIL.toLowerCase(),
    )
    if (!employer) throw new Error(`Test employer ${EMPLOYER_EMAIL} not found`)

    // Pick nine arbitrary candidate profiles to attach seeded apps to.
    // We don't care WHICH candidates — the test only inspects pipeline
    // mechanics, not candidate-specific UI. Eight reviewing seeds is
    // the minimum that reliably overflows the iPhone 13 mini column-
    // height budget; the ninth is for the offered-status card used by
    // the BackwardToInterview modal-clip regression test.
    const { data: candidates } = await supabase
      .from('candidate_profiles')
      .select('user_id')
      .limit(9)
    if (!candidates || candidates.length < 9) {
      throw new Error(`Need at least 9 candidate_profiles rows in the DB to seed the test; found ${candidates?.length ?? 0}`)
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

    // One extra app in 'offered' status — the only way to reach
    // BackwardToInterviewModal is moving a card from offered or hired
    // back to interview. Seeding the offered status directly is simpler
    // than chaining a forward-move-then-back-move through several tests.
    const { data: offeredApp, error: offeredErr } = await supabase
      .from('job_applications')
      .insert({
        job_id: seededJobId,
        candidate_id: candidates[8].user_id,
        job_title: '__e2e_pipeline_mobile__ Test Role',
        status: 'offered',
      })
      .select('id')
      .single()
    if (offeredErr || !offeredApp) throw new Error(`Offered app seed failed: ${offeredErr?.message}`)
    seededOfferedApp = offeredApp.id

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
    if (seededOfferedApp) await supabase.from('job_applications').delete().eq('id', seededOfferedApp)
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

  test('5b. Touch-swipe on a column propagates to .board horizontal carousel scroll', async ({ browser }) => {
    // Why this test exists: test 5 below uses programmatic scrollBy on
    // the .board element, which bypasses touch-action entirely. That's
    // why the previous touch-action: pan-y regression on .column slipped
    // past the green suite but broke instantly on a real phone. This
    // test exercises real touch events so the column → board pan-x
    // bubbling path is asserted, not assumed.
    //
    // Why a separate iPhone 13 context: the playwright.config.ts
    // project uses devices['Desktop Chrome'] (hasTouch: false). Real
    // touch dispatch needs hasTouch: true at context creation, which
    // can't be retroactively flipped on the existing context. Cheaper
    // than rewriting the whole spec around iPhone 13 emulation — just
    // spin a side-context for this one assertion.
    //
    // Touch dispatch via CDP Input.dispatchTouchEvent: Playwright's
    // built-in page.touchscreen only exposes .tap(). Swipes require
    // either CDP's raw touch dispatcher (highest fidelity, respects
    // touch-action at the compositor level — same path real device
    // touches take) or a sequence of touchstart/move/end dispatched
    // via page.evaluate. CDP is more authoritative.

    const touchCtx = await browser.newContext({
      ...devices['iPhone 13'],
      // The 'storageState' from cookie-consent is intentionally omitted;
      // we explicitly add the cookie below for the same hostname.
    })
    // Seed the cookie banner-dismissal cookie on this hostname so the
    // banner doesn't render and steal the swipe coordinates.
    const baseHost = new URL(BASE).hostname
    await touchCtx.addCookies([
      {
        name: 'hex_cookie_consent',
        value: encodeURIComponent(JSON.stringify({ essential: true, functional: true, analytics: false })),
        domain: baseHost,
        path: '/',
        sameSite: 'Lax',
      },
    ])
    const touchPage = await touchCtx.newPage()

    try {
      // Log in fresh on this context (its cookies are independent from
      // the main page's context).
      await touchPage.goto(`${BASE}/login/employer`)
      await touchPage.waitForLoadState('networkidle')
      await touchPage.locator('input[type="email"]').first().fill(EMPLOYER_EMAIL)
      await touchPage.locator('input[type="password"]').first().fill(EMPLOYER_PASS)
      await touchPage.locator('button[type="submit"]').first().click()
      await touchPage.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })

      await touchPage.goto(`${BASE}/pipeline`)
      await touchPage.waitForLoadState('networkidle')
      await expect(touchPage.locator('h1', { hasText: 'Hiring Pipeline' })).toBeVisible({ timeout: 15000 })
      await expect(touchPage.locator('option', { hasText: '__e2e_pipeline_mobile__' })).toHaveCount(1, { timeout: 15000 })

      // Board must be a horizontal scroll container before we even try.
      const board = touchPage.locator('[class*="page_board__"]').first()
      const beforeScroll = await board.evaluate((el) => el.scrollLeft)

      // Find the first column's centre coordinate — the swipe must
      // ORIGINATE inside the column, not on the board's padding.
      // That's the whole point of the regression test: the bug was
      // about gestures starting inside columns being blocked, not
      // gestures starting on bare board area.
      const firstColumn = touchPage.locator('[class*="page_column__"]').first()
      const colBox = await firstColumn.boundingBox()
      if (!colBox) throw new Error('First column has no bounding box — page not rendered correctly')
      const startX = colBox.x + colBox.width * 0.7
      const endX = colBox.x + colBox.width * 0.1
      const y = colBox.y + colBox.height / 2

      // Dispatch real touch events via CDP. Mirrors what an iOS Safari
      // user's finger swipe sends to the renderer; touch-action is
      // checked against this exact event stream.
      const cdp = await touchCtx.newCDPSession(touchPage)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y, id: 1 }],
      })
      const STEPS = 10
      for (let i = 1; i <= STEPS; i++) {
        const x = startX + ((endX - startX) * i) / STEPS
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y, id: 1 }],
        })
        await touchPage.waitForTimeout(15)
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      // Snap-mandatory needs a beat to settle to the next column.
      await touchPage.waitForTimeout(600)

      const afterScroll = await board.evaluate((el) => el.scrollLeft)
      const delta = afterScroll - beforeScroll

      if (delta === 0) {
        throw new Error(
          'Touch swipe on column did not propagate to board horizontal scroll — touch-action regression. ' +
          `beforeScroll=${beforeScroll}, afterScroll=${afterScroll}. ` +
          'Check .column touch-action — must include pan-x for horizontal pan to bubble to .board.',
        )
      }
      // Load-bearing assertion is the delta !== 0 check above — that's
      // what catches the touch-action regression. This further bound
      // is just smoke for "we actually scrolled a meaningful amount,
      // not 1-2px jitter". Snap-mandatory + synthetic CDP touch (no
      // velocity hint) doesn't always advance a full column width,
      // so 100px is a conservative floor well above noise.
      expect(delta).toBeGreaterThanOrEqual(100)
    } finally {
      await touchCtx.close()
    }
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
    // touch-action must permit vertical pan. Allow any of pan-y, pan-x
    // pan-y, manipulation, auto. The 'pan-x pan-y' value lands here
    // after the horizontal-swipe fix (5b) — pan-y alone caused the
    // mirror-image regression where horizontal swipe broke.
    expect(measure.computedTouchAction).toMatch(/(^|\s)pan-y(\s|$)|^manipulation$|^auto$/)

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

  test('8b. ScheduleInterviewModal header stays in viewport on short mobile (375x568)', async () => {
    // iPhone SE / older short Androids are 568px tall. iPhone 13 with
    // URL bar visible drops to ~664px visible — both well under the
    // 90vh × 844px (= 760px) max-height the modal had pre-fix. At any
    // viewport short enough that 90% of the LARGE viewport exceeds
    // the actually-visible area, the modal's bounding box exceeded
    // the overlay's flex container and align-items: center clipped
    // the top above the visible viewport, hiding the "Schedule
    // Interview" header. Switching to 90dvh follows the dynamic
    // viewport so the modal always fits.
    //
    // 375x568 is the smallest realistic mobile size we care about.
    // If the header is in viewport here, it's in viewport at every
    // size we ship to.
    await page.setViewportSize({ width: 375, height: 568 })
    await page.goto(`${BASE}/pipeline`, { waitUntil: 'domcontentloaded' })
    await dismissCookieBanner(page)
    // Higher timeout — repeated nav under suite load makes loadData()
    // slower to resolve than in test 1-2. h1 is the "loading state
    // cleared" signal: the page renders a different tree while
    // `loading` is true.
    await expect(page.locator('h1', { hasText: 'Hiring Pipeline' })).toBeVisible({ timeout: 30000 })

    // Open the sheet via a reviewing card, then tap Move to Interview
    // — same flow as test 8, just at a shorter viewport.
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-rfd-draggable-id="${id}"]`) as HTMLElement | null
      el?.click()
    }, seededAppA)
    await expect(page.locator('div[role="dialog"][aria-label^="Move "]')).toBeVisible({ timeout: 3000 })
    await page.locator('button[aria-label="Move to Interview"]').click()

    // Wait for the schedule modal — the header element is the load-
    // bearing surface. Its bounding rect tells us whether the clip
    // regression has returned.
    const scheduleHeader = page.locator('h2', { hasText: /(re)?schedule interview/i }).first()
    await expect(scheduleHeader).toBeVisible({ timeout: 5000 })

    const rect = await scheduleHeader.boundingBox()
    if (!rect) throw new Error('Schedule modal header has no bounding box')
    const viewportHeight = page.viewportSize()?.height ?? 568

    if (rect.y < 0) {
      throw new Error(
        `ScheduleInterviewModal header clipped ABOVE viewport — top=${rect.y}. ` +
        'Check modal max-height: must be 90dvh (dynamic viewport), not 90vh (large viewport).',
      )
    }
    if (rect.y + rect.height > viewportHeight) {
      throw new Error(
        `ScheduleInterviewModal header clipped BELOW viewport — top=${rect.y}, height=${rect.height}, viewport=${viewportHeight}.`,
      )
    }
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewportHeight)

    // Static-source check — load-bearing for the dvh-vs-vh regression
    // specifically. In headless Chromium, 90vh and 90dvh resolve to
    // the same px value (there's no browser chrome to create the
    // visible-vs-layout discrepancy that breaks the modal on real iOS
    // Safari). The geometric check above is necessary but not
    // sufficient — it passes with the regression in place. This
    // source check fails the moment someone reverts dvh → vh.
    const cssPath = path.resolve(__dirname, '../components/ScheduleInterviewModal.module.css')
    const cssSrc = fs.readFileSync(cssPath, 'utf8')
    // Regex matches `max-height: <digits>vh` but NOT `max-height: <digits>dvh`
    // because `\d+vh` requires "vh" to come directly after the digits,
    // and "90dvh" has "d" between the digits and "vh".
    const vhMatches = cssSrc.match(/max-height:\s*\d+vh\b/g) || []
    if (vhMatches.length > 0) {
      throw new Error(
        `ScheduleInterviewModal.module.css uses raw vh for max-height: ${JSON.stringify(vhMatches)}. ` +
        'iOS Safari resolves vh against the large viewport (URL bar hidden), so 90vh can exceed the actually-visible area when the URL bar is showing. ' +
        'Replace every "Nvh" with "Ndvh" on .modal max-height rules.',
      )
    }
    expect(cssSrc).toMatch(/max-height:\s*\d+dvh\b/)

    // Close the modal so test 8c starts from a clean page.
    const closeBtn = page.locator('[aria-label="Close"], button:has-text("Cancel"), button:has-text("✕")').first()
    if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await closeBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(500)
  })

  test('8c. BackwardToInterviewModal header stays in viewport on short mobile (375x568)', async () => {
    // Same fix class as 8b but a different file (inline-styled .tsx
    // rather than CSS module). Trigger via the seeded 'offered' card —
    // backward into Interview opens BackwardToInterviewModal because
    // toIdx < fromIdx (interview=2, offered=3 in STAGE_ORDER).
    if (!seededOfferedApp) {
      test.skip(true, 'Offered card was not seeded')
      return
    }
    // Viewport is already 375x568 from test 8b; re-set defensively in
    // case Playwright's serial mode ever changes.
    await page.setViewportSize({ width: 375, height: 568 })
    await page.goto(`${BASE}/pipeline`, { waitUntil: 'domcontentloaded' })
    await dismissCookieBanner(page)
    // Higher timeout — repeated nav under suite load makes loadData()
    // slower to resolve than in test 1-2. h1 is the "loading state
    // cleared" signal: the page renders a different tree while
    // `loading` is true.
    await expect(page.locator('h1', { hasText: 'Hiring Pipeline' })).toBeVisible({ timeout: 30000 })

    // The offered card lives in the Offered column. Tap it via JS so
    // we don't have to horizontally scroll through the board.
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-rfd-draggable-id="${id}"]`) as HTMLElement | null
      el?.click()
    }, seededOfferedApp)
    await expect(page.locator('div[role="dialog"][aria-label^="Move "]')).toBeVisible({ timeout: 3000 })
    await page.locator('button[aria-label="Move to Interview"]').click()

    // BackwardToInterviewModal's title text. Inline-styled component
    // uses an h3 with the candidate name.
    const backwardHeader = page.locator('h3', { hasText: /back to Interview/i }).first()
    await expect(backwardHeader).toBeVisible({ timeout: 5000 })

    const rect = await backwardHeader.boundingBox()
    if (!rect) throw new Error('BackwardToInterview modal header has no bounding box')
    const viewportHeight = page.viewportSize()?.height ?? 568

    if (rect.y < 0) {
      throw new Error(
        `BackwardToInterviewModal header clipped ABOVE viewport — top=${rect.y}. ` +
        'Check modal maxHeight + dvh — see BackwardToInterviewModal.tsx inline style.',
      )
    }
    if (rect.y + rect.height > viewportHeight) {
      throw new Error(
        `BackwardToInterviewModal header clipped BELOW viewport — top=${rect.y}, height=${rect.height}, viewport=${viewportHeight}.`,
      )
    }
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewportHeight)

    // Close via Cancel button so downstream tests start clean.
    await page.locator('button:has-text("Cancel")').last().click()
    await page.waitForTimeout(500)

    // Restore viewport for test 9 — keeps that test's expectations
    // identical to its pre-existing behaviour.
    await page.setViewportSize(MOBILE_VIEWPORT)
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
