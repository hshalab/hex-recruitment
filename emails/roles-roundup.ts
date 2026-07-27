import { emailLayout, ctaButton, BASE_URL } from './layout'
import { formatSalary } from '@/lib/jobDigest'
import { ROLES_PER_EMAIL, type MatchMode } from '@/lib/rolesRoundup'
import type { DigestJobRow } from '@/lib/jobDigest'

// "Roles for you this week" — the recurring re-engagement roundup.
//
// Framing differs from the new-jobs digest on purpose. This email does not
// claim these roles are new; it says they are ON THE MARKET and matched to
// this candidate. Everything rendered comes from the job row — a role with no
// salary shows no salary line rather than "competitive".

export interface RolesRoundupParams {
  candidateName: string | null
  mode: MatchMode
  /** Areas the candidate picked — area mode only. */
  areaNames: string[]
  /** What the candidate says they do — profile mode subject/intro. */
  roleLabel: string | null
  jobs: DigestJobRow[]
  totalMatches: number
  unsubscribeUrl: string
  browseUrl: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Collapse the whitespace people leave in free-text fields. Never rewords. */
function tidy(s: string | null | undefined): string {
  return (s || '').replace(/\s+/g, ' ').trim()
}

/**
 * Job titles are free text and arrive scruffy — "Head.chef ",
 * "exec chef/head chef", "Sous Chef, pizza chef". Their own words are fine
 * inside the email, where there's room to quote them, but a subject line has
 * to read like a sentence. So: use the label in the subject only when it
 * already reads as a job title, otherwise fall back to the generic phrasing.
 * We tidy spacing but never invent a title the candidate didn't type.
 */
function subjectSafeRole(label: string | null): string | null {
  const t = tidy(label)
  if (!t) return null
  if (t.length > 30) return null
  if (t.split(' ').length > 4) return null
  if (!/^[A-Za-z][A-Za-z \-]*$/.test(t)) return null
  return t
}

function listAreas(names: string[]): string {
  const clean = names.filter(Boolean)
  if (clean.length === 0) return 'your areas'
  if (clean.length === 1) return clean[0]
  if (clean.length > 3) return `${clean.slice(0, 3).join(', ')} and ${clean.length - 3} more`
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

function jobRow(job: DigestJobRow): string {
  const url = `${BASE_URL}/jobs?id=${job.id}`
  const title = esc(job.title?.trim() || 'Untitled role')
  const company = job.company?.trim() ? esc(job.company.trim()) : null
  const location = job.location?.trim() ? esc(job.location.trim()) : null
  const salary = formatSalary(job)
  const meta = [company, location].filter(Boolean).join(' · ')

  return `<tr>
    <td style="padding:16px 0;border-bottom:1px solid #eef0f3;">
      <a href="${url}" style="display:block;font-size:16px;font-weight:700;color:#0f172a;text-decoration:none;line-height:1.35;">${title}</a>
      ${meta ? `<div style="margin-top:4px;font-size:14px;color:#475569;">${meta}</div>` : ''}
      ${salary ? `<div style="margin-top:4px;font-size:14px;color:#0f172a;font-weight:600;">${esc(salary)}</div>` : ''}
      <a href="${url}" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:#2563eb;text-decoration:none;">View and apply →</a>
    </td>
  </tr>`
}

export function rolesRoundupEmail(params: RolesRoundupParams): { subject: string; html: string } {
  const { candidateName, mode, areaNames, roleLabel, jobs, totalMatches, unsubscribeUrl, browseUrl } = params
  const count = jobs.length
  const firstName = (candidateName || '').trim().split(/\s+/)[0] || 'there'
  const areas = listAreas(areaNames)
  const role = tidy(roleLabel)
  const subjectRole = subjectSafeRole(roleLabel)

  const subject =
    mode === 'area'
      ? `${count} ${count === 1 ? 'role' : 'roles'} in ${areas} for you`
      : `${count} ${subjectRole ? `${subjectRole} ` : ''}${count === 1 ? 'role' : 'roles'} that match your profile`

  const heading =
    mode === 'area'
      ? `${count === 1 ? 'A role' : `${count} roles`} in ${esc(areas)}`
      : `${count === 1 ? 'A role' : `${count} roles`} that match your profile`

  const intro =
    mode === 'area'
      ? `these are on the market right now in the ${areaNames.length === 1 ? 'area' : 'areas'} you chose.`
      : `these are on the market right now${role ? `, matched to "${esc(role)}"` : ', matched to your profile'}.`

  const why =
    mode === 'area'
      ? `You're getting this because you picked ${esc(areas)} as your preferred ${areaNames.length === 1 ? 'area' : 'areas'}.`
      : `You're getting this because of what you told us you do${role ? ` — "${esc(role)}"` : ''}. Adding your preferred areas would make these more local.`

  const body = `
    <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">
      ${heading}
    </h1>
    <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#475569;">
      Hi ${esc(firstName)} — ${intro}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;">
      ${jobs.map(jobRow).join('')}
    </table>

    ${
      totalMatches > count
        ? `<p style="margin:16px 0 0;font-size:14px;color:#475569;">
             <a href="${browseUrl}" style="color:#2563eb;font-weight:600;text-decoration:none;">See all ${totalMatches} roles →</a>
           </p>`
        : ''
    }

    ${ctaButton('Browse all jobs', browseUrl)}

    <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
      ${why}
      <a href="${BASE_URL}/settings/notifications" style="color:#64748b;text-decoration:underline;">Change what we send</a>,
      or <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">stop these emails</a> — one click, no login needed.
    </p>
  `

  return { subject, html: emailLayout(subject, body) }
}

export { ROLES_PER_EMAIL }
