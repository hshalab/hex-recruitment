import { emailLayout, ctaButton, BASE_URL } from './layout'
import { formatSalary, type DigestJobRow } from '@/lib/jobDigest'

// "New jobs in your areas" — the candidate re-engagement digest.
//
// Every field rendered here comes from the job row. Nothing is inferred,
// estimated or filled in with a friendly guess: a role with no salary shows no
// salary line rather than "competitive", and a role with no company shows the
// title alone. The whole point of the email is that the listings are real.

export interface JobDigestParams {
  candidateName: string | null
  /** Human-readable areas the candidate picked, e.g. ['Surrey', 'Greater London']. */
  areaNames: string[]
  jobs: DigestJobRow[]
  /** Matches beyond the ones listed. */
  overflow: number
  unsubscribeUrl: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** "Surrey", "Surrey and Kent", "Surrey, Kent and Essex" */
function listAreas(names: string[]): string {
  const clean = names.filter(Boolean)
  if (clean.length === 0) return 'your areas'
  if (clean.length === 1) return clean[0]
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

function jobRow(job: DigestJobRow): string {
  const url = `${BASE_URL}/jobs?id=${job.id}`
  const title = esc(job.title?.trim() || 'Untitled role')
  const company = job.company?.trim() ? esc(job.company.trim()) : null
  const location = job.location?.trim() ? esc(job.location.trim()) : null
  const salary = formatSalary(job)

  // Meta line: only the parts we actually have.
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

export function jobDigestEmail(params: JobDigestParams): { subject: string; html: string } {
  const { candidateName, areaNames, jobs, overflow, unsubscribeUrl } = params
  const count = jobs.length
  const areas = listAreas(areaNames)
  const firstName = (candidateName || '').trim().split(/\s+/)[0] || 'there'

  // "Recommended for you" rather than "new jobs in your areas": it stays true
  // whatever the state of the board, where the old wording claimed both novelty
  // and locality and could over-claim on either.
  const subject =
    count === 1
      ? `A role recommended for you`
      : `${count}${overflow > 0 ? '+' : ''} roles recommended for you`

  const body = `
    <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">
      ${count === 1 ? 'A role' : `${count} roles`} recommended for you
    </h1>
    <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#475569;">
      Hi ${esc(firstName)} — ${count === 1 ? 'this is' : 'these are'} on the market in
      ${esc(areas)}, the ${areaNames.length === 1 ? 'area' : 'areas'} you chose.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;">
      ${jobs.map(jobRow).join('')}
    </table>

    ${
      overflow > 0
        ? `<p style="margin:16px 0 0;font-size:14px;color:#475569;">
             …and ${overflow} more matching ${overflow === 1 ? 'role' : 'roles'}.
           </p>`
        : ''
    }

    ${ctaButton('Browse all jobs', `${BASE_URL}/jobs`)}

    <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
      You're getting this because you picked ${esc(areas)} as your preferred
      ${areaNames.length === 1 ? 'area' : 'areas'}.
      <a href="${BASE_URL}/settings/notifications" style="color:#64748b;text-decoration:underline;">Change your areas or how often we write</a>,
      or <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">stop these emails</a> — one click, no login needed.
    </p>
  `

  return { subject, html: emailLayout(subject, body) }
}
