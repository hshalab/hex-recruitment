import { test, expect, type Page } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.test') })

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const EMPLOYER_EMAIL = process.env.EMPLOYER_EMAIL!
const EMPLOYER_PASS = process.env.EMPLOYER_PASS!

// Canonical page-surface tone for the authenticated app — every page that
// isn't the kanban board sits on body's --off-white.
const CANONICAL_BODY_BG = 'rgb(248, 249, 250)' // #f8f9fa
// Forbidden background for any stat-tile / metric-card surface — that's
// the dark-navy treatment we deliberately removed.
const FORBIDDEN_DARK_BG = 'rgb(15, 23, 42)' // #0f172a

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
  await page.waitForURL(/employer|dashboard|my-jobs|interviews|pipeline/, { timeout: 15000 })
  await dismissCookieBanner(page)
}

async function goAuthed(page: Page, route: string): Promise<'ok' | 'redirected'> {
  await page.goto(`${BASE}${route}`)
  await page.waitForLoadState('networkidle')
  return page.url().includes(route) ? 'ok' : 'redirected'
}

async function assertBodyBgAndNoDarkStatTiles(page: Page, route: string) {
  const result = await page.evaluate(({ FORBIDDEN }) => {
    const bodyBg = getComputedStyle(document.body).backgroundColor
    // Look for anything that styles itself like a stat tile / metric card.
    // Names converged across pages: statCard, statItem, statTile, statBox,
    // statPill (the latter is /employer/dashboard's already-light variant).
    const selectors = ['statCard', 'statItem', 'statTile', 'statBox']
    const offenders: Array<{ cls: string; bg: string }> = []
    for (const s of selectors) {
      const els = document.querySelectorAll(`[class*="${s}"]`)
      for (const el of Array.from(els)) {
        const bg = getComputedStyle(el).backgroundColor
        if (bg === FORBIDDEN) {
          offenders.push({ cls: (el as HTMLElement).className.toString().slice(0, 80), bg })
        }
      }
    }
    return { bodyBg, offenders }
  }, { FORBIDDEN: FORBIDDEN_DARK_BG })

  expect(result.bodyBg, `body background on ${route}`).toBe(CANONICAL_BODY_BG)
  expect(result.offenders, `no stat tile on ${route} should have dark navy bg`).toEqual([])
}

test.describe('Visual consistency — page surface system', () => {
  test.skip(!EMPLOYER_EMAIL || !EMPLOYER_PASS, 'EMPLOYER_EMAIL / EMPLOYER_PASS not set in .env.test')

  test('/pipeline body bg + no dark stat tiles', async ({ page }) => {
    await loginAsEmployer(page)
    const status = await goAuthed(page, '/pipeline')
    if (status === 'redirected') {
      test.skip(true, `Redirected away from /pipeline (likely subscription gate): ${page.url()}`)
      return
    }
    await assertBodyBgAndNoDarkStatTiles(page, '/pipeline')
  })

  test('/interviews body bg + no dark stat tiles', async ({ page }) => {
    await loginAsEmployer(page)
    const status = await goAuthed(page, '/interviews')
    if (status === 'redirected') {
      test.skip(true, `Redirected away from /interviews (likely subscription gate): ${page.url()}`)
      return
    }
    await assertBodyBgAndNoDarkStatTiles(page, '/interviews')
  })

  test('/my-jobs body bg + no dark stat tiles', async ({ page }) => {
    await loginAsEmployer(page)
    const status = await goAuthed(page, '/my-jobs')
    if (status === 'redirected') {
      test.skip(true, `Redirected away from /my-jobs (likely subscription gate): ${page.url()}`)
      return
    }
    await assertBodyBgAndNoDarkStatTiles(page, '/my-jobs')
  })
})
