import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          borderRadius: 36,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#FFE500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3" />
          <path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4" />
          <path d="M5 21h14" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
