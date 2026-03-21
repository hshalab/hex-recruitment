import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_CANDIDATE_EMAIL = `test-candidate-${Date.now()}@example.com`
const TEST_CANDIDATE_PASSWORD = 'TestPass123!'
const TEST_CANDIDATE_NAME = 'Test Candidate'

test.describe('Candidate Flow — register → profile → search → apply → check applications', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('1. Register as candidate', async () => {
    await page.goto(`${BASE_URL}/register/employee`)
    await expect(page).toHaveURL(/register/)

    // Fill registration form
    await page.fill('input[name="fullName"], input[id="fullName"]', TEST_CANDIDATE_NAME)
    await page.fill('input[name="email"], input[id="email"], input[type="email"]', TEST_CANDIDATE_EMAIL)
    await page.fill('input[name="password"], input[id="password"], input[type="password"]', TEST_CANDIDATE_PASSWORD)

    // Accept terms if checkbox exists
    const termsCheckbox = page.locator('input[type="checkbox"]').first()
    if (await termsCheckbox.isVisible()) {
      await termsCheckbox.check()
    }

    // Submit
    await page.click('button[type="submit"]')

    // Should redirect to profile setup or dashboard
    await page.waitForURL(/profile|dashboard|jobs|verify/, { timeout: 15000 })
  })

  test('2. Complete candidate profile', async () => {
    await page.goto(`${BASE_URL}/profile`)
    await page.waitForLoadState('networkidle')

    // Click edit if in view mode
    const editBtn = page.locator('button:has-text("Edit Profile")')
    if (await editBtn.isVisible()) {
      await editBtn.click()
      await page.waitForTimeout(500)
    }

    // Fill basic profile fields (step 1 - personal info)
    const jobTitleInput = page.locator('input[name="currentPosition"], input[id="currentPosition"]')
    if (await jobTitleInput.isVisible()) {
      await jobTitleInput.fill('Head Chef')
    }

    const aboutMe = page.locator('textarea[name="aboutMe"], textarea[id="aboutMe"]')
    if (await aboutMe.isVisible()) {
      await aboutMe.fill('Experienced chef with 5 years in fine dining.')
    }

    // Try to navigate through steps or save
    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Next Step")')
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
    }

    // Verify profile page loads without errors
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })
  })

  test('3. Search and browse jobs', async () => {
    await page.goto(`${BASE_URL}/jobs`)
    await page.waitForLoadState('networkidle')

    // Wait for jobs to load
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Search for a job
    const searchInput = page.locator('input[placeholder*="Search"], input[name="search"], input[id="search"]')
    if (await searchInput.isVisible()) {
      await searchInput.fill('chef')
      await page.waitForTimeout(1000) // Wait for debounced search
    }

    // Verify job cards are displayed (or empty state)
    const jobCards = page.locator('[class*="jobCard"], [class*="listCard"]')
    const emptyState = page.locator('[class*="emptyState"], text=No jobs found')

    // Either jobs exist or empty state is shown
    const hasJobs = await jobCards.count() > 0
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    expect(hasJobs || hasEmpty).toBeTruthy()

    // If jobs exist, click the first one
    if (hasJobs) {
      await jobCards.first().click()
      await page.waitForTimeout(500)

      // Verify job detail is shown (either in split panel or modal)
      const detailVisible = await page.locator('[class*="detailPanel"], [class*="jobDetail"], [class*="modal"]').isVisible().catch(() => false)
      expect(detailVisible).toBeTruthy()
    }
  })

  test('4. Apply for a job', async () => {
    await page.goto(`${BASE_URL}/jobs`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Find and click first available job
    const jobCards = page.locator('[class*="jobCard"], [class*="listCard"]')
    if (await jobCards.count() === 0) {
      test.skip(true, 'No jobs available to apply to')
      return
    }
    await jobCards.first().click()
    await page.waitForTimeout(500)

    // Click Apply button
    const applyBtn = page.locator('button:has-text("Apply"), a:has-text("Apply")')
    if (await applyBtn.isVisible()) {
      await applyBtn.first().click()
      await page.waitForTimeout(500)

      // Fill cover letter if modal appears
      const coverLetter = page.locator('textarea[placeholder*="employer"], textarea[placeholder*="fit"]')
      if (await coverLetter.isVisible()) {
        await coverLetter.fill('I am very interested in this position and have relevant experience.')
      }

      // Submit application
      const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Send Application")')
      if (await submitBtn.isVisible()) {
        await submitBtn.click()
        await page.waitForTimeout(2000)
      }
    }
  })

  test('5. Check applications page', async () => {
    await page.goto(`${BASE_URL}/applications`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Page should show either applications or empty state
    const appCards = page.locator('[class*="applicationCard"]')
    const emptyState = page.locator('[class*="emptyState"], text=haven\'t applied')

    const hasApps = await appCards.count() > 0
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    expect(hasApps || hasEmpty).toBeTruthy()

    // If applications exist, verify stepper is visible
    if (hasApps) {
      const stepper = page.locator('[class*="stepper"]').first()
      await expect(stepper).toBeVisible()

      // Verify "Application status" label is present
      await expect(page.locator('text=Application status').first()).toBeVisible()
    }
  })
})
