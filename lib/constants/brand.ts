/**
 * Single source of truth for the Thrive brand identity strings.
 *
 * Until this file existed, the full "Thrive — Hire talent / Find jobs"
 * tagline lived as a literal in four places (root metadata title,
 * openGraph title, twitter title, and two ChatBot responses), and the
 * tagline-without-name variant ("Hire talent / Find jobs") was a separate
 * literal in the homepage footer. The separator drifted twice already —
 * from "Talent Recruitment" to "Thrive | Talent Recruitment" (pipe) to
 * the current em-dash form — so a copy-only standardisation pass had to
 * touch every surface manually. Centralising prevents that.
 *
 * If the tagline ever changes again, every surface (footer, metadata,
 * chatbot, schema.org JSON-LD) rebuilds and renders the new value
 * automatically — no hunting through grep for stale literals.
 *
 * Split into three exports so each call site picks the right shape:
 *   - BRAND_NAME    — for schema.org `name` and PWA-style atoms
 *   - BRAND_TAGLINE — for the homepage footer where the logo + tagline
 *                     render side by side and the name is already shown
 *   - BRAND_FULL    — for metadata titles and chatbot intro where both
 *                     name and tagline appear in one inline string
 *
 * Em-dash (—, U+2014) is the canonical separator everywhere. Pipe (|) is
 * no longer used for brand identity.
 */
export const BRAND_NAME = 'Thrive'
export const BRAND_TAGLINE = 'Hire talent / Find jobs'
export const BRAND_FULL = `${BRAND_NAME} — ${BRAND_TAGLINE}`
