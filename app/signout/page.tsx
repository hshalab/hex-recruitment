'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'

// Client-side signout page. /api/auth/signout (server route) redirects
// here so that any direct-URL navigation to either path ends up doing
// the proper client-side supabase.auth.signOut() — which clears
// localStorage where the session lives. The server route still runs
// first to expire any chunked auth-token cookies set by SSR/OAuth
// callbacks; this page then mops up the client storage.
export default function SignoutPage() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    supabase.auth.signOut().finally(() => {
      if (cancelled) return
      router.replace('/')
    })
    return () => { cancelled = true }
  }, [router])

  return (
    <main>
      <Header />
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem', color: '#6b7280', fontSize: '0.95rem' }}>
        <p>Signing you out…</p>
      </div>
    </main>
  )
}
