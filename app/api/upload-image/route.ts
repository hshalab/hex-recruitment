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
    const targetBucket = bucketParam === 'temp-posts' ? 'temp-posts' : BANNER_BUCKET

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      )
    }

    const isTempPost = targetBucket === 'temp-posts'
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

    // Banners must meet a minimum so the fixed job-card slot stays crisp. Temp
    // Work posts have no size requirement — any photo works, the card uses
    // object-fit: cover — so we skip the check there.
    if (!isTempPost && (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT)) {
      return NextResponse.json(
        {
          error: `Image is too small (${metadata.width}x${metadata.height}px). Minimum size is ${MIN_WIDTH}x${MIN_HEIGHT}px — smaller images will look blurry.`
        },
        { status: 400 }
      )
    }

    let processedBuffer: Buffer
    if (isTempPost) {
      // Preserve the photo's own aspect ratio: cap the long edge, never enlarge,
      // re-encode to WebP. The feed/manage cards frame it with object-fit: cover,
      // so any shape looks fine and the poster never has to crop.
      processedBuffer = await sharp(buffer)
        .rotate() // honour EXIF orientation from phone photos
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer()
    } else {
      // Banners: always crop to an exact 16:11 landscape, at the largest size that
      // fits the source without upscaling (capped at TARGET_WIDTH). Computing the
      // box from the source — rather than relying on fit:'cover' +
      // withoutEnlargement, which skips the crop when the source is smaller than
      // the target — guarantees the stored banner is exactly 16:11, so the card
      // shows it uncropped and the post-job preview is an exact match.
      const fitW = Math.min(TARGET_WIDTH, metadata.width, Math.floor((metadata.height * TARGET_WIDTH) / TARGET_HEIGHT))
      const outW = Math.max(1, fitW)
      const outH = Math.max(1, Math.round((outW * TARGET_HEIGHT) / TARGET_WIDTH))
      processedBuffer = await sharp(buffer)
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
      originalDimensions: { width: metadata.width, height: metadata.height },
    })
  } catch (error) {
    console.error('Image processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process image. Please try a different file.' },
      { status: 500 }
    )
  }
}
