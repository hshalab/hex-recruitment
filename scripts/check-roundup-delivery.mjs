// Did the roundup actually ARRIVE?
//
// "sent" from the cron route counts what Resend ACCEPTED, not what a mail server
// took. Two candidates asked why they hadn't received an email the run had
// reported as sent, and answering it meant querying Resend by hand. This turns
// that into a line in the Actions log nobody has to ask for.
//
//   node scripts/check-roundup-delivery.mjs <emails.json> <expected-count>
//
// <emails.json> is the body of GET https://api.resend.com/emails?limit=100.
// Fetching happens in the workflow so the API key never reaches this file.
//
// EXIT CODES
//   0  everything delivered, or still settling
//   1  at least one message bounced, was complained about, or failed
//
// It deliberately does NOT fail on a status that hasn't settled. Resend reports
// 'sent' the instant it accepts a message and only 'delivered' once the
// receiving server takes it — usually seconds, occasionally longer. Treating
// "not yet known" as "not delivered" would make this cry wolf on a good run,
// and a check that cries wolf gets ignored, which is worse than no check.

import { readFileSync } from 'node:fs'

const [, , file, expectedRaw] = process.argv
if (!file) {
  console.error('usage: check-roundup-delivery.mjs <emails.json> [expected-count]')
  process.exit(2)
}

const expected = Number.parseInt(expectedRaw ?? '0', 10) || 0

/** Messages from THIS run: the real roundup subject, no test marker, recent. */
const WINDOW_MS = 30 * 60 * 1000
const FAILED = new Set(['bounced', 'complained', 'failed'])

let payload
try {
  payload = JSON.parse(readFileSync(file, 'utf8'))
} catch (err) {
  console.log(`::warning::Could not read Resend's response (${err.message}) — skipping the delivery check.`)
  process.exit(0)
}

const now = Date.now()
const recent = (payload.data || []).filter(e => {
  const subject = e.subject || ''
  if (!subject.includes('recommended for you') || subject.includes('[test')) return false
  const ts = Date.parse((e.created_at || '').replace(' ', 'T'))
  return Number.isFinite(ts) && now - ts <= WINDOW_MS
})

const delivered = []
const pending = []
const failed = []

for (const e of recent) {
  const status = String(e.last_event || e.status || 'unknown').toLowerCase()
  const to = (e.to && e.to[0]) || '(unknown recipient)'
  if (status === 'delivered') delivered.push(to)
  else if (FAILED.has(status)) failed.push([to, status])
  else pending.push([to, status])
}

console.log(
  `${expected} sent, ${delivered.length} delivered, ` +
  `${pending.length} not yet known, ${failed.length} failed`,
)
// Name them. A count tells you something is wrong; a name tells you who to ring.
for (const [to, status] of failed) console.log(`  FAILED   ${to}  (${status})`)
for (const [to, status] of pending) console.log(`  pending  ${to}  (${status} — not settled yet)`)

if (failed.length > 0) {
  console.log(
    `::error::${failed.length} message(s) did not reach the recipient: ` +
    failed.map(([to]) => to).join(', '),
  )
  process.exit(1)
}

if (expected > 0 && recent.length < expected) {
  console.log(
    `::warning::Found ${recent.length} of ${expected} messages in Resend's recent list — ` +
    `the remainder could not be checked.`,
  )
}

console.log(
  `::notice::Delivery check: ${delivered.length}/${expected} confirmed delivered` +
  (pending.length > 0 ? `, ${pending.length} still settling` : ''),
)
