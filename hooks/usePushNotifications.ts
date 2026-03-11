'use client'

import { useState, useEffect } from 'react'

interface UsePushNotificationsReturn {
  supported: boolean
  permission: NotificationPermission | null
  subscribed: boolean
  loading: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const isSupported =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window

    setSupported(isSupported)

    if (isSupported) {
      setPermission(Notification.permission)

      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(sub => {
          setSubscribed(!!sub)
        })
      }).catch(() => {
        // Service worker not registered yet
      })
    }
  }, [])

  async function subscribe() {
    if (!supported) return
    setLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      setPermission(permission)

      if (permission !== 'granted') return

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })
      setSubscribed(!!sub)
    } catch (err) {
      console.error('Push subscribe error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function unsubscribe() {
    if (!supported) return
    setLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        setSubscribed(false)
      }
    } catch (err) {
      console.error('Push unsubscribe error:', err)
    } finally {
      setLoading(false)
    }
  }

  return { supported, permission, subscribed, loading, subscribe, unsubscribe }
}
