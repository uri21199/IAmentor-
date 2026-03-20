'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

const DAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
]

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEK_DAYS = [1, 2, 3, 4, 5, 6] // Mon–Sat for the weekly view

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export default function CursadaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [activeSemester, setActiveSemester] = useState<any>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    subject_id: '',
    days_of_week: [1] as number[],
    start_time: '08:00',
    end_time: '10:00',
    modality: 'presencial' as 'presencial' | 'virtual',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      // Active semester
      const { data: semRows } = await supabase
        .from('semesters')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
      const activeSem = semRows?.[0] ?? null
      setActiveSemester(activeSem)

      // Subjects
      let subList: any[] = []
      if (activeSem) {
        const { data } = await supabase
          .from('subjects')
          .select('id, name, color')
          .eq('semester_id', activeSem.id)
          .order('name')
        subList = data || []
      } else {
        const { data } = await supabase
          .from('subjects')
          .select('id, name, color')
          .eq('user_id', user.id)
          .order('name')
        subList = data || []
      }
      setSubjects(subList)
      if (subList.length > 0) setForm(f => ({ ...f, subject_id: subList[0].id }))

      // Class schedule
      try {
        const { data } = await supabase
          .from('class_schedule')
          .select('*, subjects(name, color)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('day_of_week')
          .order('start_time')
        setClasses(data || [])
      } catch {
        setClasses([])
      }

      setLoading(false)
    }
    load()
  }, [])

  async function addClass() {
    if (!user || !form.subject_id || form.days_of_week.length === 0) return
    setSaving(true)
    try {
      // Insert one row per selected day
      const rows = form.days_of_week.map(day => ({
        user_id: user.id,
        subject_id: form.subject_id,
        day_of_week: day,
        start_time: form.start_time,
        end_time: form.end_time,
        modality: form.modality,
      }))
      const { data, error } = await supabase
        .from('class_schedule')
        .insert(rows)
        .select('*, subjects(name, color)')
      if (!error && data) {
        setClasses(prev =>
          [...prev, ...data].sort((a, b) =>
            a.day_of_week !== b.day_of_week
              ? a.day_of_week - b.day_of_week
              : a.start_time.localeCompare(b.start_time)
          )
        )
        setShowForm(false)
        setForm({
          subject_id: subjects[0]?.id || '',
          days_of_week: [1],
          start_time: '08:00',
          end_time: '10:00',
          modality: 'presencial',
        })
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteClass(id: string) {
    await supabase.from('class_schedule').update({ is_active: false }).eq('id', id)
    setClasses(prev => prev.filter(c => c.id !== id))
  }

  const totalWeeklyMinutes = classes.reduce((acc, cls) => {
    return acc + (timeToMinutes(cls.end_time) - timeToMinutes(cls.start_time))
  }, 0)
  const totalWeeklyHours = (totalWeeklyMinutes / 60).toFixed(1)

  const subjectIds = [...new Set(classes.map(c => c.subject_id || c.subjects?.id))]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Group classes by day
  const classesByDay = WEEK_DAYS.reduce((acc, day) => {
    acc[day] = classes.filter(c => c.day_of_week === day)
    return acc
  }, {} as Record<number, any[]>)

  const activeDays = WEEK_DAYS.filter(d => classesByDay[d].length > 0)

  return (
    <div className="px-4 pt-5 pb-28 space-y-5 max-w-lg mx-auto md:max-w-2xl md:px-6">

      {/* ── Stats strip ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-surface-2 border border-border-subtle p-3 text-center">
          <p className="text-2xl font-bold text-text-primary">{classes.length}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">clases</p>
        </div>
        <div className="rounded-2xl bg-surface-2 border border-border-subtle p-3 text-center">
          <p className="text-2xl font-bold text-cyan-400">{totalWeeklyHours}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">hs/semana</p>
        </div>
        <div className="rounded-2xl bg-surface-2 border border-border-subtle p-3 text-center">
          <p className="text-2xl font-bold text-violet-400">{subjectIds.length}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">materias</p>
        </div>
      </div>

      {/* ── Semester context ──────────────────────────────────── */}
      {activeSemester ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-border-subtle">
          <span className="text-lg">📚</span>
          <div className="flex-1">
            <p className="text-xs text-text-secondary">Cuatrimestre activo</p>
            <p className="text-sm font-semibold text-text-primary">{activeSemester.name}</p>
          </div>
          <Link href="/cuatrimestres" className="text-xs text-primary hover:underline">
            Cambiar →
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-400">Sin cuatrimestre activo</p>
            <p className="text-xs text-text-secondary">Necesitás uno para asociar materias</p>
          </div>
          <Link href="/cuatrimestres" className="text-xs text-amber-400 hover:underline font-medium">
            Crear →
          </Link>
        </div>
      )}

      {/* ── No subjects warning ───────────────────────────────── */}
      {subjects.length === 0 && (
        <Card variant="bordered">
          <div className="text-center py-4">
            <p className="text-3xl mb-2">📖</p>
            <p className="text-sm font-semibold text-text-primary">Sin materias</p>
            <p className="text-xs text-text-secondary mt-1 mb-3">
              Agregá materias desde la sección Materias para poder cargar clases
            </p>
            <Link href="/subjects">
              <Button variant="secondary" size="sm">Ir a Materias</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* ── Weekly schedule view ──────────────────────────────── */}
      {classes.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary px-1">
            Horario semanal
          </p>
          {activeDays.map(day => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  {DAYS.find(d => d.value === day)?.label}
                </p>
              </div>
              <div className="space-y-2 pl-3 border-l border-border-subtle ml-0.5">
                {classesByDay[day].map(cls => {
                  const color = cls.subjects?.color || '#06B6D4'
                  const durationMin = timeToMinutes(cls.end_time) - timeToMinutes(cls.start_time)
                  const durationHrs = (durationMin / 60).toFixed(1)
                  return (
                    <div
                      key={cls.id}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-surface border border-border-subtle"
                      style={{ borderLeftColor: color + '80', borderLeftWidth: 3 }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {cls.subjects?.name || 'Materia'}
                          </p>
                          <Badge variant={cls.modality === 'presencial' ? 'default' : 'cyan'}>
                            {cls.modality === 'presencial' ? '🏫' : '💻'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-secondary">
                          <span>{cls.start_time} – {cls.end_time}</span>
                          <span className="w-1 h-1 rounded-full bg-text-secondary/40" />
                          <span>{durationHrs}hs</span>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteClass(cls.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-text-secondary hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {classes.length === 0 && subjects.length > 0 && (
        <div className="rounded-3xl bg-surface-2 border border-border-subtle p-10 text-center">
          <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="text-base font-semibold text-text-primary mb-1">Sin clases cargadas</p>
          <p className="text-sm text-text-secondary mb-5">
            Agregá tus clases fijas para que aparezcan automáticamente en tu plan diario
          </p>
          <Button variant="primary" size="md" onClick={() => setShowForm(true)}>
            + Agregar primera clase
          </Button>
        </div>
      )}

      {/* ── Add button ────────────────────────────────────────── */}
      {classes.length > 0 && subjects.length > 0 && (
        <Button
          variant="secondary"
          size="md"
          className="w-full"
          onClick={() => setShowForm(true)}
        >
          + Agregar clase
        </Button>
      )}

      {/* ── Inline add form ───────────────────────────────────── */}
      {showForm && (
        <Card variant="elevated">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-base font-semibold text-text-primary">Nueva clase fija</p>
              <p className="text-xs text-text-secondary mt-0.5">Se repite todas las semanas</p>
            </div>
            <button
              onClick={() => setShowForm(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-surface text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Subject */}
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Materia</p>
              <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto">
                {subjects.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setForm(p => ({ ...p, subject_id: s.id }))}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      form.subject_id === s.id
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border-subtle bg-surface hover:border-border-subtle/60'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-sm text-text-primary">{s.name}</span>
                    {form.subject_id === s.id && (
                      <svg className="w-4 h-4 text-primary ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Day — multi-select */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-text-secondary">Días</p>
                {form.days_of_week.length > 1 && (
                  <span className="text-xs text-primary">{form.days_of_week.length} días seleccionados</span>
                )}
              </div>
              <div className="flex gap-1.5">
                {DAYS.slice(0, 6).map(d => {
                  const selected = form.days_of_week.includes(d.value)
                  return (
                    <button
                      key={d.value}
                      onClick={() =>
                        setForm(p => ({
                          ...p,
                          days_of_week: selected
                            ? p.days_of_week.filter(v => v !== d.value)
                            : [...p.days_of_week, d.value].sort(),
                        }))
                      }
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-all min-h-[40px] ${
                        selected
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border-subtle bg-surface text-text-secondary'
                      }`}
                    >
                      {DAYS_SHORT[d.value]}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-text-secondary mt-1.5">Tocá varios días para clases que se repiten (ej: Martes y Jueves)</p>
            </div>

            {/* Time */}
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-xs font-medium text-text-secondary mb-2">Inicio</p>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                  className="w-full h-11 px-3 rounded-xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60 text-center"
                />
              </div>
              <div className="flex items-end pb-1.5 text-text-secondary font-light">→</div>
              <div className="flex-1">
                <p className="text-xs font-medium text-text-secondary mb-2">Fin</p>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                  className="w-full h-11 px-3 rounded-xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60 text-center"
                />
              </div>
            </div>

            {/* Modality */}
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Modalidad</p>
              <div className="flex gap-2">
                {[
                  { value: 'presencial' as const, label: '🏫 Presencial' },
                  { value: 'virtual' as const, label: '💻 Virtual' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(p => ({ ...p, modality: opt.value }))}
                    className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all min-h-[48px] ${
                      form.modality === opt.value
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-400'
                        : 'border-border-subtle bg-surface text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-5 pt-4 border-t border-border-subtle">
            <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={addClass}
              loading={saving}
              disabled={!form.subject_id || form.days_of_week.length === 0}
            >
              {form.days_of_week.length > 1 ? `Agregar (${form.days_of_week.length} días)` : 'Agregar'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
