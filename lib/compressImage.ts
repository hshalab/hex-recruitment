// Client-side image downscale/compress so posting a photo is effortless — the
// user never thinks about dimensions or file size. We draw the chosen image to a
// canvas capped at a sensible long edge and re-encode as JPEG. Anything the
// browser can't decode (e.g. some HEIC) is passed through untouched for the
// server (sharp) to handle. Browser-only — do not import server-side.

export async function compressImage(file: File, maxEdge = 1600, quality = 0.85): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!file.type.startsWith('image/')) return file
  // Keep GIFs as-is so animation isn't flattened by the canvas.
  if (file.type === 'image/gif') return file

  try {
    const img = await loadImage(file)
    const w0 = (img as ImageBitmap).width || (img as HTMLImageElement).naturalWidth
    const h0 = (img as ImageBitmap).height || (img as HTMLImageElement).naturalHeight
    if (!w0 || !h0) return file

    const scale = Math.min(1, maxEdge / Math.max(w0, h0))
    const w = Math.max(1, Math.round(w0 * scale))
    const h = Math.max(1, Math.round(h0 * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h)

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return file
    // If we neither shrank the pixels nor the bytes, keep the original.
    if (scale === 1 && blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file // undecodable (e.g. HEIC on this browser) — let the server try.
  }
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
  } finally {
    // Revoke on next tick so the decoded image is safely drawn first.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
