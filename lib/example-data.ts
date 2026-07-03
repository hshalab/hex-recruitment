// ============================================================================
// DISPLAY-ONLY example/onboarding data.
//
// ⚠️  SAFETY CONTRACT — read before importing:
//   - This is fake, illustrative data used to teach empty screens.
//   - It is NEVER inserted into Supabase, NEVER merged into real query results,
//     and NEVER written by any API route, server action or DB writer.
//   - Import this module ONLY from client display/tour components
//     (components/onboarding/*). Do NOT import it from:
//       app/api/**, any 'use server' action, lib/confirmHive/DB writers,
//       or the public candidate job board (/jobs) / any candidate-facing query.
//   - Every id is prefixed "example-" and every record carries isExample:true so
//     it can never be mistaken for a real row if it somehow leaks.
// ============================================================================

import type { Job } from '@/lib/mockJobs'

export const EXAMPLE_ID_PREFIX = 'example-'

/** A full, type-safe example Job (matches the real Job type). Display only. */
export const exampleJob: Job & { isExample: true } = {
  isExample: true,
  id: 'example-job-1',
  company: 'Your Company',
  companyLogo: '',
  title: 'Bartender',
  jobReference: 'EX-001',
  salaryMin: 12,
  salaryMax: 14,
  salaryPeriod: 'hour',
  employmentType: ['Full-time', 'Permanent'],
  location: 'London',
  area: 'Central London',
  fullLocation: { addressLine1: '1 Example Street', city: 'London', postcode: 'EC1A 1AA' },
  shiftSchedule: 'Evenings & weekends',
  description: 'Serve drinks, create a great atmosphere and look after regulars at a busy central bar.',
  fullDescription: 'This is an example listing shown while you set up your account. Post your first job to replace it with the real thing.',
  responsibilities: ['Prepare and serve drinks', 'Keep the bar clean and stocked', 'Deliver friendly, fast service'],
  requirements: ['Some hospitality experience', 'Right to work in the UK', 'Available evenings'],
  benefits: ['Tips', 'Staff discount', 'Flexible shifts'],
  skillsRequired: ['Customer service', 'Cash handling', 'Cocktails'],
  experienceRequired: '1+ years',
  workAuthorization: ['UK'],
  workLocationType: 'In person',
  tags: ['Bar', 'Hospitality'],
  urgent: false,
  noExperience: false,
  postedAt: 'Just now',
  postedDate: '',
  category: 'Bar & Waiting',
  viewCount: 128,
  applicationCount: 5,
  status: 'active',
}

// ── Example pipeline (applicants across stages) ─────────────────────────────
export interface ExampleApplicant {
  isExample: true
  id: string
  name: string
  role: string
  /** Matches the real pipeline status keys. */
  stage: 'applied' | 'reviewing' | 'shortlisted' | 'interview' | 'offered'
  appliedAgo: string
  initials: string
}

export const exampleApplicants: ExampleApplicant[] = [
  { isExample: true, id: 'example-app-1', name: 'Jordan Blake', role: 'Bartender', stage: 'applied', appliedAgo: '2h ago', initials: 'JB' },
  { isExample: true, id: 'example-app-2', name: 'Sam Rivera', role: 'Bartender', stage: 'applied', appliedAgo: '5h ago', initials: 'SR' },
  { isExample: true, id: 'example-app-3', name: 'Priya Anand', role: 'Bartender', stage: 'reviewing', appliedAgo: '1d ago', initials: 'PA' },
  { isExample: true, id: 'example-app-4', name: 'Leo Marsh', role: 'Bartender', stage: 'shortlisted', appliedAgo: '2d ago', initials: 'LM' },
  { isExample: true, id: 'example-app-5', name: 'Erin Doyle', role: 'Bartender', stage: 'interview', appliedAgo: '3d ago', initials: 'ED' },
  { isExample: true, id: 'example-app-6', name: 'Nadia Khan', role: 'Bartender', stage: 'offered', appliedAgo: '4d ago', initials: 'NK' },
]

export const EXAMPLE_PIPELINE_STAGES: { key: ExampleApplicant['stage']; label: string }[] = [
  { key: 'applied', label: 'Applied' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview', label: 'Interview' },
  { key: 'offered', label: 'Offered' },
]

// ── Example interview ───────────────────────────────────────────────────────
export interface ExampleInterview {
  isExample: true
  id: string
  candidate: string
  role: string
  when: string
  type: string
}

export const exampleInterview: ExampleInterview = {
  isExample: true,
  id: 'example-interview-1',
  candidate: 'Erin Doyle',
  role: 'Bartender',
  when: 'Tomorrow, 2:00 PM',
  type: 'In-person · 30 min',
}

// ── Example offer ───────────────────────────────────────────────────────────
export interface ExampleOffer {
  isExample: true
  id: string
  candidate: string
  role: string
  salary: string
  start: string
  status: string
}

export const exampleOffer: ExampleOffer = {
  isExample: true,
  id: 'example-offer-1',
  candidate: 'Nadia Khan',
  role: 'Bartender',
  salary: '£13/hr',
  start: 'Mon 14 Jul',
  status: 'Awaiting signature',
}

// ── Example AI-generated interview questions ────────────────────────────────
// Illustrates the "read the CV + application, compare to the job description &
// expectations, then suggest tailored questions" feature. Display only.
export const exampleQuestions: string[] = [
  'Your CV shows two years at a high-volume cocktail bar — walk me through how you kept service fast during a Friday-night rush.',
  'The role needs strong cash and card reconciliation. Tell me about a time a till didn\'t balance and how you resolved it.',
  'This venue is known for its regulars. How do you build rapport so customers come back and ask for you?',
]

// ── Job-card photo guidance (candidates notice the image first) ─────────────
export const exampleImageTips: string[] = [
  'Use a bright, high-resolution photo — at least 1200px wide and landscape.',
  'Show your venue, your food or your team — something candidates will recognise.',
  'Avoid dark, blurry or heavily-filtered shots, and keep text off the image.',
  'No pro photo? A clean shot on a phone in good daylight works great.',
]
