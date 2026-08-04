#!/usr/bin/env node
//
// EVERY CHECK, AND THE ANSWER COMES FROM EXIT CODES.
//
//   npm run verify
//
// WHY THIS EXISTS. A commit went out broken because the check that was supposed
// to catch it printed success over the top of the failure:
//
//   npx tsc --noEmit 2>&1 | head -5 && echo "tsc ok"
//
// `head` exits 0 whatever tsc did, so the `&&` fired and printed a label I had
// written directly underneath two real TypeScript errors. I read the label.
//
// That is the root of a whole family of the same mistake — the buffered pipe,
// the rel-keyed icon lookup, the closed accordion, the CSS-uppercased selector,
// the stdin parser, the guessed hostname. In each one the instrument reported,
// not the thing. Seven in a week.
//
// We already decided once that discipline is what fails: that is why
// migrations:check exists rather than a rule saying "remember to capture
// migrations". The same argument applies here, and it had now failed twice.
//
// THE RULES THIS FILE KEEPS:
//   • nothing is printed that is not derived from an exit status
//   • no pipes around the checks — output is captured whole, never truncated
//   • every check runs even if an earlier one fails, so one run gives the full
//     picture rather than the first problem
//   • the process exits non-zero if ANY check failed

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const CHECKS = [
  { name: 'tsc', cmd: process.execPath, args: [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'] },
  { name: 'build', cmd: npm, args: ['run', 'build'] },
  { name: 'migrations', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'check-migrations.js')] },
  { name: 'guard:prove', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'prove-credibility-guard.js')] },
]

const results = []

for (const check of CHECKS) {
  process.stdout.write(`running ${check.name} ... `)
  // No shell, no pipe. The output is captured in full so a failure can be shown
  // whole rather than head-ed into silence.
  const r = spawnSync(check.cmd, check.args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32' && check.cmd === npm,
    maxBuffer: 64 * 1024 * 1024,
  })

  // A check that could not be STARTED is a failure, not a pass. spawnSync
  // reports that as a null status, which is falsy in all the wrong ways.
  const status = r.error ? null : r.status
  const passed = status === 0
  results.push({ name: check.name, status, passed, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error })
  console.log(passed ? 'exit 0' : `exit ${status === null ? '(failed to start)' : status}`)
}

const failed = results.filter(r => !r.passed)

if (failed.length) {
  for (const f of failed) {
    console.log(`\n${'='.repeat(64)}\n${f.name} FAILED — exit ${f.status === null ? '(failed to start)' : f.status}\n${'='.repeat(64)}`)
    if (f.error) console.log(String(f.error.message))
    // The last 60 lines: enough to see the error, not the whole build log.
    const lines = f.out.split(/\r?\n/).filter(Boolean)
    console.log(lines.slice(-60).join('\n'))
  }
}

console.log(`\n${'-'.repeat(64)}`)
for (const r of results) console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`)
console.log(`${'-'.repeat(64)}`)
console.log(failed.length
  ? `${failed.length} of ${results.length} FAILED: ${failed.map(f => f.name).join(', ')}`
  : `all ${results.length} passed`)

process.exit(failed.length ? 1 : 0)
