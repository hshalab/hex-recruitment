import Link from 'next/link'

// Confirmation for the one-click opt-out. Pure render — the write happens in
// /api/candidate/stay-hidden, which redirects here, so refreshing this page
// can't re-run anything.

export const metadata = { title: 'Your profile stays hidden — Thrive' }

type Status = 'ok' | 'already' | 'invalid' | 'notfound' | 'error'

const MESSAGES: Record<Status, { heading: string; body: string }> = {
  ok: {
    heading: "Done — you'll stay hidden",
    body: 'Your profile will not be shown to employers. Nothing else changes, and you can turn visibility on whenever you want with the "Hide my profile" switch on your dashboard.',
  },
  already: {
    heading: "You're already hidden",
    body: 'We had already recorded this, so there was nothing to change. Your profile is not shown to employers.',
  },
  invalid: {
    // SAY WHAT HAPPENED OR SAY NOTHING — NEVER INVENT A REASON.
    //
    // This used to read "That link has expired / Opt-out links stop working
    // after a few weeks." It was shown for a link with TWELVE DAYS still to
    // run, and the real cause was a signature that could not be verified. The
    // wrong explanation sent two people looking at expiry rather than at the
    // signature, and cost most of a day.
    //
    // `invalid` is returned for several distinct reasons and this page cannot
    // tell them apart. So it no longer tries. What it says instead is true in
    // every one of those cases, including the ones not yet found — and it still
    // gets the person to the thing that always works.
    heading: "That link didn't work",
    body: 'Sorry — we couldn’t action that one. You can do it yourself in a couple of taps: sign in and use the "Hide my profile" switch at the top of your dashboard.',
  },
  notfound: {
    heading: "We couldn't find that profile",
    body: 'The link may belong to an account that has since been removed. If you think this is wrong, reply to the email we sent you and we\'ll sort it out.',
  },
  error: {
    heading: 'Something went wrong at our end',
    body: 'Your profile has not been changed. Please try the link again in a few minutes, or use the "Hide my profile" switch on your dashboard.',
  },
}

export default async function StayHiddenPage({
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
          href="/dashboard"
          style={{ display: 'inline-block', padding: '12px 26px', background: '#FFE500', color: '#0f172a', fontWeight: 700, fontSize: 15, borderRadius: 9, textDecoration: 'none' }}
        >
          Go to your dashboard
        </Link>
      </div>
    </main>
  )
}
