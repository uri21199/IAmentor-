/**
 * PATCH /api/notifications/[id]
 *   Body: { read: true }
 *   Marks a single notification as read.
 *   Returns { ok: true, target_path } so the client can perform the redirect.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface Params { params: { id: string } }

export async function PATCH(request: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Fetch the notification first so we can return the target_path
  const { data: notification, error: fetchError } = await supabase
    .from('notifications')
    .select('id, target_path, user_id')
    .eq('id', id)
    .eq('user_id', user.id)   // RLS enforced in SQL, but double-check here
    .maybeSingle()

  if (fetchError || !notification) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error: updateError } = await supabase
    .from('notifications')
    .update({ read_status: true })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    target_path: notification.target_path ?? null,
  })
}
