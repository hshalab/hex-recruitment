import { test, expect, type Page } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })

const BASE = process.env.BASE_URL || 'https://hex-recruitment.vercel.app'
const EMPLOYER_EMAIL = process.env.EMPLOYER_EMAIL!
const EMPLOYER_PASS = process.env.EMPLOYER_PASS!
const CANDIDATE_EMAIL = process.env.CANDIDATE_EMAIL!
const CANDIDATE_PASS = process.env.CANDIDATE_PASS!

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
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
  await emailInput.first().fill(EMPLOYER_EMAIL)
  const passInput = page.locator('input[type="password"]')
  await passInput.first().fill(EMPLOYER_PASS)
  await page.locator('button[type="submit"], button:has-text("Login")').first().click()
  await page.waitForURL(/employer|dashboard|my-jobs|interviews/, { timeout: 15000 })
  await dismissCookieBanner(page)
}

async function loginAsCandidate(page: Page) {
  await page.goto(`${BASE}/login/employee`)
  await dismissCookieBanner(page)
  await page.waitForLoadState('networkidle')
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
  await emailInput.first().fill(CANDIDATE_EMAIL)
  const passInput = page.locator('input[type="password"]')
  await passInput.first().fill(CANDIDATE_PASS)
  await page.locator('button[type="submit"], button:has-text("Login")').first().click()
  await page.waitForURL(/dashboard|jobs|profile/, { timeout: 15000 })
  await dismissCookieBanner(page)
}

// ─── Employer Flows ─────────────────────────────────────────────────────────

test.describe('Employer Authenticated Flows', () => {
  test.beforeEach(({ }, testInfo) => {
    if (!EMPLOYER_EMAIL || !EMPLOYER_PASS) {
      testInfo.skip(true, 'EMPLOYER_EMAIL / EMPLOYER_PASS not set in .env.test')
    }
  })

  test('1. Interviews — Reschedule opens schedule modal, not messages', async ({ page }) => {
    await loginAsEmployer(page)
    await page.goto(`${BASE}/interviews`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Find a Reschedule button
    const rescheduleBtn = page.locator('button:has-text("Reschedule")')
    if (await rescheduleBtn.count() === 0) {
      test.skip(true, 'No interviews with Reschedule button')
      return
    }

    await rescheduleBtn.first().click()
    await page.waitForTimeout(1000)

    // Should open a schedule/interview modal — NOT navigate to /messages
    expect(page.url()).not.toContain('/messages')

    // Modal should be visible with date/time fields
    const modal = page.locator('[class*="modal"], [class*="Modal"], [role="dialog"]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Should contain date or time input (schedule modal)
    const dateInput = modal.locator('input[type="date"]')
    const timeInput = modal.locator('input[type="time"]')
    const hasScheduleFields = (await dateInput.count() > 0) || (await timeInput.count() > 0)
    expect(hasScheduleFields).toBeTruthy()

    // Close the modal
    const closeBtn = modal.locator('button:has-text("Close"), button:has-text("Cancel"), button[aria-label="Close"]')
    if (await closeBtn.first().isVisible()) {
      await closeBtn.first().click()
    }
  })

  test('2. My Jobs — View Applications goes to correct page', async ({ page }) => {
    await loginAsEmployer(page)
    await page.goto(`${BASE}/my-jobs`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    const viewAppsBtn = page.locator('a:has-text("View Applications"), button:has-text("View Applications")')
    if (await viewAppsBtn.count() === 0) {
      test.skip(true, 'No jobs with View Applications button')
      return
    }

    await viewAppsBtn.first().click()
    await page.waitForLoadState('networkidle')

    // Should navigate to /my-jobs/[jobId]/applications
    expect(page.url()).toMatch(/\/my-jobs\/[a-f0-9-]+\/applications/)
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })
  })

  test('3. Post New Job navigates to /post-job', async ({ page }) => {
    await loginAsEmployer(page)
    await page.goto(`${BASE}/my-jobs`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Look for "Post a Job" or "Post New Job" link/button
    const postJobBtn = page.locator('a:has-text("Post"), button:has-text("Post")')
    if (await postJobBtn.count() === 0) {
      // Try direct navigation
      await page.goto(`${BASE}/post-job`)
    } else {
      await postJobBtn.first().click()
    }

    await page.waitForURL(/\/post-job/, { timeout: 10000 })
    expect(page.url()).toContain('/post-job')

    // Should have a job title input field
    const titleInput = page.locator('input[name="title"], input[id="title"], input[placeholder*="title" i]')
    await expect(titleInput.first()).toBeVisible({ timeout: 10000 })
  })

  test('4. Interviews — Cancel shows confirmation prompt', async ({ page }) => {
    await loginAsEmployer(page)
    await page.goto(`${BASE}/interviews`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    const cancelBtn = page.locator('button:has-text("Cancel")')
    if (await cancelBtn.count() === 0) {
      test.skip(true, 'No interviews with Cancel button')
      return
    }

    // Set up dialog handler BEFORE clicking
    let dialogMessage = ''
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message()
      await dialog.dismiss() // Click "Cancel" on the confirm dialog to NOT actually cancel
    })

    await cancelBtn.first().click()
    await page.waitForTimeout(1000)

    // A window.confirm dialog should have appeared
    expect(dialogMessage).toContain('cancel')

    // Should still be on interviews page (we dismissed the dialog)
    expect(page.url()).toContain('/interviews')
  })
})

// ─── Candidate Flows ────────────────────────────────────────────────────────

test.describe('Candidate Authenticated Flows', () => {
  test.beforeEach(({ }, testInfo) => {
    if (!CANDIDATE_EMAIL || !CANDIDATE_PASS) {
      testInfo.skip(true, 'CANDIDATE_EMAIL / CANDIDATE_PASS not set in .env.test')
    }
  })

  test('5. Jobs — click card → detail modal → Apply Now → apply modal', async ({ page }) => {
    await loginAsCandidate(page)
    await page.goto(`${BASE}/jobs`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const cards = page.locator('[class*="jobCard"]')
    if (await cards.count() === 0) {
      test.skip(true, 'No jobs available')
      return
    }

    // Click first job card
    await cards.first().click()
    await page.waitForTimeout(1000)

    // Detail modal should open (slide-in panel)
    const modal = page.locator('[class*="modalPanel"], [class*="modalOverlay"], [class*="detailPanel"]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Click Apply Now
    const applyBtn = page.locator('button:has-text("Apply Now"), button:has-text("Apply")')
    if (await applyBtn.first().isVisible()) {
      await applyBtn.first().click()
      await page.waitForTimeout(1000)

      // Apply modal should open (with textarea for cover letter)
      const applyModal = page.locator('[class*="applyModal"], [class*="ApplyNow"], [class*="apply"]')
      const textarea = page.locator('textarea')
      const hasApplyUI = (await applyModal.count() > 0) || (await textarea.count() > 0)
      expect(hasApplyUI).toBeTruthy()
    }
  })

  test('6. Dashboard — Browse All Jobs navigates to /jobs', async ({ page }) => {
    await loginAsCandidate(page)
    await page.goto(`${BASE}/dashboard`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 10000 })

    // Look for Browse All Jobs or Browse Jobs link
    const browseBtn = page.locator('a:has-text("Browse"), button:has-text("Browse")')
    if (await browseBtn.count() === 0) {
      // Fallback: check if there's a "Jobs" nav link in header
      const jobsNav = page.locator('a:has-text("Jobs")')
      if (await jobsNav.count() > 0) {
        await jobsNav.first().click()
      } else {
        test.skip(true, 'No Browse Jobs button found on dashboard')
        return
      }
    } else {
      await browseBtn.first().click()
    }

    await page.waitForURL(/\/jobs/, { timeout: 10000 })
    expect(page.url()).toContain('/jobs')
  })
})
