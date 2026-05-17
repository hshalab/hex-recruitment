// Client-side email FORMAT validator. Catches genuinely malformed input
// (no @, no domain, no TLD, whitespace) without trying to verify that the
// domain actually exists or that the mailbox is real — that's the
// confirmation-email step's job. Intentionally rejects strings that the
// browser's native <input type="email"> still accepts (e.g. "abc@def"
// has no TLD but is valid per HTML5).
//
// Accepts: a@b.cc, foo@bar.com, foo.bar@baz.co.uk, well-formed-but-wrong
// addresses like "bmail.com" instead of gmail (typo — confirmation step
// catches those).
//
// Rejects: no @, missing local part, missing domain, missing TLD,
// numeric-only TLD, single-char TLD, whitespace anywhere.

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim())
}
