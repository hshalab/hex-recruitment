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

// Known disposable / throwaway inbox providers, blocked at sign-up to cut junk
// and test-bot accounts (e.g. the fake "John Smith" signups). This list holds
// ONLY burner domains — never real providers (gmail, outlook, company domains) —
// so genuine users, and your own gmail "+alias" test accounts, are unaffected.
// Not exhaustive; add new offenders as they turn up.
export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  // observed on junk signups
  'gicont.com', 'lasttea.com',
  // common burner-mail providers
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'grr.la',
  'sharklasers.com', '10minutemail.com', '10minutemail.net', 'temp-mail.org',
  'tempmail.com', 'tempmailo.com', 'tempmail.dev', 'tempinbox.com',
  'yopmail.com', 'yopmail.net', 'trashmail.com', 'trashmail.de', 'getnada.com',
  'nada.email', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com',
  'fakeinbox.com', 'mailnesia.com', 'mohmal.com', 'moakt.com', 'moakt.cc',
  'emailondeck.com', 'mintemail.com', 'spam4.me', 'mytemp.email',
  'burnermail.io', 'inboxbear.com', 'tempr.email', 'discard.email',
  'mailcatch.com', 'harakirimail.com', 'guerrillamailblock.com', 'spambog.com',
  'fakemailgenerator.com', 'emltmp.com', 'wegwerfmail.de', 'mailexpire.com',
  'anonaddy.me', 'rmqkr.net', 'linshiyou.com', 'cs.email',
])

// Domain-only disposable check. Format is validated separately by isValidEmail.
export function isDisposableEmail(value: string): boolean {
  const email = value.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at === -1) return false
  return DISPOSABLE_EMAIL_DOMAINS.has(email.slice(at + 1))
}
