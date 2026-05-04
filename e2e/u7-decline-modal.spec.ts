import { test, expect, type Page } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const EMPLOYER_EMAIL = process.env.EMPLOYER_EMAIL!
const EMPLOYER_PASS = process.env.EMPLOYER_PASS!

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
  await page.locator('button[type="submit"], button:has-text("Login")').first().click()
  await page.waitForURL(/employer|dashboard|my-jobs|interviews/, { timeout: 15000 })
  await dismissCookieBanner(page)
}

test.describe('U7 — decline modal', () => {
  test.skip(!EMPLOYER_EMAIL || !EMPLOYER_PASS, 'EMPLOYER_EMAIL / EMPLOYER_PASS not set in .env.test')

  test('modal has exactly TWO buttons (Cancel + Send & Decline) and pre-fills body', async ({ page }) => {
    await loginAsEmployer(page)

    // Find a job with at least one Reject button on its applications page.
    await page.goto(`${BASE}/my-jobs`)
    await page.waitForLoadState('networkidle')

    const viewAppLinks = page.locator('a[href*="/applications"]')
    const linkCount = await viewAppLinks.count()
    if (linkCount === 0) {
      test.skip(true, 'No jobs with applications link on /my-jobs')
      return
    }

    let rejectBtn = page.locator('button.barBtnReject, button:has-text("Reject")').first()
    let opened = false
    for (let i = 0; i < linkCount && !opened; i++) {
      await viewAppLinks.nth(i).click()
      await page.waitForLoadState('networkidle')
      rejectBtn = page.locator('button:has-text("Reject")').first()
      if (await rejectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        opened = true
        break
      }
      await page.goBack()
      await page.waitForLoadState('networkidle')
    }

    if (!opened) {
      test.skip(true, 'No Reject buttons found across employer applications')
      return
    }

    await rejectBtn.click()

    const heading = page.locator('h3:has-text("Decline application")')
    await expect(heading).toBeVisible({ timeout: 5000 })

    // Modal root = the <div onClick={e => e.stopPropagation()}> wrapping the heading.
    const modal = heading.locator('xpath=ancestor::div[1]')

    // Wait for the textarea to populate (template fetch + applyVars).
    const textarea = modal.locator('textarea')
    await expect(textarea).toHaveValue(/.+/, { timeout: 5000 })

    const body = await textarea.inputValue()
    // Either custom template or DEFAULT_REJECTED_BODY → both contain the
    // job title or company name after applyVars substitution.
    expect(body.trim().length).toBeGreaterThan(20)

    // ── Regression guard: TWO buttons only, no silent decline. ──
    const buttons = modal.locator('button')
    const count = await buttons.count()
    expect(count).toBe(2)

    await expect(modal.locator('button:has-text("Cancel")')).toBeVisible()
    await expect(modal.locator('button:has-text("Send & Decline")')).toBeVisible()
    await expect(modal.locator('button:has-text("Reject without message")')).toHaveCount(0)
    await expect(modal.locator('button:has-text("Reject & Send Message")')).toHaveCount(0)
  })
})
