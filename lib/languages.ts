// Canonical list of common world languages (ISO 639-1 names).
// Ordered by global speaker count / commonality in UK hiring contexts.
// Not exhaustive — free-text entries are still accepted by the autocomplete
// component for niche languages we haven't listed.

export const COMMON_LANGUAGES: readonly string[] = [
  'English',
  'Mandarin Chinese',
  'Spanish',
  'Hindi',
  'Arabic',
  'Bengali',
  'Portuguese',
  'Russian',
  'Japanese',
  'Punjabi',
  'German',
  'French',
  'Italian',
  'Turkish',
  'Korean',
  'Vietnamese',
  'Tamil',
  'Urdu',
  'Persian',
  'Polish',
  'Ukrainian',
  'Romanian',
  'Dutch',
  'Greek',
  'Czech',
  'Swedish',
  'Hungarian',
  'Portuguese (Brazilian)',
  'Cantonese',
  'Thai',
  'Indonesian',
  'Malay',
  'Filipino',
  'Tagalog',
  'Swahili',
  'Yoruba',
  'Igbo',
  'Zulu',
  'Afrikaans',
  'Amharic',
  'Somali',
  'Hausa',
  'Hebrew',
  'Norwegian',
  'Danish',
  'Finnish',
  'Icelandic',
  'Bulgarian',
  'Serbian',
  'Croatian',
  'Slovenian',
  'Slovak',
  'Albanian',
  'Lithuanian',
  'Latvian',
  'Estonian',
  'Catalan',
  'Basque',
  'Galician',
  'Welsh',
  'Irish',
  'Scottish Gaelic',
  'Maltese',
  'Macedonian',
  'Belarusian',
  'Georgian',
  'Armenian',
  'Azerbaijani',
  'Kazakh',
  'Uzbek',
  'Pashto',
  'Dari',
  'Sinhala',
  'Nepali',
  'Burmese',
  'Khmer',
  'Lao',
  'Mongolian',
  'Gujarati',
  'Marathi',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Odia',
  'Assamese',
  'Sindhi',
  'Kurdish',
  'British Sign Language',
  'American Sign Language',
] as const

// Build a lookup keyed by lowercase name so we can snap free-text input
// back to the canonical capitalisation when it matches.
const CANONICAL_BY_LOWER = new Map<string, string>(
  COMMON_LANGUAGES.map((name) => [name.toLowerCase(), name]),
)

export function canonicaliseLanguage(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const match = CANONICAL_BY_LOWER.get(trimmed.toLowerCase())
  return match ?? trimmed
}

// Return up to `limit` languages that match the user's typed query.
// Empty query returns an empty list (the autocomplete is closed when empty).
// Prefix matches rank above substring matches.
export function searchLanguages(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const prefixMatches: string[] = []
  const substringMatches: string[] = []

  for (const lang of COMMON_LANGUAGES) {
    const lower = lang.toLowerCase()
    if (lower.startsWith(q)) {
      prefixMatches.push(lang)
    } else if (lower.includes(q)) {
      substringMatches.push(lang)
    }
    if (prefixMatches.length + substringMatches.length >= limit + 5) break
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit)
}
