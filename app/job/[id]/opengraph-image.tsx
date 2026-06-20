import { ImageResponse } from 'next/og'
import { getJobForMeta, formatSalaryShort } from '@/lib/jobMeta'

// Per-job link-preview image (1200x630).
//   - job has a banner photo (public Storage URL) -> serve the REAL photo as the
//     preview image. (The OG renderer can't rasterise WebP, and our banners are
//     WebP, so we proxy the actual bytes rather than compositing a card. The role
//     title / company / salary still show via og:title + og:description.)
//   - no usable photo -> a branded navy card carrying the role text (safety net).
//
// Edge runtime is the supported path for @vercel/og — it bundles the font inline
// and avoids the node-runtime font-path resolution (which breaks on Windows
// paths containing spaces).
export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Hospitality role on Thrive'

interface Props {
  params: { id: string }
}

export default async function OgImage({ params }: Props) {
  const job = await getJobForMeta(params.id)
  const banner = job?.bannerUrl || null

  // Photo job: serve the real banner image bytes as the preview.
  //
  // Hardened against SSRF + content-type passthrough: only ever fetch from our
  // own public job-banners Storage prefix (so the URL can't be pointed at an
  // internal/arbitrary host), don't follow redirects, and always serve the bytes
  // as image/webp with nosniff (we only ever store WebP there) — never the
  // upstream content type.
  const allowedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/storage/v1/object/public/job-banners/`
  if (banner && allowedPrefix.startsWith('http') && banner.startsWith(allowedPrefix)) {
    try {
      const res = await fetch(banner, { redirect: 'error' })
      if (res.ok) {
        const buf = await res.arrayBuffer()
        return new Response(buf, {
          headers: {
            'Content-Type': 'image/webp',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          },
        })
      }
    } catch {
      // fall through to the branded card if the photo can't be fetched
    }
  }

  // No usable photo (or fetch failed) -> branded navy card with the role text.
  const title = job?.title || 'Hospitality role'
  const company = job?.company || 'Thrive'
  const salary = job ? formatSalaryShort(job) : null
  const metaLine = [job?.location, salary].filter(Boolean).join('   ·   ')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          backgroundColor: '#0a1628',
          backgroundImage: 'linear-gradient(135deg, #0a1628 0%, #12294a 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: '#ffe500', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a1628', fontSize: 30, fontWeight: 800 }}>T</div>
          <div style={{ marginLeft: 18, fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>Thrive</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 30, fontWeight: 600, color: '#ffe500', marginBottom: 18 }}>{company}</div>
          <div style={{ display: 'flex', fontSize: title.length > 48 ? 60 : 74, fontWeight: 800, lineHeight: 1.05, maxWidth: 1000 }}>{title}</div>
          {metaLine ? <div style={{ fontSize: 34, color: 'rgba(255,255,255,0.82)', marginTop: 26 }}>{metaLine}</div> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: 'rgba(255,255,255,0.75)' }}>
          View the role and apply on Thrive
        </div>
      </div>
    ),
    size,
  )
}
