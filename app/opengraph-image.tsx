import { ImageResponse } from 'next/og'

// Edge runtime is the standard for ImageResponse — keeps the cold render
// fast and lets Vercel's edge cache the rendered PNG. The route file
// supersedes the prior static app/opengraph-image.png so the canonical
// /opengraph-image URL now renders Inter (the real brand font from
// next/font) instead of the previous PIL/Poppins render.
export const runtime = 'edge'
export const alt = 'Thrive — Hire faster. Apply smarter.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Brand tokens — sourced from public/logo/thrive-mark.svg so the OG image
// reads as the same mark, not the slightly-different UI yellow.
const NAVY = '#0A1628'
const YELLOW = '#FFD23F'
const TAGLINE = '#DCE2EA'

// Inter is loaded for the site via next/font/google. ImageResponse needs
// the raw font bytes, so we pull them from Google's CSS API at render
// time. The Vercel edge cache + Google CDN make this cheap and the
// resulting PNG is itself cached at the edge.
//
// The CSS API serves different formats depending on User-Agent. We
// deliberately send no UA so Google falls back to TTF — @vercel/og
// (which powers ImageResponse) supports TTF/OTF/WOFF but not WOFF2,
// and a modern browser UA triggers the unsupported WOFF2 response.
async function loadInter(weight: 400 | 700): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`,
  ).then((r) => r.text())
  const match = css.match(/url\((https:\/\/[^)]+)\)/)
  if (!match) throw new Error(`Inter ${weight} font URL not found in Google CSS response`)
  return fetch(match[1]).then((r) => r.arrayBuffer())
}

export default async function Image() {
  const [regular, bold] = await Promise.all([loadInter(400), loadInter(700)])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: NAVY,
          fontFamily: 'Inter',
        }}
      >
        {/* 200×200 yellow tile + chunky navy "T" built from two divs.
            Proportions per spec: bar 17% tile height (34px), stem 25%
            tile width (50px). Stem sits flush against the bar so the
            T reads as one continuous mark. */}
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: 40,
            background: YELLOW,
            position: 'relative',
            display: 'flex',
            marginBottom: 48,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 50,
              left: 30,
              width: 140,
              height: 34,
              background: NAVY,
              borderRadius: 4,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 84,
              left: 75,
              width: 50,
              height: 110,
              background: NAVY,
              borderRadius: 4,
            }}
          />
        </div>
        <div
          style={{
            fontSize: 110,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-0.03em',
            lineHeight: 1,
            marginBottom: 18,
          }}
        >
          Thrive
        </div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 400,
            color: TAGLINE,
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
          }}
        >
          Hire faster. Apply smarter.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' },
      ],
    },
  )
}
