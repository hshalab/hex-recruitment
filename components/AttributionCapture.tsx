'use client'

import { useEffect } from 'react'
import { captureFromSearch } from '@/lib/attribution'

// Reads ?ref / ?utm_* from the landing URL and stores it first-party
// (first-touch-wins) so it survives the signup journey. Renders nothing.
export default function AttributionCapture() {
  useEffect(() => {
    captureFromSearch(window.location.search)
  }, [])
  return null
}
