import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format, differenceInDays, parseISO } from 'date-fns'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { getDaysColor } from '@/lib/study-priority'
import type { Subject, AcademicEvent, Topic } from '@/types'

export default async function SubjectsPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get active semester
  const { data: semester } = await supabase
    .from('semesters')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!semester) {
    return (
      <div className="px-4 pt-6 max-w-lg mx-auto text-center py-20">
        <p className="text-4xl mb-4">📚</p>
        <h2 className="text-xl font-bold text-text-primary mb-2">Sin cuatrimestre activo</h2>
        <p className="text-text-secondary text-sm mb-6">
          Configurá tu cuatrimestre en Ajustes para ver tus materias
        </p>
        <Link href="/settings" className="text-primary text-sm">
          Ir a configuración →
        </Link>
      </div>
    )
  }

  // Get subjects with unit/topic counts
  const { data: subjects } = await supabase
    .from('subjects')
    .select(`
      id, name, color,
      units (
        id,
        topics (id, status)
      )
    `)
    .eq('semester_id', semester.id)
    .order('name')

  // Get upcoming academic events
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: events } = await supabase
    .from('academic_events')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', today)
    .order('date', { ascending: true })

  function getSubjectProgress(subject: any) {
    const allTopics: any[] = subject.units?.flatMap((u: any) => u.topics) || []
    const total = allTopics.length
    if (total === 0) return { total: 0, green: 0, yellow: 0, red: 0, pct: 0 }
    const green  = allTopics.filter(t => t.status === 'green').length
    const yellow = allTopics.filter(t => t.status === 'yellow').length
    const red    = allTopics.filter(t => t.status === 'red').length
    return { total, green, yellow, red, pct: Math.round((green / total) * 100) }
  }

  function getNearestEvent(subjectId: string) {
    return (events || [])
      .filter(e => e.subject_id === subjectId)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Materias 📚</h1>
          <p className="text-text-secondary text-sm mt-0.5">{semester.name}</p>
        </div>
        <Link href="/settings" className="text-text-secondary text-sm hover:text-text-primary transition-colors">
          ⚙️
        </Link>
      </div>

      {/* Subject cards */}
      {(subjects || []).map((subject: any) => {
        const progress = getSubjectProgress(subject)
        const nearestEvent = getNearestEvent(subject.id)
        const daysToEvent = nearestEvent
          ? differenceInDays(parseISO(nearestEvent.date), new Date())
          : null

        return (
          <Link key={subject.id} href={`/subjects/${subject.id}`}>
            <Card variant="elevated" className="active:scale-[0.98] transition-transform cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: subject.color }}
                  />
                  <CardTitle className="line-clamp-1">{subject.name}</CardTitle>
                </div>
                {nearestEvent && daysToEvent !== null && (
                  <Badge variant={
                    getDaysColor(daysToEvent) === 'red' ? 'danger' :
                    getDaysColor(daysToEvent) === 'amber' ? 'warning' : 'success'
                  }>
                    {nearestEvent.type === 'parcial' ? '📝' :
                     nearestEvent.type === 'parcial_intermedio' ? '📋' : '📄'}{' '}
                    {daysToEvent === 0 ? 'Hoy' : `${daysToEvent}d`}
                  </Badge>
                )}
              </CardHeader>

              {/* Progress bar */}
              <ProgressBar value={progress.pct} color="green" size="sm" className="mb-3" />

              {/* Topic status pills */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-text-secondary">{progress.green} dominados</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-text-secondary">{progress.yellow} con dudas</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-text-secondary">{progress.red} pendientes</span>
                </div>
              </div>

              {nearestEvent && (
                <div className="mt-3 pt-3 border-t border-border-subtle">
                  <p className="text-xs text-text-secondary">
                    Próximo: <span className="text-text-primary">{nearestEvent.title}</span>{' '}
                    — {format(parseISO(nearestEvent.date), 'dd/MM')}
                  </p>
                </div>
              )}
            </Card>
          </Link>
        )
      })}

      {subjects?.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📖</p>
          <p className="text-text-secondary text-sm">No hay materias cargadas</p>
          <p className="text-xs text-text-secondary mt-1">
            Ejecutá el SQL de seed en Supabase
          </p>
        </div>
      )}
    </div>
  )
}
