import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>404</h1>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.75rem' }}>Page not found</h2>
      <p style={{ fontSize: '0.95rem', color: '#6b7280', marginBottom: '1.5rem', maxWidth: '400px' }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        style={{ background: '#0f172a', color: '#FFE500', borderRadius: '8px', padding: '0.625rem 1.5rem', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none' }}
      >
        Back to home
      </Link>
    </div>
  )
}
