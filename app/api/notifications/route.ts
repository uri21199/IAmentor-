/**
 * GET  /api/notifications
 *   1. Fetches all context data
 *   2. Runs evaluateTriggers() (legacy: post_class, energy_boost, exam_alert, early_win)
 *   3. Runs checkAndScheduleAlerts() (new: deadline alerts at 14/10/7/5/1/0 days)
 *   4. Persists new notifications with dedup
 *   5. Sends push for new deadline alerts (fire-and-forget)
 *   6. Returns latest 20 unread, non-expired notifications
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { evaluateTriggers, checkAndScheduleAlerts } from '@/lib/notifications-engine'
import { format } from 'date-fns'
import { getTodayArg, getDowArg } from '@/lib/utils'
import type { SubjectWithDetails } from '@/types'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today    = getTodayArg()
  const todayDow = getDowArg()
  const now      = new Date()

  // ── 1. Today's check-in ────────────────────────────────────────────────────
  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  // ── 2. Today's plan ────────────────────────────────────────────────────────
  const { data: plan } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  // ── 3. Class schedule for today ────────────────────────────────────────────
  let classScheduleToday: any[] = []
  try {
    const { data } = await supabase
      .from('class_schedule')
      .select('*, subject:subjects(name, color)')
      .eq('user_id', user.id)
      .eq('day_of_week', todayDow)
      .eq('is_active', true)
    classScheduleToday = data ?? []
  } catch { /* table may not exist yet */ }

  // ── 4. Class logs for today ────────────────────────────────────────────────
  const { data: classLogsToday } = await supabase
    .from('class_logs')
    .select('subject_id')
    .eq('user_id', user.id)
    .eq('date', today)
  const existingClassLogSubjectIds = (classLogsToday ?? []).map((l: any) => l.subject_id as string)

  // ── 5. Subjects with full topic tree ──────────────────────────────────────
  let subjectsWithDetails: SubjectWithDetails[] = []
  let academicEvents: any[] = []

  const { data: activeSemester } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (activeSemester) {
    const [{ data: subjectsRaw }, { data: eventsRaw }] = await Promise.all([
      supabase
        .from('subjects')
        .select('*, units(*, topics(*))')
        .eq('semester_id', activeSemester.id)
        .eq('user_id', user.id),
      supabase
        .from('academic_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', today),
    ])

    subjectsWithDetails = (subjectsRaw ?? []).map((s: any) => ({ ...s, upcoming_events: [] }))
    academicEvents      = eventsRaw ?? []
  }

  // ── 6. Upcoming daily plans (for planned-session counting) ────────────────
  let upcomingPlans: any[] = []
  try {
    const { data } = await supabase
      .from('daily_plans')
      .select('date, plan_json')
      .eq('user_id', user.id)
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(60)
    upcomingPlans = data ?? []
  } catch { /* ignore */ }

  // ── 7. Existing notifications for dedup ───────────────────────────────────
  let existingTodayNotifications: Array<{ type: string; metadata: Record<string, unknown> }> = []
  let existingDeadlineNotifications: Array<{ event_id: string | null; trigger_days_before: number | null }> = []

  try {
    const todayStart = `${today}T00:00:00`
    const todayEnd   = `${today}T23:59:59`

    const [{ data: todayRows }, { data: deadlineRows }] = await Promise.all([
      // Legacy triggers — dedup by type within today
      supabase
        .from('notifications')
        .select('type, metadata')
        .eq('user_id', user.id)
        .gte('triggered_at', todayStart)
        .lte('triggered_at', todayEnd),
      // Deadline alerts — dedup by (event_id, trigger_days_before) across all time
      supabase
        .from('notifications')
        .select('event_id, trigger_days_before')
        .eq('user_id', user.id)
        .not('event_id', 'is', null)
        .not('trigger_days_before', 'is', null),
    ])

    existingTodayNotifications    = (todayRows ?? []) as typeof existingTodayNotifications
    existingDeadlineNotifications = (deadlineRows ?? []) as typeof existingDeadlineNotifications
  } catch { /* notifications table may not exist yet */ }

  // ── 8. Run engines ────────────────────────────────────────────────────────
  const legacyPending = evaluateTriggers({
    checkin: checkin ?? null,
    plan: plan ?? null,
    classScheduleToday,
    existingClassLogSubjectIds,
    subjectsWithDetails,
    academicEvents,
    existingTodayNotifications,
    existingDeadlineNotifications,
    now,
  })

  const deadlinePending = checkAndScheduleAlerts({
    subjectsWithDetails,
    academicEvents,
    upcomingPlans,
    existingDeadlineNotifications,
    now,
  })

  const allPending = [...legacyPending, ...deadlinePending]

  // ── 9. Persist new notifications ──────────────────────────────────────────
  let insertedDeadlineIds: string[] = []

  const toRow = (n: any) => ({
    user_id:              user.id,
    type:                 n.type,
    message:              n.message,
    title:                n.title        ?? null,
    body:                 n.body         ?? null,
    target_path:          n.target_path,
    read_status:          false,
    triggered_at:         now.toISOString(),
    expires_at:           n.expires_at,
    metadata:             n.metadata,
    context_json:         n.context_json ?? {},
    event_id:             n.event_id     ?? null,
    subject_id:           n.subject_id   ?? null,
    trigger_days_before:  n.trigger_days_before ?? null,
    push_sent:            false,
  })

  try {
    // Deadline alerts: upsert using the unique constraint (event_id, trigger_days_before)
    if (deadlinePending.length > 0) {
      const { data: inserted } = await supabase
        .from('notifications')
        .upsert(deadlinePending.map(toRow), {
          onConflict:       'user_id,event_id,trigger_days_before',
          ignoreDuplicates: true,
        })
        .select('id, type')

      insertedDeadlineIds = (inserted ?? []).map((r: any) => r.id)
    }

    // Legacy triggers: plain insert (engine already deduped by checking today's notifications)
    if (legacyPending.length > 0) {
      await supabase.from('notifications').insert(legacyPending.map(toRow))
    }
  } catch { /* table may not exist yet */ }

  // ── 10. Fire-and-forget push for deadline alerts ───────────────────────────
  if (insertedDeadlineIds.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SECRET ?? '' },
      body: JSON.stringify({ userId: user.id, notificationIds: insertedDeadlineIds }),
    }).catch(() => { /* non-blocking */ })
  }

  // ── 11. Return latest 20 unread non-expired notifications ─────────────────
  let notifications: any[] = []
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('read_status', false)
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .order('triggered_at', { ascending: false })
      .limit(20)
    notifications = data ?? []
  } catch { /* table may not exist */ }

  return NextResponse.json({ notifications })
}
