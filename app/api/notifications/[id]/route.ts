/**
 * PATCH /api/notifications/[id]
 *   Body: { read: true }
 *   Marks a single notification as read.
 *   Returns { ok: true, target_path } so the client can perform the redirect.
 *
 * DELETE /api/notifications/[id]
 *   Deletes a single notification.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface Params { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
