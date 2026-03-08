/**
 * GET  /api/notifications
 *   1. Fetches all context data needed by the engine
 *   2. Runs evaluateTriggers() (pure, no side effects)
 *   3. Persists any NEW pending notifications (deduplication is handled by the engine)
 *   4. Returns all unread, non-expired notifications for the client to render
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { evaluateTriggers } from '@/lib/notifications-engine'
import { format } from 'date-fns'
import type { SubjectWithDetails } from '@/types'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = format(new Date(), 'yyyy-MM-dd')
  const todayDow = new Date().getDay()
  const now = new Date()

  // ── 1. Fetch today's check-in ──────────────────────────────────────────────
  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  // ── 2. Fetch today's plan ──────────────────────────────────────────────────
  const { data: plan } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  // ── 3. Fetch class schedule for today ─────────────────────────────────────
  let classScheduleToday: any[] = []
  try {
    const { data } = await supabase
      .from('class_schedule')
      .select('*, subject:subjects(name, color)')
      .eq('user_id', user.id)
      .eq('day_of_week', todayDow)
      .eq('is_active', true)
    classScheduleToday = data ?? []
  } catch {
    // table may not exist yet
  }

  // ── 4. Fetch class logs for today (to skip already-logged classes) ─────────
  const { data: classLogsToday } = await supabase
    .from('class_logs')
    .select('subject_id')
    .eq('user_id', user.id)
    .eq('date', today)

  const existingClassLogSubjectIds = (classLogsToday ?? []).map((l: any) => l.subject_id as string)

  // ── 5. Fetch subjects with units + topics (for priority engine) ────────────
  let subjectsWithDetails: SubjectWithDetails[] = []
  let academicEvents: any[] = []

  const { data: activeSemester } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (activeSemester) {
    const { data: subjectsRaw } = await supabase
      .from('subjects')
      .select(`
        *,
        units (
          *,
          topics (*)
        )
      `)
      .eq('semester_id', activeSemester.id)
      .eq('user_id', user.id)

    const { data: eventsRaw } = await supabase
      .from('academic_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', today)

    // Build SubjectWithDetails[] by attaching upcoming_events
    subjectsWithDetails = (subjectsRaw ?? []).map((s: any) => ({
      ...s,
      upcoming_events: [],
    }))

    academicEvents = eventsRaw ?? []
  }

  // ── 6. Fetch today's already-created notifications (dedup) ────────────────
  let existingTodayNotifications: Array<{ type: string; metadata: Record<string, unknown> }> = []
  try {
    const todayStart = `${today}T00:00:00`
    const todayEnd   = `${today}T23:59:59`
    const { data } = await supabase
      .from('notifications')
      .select('type, metadata')
      .eq('user_id', user.id)
      .gte('triggered_at', todayStart)
      .lte('triggered_at', todayEnd)

    existingTodayNotifications = (data ?? []) as typeof existingTodayNotifications
  } catch {
    // notifications table may not exist yet — safe to ignore
  }

  // ── 7. Run the engine ──────────────────────────────────────────────────────
  const pending = evaluateTriggers({
    checkin: checkin ?? null,
    plan: plan ?? null,
    classScheduleToday,
    existingClassLogSubjectIds,
    subjectsWithDetails,
    academicEvents,
    existingTodayNotifications,
    now,
  })

  // ── 8. Persist new notifications ───────────────────────────────────────────
  if (pending.length > 0) {
    try {
      const rows = pending.map(n => ({
        user_id: user.id,
        type: n.type,
        message: n.message,
        target_path: n.target_path,
        read_status: false,
        triggered_at: now.toISOString(),
        expires_at: n.expires_at,
        metadata: n.metadata,
      }))
      await supabase.from('notifications').insert(rows)
    } catch {
      // If table doesn't exist yet, silently continue
    }
  }

  // ── 9. Return all unread, non-expired notifications ────────────────────────
  let notifications: any[] = []
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('read_status', false)
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .order('triggered_at', { ascending: false })
      .limit(10)

    notifications = data ?? []
  } catch {
    // notifications table may not exist
  }

  return NextResponse.json({ notifications })
}
