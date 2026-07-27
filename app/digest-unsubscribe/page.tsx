import Link from 'next/link'

// Confirmation for the one-click digest unsubscribe. Pure render — the write
// happens in /api/candidate/digest-unsubscribe, which redirects here, so
// refreshing this page can't re-run anything.

export const metadata = { title: 'Job digest emails — Thrive' }

type Status = 'ok' | 'already' | 'invalid' | 'notfound' | 'error'

const MESSAGES: Record<Status, { heading: string; body: string }> = {
  ok: {
    heading: "Done — no more job digests",
    body: "We won't email you about new jobs in your areas again. Everything else is unchanged: your profile, your applications and messages about them all carry on as normal. You can turn the digest back on any time in your notification settings.",
  },
  already: {
    heading: "You're already unsubscribed",
    body: 'We had already turned the job digest off for you, so there was nothing to change. You can turn it back on any time in your notification settings.',
  },
  invalid: {
    heading: "That link doesn't look right",
    body: 'It may have been broken in transit by your email client. You can turn the job digest off directly: sign in and use the notification settings page.',
  },
  notfound: {
    heading: "We couldn't find that account",
    body: "The link may belong to an account that has since been removed. If you're still getting emails you don't want, reply to one and we'll sort it out.",
  },
  error: {
    heading: 'Something went wrong at our end',
    body: "Your settings haven't been changed, so the digest may still arrive. Please try the link again in a few minutes, or turn it off in your notification settings.",
  },
}

export default async function DigestUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const key: Status = (['ok', 'already', 'invalid', 'notfound', 'error'] as const).includes(status as Status)
    ? (status as Status)
    : 'invalid'
  const { heading, body } = MESSAGES[key]
  const good = key === 'ok' || key === 'already'

  return (
    <main style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ maxWidth: 520, width: '100%', background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: 32, textAlign: 'center' }}>
        <div
          aria-hidden
          style={{
            width: 44, height: 44, margin: '0 auto 18px', borderRadius: '50%',
            background: good ? '#ecfdf5' : '#fef3c7',
            color: good ? '#059669' : '#b45309',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700,
          }}
        >
          {good ? '✓' : '!'}
        </div>
        <h1 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{heading}</h1>
        <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.6, color: '#475569' }}>{body}</p>
        <Link
          href="/settings/notifications"
          style={{ display: 'inline-block', padding: '12px 26px', background: '#FFE500', color: '#0f172a', fontWeight: 700, fontSize: 15, borderRadius: 9, textDecoration: 'none' }}
        >
          Notification settings
        </Link>
      </div>
    </main>
  )
}
