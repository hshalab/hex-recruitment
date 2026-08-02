import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'

const BANNER_BUCKET = 'job-banners'

const MIN_WIDTH = 400
const MIN_HEIGHT = 300
// Target a fixed 16:11 landscape — the candidate job-card slot. Every stored
// banner is centre/attention-cropped to this once, at upload, so the card shows
// the uploaded image in full (no surprise per-slot crop) and the post-job
// preview reflects the true result. 1200px wide keeps it crisp on desktop/retina.
const TARGET_WIDTH = 1200
const TARGET_HEIGHT = 825
// Company logos: square, contained on white, matching what the old client-side
// canvas produced so nothing changes visually when the storage moves.
const LOGO_SIZE = 200
const WEBP_QUALITY = 80
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    // Rate limit: max 20 requests per minute per IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(`upload-image:${ip}`, 20, 60000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const formData = await request.formData()
    const file = formData.get('image') as File | null
    // Optional target bucket (allowlisted). Defaults to job banners so the
    // existing post-job flow is unchanged; the Temp Work composer passes 'temp-posts'.
    const bucketParam = (formData.get('bucket') as string) || ''
    const targetBucket = bucketParam === 'temp-posts' ? 'temp-posts'
      : bucketParam === 'company-logos' ? 'company-logos'
      : BANNER_BUCKET

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      )
    }

    const isTempPost = targetBucket === 'temp-posts'
    const isLogo = targetBucket === 'company-logos'
    // Temp Work accepts any common photo (incl. phone HEIC); banners stay strict.
    const allowedTypes = isTempPost
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
      : ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const metadata = await sharp(buffer).metadata()

    if (!metadata.width || !metadata.height) {
      return NextResponse.json(
        { error: 'Could not read image dimensions.' },
        { status: 400 }
      )
    }

    // EXIF orientation is applied by .rotate() below, but sharp reports metadata
    // in the file's OWN axes — so a portrait phone photo tagged orientation 6
    // reports as landscape. Every size decision after this point must use the
    // dimensions the image will actually have, or the crop box is computed for
    // the wrong shape and a portrait photo comes out cropped to its middle.
    const rotated = (metadata.orientation ?? 1) >= 5
    const srcW = rotated ? metadata.height : metadata.width
    const srcH = rotated ? metadata.width : metadata.height

    // Banners must meet a minimum so the fixed job-card slot stays crisp. Temp
    // Work posts have no size requirement — the person posting a Saturday shift
    // is on a phone and should not meet a dimensions error. Nor do logos: a small
    // square logo is a perfectly good logo.
    if (!isTempPost && !isLogo && (srcW < MIN_WIDTH || srcH < MIN_HEIGHT)) {
      return NextResponse.json(
        {
          error: `Image is too small (${srcW}x${srcH}px). Minimum size is ${MIN_WIDTH}x${MIN_HEIGHT}px — smaller images will look blurry.`
        },
        { status: 400 }
      )
    }

    // ONE GEOMETRY FOR BOTH, as of the shared card.
    //
    // A temp post's image used to keep its own aspect ratio, because it rendered
    // as a photo inside a white text card and any shape looked fine. It is now
    // the BACKGROUND of the same 16:11 card a job gets, so it is cropped exactly
    // as a job banner is. An uncropped portrait phone photo behind that card
    // would have shown its middle third and nothing else.
    //
    // What stays different for temp posts is the INPUT, not the output: HEIC and
    // small images are still accepted, because the person posting a Saturday
    // shift is doing it on a phone and should not meet a dimensions error.
    //
    // Computing the box from the source — rather than relying on fit:'cover' +
    // withoutEnlargement, which skips the crop when the source is smaller than
    // the target — guarantees the stored image is exactly 16:11, so the card
    // shows it uncropped and the composer's preview is an exact match.
    let processedBuffer: Buffer
    if (isLogo) {
      // A LOGO IS NOT A BANNER. Cropping one to 16:11 would cut the top and
      // bottom off a square mark. Contain it in a 200x200 square on white —
      // deliberately the same geometry the old canvas code produced, so existing
      // logos are unchanged in appearance and only their storage moves.
      processedBuffer = await sharp(buffer)
        .rotate()
        .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
    } else {
      const fitW = Math.min(TARGET_WIDTH, srcW, Math.floor((srcH * TARGET_WIDTH) / TARGET_HEIGHT))
      const outW = Math.max(1, fitW)
      const outH = Math.max(1, Math.round((outW * TARGET_HEIGHT) / TARGET_WIDTH))
      processedBuffer = await sharp(buffer)
        .rotate() // honour EXIF orientation from phone photos
        .resize(outW, outH, { fit: 'cover', position: 'attention' })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
    }

    // Store the processed banner as a file in the public 'job-banners' bucket and
    // return its public URL. Falls back to an inline base64 data URL if Storage
    // is unavailable, so uploads keep working either way. (Existing banners were
    // migrated from base64 to this bucket by scripts/migrate-banners-to-storage.js.)
    let url: string | null = null
    try {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      )
      const path = `${randomUUID()}.webp`
      const { error: upErr } = await admin.storage
        .from(targetBucket)
        .upload(path, processedBuffer, { contentType: 'image/webp', upsert: false })
      if (upErr) throw upErr
      url = admin.storage.from(targetBucket).getPublicUrl(path).data.publicUrl
    } catch (e: any) {
      console.error('[upload-image] Storage upload failed, falling back to base64:', e?.message)
    }

    const dataUrl = `data:image/webp;base64,${processedBuffer.toString('base64')}`

    return NextResponse.json({
      success: true,
      url: url || dataUrl, // prefer the Storage URL; base64 only if Storage failed
      dataUrl, // kept for back-compat
      storedToBucket: Boolean(url),
      originalSize: file.size,
      processedSize: processedBuffer.length,
      originalDimensions: { width: srcW, height: srcH },
    })
  } catch (error) {
    console.error('Image processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process image. Please try a different file.' },
      { status: 500 }
    )
  }
}
