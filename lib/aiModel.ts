// Single source of truth for the AI model used by interview-question generation.
// Swap to the cheaper model in ONE line if cost ever needs it:
//   export const INTERVIEW_QUESTION_MODEL = 'claude-haiku-4-5-20251001'
// (Both ids are already used in production by app/api/ai-assist/route.ts.)
export const INTERVIEW_QUESTION_MODEL = 'claude-sonnet-4-6'

// Feature key for the per-day usage counter (ai_generation_usage.feature).
export const INTERVIEW_QUESTION_FEATURE = 'interview_questions'

// Daily cap of SUCCESSFUL generations per employer.
export const INTERVIEW_QUESTION_DAILY_LIMIT = 10

export type GeneratedQuestion = {
  type: 'verification' | 'role-fit' | 'culture'
  question: string
  why: string
}

const TYPE_HEADINGS: Record<GeneratedQuestion['type'], string> = {
  verification: 'Verification & probing',
  'role-fit': 'Role fit',
  culture: 'Culture & values',
}

const TYPE_ORDER: GeneratedQuestion['type'][] = ['verification', 'role-fit', 'culture']

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Validate + coerce the model's JSON into a clean GeneratedQuestion[].
 * Drops malformed entries rather than throwing, so one bad item can't sink
 * the whole batch. Returns [] if nothing usable.
 */
export function parseGeneratedQuestions(raw: unknown): GeneratedQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: GeneratedQuestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const t = (item as any).type
    const q = (item as any).question
    const w = (item as any).why
    const type: GeneratedQuestion['type'] =
      t === 'verification' || t === 'role-fit' || t === 'culture' ? t : 'role-fit'
    if (typeof q !== 'string' || !q.trim()) continue
    out.push({
      type,
      question: q.trim().slice(0, 600),
      why: typeof w === 'string' ? w.trim().slice(0, 400) : '',
    })
  }
  return out
}

/**
 * Robustly extract a GeneratedQuestion[] from the model's RAW text. Sonnet
 * mostly returns a clean JSON array, but for some inputs it varies: wrapping the
 * array in an object ({"questions":[...]}), surrounding it with prose/markdown
 * fences, leaving trailing commas, or — observed in prod for some candidates —
 * DROPPING the opening "[" so the body is a comma-separated list of objects that
 * still ends in "]". Tries, in order: direct parse (bare array or
 * {questions:[...]}), a bracketed [..] slice within prose, and finally wrapping
 * the first-"{"…last-"}" body in [..] (recovers the dropped-bracket case).
 * Returns [] only if nothing usable survives.
 */
export function parseQuestionsFromModelText(text: string): GeneratedQuestion[] {
  if (!text) return []
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  // Tolerate trailing commas before a closing ] or }.
  const noTrailingCommas = (s: string) => s.replace(/,(\s*[\]}])/g, '$1')
  const tryParse = (s: string): GeneratedQuestion[] => {
    try {
      const v = JSON.parse(noTrailingCommas(s))
      if (Array.isArray(v)) return parseGeneratedQuestions(v)
      if (v && typeof v === 'object' && Array.isArray((v as { questions?: unknown }).questions)) {
        return parseGeneratedQuestions((v as { questions: unknown }).questions)
      }
    } catch { /* fall through */ }
    return []
  }

  // 1. Direct.
  let out = tryParse(cleaned)
  if (out.length) return out
  // 2. A bracketed [...] slice (array surrounded by prose).
  const arr = cleaned.match(/\[[\s\S]*\]/)
  if (arr) { out = tryParse(arr[0]); if (out.length) return out }
  // 3. Comma-separated objects with a missing/unmatched outer bracket: take the
  //    first "{"…last "}" body and wrap it in [ ].
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last > first) {
    out = tryParse('[' + cleaned.slice(first, last + 1) + ']')
    if (out.length) return out
  }
  return []
}

/**
 * Format questions as allowlist-safe notes HTML to APPEND below an employer's
 * existing prep notes. Grouped by type, each question numbered with its italic
 * "why". All model text is HTML-escaped; the result still passes through
 * sanitizeNoteHtml on the server before storage (defence-in-depth).
 */
export function formatQuestionsToHtml(questions: GeneratedQuestion[]): string {
  if (!questions.length) return ''
  const parts: string[] = ['<h3>AI-suggested questions</h3>']
  for (const type of TYPE_ORDER) {
    const group = questions.filter(q => q.type === type)
    if (!group.length) continue
    parts.push(`<p><strong>${escapeHtml(TYPE_HEADINGS[type])}</strong></p>`)
    parts.push('<ol>')
    for (const q of group) {
      const why = q.why ? `<br><em>Why: ${escapeHtml(q.why)}</em>` : ''
      parts.push(`<li>${escapeHtml(q.question)}${why}</li>`)
    }
    parts.push('</ol>')
  }
  return parts.join('')
}
