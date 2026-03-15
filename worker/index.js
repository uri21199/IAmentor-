/**
 * worker/index.js — Custom Service Worker extension for next-pwa
 *
 * next-pwa v5.6 supports "customWorkerSrc" which points to this directory.
 * This file is bundled INTO the generated public/sw.js alongside workbox code.
 *
 * Handles:
 *   - push events  → shows a notification with title, body, icon
 *   - notificationclick → opens/focuses the app at the target URL
 */

// ── Push event ─────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Mentor IA', body: event.data.text() }
  }

  const title   = data.title   ?? 'Mentor IA'
  const options = {
    body:    data.body    ?? '',
    icon:    data.icon    ?? '/icons/icon-192.png',
    badge:   data.badge   ?? '/icons/icon-96.png',
    tag:     data.tag     ?? 'mentor-ia',
    renotify: false,
    data:    data.data    ?? {},
    actions: [],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification click ─────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url ?? '/today'
  const fullUrl   = self.location.origin + targetUrl

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If app is already open, focus and navigate
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.navigate(fullUrl)
            return client.focus()
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(fullUrl)
        }
      })
  )
})
