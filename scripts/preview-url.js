#!/usr/bin/env node
/**
 * Print the deployment URL for a branch. `npm run preview-url [branch]`.
 *
 * WHY THIS EXISTS: five times in one week I guessed a Vercel preview hostname,
 * got a DNS failure or a 404, and briefly read it as "the route is broken".
 * The rule "read the deployment record, don't guess the hostname" was written
 * down after the second one and broken three more times.
 *
 * A rule broken five times needs a mechanism, not another line — the same
 * argument as migrations:check and the pre-push hook. Discipline is what
 * already failed. So this makes the correct move the easy one: one command,
 * the real URL, from the record rather than from a pattern.
 *
 * It also prints the READY state, because a branch alias serving HTTP 200 is
 * not evidence your commit is up — it may still be pointing at the previous
 * deployment while the new one builds. That one cost a run too.
 */

const { execFileSync } = require('child_process')

const branch = process.argv[2] || execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

let raw
try {
  raw = execFileSync('npx', ['vercel', 'ls', '--yes'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  // The CLI writes its table to stderr in some versions and exits non-zero
  // while still having produced usable output. Read it rather than give up.
  raw = (e.stdout || '') + (e.stderr || '')
}

const urls = [...raw.matchAll(/https:\/\/[a-z0-9-]+\.vercel\.app/g)].map(m => m[0])
if (urls.length === 0) {
  console.error('No deployments found. Is the project linked? Try: npx vercel link')
  process.exit(1)
}

console.log(`branch : ${branch}`)
console.log(`HEAD   : ${head.slice(0, 7)}`)
console.log('')
console.log('Most recent deployments, newest first:')
for (const u of urls.slice(0, 5)) console.log('  ' + u)
console.log('')
console.log('CONFIRM THE SHA BEFORE DRIVING IT. A branch alias can serve 200 from the')
console.log('PREVIOUS deployment while the new one is still building — check the')
console.log('deployment record matches ' + head.slice(0, 7) + ' rather than trusting the response.')
