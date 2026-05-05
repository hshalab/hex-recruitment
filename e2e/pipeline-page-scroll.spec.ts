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
  await page.waitForURL(/employer|dashboard|my-jobs|interviews|pipeline/, { timeout: 15000 })
  await dismissCookieBanner(page)
}

test.describe('Pipeline page-scroll', () => {
  test.skip(!EMPLOYER_EMAIL || !EMPLOYER_PASS, 'EMPLOYER_EMAIL / EMPLOYER_PASS not set in .env.test')

  test('desktop 1280×800 — board scrolls horizontally, no descendant has constrained vertical overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAsEmployer(page)
    await page.goto(`${BASE}/pipeline`)
    await page.waitForLoadState('networkidle')
    // The login flow may redirect a sub-less employer past /pipeline to
    // the subscription gate. Skip the test cleanly in that case rather
    // than asserting against a route we never landed on.
    if (!page.url().includes('/pipeline')) {
      test.skip(true, `Redirected away from /pipeline to ${page.url()} — likely subscription gate`)
      return
    }
    await page.locator('[class*="board"]').first().waitFor({ state: 'attached', timeout: 10000 })

    const layout = await page.evaluate(() => {
      const board = document.querySelector('[class*="board"]') as HTMLElement | null
      if (!board) return { boardFound: false }

      const boardCs = getComputedStyle(board)
      const boardScrollsX = board.scrollWidth > board.clientWidth + 1

      // Walk every descendant of the board (columns, column bodies, cards,
      // anything inside) and flag elements that engage their own vertical
      // scrollbar. After the page-scroll fix, no descendant should have
      // overflow-y:auto/scroll combined with content that exceeds its
      // clientHeight — the page itself absorbs the scroll instead.
      const offenders: Array<{ tag: string; cls: string; overflowY: string; scrollHeight: number; clientHeight: number }> = []
      const walk = (el: Element) => {
        const cs = getComputedStyle(el)
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el as HTMLElement).className.toString().slice(0, 100),
            overflowY: cs.overflowY,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          })
        }
        for (const child of Array.from(el.children)) walk(child)
      }
      walk(board)

      // Also flag any column body still carrying overflow-y:auto/scroll even
      // when it's not currently overflowing — that was the U7-era setting we
      // explicitly removed.
      const columnBodies = Array.from(board.querySelectorAll('[class*="columnBody"]'))
      const columnBodyOverflow = columnBodies.map(cb => getComputedStyle(cb).overflowY)

      return {
        boardFound: true,
        board: {
          overflowX: boardCs.overflowX,
          overflowY: boardCs.overflowY,
          scrollsHorizontally: boardScrollsX,
        },
        offenders,
        columnBodyOverflow,
      }
    })

    expect(layout.boardFound).toBe(true)
    // Board itself is allowed (and expected) to scroll horizontally.
    expect(layout.board!.overflowX).toMatch(/auto|scroll/)
    // No descendant should be a vertical scroll container with overflowing content.
    expect(layout.offenders).toEqual([])
    // Column bodies should NOT carry overflow-y: auto/scroll (regression guard
    // against the old per-column scroll pattern).
    for (const ov of layout.columnBodyOverflow!) {
      expect(ov).not.toBe('auto')
      expect(ov).not.toBe('scroll')
    }
  })

  test('mobile 390×844 — 3×2 grid intact, no per-cell vertical overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsEmployer(page)
    await page.goto(`${BASE}/pipeline`)
    await page.waitForLoadState('networkidle')
    if (!page.url().includes('/pipeline')) {
      test.skip(true, `Redirected away from /pipeline to ${page.url()} — likely subscription gate`)
      return
    }
    await page.locator('[class*="board"]').first().waitFor({ state: 'attached', timeout: 10000 })

    const layout = await page.evaluate(() => {
      const board = document.querySelector('[class*="board"]') as HTMLElement | null
      if (!board) return { boardFound: false }
      const boardCs = getComputedStyle(board)
      const columnBodies = Array.from(board.querySelectorAll('[class*="columnBody"]'))
      const columns = Array.from(board.querySelectorAll('[class*="columnHeader"]')).map(h => {
        const col = h.parentElement!
        return { width: Math.round(col.getBoundingClientRect().width) }
      })
      return {
        boardFound: true,
        display: boardCs.display,
        gridTemplateColumns: boardCs.gridTemplateColumns,
        columnCount: columns.length,
        columnBodyOverflow: columnBodies.map(cb => getComputedStyle(cb).overflowY),
        firstTwoColumnWidthsRoughlyEqual: columns.length >= 2 && Math.abs(columns[0].width - columns[1].width) < 4,
      }
    })

    expect(layout.boardFound).toBe(true)
    expect(layout.display).toBe('grid')
    // Two-column grid: each track expressed as a length, not a fraction.
    expect(layout.gridTemplateColumns).toMatch(/^\S+ \S+$/)
    expect(layout.columnCount).toBe(6)
    expect(layout.firstTwoColumnWidthsRoughlyEqual).toBe(true)
    for (const ov of layout.columnBodyOverflow!) {
      expect(ov).not.toBe('auto')
      expect(ov).not.toBe('scroll')
    }
  })
})
