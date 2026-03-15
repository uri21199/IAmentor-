/**
 * POST /api/push/send  (internal — called by /api/notifications)
 * Sends Web Push notifications to all subscriptions of a user.
 *
 * Body: { userId: string, notificationIds: string[] }
 *
 * Requires env vars:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_MAILTO           (e.g. "mailto:admin@example.com")
 *   INTERNAL_SECRET        (shared secret to restrict direct access)
 */

import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Configure VAPID only once at module level
const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? ''
const vapidMailto  = process.env.VAPID_MAILTO ?? 'mailto:app@mentoria.dev'

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidMailto, vapidPublic, vapidPrivate)
}

export async function POST(req: NextRequest) {
  // Internal secret guard — prevents public abuse
  const secret = req.headers.get('x-internal-secret') ?? ''
  if (secret !== (process.env.INTERNAL_SECRET ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!vapidPublic || !vapidPrivate) {
    // VAPID not configured — skip silently (feature disabled)
    return NextResponse.json({ ok: true, sent: 0, reason: 'vapid_not_configured' })
  }

  let body: { userId?: string; notificationIds?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, notificationIds } = body
  if (!userId || !notificationIds?.length) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Fetch the notification rows to build the push payload
  const { data: notifRows } = await supabase
    .from('notifications')
    .select('id, title, body, message, target_path, type')
    .in('id', notificationIds)
    .eq('user_id', userId)

  if (!notifRows?.length) return NextResponse.json({ ok: true, sent: 0 })

  // Fetch all push subscriptions for this user
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, keys_json')
    .eq('user_id', userId)

  if (!subs?.length) return NextResponse.json({ ok: true, sent: 0, reason: 'no_subscriptions' })

  let sent = 0
  const staleEndpoints: string[] = []

  for (const notif of notifRows) {
    const pushTitle = notif.title ?? 'Mentor IA'
    const pushBody  = notif.body  ?? notif.message ?? ''

    const payload = JSON.stringify({
      title:       pushTitle,
      body:        pushBody,
      icon:        '/icons/icon-192.png',
      badge:       '/icons/icon-96.png',
      data:        { url: notif.target_path ?? '/today' },
      tag:         notif.id,          // replaces older notification with same id
      renotify:    false,
    })

    for (const sub of subs) {
      const subscription = {
        endpoint:  sub.endpoint,
        keys: {
          p256dh: sub.keys_json?.p256dh ?? '',
          auth:   sub.keys_json?.auth   ?? '',
        },
      }

      try {
        await webpush.sendNotification(subscription, payload)
        sent++
      } catch (err: any) {
        // 410 Gone = subscription expired, clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint)
        }
      }
    }
  }

  // Mark notifications as push_sent
  if (sent > 0) {
    await supabase
      .from('notifications')
      .update({ push_sent: true })
      .in('id', notificationIds)
      .eq('user_id', userId)
  }

  // Remove stale subscriptions
  if (staleEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', staleEndpoints)
  }

  return NextResponse.json({ ok: true, sent })
}
