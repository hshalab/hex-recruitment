import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Hex — Talent Recruitment'
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
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, color: '#FFE500', letterSpacing: '-0.02em' }}>
          HEX
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
          hexjobs.co.uk
        </div>
      </div>
    ),
    { ...size }
  )
}
