import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'

import { emailLayout, ctaButton, BASE_URL } from '../emails/layout'
import { welcomeEmail } from '../emails/welcome'
import { candidateWelcomeEmail } from '../emails/candidate-welcome'
import { newApplicationEmail } from '../emails/new-application'
import { applicationSubmittedEmail } from '../emails/application-submitted'
import { applicationStatusEmail } from '../emails/application-status'
import { interviewScheduledEmail } from '../emails/interview-scheduled'
import { interviewConfirmedEmail } from '../emails/interview-confirmed'
import { interviewConfirmedEmployerEmail } from '../emails/interview-confirmed-employer'
import { interviewCancelledEmail } from '../emails/interview-cancelled'
import { interviewRescheduledEmail } from '../emails/interview-rescheduled'
import { interviewReminderEmail } from '../emails/interview-reminder'
import { newMessageEmail } from '../emails/new-message'
import { trialEndingEmail } from '../emails/trial-ending'
import { jobExpiredEmail } from '../emails/job-expired'
import { emailVerificationEmail } from '../emails/email-verification'
import { passwordResetEmail } from '../emails/password-reset'
import { activationDay1Email } from '../emails/activation-day1'
import { activationDay3Email } from '../emails/activation-day3'
import { activationDay7Email } from '../emails/activation-day7'
import { activationDay14Email } from '../emails/activation-day14'
import { activationDay30Email } from '../emails/activation-day30'
import { supabaseAuthTemplates } from '../emails/supabase-auth-templates'

// ---- Sample data (display only; no real recipients/links) ----
const CO = 'The Oak & Anchor'
const CAND = 'James Okoro'
const CONTACT = 'Sarah Mills'
const ROLE = 'Head Chef'
const DATE = 'Thursday 12 June 2026'
const TIME = '2:30 PM'
const SAMPLE_CONFIRM = `${BASE_URL}/auth/confirm?token_hash=sample-token-hash&type=signup`
const SAMPLE_RESET = `${BASE_URL}/auth/reset?token=sample-token`

type Entry = { name: string; subject: string; html: string }

// ---- Code-sent emails (real template functions) ----
const codeSent: Entry[] = [
  e('welcome', welcomeEmail(CONTACT, CO)),
  e('candidate-welcome', candidateWelcomeEmail(CAND)),
  e('new-application', newApplicationEmail(CAND, ROLE, CO)),
  e('application-submitted', applicationSubmittedEmail(CAND, ROLE, CO)),
  e('application-status--shortlisted', applicationStatusEmail('shortlisted', CO, ROLE, CAND)),
  e('application-status--rejected', applicationStatusEmail('rejected', CO, ROLE, CAND)),
  e('application-status--offer-accepted', applicationStatusEmail('offer_accepted', CO, ROLE, CAND)),
  e('interview-scheduled', interviewScheduledEmail(CO, ROLE, DATE, TIME)),
  e('interview-confirmed', interviewConfirmedEmail(CO, ROLE, CAND, DATE, TIME, 'Video call')),
  e('interview-confirmed-employer', interviewConfirmedEmployerEmail(CO, ROLE, CAND, DATE, TIME, 'Video call')),
  e('interview-cancelled', interviewCancelledEmail(CO, ROLE, CAND, DATE)),
  e('interview-rescheduled', interviewRescheduledEmail(CO, ROLE, CAND, 'Friday 13 June 2026', '11:00 AM', 'Video call', 'https://meet.example.com/thrive-abc')),
  e('interview-reminder', interviewReminderEmail(CONTACT, CAND, ROLE, CO, DATE, TIME, 24)),
  e('new-message', newMessageEmail(CONTACT, 'Hi James, are you free for a quick call this week to talk through the role and next steps?')),
  e('trial-ending', trialEndingEmail(CO, 3)),
  e('job-expired', jobExpiredEmail(CONTACT, ROLE, 'job-sample-123')),
  e('email-verification', emailVerificationEmail(SAMPLE_CONFIRM)),
  e('password-reset', passwordResetEmail(SAMPLE_RESET)),
  e('activation-day1', activationDay1Email(CO)),
  e('activation-day3', activationDay3Email(CO)),
  e('activation-day7', activationDay7Email(CO)),
  e('activation-day14', activationDay14Email(CO)),
  e('activation-day30', activationDay30Email(CO)),
]

// ---- Inline-sent emails (reconstructed bodies for preview only) ----
const APPROVE_SUB = "You're in — your Thrive account is approved"
const REVIEW_SUB = `[Thrive] Founding-cohort review: ${CO}`
const inlineSent: Entry[] = [
  {
    name: 'inline--founding-approved',
    subject: APPROVE_SUB,
    html: emailLayout(APPROVE_SUB, `
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">You're in, Sarah &#127881;</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">Your account for <strong style="color:#0f172a;">${CO}</strong> has been approved for the Thrive founding cohort. You now have the full hiring pipeline &mdash; post jobs, browse candidates, schedule interviews and make offers &mdash; <strong>free for 12 months</strong>.</p>
      ${ctaButton('Go to your dashboard', `${BASE_URL}/employer/dashboard`)}
      <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;">Questions, or something looks off? Just reply to this email &mdash; we'd love to help you get hiring.</p>
    `),
  },
  {
    name: 'inline--founding-review',
    subject: REVIEW_SUB,
    html: emailLayout(REVIEW_SUB, `
      <h1 style="margin:0 0 8px;font-size:21px;font-weight:700;color:#0f172a;">New founding-cohort signup to review</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">A new signup arrived from a free-mail address (<strong style="color:#0f172a;">personal_freemail</strong>). Decide whether to admit them to the founding cohort.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 4px;font-size:14px;">
        <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;">Company</td><td style="padding:7px 0;color:#0f172a;font-weight:600;">${CO}</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;">Contact</td><td style="padding:7px 0;color:#334155;">${CONTACT}</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;">Email</td><td style="padding:7px 0;color:#334155;">sarah.mills@gmail.com</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;">Classification</td><td style="padding:7px 0;color:#334155;">personal_freemail</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;vertical-align:top;">User ID</td><td style="padding:7px 0;color:#334155;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;">8f2c1a90-4d6e-4b1f-9c3a-7e0d2b5a6f11</td></tr>
      </table>
      ${ctaButton('Approve &amp; admit to cohort', '#approve-sample')}
      <p style="margin:0 0 24px;font-size:14px;"><a href="#reject-sample" style="display:inline-block;padding:11px 22px;border:1px solid #e2e8f0;border-radius:9px;color:#b91c1c;font-weight:600;text-decoration:none;">Reject this signup</a></p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">Approve consumes one of the founding spots. Reject locks the account out of founding entitlement. Both links are signed with HMAC, expire in 7&nbsp;days, and are single-use (enforced by approval_status).</p>
    `),
  },
  {
    name: 'inline--waitlist',
    subject: "You're on the Thrive waitlist",
    html: emailLayout("You're on the Thrive waitlist", `
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Hi Sarah, you're on the list &#9989;</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">Thanks for joining the Thrive waitlist. We're giving the first <strong style="color:#0f172a;">100</strong> employers on Thrive 12 months free &mdash; and we'll email you the moment we go live.</p>
      ${ctaButton('Explore Thrive', 'https://thrivecareer.co.uk')}
      <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;">Hospitality hiring, made simple. Talk soon.</p>
    `),
  },
  {
    name: 'inline--feedback',
    subject: 'New employer feedback — 5 stars',
    html: emailLayout('New employer feedback — 5 stars', `
      <h1 style="margin:0 0 16px;font-size:21px;font-weight:700;color:#0f172a;">Employer feedback received</h1>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;vertical-align:top;">Rating</td><td style="padding:7px 0;color:#334155;">★★★★★ (5/5)</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;vertical-align:top;">Page</td><td style="padding:7px 0;color:#334155;">/employer/dashboard</td></tr>
        <tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;vertical-align:top;">Notes</td><td style="padding:7px 0;color:#334155;">Really easy to post a job and shortlist candidates.</td></tr>
      </table>
    `),
  },
]

// ---- Supabase Auth templates (paste-ready; sample URL substituted for preview) ----
const authPreview: Entry[] = Object.entries(supabaseAuthTemplates).map(([name, html]) => ({
  name: `supabase-auth--${name}`,
  subject: `Supabase Auth: ${name}`,
  html: html.replace(/\{\{ \.ConfirmationURL \}\}/g, SAMPLE_CONFIRM),
}))

function e(name: string, r: { subject: string; html: string }): Entry {
  return { name, subject: r.subject, html: r.html }
}

const OUT = path.join(process.cwd(), '.email-previews')
const dirs = {
  html: path.join(OUT, 'html'),
  desktop: path.join(OUT, 'desktop'),
  mobile: path.join(OUT, 'mobile'),
  auth: path.join(OUT, 'supabase-auth'),
}

test.beforeAll(() => {
  Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }))
  // Write paste-ready Supabase Auth HTML (variables INTACT) to its own folder.
  for (const [name, html] of Object.entries(supabaseAuthTemplates)) {
    fs.writeFileSync(path.join(dirs.auth, `${name}.html`), html, 'utf8')
  }
})

const all = [...codeSent, ...inlineSent, ...authPreview]

for (const entry of all) {
  test(`render ${entry.name}`, async ({ page }) => {
    fs.writeFileSync(path.join(dirs.html, `${entry.name}.html`), entry.html, 'utf8')

    // Desktop
    await page.setViewportSize({ width: 720, height: 900 })
    await page.setContent(entry.html, { waitUntil: 'networkidle' })
    await page.screenshot({ path: path.join(dirs.desktop, `${entry.name}.png`), fullPage: true })

    // Mobile
    await page.setViewportSize({ width: 390, height: 844 })
    await page.setContent(entry.html, { waitUntil: 'networkidle' })
    await page.screenshot({ path: path.join(dirs.mobile, `${entry.name}.png`), fullPage: true })
  })
}
