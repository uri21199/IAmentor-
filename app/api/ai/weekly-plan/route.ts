import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { anthropic } from '@/lib/anthropic'
import { calculateStudyPriorities, buildClassLogBoosts } from '@/lib/study-priority'
import { getTodayArg } from '@/lib/utils'
import { addDays, format, differenceInDays, parseISO, subDays } from 'date-fns'
import type { SubjectWithDetails, AcademicEvent } from '@/types'

export interface WeeklyDayPlan {
  date: string
  day_label: string
  has_work: boolean
  has_class: boolean
  academic_events: Array<{ title: string; type: string }>
  study_goals: Array<{ subject_name: string; topics: string[]; minutes: number }>
  total_study_minutes: number
  tip: string
}

export interface WeeklyPlanResponse {
  week_start: string
  days: WeeklyDayPlan[]
  weekly_focus: string
  total_hours: number
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateLimitResponse = await checkRateLimit('weekly-plan', user.id)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const referenceDate = new Date()

    // If it's 18:00 or later in Argentina (UTC-3), start the plan from tomorrow
    const argHours = (referenceDate.getUTCHours() - 3 + 24) % 24
    const startOffset = argHours >= 18 ? 1 : 0
    const planStartDate = addDays(referenceDate, startOffset)
    const today = getTodayArg()

    // Fetch active semester + subjects
    const { data: semester } = await supabase
      .from('semesters')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!semester) {
      return NextResponse.json({ error: 'No active semester' }, { status: 400 })
    }

    const [{ data: subjects }, { data: events }, { data: userConfig }, { data: classSchedule }, { data: rawClassLogs }] = await Promise.all([
      supabase
        .from('subjects')
        .select('id, name, color, semester_id, user_id, created_at, units(id, name, order_index, subject_id, created_at, topics(id, name, full_description, status, last_studied, next_review, created_at, unit_id))')
        .eq('semester_id', semester.id),
      supabase
        .from('academic_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', today)
        .lte('date', format(addDays(referenceDate, 14), 'yyyy-MM-dd'))
        .order('date'),
      supabase.from('user_config').select('*').eq('user_id', user.id).single(),
      supabase.from('class_schedule').select('day_of_week, subject_id').eq('user_id', user.id).eq('is_active', true),
      supabase
        .from('class_logs')
        .select('subject_id, date, topics_covered_json, understanding_level')
        .eq('user_id', user.id)
        .gte('date', format(subDays(referenceDate, 14), 'yyyy-MM-dd'))
        .order('date', { ascending: false }),
    ])

    const subjectsWithDetails: SubjectWithDetails[] = ((subjects as any[]) || []).map(s => ({
      ...s,
      upcoming_events: [],
      units: (s.units || [])
        .sort((a: any, b: any) => a.order_index - b.order_index)
        .map((u: any) => ({ ...u, topics: u.topics || [] })),
    }))

    const academicEvents = (events || []) as AcademicEvent[]
    const classLogBoosts = buildClassLogBoosts((rawClassLogs ?? []) as any[], referenceDate)

    const priorities = calculateStudyPriorities({
      subjects: subjectsWithDetails,
      academic_events: academicEvents,
      reference_date: referenceDate,
      class_log_boosts: classLogBoosts,
    })

    const workDays: number[] = (userConfig as any)?.work_days_json || []
    const classDays = new Set((classSchedule || []).map((c: any) => c.day_of_week))

    // Build 7-day context for the prompt (starting today or tomorrow depending on time)
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(planStartDate, i)
      const dateStr = format(d, 'yyyy-MM-dd')
      const dow = d.getDay()
      const dayEvents = academicEvents.filter(e => e.date === dateStr)
      const hasWork = workDays.includes(dow)
      const hasClass = classDays.has(dow)
      const hasExam = dayEvents.some(e => ['parcial', 'parcial_intermedio'].includes(e.type))
      return { date: dateStr, dow, hasWork, hasClass, hasExam, events: dayEvents }
    })

    // Build study priority context
    const prioritySummary = priorities.slice(0, 5).map(p => ({
      subject: p.subject_name,
      priority: p.priority,
      days_to_event: p.days_to_event,
      event_type: p.event_type,
      weak_topics: p.recommended_topics.slice(0, 3).map(t => t.name),
    }))

    // Upcoming important dates within the 14-day window (including beyond the 7-day plan)
    const allUpcomingEvents = academicEvents.filter(e =>
      ['parcial', 'parcial_intermedio', 'entrega_tp', 'recuperatorio'].includes(e.type)
    )
    const upcomingEventsStr = allUpcomingEvents.length > 0
      ? allUpcomingEvents.map(e => {
          const daysUntil = differenceInDays(parseISO(e.date), planStartDate)
          return `  - ${e.date} (en ${daysUntil} día${daysUntil !== 1 ? 's' : ''}): ${e.title} [${e.type}]`
        }).join('\n')
      : '  (ninguna)'

    const prompt = `Sos un planificador académico. Generá un plan de estudio para los próximos 7 días en JSON.

CONTEXTO:
- Fecha inicio del plan: ${format(planStartDate, 'yyyy-MM-dd')}
- Materias con prioridad: ${JSON.stringify(prioritySummary)}
- Días con trabajo: ${weekDays.filter(d => d.hasWork).map(d => d.date).join(', ') || 'ninguno'}
- Días con clase universitaria: ${weekDays.filter(d => d.hasClass).map(d => d.date).join(', ') || 'ninguno'}

FECHAS IMPORTANTES PRÓXIMAS (incluyendo más allá de los 7 días del plan):
${upcomingEventsStr}

REGLAS:
- En días solo de trabajo: máximo 90 min de estudio, 1-2 materias
- En días solo de clase universitaria: máximo 90 min de estudio, 1-2 materias
- En días con trabajo Y clase: máximo 60 min de estudio, 1 materia
- En días de examen/entrega: 0 min de estudio (día de descanso)
- En días libres (sin trabajo ni clase): hasta 150 min, 2-3 materias
- El día anterior a un parcial o entrega: focus total en esa materia (exam_prep), aunque sea un día de trabajo/clase reducir a 1 materia
- Si hay un parcial o entrega en los próximos 3 días: aumentá la carga de esa materia progresivamente
- "tip" debe ser una frase motivadora corta (máx 8 palabras)
- Distribuí los temas débiles respetando la urgencia de los eventos

Devolvé ÚNICAMENTE este JSON (sin markdown):
{
  "weekly_focus": "una frase de foco de la semana",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "study_goals": [
        {"subject_name": "...", "topics": ["tema1", "tema2"], "minutes": 45}
      ],
      "tip": "frase motivadora"
    }
  ]
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = (message.content[0] as any).text as string
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 422 })
    }

    const aiPlan = JSON.parse(jsonMatch[0]) as {
      weekly_focus: string
      days: Array<{
        date: string
        study_goals: Array<{ subject_name: string; topics: string[]; minutes: number }>
        tip: string
      }>
    }

    const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

    const days: WeeklyDayPlan[] = weekDays.map(wd => {
      const aiDay = aiPlan.days.find(d => d.date === wd.date)
      const totalMinutes = (aiDay?.study_goals || []).reduce((s, g) => s + g.minutes, 0)
      return {
        date: wd.date,
        day_label: DAY_LABELS[wd.dow],
        has_work: wd.hasWork,
        has_class: wd.hasClass,
        academic_events: wd.events.map(e => ({ title: e.title, type: e.type })),
        study_goals: aiDay?.study_goals || [],
        total_study_minutes: totalMinutes,
        tip: aiDay?.tip || '',
      }
    })

    const totalHours = days.reduce((s, d) => s + d.total_study_minutes, 0) / 60

    const result: WeeklyPlanResponse = {
      week_start: format(planStartDate, 'yyyy-MM-dd'),
      days,
      weekly_focus: aiPlan.weekly_focus,
      total_hours: Math.round(totalHours * 10) / 10,
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[weekly-plan]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
