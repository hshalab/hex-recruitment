import { ImageResponse } from 'next/og'
import { getJobForMeta, formatSalaryShort } from '@/lib/jobMeta'

// Dynamic per-job link-preview image. Banners are stored base64-in-row (not a
// hosted URL), so they can't be used directly as og:image; instead we render a
// branded card carrying the role title + company + location + salary. This
// works for every job (photo or not) and reads as a candidate invite.

// Edge runtime is the supported path for @vercel/og — it bundles the font
// inline and avoids the node-runtime font-path resolution (which breaks on
// Windows paths containing spaces).
export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Hospitality role on Thrive'

interface Props {
  params: { id: string }
}

export default async function OgImage({ params }: Props) {
  const job = await getJobForMeta(params.id)
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
          // satori (the OG renderer) only supports simple gradients — keep it to
          // a single linear gradient.
          backgroundImage: 'linear-gradient(135deg, #0a1628 0%, #12294a 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              backgroundColor: '#ffe500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0a1628',
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            T
          </div>
          <div style={{ marginLeft: 18, fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>Thrive</div>
        </div>

        {/* Role */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 30, fontWeight: 600, color: '#ffe500', marginBottom: 18 }}>
            {company}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 48 ? 60 : 74,
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          {metaLine ? (
            <div style={{ fontSize: 34, color: 'rgba(255,255,255,0.82)', marginTop: 26 }}>{metaLine}</div>
          ) : null}
        </div>

        {/* Footer CTA */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: 'rgba(255,255,255,0.75)' }}>
          View the role and apply on Thrive
        </div>
      </div>
    ),
    size,
  )
}
