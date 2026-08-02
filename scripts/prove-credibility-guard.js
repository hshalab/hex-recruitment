#!/usr/bin/env node
//
// PROVE THE CREDIBILITY GUARD FIRES.
//
// Same standard as making migrations:check fail on purpose: a guard nobody has
// watched reject something isn't a guard. Every case below feeds a REAL
// exported function the row this whole change exists for — £32,000 typed as an
// annual salary with the period left on hourly — and asserts the code treats it
// as "no salary stated" rather than as £66,560,000 a year.
//
// It asserts the other direction just as hard. A guard that quietly swallows
// genuine rows is worse than none, so every case has a counterpart proving a
// real hourly rate, a real annual salary and a genuinely over-cap job all still
// behave exactly as they did.
//
// No database, no network, no writes. Compiles the four lib files to a scratch
// directory and requires them, because the repo has no TypeScript runner.
//
//   npm run guard:prove

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, '.guardproof')
const SOURCES = ['lib/jobAlerts.ts', 'lib/recommendations.ts', 'lib/rolesRoundup.ts', 'lib/salaryInput.ts']

function compile() {
  fs.rmSync(OUT, { recursive: true, force: true })
  // The local binary directly, not npx. Node 20+ refuses to spawnSync a .cmd
  // shim without shell:true (EINVAL), and turning the shell on to run a path
  // that may contain spaces is the worse trade.
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
  execFileSync(
    process.execPath,
    [tsc, ...SOURCES, '--outDir', OUT, '--module', 'commonjs', '--target', 'es2020',
     '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node'],
    { cwd: ROOT, stdio: 'inherit' },
  )
}

const gbp = n => '£' + Math.round(n).toLocaleString('en-GB')
let pass = 0
const failures = []

function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  console.log(`        ${detail}`)
  if (ok) pass++
  else failures.push(label)
}

function main() {
  compile()
  const { jobMatchesAlert } = require(path.join(OUT, 'jobAlerts.js'))
  const { scoreAndRankJobs } = require(path.join(OUT, 'recommendations.js'))
  const { annualPayOf } = require(path.join(OUT, 'rolesRoundup.js'))
  const { annualisedOrNull, isCredibleAnnualAsk } = require(path.join(OUT, 'salaryInput.js'))

  const OLD = 32000 * 2080

  const baseJob = {
    id: 'proof-bad-period', title: 'Head Chef', company: 'Proof', location: 'Reading',
    area: null, category: 'hospitality', employmentType: ['Full-time'],
    salaryMin: 32000, salaryMax: 32000, salaryPeriod: 'hour',
    tags: [], postedAt: new Date(0).toISOString(), description: '', noExperience: false,
  }

  console.log('THE ROW: £32,000 with the period left on hourly.')
  console.log(`Old arithmetic made that ${gbp(OLD)} a year, silently.\n`)

  console.log('0. THE GUARD ITSELF — lib/salaryInput.ts')
  check('isCredibleAnnualAsk(32000, hour) is false',
    isCredibleAnnualAsk(32000, 'hour') === false,
    '£32,000/hr sits outside the £5–£200/hr bounds')
  check('annualisedOrNull(32000, hour) is null',
    annualisedOrNull(32000, 'hour') === null,
    `null, not ${gbp(OLD)} — the absence is representable, so callers must decide`)
  check('a real hourly rate is untouched',
    annualisedOrNull(18.16, 'hour') === 18.16 * 2080,
    `£18.16/hr — the live Senior Pizza Chef — still annualises to ${gbp(18.16 * 2080)}`)
  check("the 'hourly' spelling takes the hourly bounds",
    annualisedOrNull(18.16, 'hourly') === 18.16 * 2080,
    'jobs.salary_type says "hourly"; the annual £5,000 floor would have rejected every real rate')
  check('the same figure marked annual is fine',
    annualisedOrNull(32000, 'year') === 32000,
    '£32,000 a year is a perfectly ordinary salary — only the period was wrong')
  check('0/0 reads as unstated',
    annualisedOrNull(0, 'year') === null,
    'the live Goldenkeys row: no salary given, not "£0"')

  console.log('\n1. lib/jobAlerts.ts — alert matching')
  const capped = { id: 'a1', sectors: [], locations: [], job_types: [], tags: [],
    min_salary: null, max_salary: 40000, keywords: null }
  check('an over-cap alert no longer excludes it',
    jobMatchesAlert(baseJob, capped) === true,
    `the alert caps at £40,000; the old sum saw ${gbp(OLD)} and dropped the job entirely`)
  check('an under-floor alert no longer admits it on a false high',
    jobMatchesAlert(baseJob, { ...capped, min_salary: 25000, max_salary: null }) === true,
    'unstated pay is not tested against the floor either — judged on everything else')
  check('a genuine hourly job still filters correctly',
    jobMatchesAlert({ ...baseJob, salaryMin: 18, salaryMax: 22 }, capped) === true,
    `£22/hr -> ${gbp(22 * 2080)}, under the cap`)
  check('a genuinely over-cap job is STILL excluded',
    jobMatchesAlert({ ...baseJob, salaryMin: 80000, salaryMax: 90000, salaryPeriod: 'year' }, capped) === false,
    '£90,000 a year really is over £40,000 — the guard did not blunt the filter')

  console.log('\n2. lib/recommendations.ts — the recommendation score')
  const cand = { id: 'c1', salaryMin: 30000, salaryMax: 35000, salaryPeriod: 'year',
    preferredAreas: [], skills: [], jobTitle: '', employmentType: [], category: 'hospitality' }
  const rank = job => scoreAndRankJobs([job], cand, new Set(), [])[0]
  const bad = rank(baseJob)
  const good = rank({ ...baseJob, salaryPeriod: 'year' })
  // matchReasons, NOT reasons. Reading the wrong field made the first
  // assertion pass vacuously — (undefined || []).find() is undefined, which
  // read as "no salary reason attached", which was the answer it was looking
  // for. A green tick from an instrument that never touched the product.
  const salaryReason = r => {
    if (!r || !Array.isArray(r.matchReasons)) throw new Error('matchReasons missing — check the harness, not the guard')
    return r.matchReasons.find(x => /salary/i.test(x)) || null
  }
  // "No salary reason attached" is TRUE BOTH WAYS — guarded it earns the
  // neutral 8 with no reason, unguarded it earns 0 with no reason. So assert
  // the points instead, by comparison: the unreadable row must score STRICTLY
  // HIGHER than a job that genuinely misses the candidate's range. Sabotaging
  // the guard collapses the two to equal, which is what makes this a test.
  const genuineMiss = rank({ ...baseJob, salaryMin: 80000, salaryMax: 90000, salaryPeriod: 'year' })
  check('the £66m row is unranked on pay, not ranked against it',
    salaryReason(bad) === null && bad.matchPercentage > genuineMiss.matchPercentage,
    `${bad.matchPercentage}% vs ${genuineMiss.matchPercentage}% for a real £90,000 mismatch — ` +
    'the unreadable row keeps the neutral 8, it is not penalised for a number we cannot read')
  check('the same figure marked annual DOES match',
    /Salary matches/i.test(salaryReason(good) || ''),
    "£32,000/yr overlaps £30,000–£35,000 -> 'Salary matches your range'")

  console.log('\n3. lib/rolesRoundup.ts — the candidate roundup EMAIL')
  const oldRoundup = 32000 * 45 * 52 * 0.85
  check('annualPayOf rejects it',
    annualPayOf({ salary_max: 32000, salary_min: 32000, salary_type: 'hourly' }) === null,
    `the old sum was ${gbp(oldRoundup)} — it would have topped every chef's roundup`)
  check('a real agency rate still prices',
    annualPayOf({ salary_max: 18.16, salary_min: 18.16, salary_type: 'hourly' }) === 18.16 * 45 * 52 * 0.85,
    `£18.16/hr -> ${gbp(18.16 * 45 * 52 * 0.85)} after the agency haircut`)
  check('the live 0/0 row prices as unstated',
    annualPayOf({ salary_max: 0, salary_min: 0, salary_type: 'annual' }) === null,
    'unchanged — already caught by the <= 0 test')

  fs.rmSync(OUT, { recursive: true, force: true })

  console.log(`\n${pass} passed, ${failures.length} failed`)
  if (failures.length) {
    for (const f of failures) console.log(`  FAILED: ${f}`)
    process.exitCode = 1
  }
}

try {
  main()
} catch (err) {
  console.error('prove-credibility-guard: ' + (err && err.message ? err.message : err))
  process.exitCode = 1
}
