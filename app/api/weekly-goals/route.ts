import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { WeeklyDayPlan } from '@/app/api/ai/weekly-plan/route'

/**
 * POST /api/weekly-goals
 * Saves weekly study goals from a generated weekly plan.
 * Replaces any existing goals for the same dates.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { days } = await req.json() as { days: WeeklyDayPlan[] }
  if (!days?.length) return NextResponse.json({ error: 'No days provided' }, { status: 400 })

  const dates = days.map(d => d.date)

  // Remove existing goals for these dates before inserting new ones
  await supabase
    .from('weekly_study_goals')
    .delete()
    .eq('user_id', user.id)
    .in('plan_date', dates)

  const rows = days.flatMap(day =>
    day.study_goals.map(goal => ({
      user_id: user.id,
      plan_date: day.date,
      subject_name: goal.subject_name,
      topics: goal.topics,
      minutes: goal.minutes,
    }))
  ).filter(r => r.minutes > 0)

  if (rows.length > 0) {
    const { error } = await supabase.from('weekly_study_goals').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: rows.length })
}

/**
 * DELETE /api/weekly-goals?dates=YYYY-MM-DD,YYYY-MM-DD
 * Clears committed weekly goals for the given dates.
 */
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const datesParam = searchParams.get('dates')
  const dates = datesParam ? datesParam.split(',').filter(Boolean) : []

  let query = supabase.from('weekly_study_goals').delete().eq('user_id', user.id)
  if (dates.length > 0) {
    query = query.in('plan_date', dates)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
