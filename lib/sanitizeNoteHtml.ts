// Isomorphic (no-DOM) allowlist sanitiser for interview prep-note HTML.
//
// WHY a bespoke sanitiser: the project's dompurify is browser-only and there's
// no server DOM (jsdom) in the stack, but prep notes must be sanitised on SAVE
// on the server — a malicious employer must not be able to persist markup that
// could execute. This runs in both the API route (authoritative, on save) and
// the client (on render, before the value is handed to the editor).
//
// DEFENCE-IN-DEPTH: the only thing that ever renders a note is the Tiptap
// editor, whose schema re-parses the HTML and materialises ONLY the nodes/marks
// it knows (paragraph, heading 2-3, bold/italic/underline/strike, bullet/ordered
// lists, link) — it never uses dangerouslySetInnerHTML. This allowlist matches
// that editor output, so anything outside it is dropped before it is stored.

// Tags the editor can produce. Anything else is unwrapped (tag removed, inner
// text kept).
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'span',
])

// Elements whose CONTENT is also unsafe — stripped whole (open→close).
const DANGEROUS_BLOCKS = 'script|style|iframe|object|embed|noscript|template|svg|math|form|head|title'
// Void/self-closing unsafe tags with no matching close.
const DANGEROUS_VOID = 'script|style|iframe|object|embed|link|meta|base'

// The only style declaration we keep (Tiptap text-align on p/h/span).
const SAFE_STYLE_RE = /^\s*text-align\s*:\s*(left|right|center|justify)\s*;?\s*$/i

// Generous ceiling on stored HTML length (≈10k chars of markup).
export const NOTE_MAX_HTML = 10_000

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sanitizeAttrs(tag: string, attrs: string): string {
  const out: string[] = []
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let m: RegExpExecArray | null
  while ((m = attrRe.exec(attrs))) {
    const name = m[1].toLowerCase()
    const value = (m[2] ?? m[3] ?? m[4] ?? '').trim()
    if (name.startsWith('on')) continue // event handlers — never
    if (tag === 'a' && name === 'href') {
      // Only safe schemes; this kills javascript:/data:/vbscript: URLs.
      if (/^(https?:|mailto:)/i.test(value)) out.push(`href="${escapeAttr(value)}"`)
      continue
    }
    if (name === 'style' && SAFE_STYLE_RE.test(value)) {
      out.push(`style="${escapeAttr(value)}"`)
      continue
    }
    // Everything else (src, class, id, srcset, data-*, style:other) is dropped.
  }
  // Links always get safe rel/target regardless of what came in.
  if (tag === 'a') out.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
  return out.length ? ' ' + out.join(' ') : ''
}

/**
 * Sanitise prep-note HTML to a strict allowlist. Returns '' for empty/whitespace
 * input. Safe to run on the server (save) and the client (render).
 */
export function sanitizeNoteHtml(input: string | null | undefined): string {
  if (!input) return ''
  let html = String(input)

  // 1. Remove dangerous elements together with their content.
  html = html.replace(new RegExp(`<(${DANGEROUS_BLOCKS})\\b[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '')
  // 2. Remove any leftover dangerous void/unclosed tags.
  html = html.replace(new RegExp(`<\\/?(${DANGEROUS_VOID})\\b[^>]*>`, 'gi'), '')
  // 3. HTML comments (can hide conditional-comment vectors).
  html = html.replace(/<!--[\s\S]*?-->/g, '')

  // 4. Walk every remaining tag: drop non-allowlisted tags (keep inner text),
  //    scrub attributes on allowlisted ones.
  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\/?>/g, (_m, slash: string, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase()
    if (!ALLOWED_TAGS.has(name)) return '' // unwrap: remove tag, keep text content
    if (slash) return `</${name}>`
    if (name === 'br') return '<br>'
    return `<${name}${sanitizeAttrs(name, attrs)}>`
  })

  return html.trim()
}

/** True if the (sanitised) HTML is within the storage ceiling. */
export function isNoteWithinLimit(html: string): boolean {
  return (html?.length ?? 0) <= NOTE_MAX_HTML
}
