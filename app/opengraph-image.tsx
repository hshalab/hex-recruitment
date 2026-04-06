import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Thrive — Talent Recruitment'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#0f172a',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FFE500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3" />
            <path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4" />
            <path d="M5 21h14" />
          </svg>
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, color: '#FFE500', letterSpacing: '-0.02em' }}>
            THRIVE
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 400, color: 'white', marginTop: 8 }}>
          Talent Recruitment
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.7)', marginTop: 32, textAlign: 'center', maxWidth: 800 }}>
          Hire great people. No agency fees. Free for 100 employers.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 40,
            background: '#FFE500',
            color: '#0f172a',
            fontSize: 20,
            fontWeight: 700,
            padding: '10px 28px',
            borderRadius: 999,
          }}
        >
          thrivecareers.co.uk
        </div>
      </div>
    ),
    { ...size }
  )
}
