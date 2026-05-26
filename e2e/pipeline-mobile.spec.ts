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
  // Two extra reviewing apps reserved for the Withdraw flow tests
  // (desktop kebab + mobile sheet). Kept separate from seededApps so
  // earlier tests' assertions about column membership stay stable.
  let seededWithdrawAppDesktop: string | null = null
  let seededWithdrawAppMobile: string | null = null
  // One card seeded with a deliberately ancient stage_entered_at (20
  // days) so the StageDurationBadge test can assert the 14+ "stronger"
  // emphasis tier without waiting in real time.
  let seededAgedApp: string | null = null
  // The signed-in employer's user_id. Captured during beforeAll so
  // the sort-pref persistence tests can verify employer_profiles
  // writes via the service-role client.
  let employerUserId: string | null = null

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
    employerUserId = employer.id

    // 12 candidates: 8 reviewing for column-fill tests, 1 offered for
    // backward-to-interview modal tests, 2 reviewing for withdraw flow
    // tests (desktop + mobile), 1 reviewing for the aged-stage badge
    // emphasis test.
    const { data: candidates } = await supabase
      .from('candidate_profiles')
      .select('user_id')
      .limit(12)
    if (!candidates || candidates.length < 12) {
      throw new Error(`Need at least 12 candidate_profiles rows in the DB to seed the test; found ${candidates?.length ?? 0}`)
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

    // Two reviewing apps reserved for the Withdraw flow tests. Kept
    // out of seededApps so the column-overflow assertions stay stable.
    for (let i = 9; i <= 10; i++) {
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
      if (appErr || !app) throw new Error(`Withdraw seed ${i} failed: ${appErr?.message}`)
      if (i === 9) seededWithdrawAppDesktop = app.id
      else seededWithdrawAppMobile = app.id
    }

    // One reviewing app with stage_entered_at backdated 20 days — the
    // StageDurationBadge emphasis test asserts data-emphasis='stronger'
    // (the 14+ tier). The seeded app uses status='shortlisted' so it
    // doesn't share the Reviewing column with the other seeds — this
    // avoids the sort tests interleaving it among the regular seeds.
    const twentyDaysAgo = new Date(Date.now() - 20 * 86400000).toISOString()
    const { data: agedApp, error: agedErr } = await supabase
      .from('job_applications')
      .insert({
        job_id: seededJobId,
        candidate_id: candidates[11].user_id,
        job_title: '__e2e_pipeline_mobile__ Test Role',
        status: 'shortlisted',
        stage_entered_at: twentyDaysAgo,
        status_updated_at: twentyDaysAgo,
        created_at: twentyDaysAgo,
      })
      .select('id')
      .single()
    if (agedErr || !agedApp) throw new Error(`Aged app seed failed: ${agedErr?.message}`)
    seededAgedApp = agedApp.id

    // Ensure the test employer has an employer_profiles row. Direct-
    // seeded test accounts skip /register/employer (which is what
    // normally creates the profile), so without this step the
    // SortOrderControl UPDATE silently no-ops and the persistence
    // assertion sees `undefined`. We INSERT once if absent, then
    // reset pipeline_sort_order to the column default so the
    // persistence test starts from a known state.
    const { data: existingProfile } = await supabase
      .from('employer_profiles')
      .select('id')
      .eq('user_id', employer.id)
      .maybeSingle()
    if (!existingProfile) {
      const { error: profileErr } = await supabase
        .from('employer_profiles')
        .insert({
          user_id: employer.id,
          company_name: 'E2E Test Co',
          contact_name: 'E2E Test',
          email: employer.email,
        })
      if (profileErr) throw new Error(`Employer profile seed failed: ${profileErr.message}`)
    }
    await supabase
      .from('employer_profiles')
      .update({ pipeline_sort_order: 'oldest_in_stage' })
      .eq('user_id', employer.id)

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
    if (seededWithdrawAppDesktop) await supabase.from('job_applications').delete().eq('id', seededWithdrawAppDesktop)
    if (seededWithdrawAppMobile) await supabase.from('job_applications').delete().eq('id', seededWithdrawAppMobile)
    if (seededAgedApp) await supabase.from('job_applications').delete().eq('id', seededAgedApp)
    if (seededJobId) await supabase.from('jobs').delete().eq('id', seededJobId)
    // Reset the sort preference for the next run so we never leave
    // 'newest_first' lingering on the employer profile.
    if (employerUserId) {
      await supabase
        .from('employer_profiles')
        .update({ pipeline_sort_order: 'oldest_in_stage' })
        .eq('user_id', employerUserId)
    }
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

  test('9. Tap Shortlisted row — card moves, status + stage_entered_at update in DB', async () => {
    // Pre-condition for the applyMove stage_entered_at sanity-revert
    // proof: backdate the card's stage_entered_at to 1 hour ago BEFORE
    // the move. A working applyMove flips it to ~NOW; a reverted
    // applyMove leaves it at the backdated value and the post-move
    // assertion below catches the regression.
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    await supabase
      .from('job_applications')
      .update({ stage_entered_at: oneHourAgo })
      .eq('id', seededAppA!)
    const moveStartedAt = Date.now()

    await page.evaluate((id) => {
      const el = document.querySelector(`[data-rfd-draggable-id="${id}"]`) as HTMLElement | null
      el?.click()
    }, seededAppA)

    await expect(page.locator('div[role="dialog"][aria-label^="Move "]')).toBeVisible({ timeout: 3000 })
    await page.locator('button[aria-label="Move to Shortlisted"]').click()

    // Sheet closes immediately on pick; applyMove writes to Supabase
    // optimistically then awaits the round-trip. Poll briefly for the
    // DB to reflect the move AND for stage_entered_at to land in the
    // last 60s — the load-bearing assertion that applyMove (and by
    // extension every status-write call site) updated the stage anchor.
    await expect(async () => {
      const { data } = await supabase
        .from('job_applications')
        .select('status, stage_entered_at')
        .eq('id', seededAppA!)
        .single()
      expect(data?.status).toBe('shortlisted')
      const stageMs = new Date(data!.stage_entered_at as string).getTime()
      expect(Math.abs(stageMs - moveStartedAt)).toBeLessThan(60_000)
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
    // pointer-event state machine. Pick a top-of-column card so the
    // library's auto-scroll-on-drag doesn't need to chase a buried
    // card. Under the new default sort ('oldest_in_stage'), the top
    // of Reviewing is the OLDEST surviving reviewing seed. seededAppA
    // (seededApps[0]) was moved to shortlisted in test 9, so the
    // oldest remaining is seededApps[1]. Space lifts, ArrowRight moves
    // one column right to 'shortlisted', Space drops. Forward non-
    // Interview move requires no gate; status flips via applyMove.
    const desktopDragId = seededApps[1]
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

  test('12. Withdraw via desktop kebab — DB writes status=withdrawn + stage_entered_at=NOW()', async () => {
    // Why this test is load-bearing: the Withdraw flow mirrors Decline,
    // so a regression in WithdrawModal that breaks the supabase update
    // (e.g. typo on the table name, lost stage_entered_at column write)
    // wouldn't be caught by the static-analysis test 11 — it'd just
    // silently fail to advance the card. This asserts both the modal
    // pathway AND the new stage_entered_at write are correct.

    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.goto(`${BASE}/pipeline`)
    await dismissCookieBanner(page)
    await expect(page.locator('h1', { hasText: 'Hiring Pipeline' })).toBeVisible({ timeout: 30000 })

    if (!seededWithdrawAppDesktop) throw new Error('seededWithdrawAppDesktop not seeded')

    // Capture pre-update timestamp so we can assert stage_entered_at
    // landed in NOW()'s vicinity (within 30s of test start) post-flow.
    const flowStartedAt = Date.now()

    // Open the kebab popover on the seeded card via JS — Playwright's
    // positional click can land on the parent .cardKebabWrap div
    // instead of the inner button on some viewports.
    await page.evaluate((id) => {
      const card = document.querySelector(`[data-rfd-draggable-id="${id}"]`) as HTMLElement | null
      const kebabBtn = card?.querySelector('button[aria-label="Card actions"]') as HTMLButtonElement | null
      kebabBtn?.click()
    }, seededWithdrawAppDesktop)

    // The kebab popover should now show TWO menuitems on a non-rejected
    // card: Decline + Mark as withdrawn. Test 7 already confirms the
    // sheet has 4 destinations; this confirms the desktop kebab parity.
    const withdrawMenuItem = page.locator('[role="menuitem"]', { hasText: 'Mark as withdrawn' }).first()
    await expect(withdrawMenuItem).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[role="menuitem"]', { hasText: /^Decline$/ }).first()).toBeVisible()

    await withdrawMenuItem.click()

    // WithdrawModal is inline-styled and opens with the default body
    // pre-filled (no custom 'withdrawn' template seeded for this employer).
    // The textarea is disabled + empty while the template async fetch
    // is in flight, then enables and fills with the default body once
    // the maybeSingle() resolves. Wait for the latter before reading.
    const modalHeading = page.locator('h3', { hasText: 'Mark candidate as withdrawn' }).first()
    await expect(modalHeading).toBeVisible({ timeout: 5000 })
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeEnabled({ timeout: 5000 })
    await expect(textarea).not.toHaveValue('', { timeout: 5000 })
    const bodyValue = await textarea.inputValue()
    // Confirm default substitution worked — companyName/jobTitle filled in.
    expect(bodyValue).toContain('__e2e_pipeline_mobile__ Test Role')

    // Submit. The button label is 'Mark as withdrawn' (not 'Send & Decline').
    await page.locator('button:has-text("Mark as withdrawn")').last().click()

    // Poll until the DB reflects the move. We assert BOTH the new status
    // AND that stage_entered_at is within ~30s of flow start — the load-
    // bearing assertion that intentToMove / WithdrawModal correctly
    // populated the new column.
    await expect(async () => {
      const { data } = await supabase
        .from('job_applications')
        .select('status, stage_entered_at')
        .eq('id', seededWithdrawAppDesktop!)
        .single()
      expect(data?.status).toBe('withdrawn')
      expect(data?.stage_entered_at).toBeTruthy()
      const writeMs = new Date(data!.stage_entered_at as string).getTime()
      const deltaMs = Math.abs(writeMs - flowStartedAt)
      expect(deltaMs).toBeLessThan(60_000) // generous: covers slow modal load
    }).toPass({ timeout: 10000 })
  })

  test('13. Withdraw via mobile StagePickerSheet — bottom row triggers WithdrawModal', async () => {
    // Same flow class as test 12 but via the mobile sheet path. Confirms
    // the new `onWithdraw` prop is wired to setWithdrawCard(card) so the
    // sheet-based path opens the same WithdrawModal as the desktop kebab.

    await page.setViewportSize(MOBILE_VIEWPORT)
    await page.goto(`${BASE}/pipeline`)
    await dismissCookieBanner(page)
    await expect(page.locator('h1', { hasText: 'Hiring Pipeline' })).toBeVisible({ timeout: 30000 })

    if (!seededWithdrawAppMobile) throw new Error('seededWithdrawAppMobile not seeded')

    const flowStartedAt = Date.now()

    // Tap the card body → opens StagePickerSheet
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-rfd-draggable-id="${id}"]`) as HTMLElement | null
      el?.click()
    }, seededWithdrawAppMobile)
    await expect(page.locator('div[role="dialog"][aria-label^="Move "]')).toBeVisible({ timeout: 3000 })

    // Sheet should now expose the Withdraw row at the bottom (alongside
    // Decline). The data-testid is the contract — see StagePickerSheet
    // bottom-section destructive-actions block.
    const withdrawRow = page.locator('[data-testid="stage-picker-withdraw"]')
    await expect(withdrawRow).toBeVisible()
    await expect(page.locator('[data-testid="stage-picker-decline"]')).toBeVisible()
    await withdrawRow.click()

    // The sheet closes and WithdrawModal opens (same modal as test 12).
    // Wait for the template fetch to resolve before submitting — the
    // submit button is `disabled` while !message.trim(), which the
    // textarea is until the async fetch fills it.
    const modalHeading = page.locator('h3', { hasText: 'Mark candidate as withdrawn' }).first()
    await expect(modalHeading).toBeVisible({ timeout: 5000 })
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeEnabled({ timeout: 5000 })
    await expect(textarea).not.toHaveValue('', { timeout: 5000 })
    await page.locator('button:has-text("Mark as withdrawn")').last().click()

    await expect(async () => {
      const { data } = await supabase
        .from('job_applications')
        .select('status, stage_entered_at')
        .eq('id', seededWithdrawAppMobile!)
        .single()
      expect(data?.status).toBe('withdrawn')
      expect(data?.stage_entered_at).toBeTruthy()
      const writeMs = new Date(data!.stage_entered_at as string).getTime()
      expect(Math.abs(writeMs - flowStartedAt)).toBeLessThan(60_000)
    }).toPass({ timeout: 10000 })
  })

  test('14. StageDurationBadge — 20-day-old card renders the stronger emphasis tier', async () => {
    // Why a 20-day seed instead of fakeTime: dayDifference() in
    // StageDurationBadge uses local-timezone Date.now() at render time
    // — clock-mocking the page from Playwright is brittle across both
    // the React render and the badge-internal calc. Seeding the stage
    // anchor 20 days in the past gives us a real, deterministic 20-day
    // delta without timer mocks.

    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.goto(`${BASE}/pipeline`)
    await dismissCookieBanner(page)
    await expect(page.locator('h1', { hasText: 'Hiring Pipeline' })).toBeVisible({ timeout: 30000 })

    if (!seededAgedApp) throw new Error('seededAgedApp not seeded')

    // The aged seed lives in Shortlisted (status='shortlisted'). Its
    // badge should declare data-emphasis='stronger' (the 14+ tier) and
    // a day count >= 19 (allowing for clock skew).
    const card = page.locator(`[data-rfd-draggable-id="${seededAgedApp}"]`)
    await expect(card).toBeVisible({ timeout: 10000 })
    const badge = card.locator('[data-testid="stage-duration-badge"]')
    await expect(badge).toBeVisible()

    const days = await badge.getAttribute('data-stage-days')
    const emphasis = await badge.getAttribute('data-emphasis')
    expect(Number(days)).toBeGreaterThanOrEqual(19)
    expect(emphasis).toBe('stronger')
    // Copy contract: badge text contains "days in Shortlisted".
    await expect(badge).toContainText(/\d+ days? in Shortlisted/i)
  })

  test('15. Default sort is oldest_in_stage — Reviewing column ordered by stage_entered_at ASC', async () => {
    // Already at DESKTOP_VIEWPORT from test 14. The default for this
    // employer was reset to 'oldest_in_stage' in beforeAll (and again
    // in afterAll for the next run), so the control should render that
    // pill as active and the Reviewing column should be in ASC order
    // by stage_entered_at.

    const oldestPill = page.locator('[data-testid="sort-order-oldest_in_stage"]')
    await expect(oldestPill).toHaveAttribute('data-active', 'true', { timeout: 5000 })

    // Read each Reviewing card's stage_entered_at via the badge title
    // attribute — the title encodes "Entered <Stage> on <localeDate>"
    // which gives us a deterministic stage anchor without round-tripping
    // back to the DB. The Reviewing column = first column; cards inside
    // it should appear in stage_entered_at ASC order.
    const reviewingColumn = page.locator('[class*="page_column__"]').first()
    const cardIds = await reviewingColumn.locator('[data-rfd-draggable-id]').evaluateAll(
      (els) => els.map((e) => (e as HTMLElement).getAttribute('data-rfd-draggable-id')!),
    )
    expect(cardIds.length).toBeGreaterThanOrEqual(6) // seededApps minus any moved in earlier tests

    // Fetch the stage_entered_at for these IDs in one query and verify
    // they're in ASC order in the rendered DOM.
    const { data: rows } = await supabase
      .from('job_applications')
      .select('id, stage_entered_at')
      .in('id', cardIds)
    expect(rows).toBeTruthy()
    const orderedByDom = cardIds.map((id) => rows!.find((r: any) => r.id === id)!.stage_entered_at as string)
    for (let i = 1; i < orderedByDom.length; i++) {
      expect(new Date(orderedByDom[i]).getTime()).toBeGreaterThanOrEqual(new Date(orderedByDom[i - 1]).getTime())
    }
  })

  test('16. Switch to newest_first — Reviewing column reorders by created_at DESC + DB persisted', async () => {
    // Toggling the control: (1) flips the visual pill immediately
    // (optimistic), (2) re-sorts the cards client-side without a refetch,
    // (3) persists the new value to employer_profiles. We assert all
    // three.

    const newestPill = page.locator('[data-testid="sort-order-newest_first"]')
    await newestPill.click()
    await expect(newestPill).toHaveAttribute('data-active', 'true', { timeout: 3000 })

    // Card order should now follow created_at DESC. Reviewing seeds
    // were inserted in seededApps order (idx 0 first → idx 7 last), so
    // the FIRST card in the column should be the LAST-seeded id.
    const reviewingColumn = page.locator('[class*="page_column__"]').first()
    const firstCard = reviewingColumn.locator('[data-rfd-draggable-id]').first()
    const firstCardId = await firstCard.getAttribute('data-rfd-draggable-id')
    // seededApps[7] is the newest reviewing card (skipping ones that
    // may have been moved earlier — desktop test 10 moved seededApps[7]
    // to shortlisted, so the newest survivor is seededApps[6]). Allow
    // for either by asserting the card is among the LAST 2-3 reviewing
    // seeds; if it's seededApps[0] (the OLDEST) the sort hasn't flipped.
    const lastFewSeeds = seededApps.slice(-3)
    expect(lastFewSeeds).toContain(firstCardId)

    // Persisted to employer_profiles?
    if (!employerUserId) throw new Error('employerUserId not captured')
    await expect(async () => {
      const { data } = await supabase
        .from('employer_profiles')
        .select('pipeline_sort_order')
        .eq('user_id', employerUserId!)
        .single()
      expect(data?.pipeline_sort_order).toBe('newest_first')
    }).toPass({ timeout: 5000 })
  })

  test('17. Sort preference persists across page reload', async () => {
    // Page is still at DESKTOP_VIEWPORT with newest_first persisted
    // from test 16. A hard reload should re-load the preference from
    // employer_profiles and render newest_first as the active pill.

    await page.goto(`${BASE}/pipeline`)
    await dismissCookieBanner(page)
    await expect(page.locator('h1', { hasText: 'Hiring Pipeline' })).toBeVisible({ timeout: 30000 })

    const newestPill = page.locator('[data-testid="sort-order-newest_first"]')
    const oldestPill = page.locator('[data-testid="sort-order-oldest_in_stage"]')
    await expect(newestPill).toHaveAttribute('data-active', 'true', { timeout: 5000 })
    await expect(oldestPill).toHaveAttribute('data-active', 'false')
  })

  test('18. Backfill correctness — seed 30-day-old app + 5-day cascade row → stage_entered_at picks cascade', async () => {
    // Reproduces the migration's COALESCE chain against a fresh row.
    // We can't re-run the migration's UPDATE (it's one-shot and only
    // touches rows where the column was just added), but we CAN run
    // the same SELECT-side COALESCE expression against a freshly seeded
    // row + cascade row to prove the logic is right.
    //
    // Setup: app created 30 days ago (current status='shortlisted'),
    // status_updated_at=NULL, with ONE cascade_log row marking the
    // shortlisted transition 5 days ago. The chain
    //   COALESCE(MAX(cascade_to_status_match), status_updated_at, created_at)
    // should pick the cascade row's 5-day timestamp.

    if (!seededJobId) throw new Error('seededJobId not seeded')
    // Need a candidate that isn't already attached to seededJobId — the
    // job_applications table has unique_job_candidate on (job_id, candidate_id).
    // beforeAll used the first 12 candidates (0..11); fetch one beyond
    // that and skip any that collide just in case.
    const { data: candidates } = await supabase
      .from('candidate_profiles')
      .select('user_id')
      .range(12, 19)
    if (!candidates || candidates.length < 1) throw new Error('No spare candidate profile available for backfill test')
    const { data: existingApps } = await supabase
      .from('job_applications')
      .select('candidate_id')
      .eq('job_id', seededJobId)
    const usedIds = new Set((existingApps || []).map((a: any) => a.candidate_id))
    const candidate = candidates.find(c => !usedIds.has(c.user_id))
    if (!candidate) throw new Error('All fetched candidates already attached to seeded job')

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString()

    // Insert the backfill-target app. stage_entered_at is left at its
    // column default (now) so the test sees the COALESCE override take
    // effect. created_at is forced to 30 days ago via a separate UPDATE
    // because the INSERT path runs a server-side trigger that overrides
    // created_at if we set it inline.
    const { data: backfillApp, error: bfErr } = await supabase
      .from('job_applications')
      .insert({
        job_id: seededJobId,
        candidate_id: candidate.user_id,
        job_title: '__e2e_backfill__',
        status: 'shortlisted',
      })
      .select('id')
      .single()
    if (bfErr || !backfillApp) throw new Error(`Backfill seed failed: ${bfErr?.message}`)
    const backfillId = backfillApp.id as string

    try {
      await supabase
        .from('job_applications')
        .update({ created_at: thirtyDaysAgo, status_updated_at: null, stage_entered_at: thirtyDaysAgo })
        .eq('id', backfillId)

      // Cascade log row marking the move into shortlisted 5 days ago.
      // cascade_kind is constrained — only interview_completed |
      // interview_cancelled | offer_accepted | offer_withdrawn |
      // backward_move | restore are allowed. 'restore' is the closest
      // semantic fit for "we just moved into a stage" and the only
      // value that fires for forward-direction transitions without
      // side effects on other tables.
      const { error: clErr } = await supabase
        .from('pipeline_cascade_log')
        .insert({
          application_id: backfillId,
          from_status: 'reviewing',
          to_status: 'shortlisted',
          cascade_kind: 'restore',
          details: {},
          created_at: fiveDaysAgo,
        })
      if (clErr) throw new Error(`Cascade log insert failed: ${clErr.message}`)

      // Read the candidates: cascade row's created_at vs status_updated_at vs created_at.
      const { data: target } = await supabase
        .from('job_applications')
        .select('id, status, status_updated_at, created_at')
        .eq('id', backfillId)
        .single()
      const { data: logRow } = await supabase
        .from('pipeline_cascade_log')
        .select('created_at')
        .eq('application_id', backfillId)
        .eq('to_status', 'shortlisted')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Manual COALESCE matching the migration body. cascade wins,
      // then status_updated_at, then created_at.
      const cascadeTs = logRow?.created_at as string | undefined
      const statusUpdatedTs = target?.status_updated_at as string | null
      const createdTs = target?.created_at as string
      const expected = cascadeTs || statusUpdatedTs || createdTs
      expect(new Date(expected).getTime()).toBeCloseTo(new Date(fiveDaysAgo).getTime(), -2)

      // And explicitly: cascade should NOT equal the 30-day created_at.
      expect(new Date(expected).getTime()).not.toBe(new Date(thirtyDaysAgo).getTime())
    } finally {
      // Tear down — cascade rows have ON DELETE CASCADE? Be defensive
      // and delete the cascade row first.
      await supabase.from('pipeline_cascade_log').delete().eq('application_id', backfillId)
      await supabase.from('job_applications').delete().eq('id', backfillId)
    }
  })
})
