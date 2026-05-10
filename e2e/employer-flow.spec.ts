import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_EMPLOYER_EMAIL = `test-employer-${Date.now()}@example.com`
const TEST_EMPLOYER_PASSWORD = 'TestPass123!'
const TEST_COMPANY_NAME = 'Test Company Ltd'

test.describe('Employer Flow — register → post job → view applications → shortlist → schedule interview', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page
  let postedJobId: string | null = null

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('1. Register as employer', async () => {
    await page.goto(`${BASE_URL}/register/employer`)
    await expect(page).toHaveURL(/register/)

    // Fill registration form
    await page.fill('input[name="companyName"], input[id="companyName"]', TEST_COMPANY_NAME)
    await page.fill('input[name="email"], input[id="email"], input[type="email"]', TEST_EMPLOYER_EMAIL)
    await page.fill('input[name="password"], input[id="password"], input[type="password"]', TEST_EMPLOYER_PASSWORD)

    // Fill name fields if present
    const nameInput = page.locator('input[name="fullName"], input[id="fullName"]')
    if (await nameInput.isVisible()) {
      await nameInput.fill('Test Employer')
    }

    // Accept terms if checkbox exists
    const termsCheckbox = page.locator('input[type="checkbox"]').first()
    if (await termsCheckbox.isVisible()) {
      await termsCheckbox.check()
    }

    // Submit
    await page.click('button[type="submit"]')

    // Should redirect to dashboard, subscription, or verification
    await page.waitForURL(/dashboard|subscribe|verify|employer/, { timeout: 15000 })
  })

  test('2. Post a new job', async () => {
    await page.goto(`${BASE_URL}/post-job`)
    await page.waitForLoadState('networkidle')

    // Fill required fields
    const titleInput = page.locator('input[name="title"], input[id="title"]')
    if (await titleInput.isVisible()) {
      await titleInput.fill('Head Chef')
    }

    // Select category if dropdown exists
    const categorySelect = page.locator('select[name="category"], select[id="category"]')
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption({ index: 1 })
    }

    // Fill location
    const locationInput = page.locator('input[name="location"], input[id="location"]')
    if (await locationInput.isVisible()) {
      await locationInput.fill('London')
    }

    // Fill salary
    const salaryMin = page.locator('input[name="salaryMin"], input[id="salaryMin"]')
    if (await salaryMin.isVisible()) {
      await salaryMin.fill('30000')
    }
    const salaryMax = page.locator('input[name="salaryMax"], input[id="salaryMax"]')
    if (await salaryMax.isVisible()) {
      await salaryMax.fill('45000')
    }

    // Fill description
    const description = page.locator('textarea[name="description"], textarea[id="description"], [contenteditable="true"]')
    if (await description.isVisible()) {
      await description.first().fill('We are looking for an experienced Head Chef to lead our kitchen team.')
    }

    // Select employment type
    const empType = page.locator('select[name="employmentType"], input[value="Full-time"]')
    if (await empType.isVisible()) {
      if (await empType.getAttribute('type') === 'checkbox' || await empType.getAttribute('type') === 'radio') {
        await empType.check()
      } else {
        await empType.selectOption('Full-time')
      }
    }

    // Submit job posting
    const postBtn = page.locator('button:has-text("Post"), button:has-text("Publish"), button[type="submit"]')
    if (await postBtn.isVisible()) {
      await postBtn.first().click()
      await page.waitForTimeout(3000)
    }

    // Capture job ID from URL if redirected
    const url = page.url()
    const jobIdMatch = url.match(/job[s]?\/([a-f0-9-]+)/)
    if (jobIdMatch) {
      postedJobId = jobIdMatch[1]
    }
  })

  test('3. View my jobs and applications', async () => {
    await page.goto(`${BASE_URL}/my-jobs`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Check that jobs list or empty state is shown.
    // /my-jobs renders rows post-toggle-removal; legacy selectors kept for
    // safety (candidate-side /jobs still uses jobCard).
    const jobCards = page.locator('[class*="jobRow"], [class*="jobCard"], [class*="listCard"]')
    const emptyState = page.locator('[class*="emptyState"], text=No jobs')

    const hasJobs = await jobCards.count() > 0
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    expect(hasJobs || hasEmpty).toBeTruthy()

    // If a job exists, click "View Applications"
    if (hasJobs) {
      const viewAppsBtn = page.locator('button:has-text("View Applications"), a:has-text("View Applications")')
      if (await viewAppsBtn.first().isVisible()) {
        await viewAppsBtn.first().click()
        await page.waitForLoadState('networkidle')
        await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })
      }
    }
  })

  test('4. Shortlist a candidate (if applications exist)', async () => {
    // Navigate to first job's applications
    await page.goto(`${BASE_URL}/my-jobs`)
    await page.waitForLoadState('networkidle')

    const viewAppsBtn = page.locator('button:has-text("View Applications"), a:has-text("View Applications")')
    if (await viewAppsBtn.count() === 0) {
      test.skip(true, 'No jobs with applications to shortlist')
      return
    }

    await viewAppsBtn.first().click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Look for application cards
    const appCards = page.locator('[class*="candidateCard"], [class*="applicationCard"]')
    if (await appCards.count() === 0) {
      test.skip(true, 'No applications to shortlist')
      return
    }

    // Click shortlist button on first application
    const shortlistBtn = page.locator('button:has-text("Shortlist")')
    if (await shortlistBtn.first().isVisible()) {
      await shortlistBtn.first().click()
      await page.waitForTimeout(1000)

      // Verify status changed
      const shortlistedBadge = page.locator('text=Shortlisted')
      await expect(shortlistedBadge.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('5. Schedule an interview (if shortlisted candidates exist)', async () => {
    // Look for "Schedule Interview" button
    const scheduleBtn = page.locator('button:has-text("Schedule Interview"), button:has-text("Schedule")')
    if (await scheduleBtn.count() === 0) {
      test.skip(true, 'No schedule interview button available')
      return
    }

    await scheduleBtn.first().click()
    await page.waitForTimeout(500)

    // Fill interview modal
    const modal = page.locator('[class*="modal"], [class*="Modal"]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Set interview date (tomorrow)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]
    const dateInput = modal.locator('input[type="date"]')
    if (await dateInput.isVisible()) {
      await dateInput.fill(dateStr)
    }

    // Set interview time
    const timeInput = modal.locator('input[type="time"]')
    if (await timeInput.isVisible()) {
      await timeInput.fill('10:00')
    }

    // Select interview type
    const typeSelect = modal.locator('select[name*="type"], select[id*="type"]')
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption({ index: 1 })
    }

    // Submit interview
    const confirmBtn = modal.locator('button:has-text("Schedule"), button:has-text("Confirm"), button[type="submit"]')
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
      await page.waitForTimeout(2000)
    }

    // Verify success (modal closes or success message appears)
    const successMsg = page.locator('text=scheduled, text=Interview, text=success')
    const modalGone = await modal.isHidden().catch(() => true)
    expect(await successMsg.isVisible().catch(() => false) || modalGone).toBeTruthy()
  })

  test('6. Verify interviews page', async () => {
    await page.goto(`${BASE_URL}/interviews`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Page should show either interviews or empty state
    const interviewCards = page.locator('[class*="interviewCard"]')
    const emptyState = page.locator('[class*="emptyState"], text=No interviews')

    const hasInterviews = await interviewCards.count() > 0
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    expect(hasInterviews || hasEmpty).toBeTruthy()
  })
})
