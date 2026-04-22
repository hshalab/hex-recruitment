'use client'

import { useState, useEffect } from 'react'
import { getSignedStorageUrl } from '@/lib/storageUrl'

interface SignedLinkProps {
  src: string | null | undefined
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
  onMouseDown?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

/**
 * Link component that resolves Supabase storage paths to
 * short-lived signed URLs. External URLs pass through unchanged.
 */
export default function SignedLink({ src, children, className, style, onClick, onMouseDown }: SignedLinkProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>('')

  useEffect(() => {
    if (!src) { setResolvedUrl(''); return }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (src.startsWith('http') && !src.includes(supabaseUrl)) {
      setResolvedUrl(src)
      return
    }
    let cancelled = false
    getSignedStorageUrl(src).then(url => {
      if (!cancelled) setResolvedUrl(url)
    })
    return () => { cancelled = true }
  }, [src])

  if (!resolvedUrl) return null

  return (
    <a
      href={resolvedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      onClick={onClick}
      onMouseDown={onMouseDown}
    >
      {children}
    </a>
  )
}
