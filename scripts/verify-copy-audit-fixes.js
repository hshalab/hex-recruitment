/**
 * Verify the copy-audit-fix batch (commits 29a9bb7c..5591013a).
 * Spot-checks each user-facing surface that the audit ticket flagged.
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

// Load NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local so the candidate-session
// path works when the harness is run from a clean shell.
try {
  const envText = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const BASE = 'http://localhost:3000'
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROJECT_REF = 'aaljufxcniacfggqiuls'

// Reach the access-denied CTA on /candidates and /post-job by signing in
// as a candidate (employee role). Both pages render the access-denied
// screen for non-employers — anonymous users get redirected before the
// screen has a chance to render, so we need a candidate session.
async function getCandidateSession() {
  if (!ANON) return null
  const res = await fetch(`https://${PROJECT_REF}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'pauldavies.gbr+demo01@gmail.com', password: 'TheMunch2017!' }),
  })
  if (!res.ok) return null
  return await res.json()
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const results = []
  const addCheck = (test, pass, detail) => results.push({ test, pass, detail })

  const candidateSession = await getCandidateSession()
  if (!candidateSession) console.warn('WARN: no candidate session; /candidates and /post-job tests will be skipped')

  if (candidateSession) {
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.evaluate(({ key, val }) => localStorage.setItem(key, val), {
      key: `sb-${PROJECT_REF}-auth-token`,
      val: JSON.stringify({
        access_token: candidateSession.access_token,
        refresh_token: candidateSession.refresh_token,
        token_type: 'bearer',
        expires_in: candidateSession.expires_in,
        expires_at: candidateSession.expires_at,
        user: candidateSession.user,
      }),
    })
  }

  // ── /candidates as a candidate → access-denied "Employer Access Only" CTA
  await page.goto(`${BASE}/candidates`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  const candidatesText = await page.evaluate(() => document.body.textContent || '')
  addCheck('/candidates CTA reads "Start 3-month free trial"',
    /Start 3-month free trial/i.test(candidatesText),
    !/14-Day Trial/i.test(candidatesText) ? 'no stale "14-Day Trial"' : 'stale "14-Day Trial" still present')

  // ── /post-job similar
  await page.goto(`${BASE}/post-job`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  const postJobText = await page.evaluate(() => document.body.textContent || '')
  addCheck('/post-job CTA reads "Start 3-month free trial"',
    /Start 3-month free trial/i.test(postJobText),
    !/14-Day Trial/i.test(postJobText) ? 'no stale "14-Day Trial"' : 'stale "14-Day Trial" still present')

  // ── /dashboard/subscription/cancel
  await page.goto(`${BASE}/dashboard/subscription/cancel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const cancelText = await page.evaluate(() => document.body.textContent || '')
  addCheck('/dashboard/subscription/cancel list contains "3-month free trial"',
    /3-month free trial/i.test(cancelText), '')
  addCheck('/dashboard/subscription/cancel says "14 days\' cancellation notice"',
    /14 days['′] cancellation notice/i.test(cancelText), '')

  // ── Homepage footer tagline + <title>
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const homeText = await page.evaluate(() => document.body.textContent || '')
  addCheck('/ footer tagline reads "Hire talent / Find jobs"',
    /Hire talent \/ Find jobs/i.test(homeText), '')
  const homeTitle = await page.title()
  addCheck('/ <title> uses "Thrive — Hire talent / Find jobs"',
    /Thrive\s*—\s*Hire talent \/ Find jobs/.test(homeTitle), `actual: "${homeTitle}"`)

  // ── ChatBot — open via the floating button (class includes "chatButton")
  // then ask cancellation + plan questions
  const chatButton = page.locator('[class*="chatButton"]').first()
  await chatButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  await chatButton.click({ force: true })
  await page.waitForTimeout(600)

  const chatInput = page.locator('input[placeholder*="message" i]').first()
  await chatInput.waitFor({ state: 'visible', timeout: 3000 })
  await chatInput.fill('How do I cancel my subscription?')
  await chatInput.press('Enter')
  await page.waitForTimeout(4000)
  let chatBodyText = await page.evaluate(() => document.body.textContent || '')
  addCheck('ChatBot cancellation response says "14 days\' notice"',
    /14 days['′] notice/i.test(chatBodyText),
    !/1 week['′]s notice/i.test(chatBodyText) ? 'no stale "1 week\'s notice"' : 'stale present')

  // Asks specifically about TIERS to route to the single-plan response.
  // ("What plans do you have?" hits the generic pricing entry — a fine answer,
  //  just not the tier-rejection one we want to assert against.)
  await chatInput.fill('What tiers do you offer?')
  await chatInput.press('Enter')
  await page.waitForTimeout(4000)
  chatBodyText = await page.evaluate(() => document.body.textContent || '')
  addCheck('ChatBot plan-question describes single £99/month plan',
    /one plan: £99\/month/i.test(chatBodyText) || /single plan at £99\/month/i.test(chatBodyText),
    '')
  addCheck('ChatBot plan-question does NOT name non-existent tiers in active response',
    !/the Professional plan|the Basic plan|the Starter plan|the Premium plan/i.test(chatBodyText), '')

  await browser.close()

  console.log('\n=========== SUMMARY ===========')
  for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.test}${r.detail ? ' — ' + r.detail : ''}`)
  const overall = results.every(r => r.pass)
  console.log('\nOVERALL:', overall ? 'PASS' : 'FAIL')
  process.exit(overall ? 0 : 1)
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
