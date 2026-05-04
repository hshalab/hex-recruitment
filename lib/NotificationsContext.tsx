'use client'

// Single source of truth for in-app notifications. Mounted at the root
// in app/providers.tsx so the bell, dashboard panels, analytics activity
// feed, and the full /notifications page all read from the same in-memory
// list and share a single realtime subscription.
//
// Pre-2026-05-04 each surface owned its own SELECT + (in the bell's case)
// 30s poll, which is what the AUDIT_2026-05-03 U2 finding flagged as the
// 9-13 duplicate `/rest/v1/notifications` GETs per dashboard load.
//
// Auth: providers.tsx is wrapped above marketing/login/register pages
// where there's no session, so this provider guards on userId before
// fetching or opening a realtime channel — public pages do nothing.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Notification } from '@/lib/mockNotifications'

type NotificationsCtx = {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  refetch: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsCtx>({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  refetch: async () => {},
})

export function useNotifications() {
  return useContext(NotificationsContext)
}

const FETCH_LIMIT = 20

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Track current user id; re-init when auth changes.
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setUserId(session?.user.id ?? null)
    }).catch(() => {
      if (!mounted) return
      setUserId(null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUserId(session?.user.id ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Initial fetch + realtime channel. Skipped entirely when no session.
  useEffect(() => {
    if (!userId) {
      setNotifications([])
      setIsLoading(false)
      return
    }

    let mounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null
    setIsLoading(true)

    const init = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT)

      if (!mounted) return
      if (!error) setNotifications((data || []) as Notification[])
      setIsLoading(false)

      // Realtime: receive new notifications and read-state updates without
      // re-fetching. supabase-js auto-reconnects if the WebSocket drops.
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            setNotifications(prev => [payload.new as Notification, ...prev].slice(0, FETCH_LIMIT))
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            const updated = payload.new as Notification
            setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n))
          }
        )
        .subscribe()
    }

    init()

    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId])

  const refetch = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)
    if (!error) setNotifications((data || []) as Notification[])
  }, [userId])

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic local update; realtime UPDATE event will reconcile.
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }, [])

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
  }, [userId])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, isLoading, markAsRead, markAllAsRead, refetch }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}
