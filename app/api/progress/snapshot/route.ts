import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { format, subDays, startOfWeek, getISOWeek, getYear } from 'date-fns'

/**
 * POST /api/progress/snapshot
 *
 * Creates (or upserts) today's progress snapshot for all subjects in the
 * active semester. Called once per day when the user visits the Stats page.
 *
 * Returns: { ok: true, snapshots_created: number }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = format(new Date(), 'yyyy-MM-dd')

    // Fetch active semester
    const { data: semester } = await supabase
      .from('semesters')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!semester) return NextResponse.json({ ok: true, snapshots_created: 0 })

    // Fetch all subjects with their topic statuses
    const { data: subjects, error: subErr } = await supabase
      .from('subjects')
      .select(`
        id, name,
        units (
          topics ( id, status )
        )
      `)
      .eq('semester_id', semester.id)

    if (subErr || !subjects) throw subErr

    const rows = subjects.map((s: any) => {
      const topics = (s.units ?? []).flatMap((u: any) => u.topics ?? [])
      const total = topics.length
      const green = topics.filter((t: any) => t.status === 'green').length
      const healthScore = total > 0 ? green / total : 0

      return {
        user_id: user.id,
        subject_id: s.id,
        snapshot_date: today,
        health_score: parseFloat(healthScore.toFixed(4)),
        topics_json: topics.map((t: any) => ({ id: t.id, status: t.status })),
      }
    })

    if (rows.length === 0) return NextResponse.json({ ok: true, snapshots_created: 0 })

    const { error: upsertErr } = await supabase
      .from('progress_snapshots')
      .upsert(rows, { onConflict: 'user_id,subject_id,snapshot_date' })

    if (upsertErr) throw upsertErr

    return NextResponse.json({ ok: true, snapshots_created: rows.length })
  } catch (err: any) {
    console.error('[api/progress/snapshot POST]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * GET /api/progress/snapshot?days=56
 *
 * Returns aggregated weekly health scores per subject for the last N days
 * (default 56 = 8 weeks), ready for the DomainHeatmap component.
 *
 * Returns: { subjects, weeks, grid }
 *   subjects: Array<{ id, name, color }>
 *   weeks:    string[]              — ISO week keys "YYYY-WNN"
 *   labels:   string[]              — human labels "Mar 9"
 *   grid:     Record<subject_id, Record<week_key, number | null>>
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const days = parseInt(url.searchParams.get('days') ?? '56', 10)
    const since = format(subDays(new Date(), days), 'yyyy-MM-dd')
    const today = format(new Date(), 'yyyy-MM-dd')

    // Fetch snapshots for the window
    const { data: snapshots, error: snapErr } = await supabase
      .from('progress_snapshots')
      .select('subject_id, snapshot_date, health_score')
      .eq('user_id', user.id)
      .gte('snapshot_date', since)
      .lte('snapshot_date', today)
      .order('snapshot_date', { ascending: true })

    if (snapErr) throw snapErr

    // Fetch subject metadata (id, name, color) for active semester
    const { data: semester } = await supabase
      .from('semesters')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    const subjectsMap: Record<string, { id: string; name: string; color: string }> = {}
    if (semester) {
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, name, color')
        .eq('semester_id', semester.id)
        .order('name')
      for (const s of subjects ?? []) {
        subjectsMap[s.id] = s
      }
    }

    // Build week keys for the display window (chronological)
    const weekKeys: string[] = []
    const weekLabels: string[] = []
    const weekSet = new Set<string>()

    for (const snap of snapshots ?? []) {
      const d = new Date(snap.snapshot_date + 'T00:00:00')
      const weekKey = `${getYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
      if (!weekSet.has(weekKey)) {
        weekSet.add(weekKey)
        weekKeys.push(weekKey)
        const monday = startOfWeek(d, { weekStartsOn: 1 })
        weekLabels.push(format(monday, 'MMM d'))
      }
    }

    // Aggregate: for each subject × week, average the health scores
    const weeklyScores: Record<string, Record<string, number[]>> = {}

    for (const snap of snapshots ?? []) {
      const d = new Date(snap.snapshot_date + 'T00:00:00')
      const weekKey = `${getYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
      if (!weeklyScores[snap.subject_id]) weeklyScores[snap.subject_id] = {}
      if (!weeklyScores[snap.subject_id][weekKey]) weeklyScores[snap.subject_id][weekKey] = []
      weeklyScores[snap.subject_id][weekKey].push(snap.health_score)
    }

    // Build grid: subject_id → week_key → average score (null if no data)
    const grid: Record<string, Record<string, number | null>> = {}
    for (const subjectId of Object.keys(weeklyScores)) {
      grid[subjectId] = {}
      for (const weekKey of weekKeys) {
        const scores = weeklyScores[subjectId][weekKey]
        grid[subjectId][weekKey] = scores
          ? scores.reduce((s, v) => s + v, 0) / scores.length
          : null
      }
    }

    // Flag subjects with no activity in the last 7 days
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')
    const inactiveSubjects = new Set<string>()
    const subjectIds = Object.keys(subjectsMap)
    for (const subjectId of subjectIds) {
      const recentSnaps = (snapshots ?? []).filter(
        s => s.subject_id === subjectId && s.snapshot_date >= sevenDaysAgo
      )
      const hasImprovement = recentSnaps.some((s, i) => {
        if (i === 0) return false
        return s.health_score > recentSnaps[i - 1].health_score
      })
      if (recentSnaps.length === 0 || !hasImprovement) {
        inactiveSubjects.add(subjectId)
      }
    }

    return NextResponse.json({
      subjects: Object.values(subjectsMap),
      weeks: weekKeys,
      labels: weekLabels,
      grid,
      inactive_subjects: Array.from(inactiveSubjects),
    })
  } catch (err: any) {
    console.error('[api/progress/snapshot GET]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
