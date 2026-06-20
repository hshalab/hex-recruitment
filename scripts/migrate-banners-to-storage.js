/**
 * One-off migration: move job banners from base64-in-row (jobs.company_banner_url
 * holding a data:image/webp URI) to the public Supabase Storage bucket
 * 'job-banners', and rewrite the column to the public URL.
 *
 * Idempotent + re-runnable: only selects rows still holding a data: URI, so a
 * second run migrates nothing. Backed up first to bak_job_banners_20260620.
 *
 * Run: node --env-file=.env.local scripts/migrate-banners-to-storage.js
 */
const { createClient } = require('@supabase/supabase-js')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supa = createClient(url, key, { auth: { persistSession: false } })
const BUCKET = 'job-banners'

async function ensureBucket() {
  const { data: buckets, error } = await supa.storage.listBuckets()
  if (error) throw error
  if (buckets.some((b) => b.name === BUCKET)) {
    console.log(`bucket '${BUCKET}' already exists`)
    return
  }
  const { error: createErr } = await supa.storage.createBucket(BUCKET, { public: true })
  if (createErr) throw createErr
  console.log(`bucket '${BUCKET}' created (public)`)
}

function parseDataUrl(s) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(s)
  if (!m) return null
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') }
}

async function backfill() {
  const { data: rows, error } = await supa
    .from('jobs')
    .select('id, company_banner_url')
    .like('company_banner_url', 'data:%')
  if (error) throw error

  let migrated = 0
  let skipped = 0
  let failed = 0
  for (const r of rows) {
    try {
      const parsed = parseDataUrl(r.company_banner_url)
      if (!parsed) {
        skipped++
        console.log('skip (not a data URL):', r.id)
        continue
      }
      const path = `${r.id}.webp`
      const { error: upErr } = await supa.storage
        .from(BUCKET)
        .upload(path, parsed.buffer, { contentType: parsed.contentType || 'image/webp', upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = pub.publicUrl
      const { error: updErr } = await supa.from('jobs').update({ company_banner_url: publicUrl }).eq('id', r.id)
      if (updErr) throw updErr
      migrated++
      console.log('migrated', r.id, '->', publicUrl)
    } catch (e) {
      failed++
      console.log('FAILED', r.id, e.message)
    }
  }
  console.log(`\nTOTAL data:URI rows: ${rows.length} | migrated: ${migrated} | skipped: ${skipped} | failed: ${failed}`)
}

;(async () => {
  await ensureBucket()
  await backfill()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
