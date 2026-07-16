// Pure, framework-agnostic builder for the aggregator jobs XML feed.
// Dependency-free and side-effect-light so the route stays a thin wrapper.
//
// Format: canonical Indeed-style <source><job>…</job></source> with CDATA
// fields — accepted by Adzuna, Jooble, Jora and Talent.com. Indeed is
// deliberately NOT a target here: free single-source XML feeds ended on
// 31 Mar 2026, so Indeed is a separate paid/ATS decision, not this channel.

export interface FeedJobRow {
  id: string
  title?: string | null
  description?: string | null
  full_description?: string | null
  responsibilities?: string[] | string | null
  requirements?: string[] | string | null
  benefits?: string[] | string | null
  company?: string | null
  location?: string | null
  area?: string | null
  full_location?: { city?: string; postcode?: string; addressLine1?: string } | null
  salary_min?: number | string | null
  salary_max?: number | string | null
  salary_type?: string | null
  employment_type?: string[] | string | null
  category?: string | null
  posted_at?: string | null
  expires_at?: string | null
  job_reference?: string | null
  source_url?: string | null
}

// Mirrors the job-expiry cron: an active job auto-expires 60 days after posting,
// so that's our validThrough default when a role has no explicit expiry.
const EXPIRY_DAYS = 60

function cdata(v: unknown): string {
  // Only ]]> needs escaping inside CDATA; split it so the section stays closed.
  return `<![CDATA[${String(v ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

function escapeText(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Minimal markdown → HTML for descriptions: bold, bullet lists, paragraphs.
// If the copy already looks like HTML, leave it as-is (the job page renders
// <>-containing descriptions as HTML too).
export function markdownToHtml(input?: string | null): string {
  const text = (input ?? '').trim()
  if (!text) return ''
  if (/<[a-z][\s\S]*>/i.test(text)) return text

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let list: string[] = []
  const flushList = () => {
    if (list.length) { out.push('<ul>' + list.map(li => `<li>${li}</li>`).join('') + '</ul>'); list = [] }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushList(); continue }
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) { list.push(inline(bullet[1])); continue }
    flushList()
    const heading = line.match(/^\*\*(.+)\*\*$/)
    if (heading) { out.push(`<p><strong>${esc(heading[1])}</strong></p>`); continue }
    out.push(`<p>${inline(line)}</p>`)
  }
  flushList()
  return out.join('')
}

// Render a labelled bullet section (Responsibilities / Requirements / Benefits)
// for the feed description. The importer stores each of these as an array whose
// elements are ';'-joined runs of items, so flatten + split on ';'/newlines into
// clean <li> bullets. Empty → '' so the section is omitted entirely.
export function listSection(title: string, value?: string[] | string | null): string {
  const arr = Array.isArray(value) ? value : value ? [value] : []
  const items = arr
    .flatMap(el => String(el ?? '').split(/\s*;\s*|\r?\n/))
    .map(s => s.trim())
    .filter(Boolean)
  if (!items.length) return ''
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<p><strong>${esc(title)}</strong></p><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
}

// £-formatted range/single, or null when there's no usable salary (omit the tag).
export function formatSalary(min: unknown, max: unknown, type?: string | null): string | null {
  const lo = Number(min); const hi = Number(max)
  const hasLo = Number.isFinite(lo) && lo > 0
  const hasHi = Number.isFinite(hi) && hi > 0
  if (!hasLo && !hasHi) return null
  const annual = type === 'annual'
  const unit = annual ? 'year' : 'hour'
  const fmt = (n: number) => (annual ? `£${n.toLocaleString('en-GB')}` : `£${n}`)
  const a = hasLo ? lo : hi
  const b = hasHi ? hi : lo
  return a === b ? `${fmt(a)} / ${unit}` : `${fmt(a)} - ${fmt(b)} / ${unit}`
}

const JOBTYPE_PRIORITY: [RegExp, string][] = [
  [/full[-\s]?time/i, 'fulltime'],
  [/part[-\s]?time/i, 'parttime'],
  [/contract/i, 'contract'],
  [/temp/i, 'temporary'],
  [/intern/i, 'internship'],
  [/apprentice/i, 'apprenticeship'],
  [/permanent/i, 'fulltime'],
]

// employment_type is a multi-value array (e.g. ["Full-time","Permanent"]); the
// feed wants one token, so pick the most specific by priority. null → omit tag.
export function mapJobType(value?: string[] | string | null): string | null {
  const arr = Array.isArray(value) ? value : value ? [value] : []
  const hay = arr.join(' ')
  for (const [re, token] of JOBTYPE_PRIORITY) if (re.test(hay)) return token
  return null
}

function toRfc1123(d?: string | null): string {
  const dt = d ? new Date(d) : new Date()
  return (isNaN(dt.getTime()) ? new Date() : dt).toUTCString()
}

function expirationDate(expires?: string | null, posted?: string | null): string {
  if (expires) { const e = new Date(expires); if (!isNaN(e.getTime())) return e.toISOString().slice(0, 10) }
  const base = posted ? new Date(posted) : new Date()
  const b = isNaN(base.getTime()) ? new Date() : base
  return new Date(b.getTime() + EXPIRY_DAYS * 86400000).toISOString().slice(0, 10)
}

export function jobToXml(job: FeedJobRow, siteUrl: string): string {
  const city = job.full_location?.city || job.location || ''
  const state = job.area || ''
  const postcode = job.full_location?.postcode || ''
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_type)
  const jobtype = mapJobType(job.employment_type)
  const ref = job.job_reference || job.source_url || job.id
  // Full <description> mirrors the job page: the main copy plus the
  // Responsibilities / Requirements / Benefits sections. Jooble (and others)
  // reject feeds whose descriptions are thinner than the on-site pages.
  const desc = [
    markdownToHtml(job.full_description || job.description),
    listSection('Responsibilities', job.responsibilities),
    listSection('Requirements', job.requirements),
    listSection('Benefits', job.benefits),
  ].filter(Boolean).join('')

  const parts: string[] = []
  parts.push(`<title>${cdata(job.title)}</title>`)
  parts.push(`<date>${escapeText(toRfc1123(job.posted_at))}</date>`)
  parts.push(`<referencenumber>${cdata(ref)}</referencenumber>`)
  parts.push(`<url>${cdata(`${siteUrl}/job/${job.id}`)}</url>`)
  parts.push(`<company>${cdata(job.company)}</company>`)
  if (city) parts.push(`<city>${cdata(city)}</city>`)
  if (state) parts.push(`<state>${cdata(state)}</state>`)
  parts.push(`<country>GB</country>`)
  if (postcode) parts.push(`<postalcode>${cdata(postcode)}</postalcode>`)
  parts.push(`<description>${cdata(desc)}</description>`)
  if (salary) parts.push(`<salary>${cdata(salary)}</salary>`)
  if (jobtype) parts.push(`<jobtype>${jobtype}</jobtype>`)
  if (job.category) parts.push(`<category>${cdata(job.category)}</category>`)
  parts.push(`<expirationdate>${expirationDate(job.expires_at, job.posted_at)}</expirationdate>`)

  return `<job>\n    ${parts.join('\n    ')}\n  </job>`
}

export function buildJobsFeedXml(rows: FeedJobRow[], siteUrl: string): string {
  const jobs = (rows || []).map(j => jobToXml(j, siteUrl)).join('\n  ')
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<source>\n` +
    `  <publisher>Thrive</publisher>\n` +
    `  <publisherurl>${escapeText(siteUrl)}</publisherurl>\n` +
    `  <lastbuilddate>${escapeText(toRfc1123(null))}</lastbuilddate>\n` +
    (jobs ? `  ${jobs}\n` : '') +
    `</source>\n`
  )
}
