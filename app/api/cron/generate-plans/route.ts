/**
 * Cron: Pre-generate provisional daily plans at 6AM Argentina (09:00 UTC).
 *
 * Strategy (Option 2 from mejoras.md): Generate a provisional plan using each
 * user's last check-in as energy/schedule baseline. When the user does their
 * check-in and generates the plan from Today, the provisional is replaced.
 *
 * Requires environment variables:
 *   CRON_SECRET              — Authorization header secret (set in Vercel)
 *   SUPABASE_SERVICE_ROLE_KEY — Bypasses RLS to read all users
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateDailyPlan } from '@/lib/anthropic'
import { calculateStudyPriorities, buildClassLogBoosts } from '@/lib/study-priority'
import { buildFixedBlocks } from '@/lib/fixed-blocks'
import { format, subDays, addDays, differenceInDays, parseISO } from 'date-fns'
import { getTodayArg, getDowArg } from '@/lib/utils'
import type {
  PlanGenerationContext,
  SubjectWithDetails,
  AcademicEvent,
  RecentClassLog,
  TimeBlock,
  WeeklyStudyGoal,
} from '@/types'

const ACADEMIC_EVENT_TYPES = ['parcial', 'parcial_intermedio', 'entrega_tp'] as const

export async function GET(req: NextRequest) {
  // Validate cron secret (Vercel sets Authorization: Bearer <CRON_SECRET> on cron calls)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Service role bypasses RLS — needed to read all users
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today    = getTodayArg()
  const todayDow = getDowArg()
  const referenceDate = new Date()

  // Find users who already have a plan today — skip them
  const { data: existingPlans } = await supabase
    .from('daily_plans')
    .select('user_id')
    .eq('date', today)

  const usersWithPlan = new Set((existingPlans || []).map((p: { user_id: string }) => p.user_id))

  // Only generate for users with an active semester
  const { data: activeSemesters } = await supabase
    .from('semesters')
    .select('user_id')
    .eq('is_active', true)

  const targetUserIds = (activeSemesters || [])
    .map((s: { user_id: string }) => s.user_id)
    .filter((uid: string) => !usersWithPlan.has(uid))

  if (targetUserIds.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'All users already have plans' })
  }

  let generated = 0
  let errors = 0

  for (const userId of targetUserIds) {
    try {
      await generateProvisionalPlan(supabase, userId, today, todayDow, referenceDate)
      generated++
    } catch (err) {
      console.error(`[cron] Failed to generate plan for user ${userId}:`, err)
      errors++
    }
  }

  // Alert via webhook when plans fail (set CRON_ERROR_WEBHOOK_URL in Vercel env vars)
  if (errors > 0 && process.env.CRON_ERROR_WEBHOOK_URL) {
    fetch(process.env.CRON_ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[IAmentor Cron] ${errors}/${targetUserIds.length} plan(s) failed at ${new Date().toISOString()}`,
      }),
    }).catch(() => {}) // fire-and-forget
  }

  return NextResponse.json({ ok: true, generated, errors, total: targetUserIds.length })
}

async function generateProvisionalPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  today: string,
  todayDow: number,
  referenceDate: Date
) {
  // Use last check-in as energy baseline, or sensible defaults
  const { data: lastCheckin } = await supabase
    .from('checkins')
    .select('energy_level, stress_level, work_mode, has_faculty, faculty_mode, faculty_subject, travel_route_json, sleep_quality, unexpected_events')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  const effectiveCheckin = lastCheckin ?? {
    energy_level: 3,
    stress_level: 'low' as const,
    work_mode: 'remoto' as const,
    has_faculty: false,
    faculty_mode: null,
    faculty_subject: null,
    travel_route_json: [] as any[],
    sleep_quality: 3,
    unexpected_events: null,
  }

  // Active semester + subjects
  const { data: semester } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (!semester) return

  let subjectsWithDetails: SubjectWithDetails[] = []
  let academicEvents: AcademicEvent[] = []

  const { data: subjects } = await supabase
    .from('subjects')
    .select(`
      id, name, color, semester_id, user_id, created_at,
      units (
        id, name, order_index, subject_id, created_at,
        topics (
          id, name, full_description, status, last_studied, next_review, created_at, unit_id
        )
      )
    `)
    .eq('semester_id', semester.id)

  subjectsWithDetails = ((subjects as any[]) || []).map(s => ({
    ...s,
    upcoming_events: [],
    units: (s.units || [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((u: any) => ({ ...u, topics: u.topics || [] })),
  }))

  const { data: events } = await supabase
    .from('academic_events')
    .select('*')
    .eq('user_id', userId)
    .gte('date', today)
    .lte('date', format(addDays(referenceDate, 30), 'yyyy-MM-dd'))
    .order('date')

  academicEvents = (events || []) as AcademicEvent[]

  const tomorrow  = format(addDays(referenceDate, 1), 'yyyy-MM-dd')
  const dayAfter  = format(addDays(referenceDate, 2), 'yyyy-MM-dd')

  const todayAcademicEvent = academicEvents.find(
    e => e.date === today && ACADEMIC_EVENT_TYPES.includes(e.type as any)
  ) ?? null

  const nextTwoDaysHaveEvent = academicEvents.some(
    e => (e.date === tomorrow || e.date === dayAfter) &&
         ACADEMIC_EVENT_TYPES.includes(e.type as any)
  )

  const suppressStudyBlocks = todayAcademicEvent !== null && !nextTwoDaysHaveEvent

  // Energy history (last 7 days)
  const { data: energyHistory } = await supabase
    .from('checkins')
    .select('date, energy_level')
    .eq('user_id', userId)
    .gte('date', format(subDays(referenceDate, 7), 'yyyy-MM-dd'))
    .order('date')

  // User config, today's class schedule, and weekly study goals
  const [{ data: userConfig }, { data: todayClasses }, { data: rawWeeklyGoals }] = await Promise.all([
    supabase.from('user_config').select('*').eq('user_id', userId).single(),
    supabase
      .from('class_schedule')
      .select('*, subjects(name, color)')
      .eq('user_id', userId)
      .eq('day_of_week', todayDow)
      .eq('is_active', true)
      .order('start_time'),
    supabase
      .from('weekly_study_goals')
      .select('subject_name, topics, minutes')
      .eq('user_id', userId)
      .eq('plan_date', today),
  ])

  // Recent class logs (last 14 days)
  const { data: rawClassLogs } = await supabase
    .from('class_logs')
    .select('subject_id, date, topics_covered_json, understanding_level')
    .eq('user_id', userId)
    .gte('date', format(subDays(referenceDate, 14), 'yyyy-MM-dd'))
    .order('date', { ascending: false })

  const allTopicsMap = new Map<string, { id: string; name: string }>()
  for (const subject of subjectsWithDetails) {
    for (const unit of subject.units) {
      for (const topic of unit.topics) {
        allTopicsMap.set(topic.id, { id: topic.id, name: topic.name })
      }
    }
  }

  const subjectNameMap = new Map<string, string>(subjectsWithDetails.map(s => [s.id, s.name]))

  const recentClassLogs: RecentClassLog[] = (rawClassLogs ?? []).map((log: any) => ({
    subject_id: log.subject_id,
    subject_name: subjectNameMap.get(log.subject_id) ?? 'Materia desconocida',
    date: log.date,
    days_ago: differenceInDays(referenceDate, parseISO(log.date)),
    understanding_level: log.understanding_level,
    topics: (log.topics_covered_json as string[])
      .map((id: string) => allTopicsMap.get(id))
      .filter((t): t is { id: string; name: string } => t !== undefined),
  }))

  const classLogBoosts = buildClassLogBoosts((rawClassLogs ?? []) as any[], referenceDate)

  // Build fixed blocks (no preserved blocks for provisional plan)
  const { fixedBlocks } = buildFixedBlocks(
    todayDow,
    effectiveCheckin as any,
    false, // checkinExists = false for provisional
    userConfig as any,
    (todayClasses ?? []) as any[],
    [] as TimeBlock[], // no preserved blocks
    todayAcademicEvent,
  )

  // Study priorities
  const studyPriorities = calculateStudyPriorities({
    subjects: subjectsWithDetails,
    academic_events: academicEvents,
    reference_date: referenceDate,
    class_log_boosts: classLogBoosts,
  })

  const weeklyStudyGoals: WeeklyStudyGoal[] = (rawWeeklyGoals || []) as WeeklyStudyGoal[]

  const context: PlanGenerationContext = {
    checkin: effectiveCheckin as any,
    calendar_events: [],
    subjects_with_topics: subjectsWithDetails,
    academic_events: academicEvents,
    energy_history: (energyHistory || []) as { date: string; energy_level: number }[],
    study_priorities: studyPriorities,
    fixed_blocks: fixedBlocks,
    recent_class_logs: recentClassLogs,
    today_academic_event: todayAcademicEvent,
    suppress_study_blocks: suppressStudyBlocks,
    weekly_study_goals: weeklyStudyGoals,
  }

  // Generate non-streaming plan
  const planBlocks = await generateDailyPlan(context)
  if (planBlocks.length === 0) return

  // Upsert provisional plan — ignoreDuplicates so it won't overwrite if user already has one
  // (handles race condition where user generated their own plan between the initial check and now)
  await supabase
    .from('daily_plans')
    .upsert({
      user_id: userId,
      date: today,
      plan_json: planBlocks,
      completion_percentage: 0,
    }, { onConflict: 'user_id,date', ignoreDuplicates: true })
}
