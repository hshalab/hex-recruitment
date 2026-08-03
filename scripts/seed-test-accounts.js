#!/usr/bin/env node
//
// POPULATE THE TWO TEST ACCOUNTS, so the dashboards and the candidate profile
// can be reviewed with data in them rather than as day-one empty states.
//
//   node scripts/seed-test-accounts.js            # create
//   node scripts/seed-test-accounts.js --remove   # remove everything it made
//
// SAFETY, checked before this was written rather than assumed:
//   • No triggers exist on jobs, saved_jobs, candidate_profiles or job_views.
//   • job_applications has two status triggers. notify_application_status_change
//     only sets updated_at despite its name; cascade_application_status writes
//     to interviews, job_offers and pipeline_cascade_log — all local tables.
//   • The database has NO outbound capability at all: pg_net, http and
//     pgsql_http are not installed. Nothing inserted here can email anyone,
//     because the database cannot make an HTTP request. Email only ever leaves
//     from the Next.js app calling Resend.
//   • Jobs are created 'filled', NEVER 'active', so they never reach the public
//     board and never trigger the alert matcher. The board stays at 247.
//
// Everything created carries SEED_MARK in a column that is never shown to a
// candidate, so teardown can be exact rather than by guesswork.

const fs = require('fs')
const path = require('path')
const { createClient } = require(path.resolve(__dirname, '..', 'node_modules', '@supabase/supabase-js'))

const ROOT = path.resolve(__dirname, '..')
const E = {}
for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const EMPLOYER = 'dda822a2-7fc1-4d6d-b208-66e8c021630a'   // pauldavies.gbr+employer@gmail.com
const CANDIDATE = 'e8ad7a0b-6632-4a6f-b8e7-3d7fa6db0984' // pauldavies.gbr+candidate@gmail.com
const SEED_MARK = 'SEED:review-aug26'
const COMPANY = 'Thrive Test Employer'

// Real hospitality copy, real lengths. A reviewer judging spacing and hierarchy
// learns nothing from "Test Job 1" — the fourth title exists specifically to
// find out where the layout gives up.
const JOBS = [
  {
    title: 'Head Chef',
    location: 'Bath', area: 'Somerset', category: 'hospitality',
    salary_min: 42000, salary_max: 48000, salary_type: 'annual',
    employment_type: ['Full-time', 'Permanent'],
    description: 'Running a 70-cover kitchen in a Georgian townhouse hotel, with a brigade of six and a menu that changes with the season.',
    tags: ['Immediate start', 'Career progression', 'Training provided'],
  },
  {
    title: 'Chef de Partie',
    location: 'Bristol', area: 'Bristol', category: 'hospitality',
    salary_min: 15.5, salary_max: 17, salary_type: 'hourly',
    employment_type: ['Full-time', 'Permanent'],
    description: 'Larder and sauce sections across a busy service, four days on, three off. No late finishes on a Sunday.',
    tags: ['No experience required'],
  },
  {
    title: 'Restaurant General Manager',
    location: 'London', area: 'Greater London', category: 'hospitality',
    salary_min: 0, salary_max: 0, salary_type: 'annual',   // pay on application
    employment_type: ['Full-time', 'Permanent'],
    description: 'Taking full P&L ownership of a 120-cover neighbourhood restaurant with a strong local following.',
    tags: ['Career progression'],
  },
  {
    // Deliberately long — this is the wrapping test.
    title: 'Assistant Front of House Manager — Boutique Hotel, Evenings & Weekends',
    location: 'Reading', area: 'Berkshire', category: 'hospitality',
    salary_min: 29500, salary_max: 29500, salary_type: 'annual',   // single figure
    employment_type: ['Part-time', 'Fixed-term'],
    description: 'Running evening service front of house in a 24-room boutique hotel, covering weekends and the occasional event.',
    tags: ['Start date flexible', 'Training provided'],
  },
]

// ONE PER JOB IS THE CEILING, not a choice. job_applications carries a unique
// constraint on (job_id, candidate_id) — `unique_job_candidate` — so a single
// candidate cannot produce several applicants on one job. Stacking a job would
// need additional candidate identities, i.e. new auth users, which is more than
// "the two test accounts" and is flagged rather than done.
//
// So the uneven shape here is across jobs, not within one: three jobs with a
// single applicant each at different stages, and one with none.
const APPLICATION_PLAN = [
  { jobIndex: 0, status: 'shortlisted' },
  { jobIndex: 1, status: 'interviewing' },
  { jobIndex: 2, status: 'pending' },
]

async function count(table, col = 'id') {
  const { count: c } = await db.from(table).select(col, { count: 'exact', head: true })
  return c
}

async function baseline(label) {
  const active = (await db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'active')).count
  console.log(`${label}: board(active)=${active} jobs=${await count('jobs')} applications=${await count('job_applications')} saved=${await count('saved_jobs')} job_alerts=${await count('job_alerts')}`)
  return active
}

async function remove() {
  console.log('REMOVING seeded rows\n')
  await baseline('before')

  const { data: seeded } = await db.from('jobs').select('id').eq('employer_id', EMPLOYER).eq('job_reference', SEED_MARK)
  const ids = (seeded || []).map(j => j.id)
  console.log(`seeded jobs found: ${ids.length}`)

  if (ids.length) {
    // Dependents first, counted so "nothing cascaded" is a measurement.
    for (const t of ['job_applications', 'saved_jobs', 'job_views', 'job_impressions', 'interviews']) {
      const { count: c } = await db.from(t).select('id', { count: 'exact', head: true }).in('job_id', ids)
      if (c) {
        await db.from(t).delete().in('job_id', ids)
        console.log(`  ${t}: removed ${c}`)
      }
    }
    await db.from('jobs').delete().in('id', ids).eq('employer_id', EMPLOYER).eq('job_reference', SEED_MARK)
    console.log(`  jobs: removed ${ids.length}`)
  }

  // Saved jobs the seed added against REAL board rows — keyed by the candidate,
  // so a real candidate's saves can't be caught by this.
  const { count: sc } = await db.from('saved_jobs').select('id', { count: 'exact', head: true }).eq('candidate_id', CANDIDATE)
  if (sc) {
    await db.from('saved_jobs').delete().eq('candidate_id', CANDIDATE)
    console.log(`  saved_jobs (test candidate): removed ${sc}`)
  }

  // The profile is emptied back to the shape it had, not deleted — deleting it
  // would break the account rather than reset it.
  await db.from('candidate_profiles').update({
    job_title: null, location: null, city: null, county: null, headline: null,
    bio: null, personal_bio: null, skills: null, specialties: null,
    notable_venues: null, certifications: null, years_experience: 0,
    salary_min: null, salary_max: null, desired_salary: null,
    preferred_areas: null, preferred_job_types: [], work_location_preferences: [],
    work_history: null, education: null, availability: null, job_sector: null,
  }).eq('user_id', CANDIDATE)
  console.log('  candidate profile: cleared')

  console.log('')
  await baseline('after')
}

async function seed() {
  console.log('SEEDING test accounts\n')
  const before = await baseline('before')

  // PRECONDITION, not an assumption.
  const alerts = await count('job_alerts')
  if (alerts !== 0) {
    console.log(`\nSTOPPING: job_alerts has ${alerts} rows. A seeded job could reach a real candidate.`)
    process.exitCode = 1
    return
  }

  // ── 1. EMPLOYER JOBS ────────────────────────────────────────────────
  const rows = JOBS.map(j => ({
    employer_id: EMPLOYER,
    company: COMPANY,
    title: j.title,
    location: j.location,
    area: j.area,
    category: j.category,
    salary_min: j.salary_min,
    salary_max: j.salary_max,
    salary_type: j.salary_type,
    employment_type: j.employment_type,
    description: j.description,
    full_description: `<h3>What you’ll be doing</h3><p>${j.description}</p><h3>Experience or skills needed</h3><p>Solid experience in a comparable kitchen or floor role, and the confidence to run your section without being asked twice.</p><h3>What we offer</h3><p>A settled team, a rota published two weeks ahead, and food you would eat on your day off.</p>`,
    tags: j.tags,
    // NEVER 'active'. These list on /my-jobs and count on the dashboard but
    // never reach the public board, so there is no window at 248 and no
    // alert-match call.
    status: 'filled',
    job_reference: SEED_MARK,
    view_count: [124, 87, 213, 41][JOBS.indexOf(j)],
    application_count: 0,
  }))
  const { data: made, error: jobErr } = await db.from('jobs').insert(rows).select('id, title, status')
  if (jobErr) { console.error('jobs insert failed:', jobErr.message); process.exitCode = 1; return }
  console.log(`\njobs created: ${made.length}`)
  made.forEach(j => console.log(`  ${j.status.padEnd(7)} ${j.title}`))

  // ── 2. APPLICATIONS ─────────────────────────────────────────────────
  // Against the TEST EMPLOYER'S jobs only. Applying to a real employer's live
  // listing would put a fabricated applicant in Goldenkeys' or Host's own
  // dashboard — a real customer's data, which the standing rule forbids.
  const apps = APPLICATION_PLAN.map((a, i) => ({
    candidate_id: CANDIDATE,
    job_id: made[a.jobIndex].id,
    status: a.status,
    job_title: made[a.jobIndex].title,
    company: COMPANY,
    applied_at: new Date(Date.now() - (i + 1) * 36e5 * 19).toISOString(),
    cover_letter: 'Ten years across hotel and restaurant kitchens, most recently running a section in a two-rosette dining room. Happy to trial.',
  }))
  const { data: madeApps, error: appErr } = await db.from('job_applications').insert(apps).select('id, status')
  if (appErr) console.error('applications insert failed:', appErr.message)
  else {
    console.log(`\napplications created: ${madeApps.length}`)
    const byJob = {}
    APPLICATION_PLAN.forEach(a => { byJob[made[a.jobIndex].title] = (byJob[made[a.jobIndex].title] || 0) + 1 })
    Object.entries(byJob).forEach(([t, n]) => console.log(`  ${n} on "${t}"`))
    made.filter(j => !APPLICATION_PLAN.some(a => made[a.jobIndex].id === j.id))
      .forEach(j => console.log(`  0 on "${j.title}" — the uneven shape is the point`))
    for (const j of made) {
      const n = APPLICATION_PLAN.filter(a => made[a.jobIndex].id === j.id).length
      if (n) await db.from('jobs').update({ application_count: n }).eq('id', j.id)
    }
  }

  // ── 3. SAVED JOBS — REAL BOARD ROWS ─────────────────────────────────
  // Saved jobs are private to the candidate: no employer sees them, nothing is
  // written to the job. So these CAN point at genuine live listings, which is
  // what makes the candidate's saved page show real cards.
  const { data: realJobs } = await db.from('jobs')
    .select('id, title').eq('status', 'active').neq('employer_id', EMPLOYER)
    .order('posted_at', { ascending: false }).limit(3)
  if (realJobs?.length) {
    const { error: savedErr } = await db.from('saved_jobs')
      .insert(realJobs.map(j => ({ candidate_id: CANDIDATE, job_id: j.id })))
    if (savedErr) console.error('saved_jobs insert failed:', savedErr.message)
    else {
      console.log(`\nsaved jobs (REAL live listings, read-only to the employer): ${realJobs.length}`)
      realJobs.forEach(j => console.log(`  ${j.title}`))
    }
  }

  // ── 4. CANDIDATE PROFILE ────────────────────────────────────────────
  const { error: profErr } = await db.from('candidate_profiles').update({
    job_title: 'Senior Chef de Partie',
    headline: 'Section chef, ten years across hotels and neighbourhood restaurants',
    location: 'Bristol',
    city: 'Bristol',
    county: 'Bristol',
    job_sector: 'hospitality',
    years_experience: 10,
    bio: 'I have spent the last decade on sections in kitchens between fifty and a hundred and twenty covers, mostly hotel dining rooms and independent restaurants. I am happiest on sauce, I like a kitchen that publishes its rota, and I am looking for somewhere I can move up to junior sous within a year.',
    personal_bio: 'Outside work I bake, badly, and walk the Mendips.',
    skills: ['Sauce section', 'Larder', 'Butchery', 'Menu development', 'Allergen management', 'Stock control', 'Mentoring commis'],
    specialties: ['Modern British', 'Seasonal menus'],
    notable_venues: ['The Pony & Trap', 'Lucknam Park'],
    certifications: ['Level 3 Food Safety', 'Allergen Awareness'],
    salary_min: 32000,
    salary_max: 38000,
    salary_period: 'year',
    desired_salary: '35000',
    availability: '2 weeks notice',
    preferred_areas: ['county:bristol', 'county:somerset', 'region:south-west'],
    preferred_job_types: ['Full-time', 'Permanent'],
    work_location_preferences: ['In person'],
    // THE KEYS ARE THE PROFILE EDITOR'S, NOT MINE. The first version of this
    // seed wrote { title, startDate, endDate } — so the profile view, which
    // reads exp.role and exp.start_date, rendered "Role not specified" with no
    // dates, and a design review reported it as a product fault. It was my data.
    //
    // The CV Builder read it fine, because it accepts `w.role || w.title`. One
    // tolerant reader and one strict one is what let a bad shape look half-right.
    work_history: [
      { company: 'The Pony & Trap', role: 'Senior Chef de Partie', start_date: '2023-04', end_date: '', description: 'Sauce and larder across a 60-cover dining room, mentoring two commis.' },
      { company: 'Lucknam Park', role: 'Chef de Partie', start_date: '2020-09', end_date: '2023-03', description: 'Rotated all sections in a country house hotel kitchen.' },
      { company: 'The Ivy Clifton Brasserie', role: 'Commis Chef', start_date: '2018-06', end_date: '2020-08', description: 'Larder and pastry sections.' },
    ],
    // Same treatment. `year` was not a key anything reads; the editor writes
    // field_of_study / start_date / end_date / in_progress.
    education: [{
      institution: 'City of Bristol College',
      qualification: 'NVQ Level 3 Professional Cookery',
      field_of_study: 'Professional Cookery',
      start_date: '2016-09', end_date: '2018-06', in_progress: false, grade: 'Distinction',
    }],
    is_discoverable: true,
  }).eq('user_id', CANDIDATE)
  if (profErr) console.error('profile update failed:', profErr.message)
  else console.log('\ncandidate profile: filled (Senior Chef de Partie, Bristol, £32–38k)')

  console.log('')
  const after = await baseline('after')
  console.log(`\nBOARD UNCHANGED: ${before} -> ${after}  ${before === after ? 'OK' : 'MISMATCH — INVESTIGATE'}`)
}

;(process.argv.includes('--remove') ? remove() : seed())
  .catch(e => { console.error('FAILED:', e.message); process.exitCode = 1 })
