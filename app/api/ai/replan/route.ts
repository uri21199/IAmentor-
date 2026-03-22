import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { replanDay } from '@/lib/anthropic'
import { buildFixedBlocks } from '@/lib/fixed-blocks'
import { getTodayArg, getDowArg } from '@/lib/utils'
import type { TimeBlock } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResponse = await checkRateLimit('replan', user.id)
    if (rateLimitResponse) return rateLimitResponse

    const { change } = await req.json()
    if (!change) {
      return NextResponse.json({ error: 'change is required' }, { status: 400 })
    }

    const today = getTodayArg()
    const todayDow = getDowArg()

    // ── Load current plan ──────────────────────────────────
    const { data: plan } = await supabase
      .from('daily_plans')
      .select('plan_json')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    if (!plan?.plan_json) {
      return NextResponse.json({ error: 'No plan found for today' }, { status: 400 })
    }

    // ── Load full check-in (all fields needed for fixed blocks) ──
    const { data: checkin } = await supabase
      .from('checkins')
      .select('energy_level, stress_level, unexpected_events, work_mode, has_faculty, travel_route_json')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    const checkinExists = !!checkin

    const effectiveCheckin = checkin ?? {
      energy_level: 3,
      stress_level: 'low',
      work_mode: 'remoto',
      has_faculty: false,
      travel_route_json: [],
      unexpected_events: null,
    }

    // ── Load user_config, today's class_schedule, and today's academic event ──
    const ACADEMIC_EVENT_TYPES = ['parcial', 'parcial_intermedio', 'entrega_tp']
    const [{ data: userConfig }, { data: todayClasses }, { data: todayEvents }] = await Promise.all([
      supabase.from('user_config').select('*').eq('user_id', user.id).single(),
      supabase
        .from('class_schedule')
        .select('*, subjects(name, color)')
        .eq('user_id', user.id)
        .eq('day_of_week', todayDow)
        .eq('is_active', true)
        .order('start_time'),
      supabase
        .from('academic_events')
        .select('id, type, title, subject_id, notes')
        .eq('user_id', user.id)
        .eq('date', today)
        .in('type', ACADEMIC_EVENT_TYPES),
    ])

    const todayAcademicEvent = todayEvents?.[0] ?? null

    // ── Rebuild fixed blocks (same logic as plan generation) ──
    const manuallyEditedBlocks: TimeBlock[] = (plan.plan_json as TimeBlock[])
      .filter(b => b.manually_edited && !b.deleted)

    const { fixedBlocks } = buildFixedBlocks(
      todayDow,
      effectiveCheckin as any,
      checkinExists,
      userConfig,
      todayClasses ?? [],
      manuallyEditedBlocks,
      todayAcademicEvent,
    )

    // ── Run replan with full context ───────────────────────
    const updatedBlocks = await replanDay(
      plan.plan_json as TimeBlock[],
      change,
      {
        energy_level: effectiveCheckin.energy_level ?? 3,
        stress_level: effectiveCheckin.stress_level ?? 'low',
        unexpected_events: effectiveCheckin.unexpected_events ?? null,
      },
      fixedBlocks,
    )

    // ── Persist updated plan ───────────────────────────────
    await supabase
      .from('daily_plans')
      .update({ plan_json: updatedBlocks })
      .eq('user_id', user.id)
      .eq('date', today)

    // Append the replan change to unexpected_events so future replans remember it
    if (checkin) {
      const existingEvents = checkin.unexpected_events || ''
      const separator = existingEvents ? '\n---\n' : ''
      await supabase
        .from('checkins')
        .update({ unexpected_events: existingEvents + separator + change })
        .eq('user_id', user.id)
        .eq('date', today)
    }

    return NextResponse.json({ blocks: updatedBlocks })
  } catch (err: any) {
    console.error('Replan error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
