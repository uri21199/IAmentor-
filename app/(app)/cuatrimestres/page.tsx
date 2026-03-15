'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { Semester } from '@/types'

function getSemesterProgress(start: string, end: string): number {
  const now = Date.now()
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (now < s) return 0
  if (now > e) return 100
  return Math.round(((now - s) / (e - s)) * 100)
}

function getDaysRemaining(end: string): number {
  const diff = new Date(end).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`
}

function getDurationWeeks(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24 * 7))
}

export default function CuatrimestresPage() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({})
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' })
  const [creating, setCreating] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data } = await supabase
        .from('semesters')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      const semList = data || []
      setSemesters(semList)

      // Subject counts per semester
      if (semList.length > 0) {
        const { data: subjects } = await supabase
          .from('subjects')
          .select('id, semester_id')
          .in('semester_id', semList.map(s => s.id))
        const counts: Record<string, number> = {}
        for (const sub of subjects || []) {
          counts[sub.semester_id] = (counts[sub.semester_id] || 0) + 1
        }
        setSubjectCounts(counts)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function activateSemester(id: string) {
    if (!user) return
    await supabase.from('semesters').update({ is_active: false }).eq('user_id', user.id)
    await supabase.from('semesters').update({ is_active: true }).eq('id', id)
    setSemesters(prev => prev.map(s => ({ ...s, is_active: s.id === id })))
  }

  async function deactivateSemester(id: string) {
    if (!user) return
    await supabase.from('semesters').update({ is_active: false }).eq('id', id)
    setSemesters(prev => prev.map(s => s.id === id ? { ...s, is_active: false } : s))
  }

  async function createSemester() {
    if (!user || !form.name || !form.start_date || !form.end_date) return
    setCreating(true)
    try {
      const { data, error } = await supabase.from('semesters').insert({
        user_id: user.id,
        ...form,
        is_active: false,
      }).select().single()
      if (!error && data) {
        setSemesters(prev => [data, ...prev])
        setShowForm(false)
        setForm({ name: '', start_date: '', end_date: '' })
      }
    } finally {
      setCreating(false)
    }
  }

  const inputClass = 'w-full h-11 px-4 rounded-2xl bg-background border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const activeSemester = semesters.find(s => s.is_active)
  const inactiveSemesters = semesters.filter(s => !s.is_active)
  const displayedInactive = showAll ? inactiveSemesters : inactiveSemesters.slice(0, 3)

  return (
    <div className="px-4 pt-5 pb-28 space-y-5 max-w-lg mx-auto">

      {/* ── Active semester (hero) ────────────────────────────── */}
      {activeSemester ? (() => {
        const progress = getSemesterProgress(activeSemester.start_date, activeSemester.end_date)
        const daysLeft = getDaysRemaining(activeSemester.end_date)
        const weeks = getDurationWeeks(activeSemester.start_date, activeSemester.end_date)
        const subCount = subjectCounts[activeSemester.id] || 0
        return (
          <div className="rounded-3xl bg-primary/10 border border-primary/30 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Activo</span>
                </div>
                <p className="text-xl font-bold text-text-primary">{activeSemester.name}</p>
                <p className="text-sm text-text-secondary mt-1">
                  {formatDate(activeSemester.start_date)} → {formatDate(activeSemester.end_date)}
                </p>
              </div>
              <button
                onClick={() => deactivateSemester(activeSemester.id)}
                className="px-3 py-1.5 rounded-xl bg-primary/20 text-primary text-xs font-semibold border border-primary/40 hover:bg-red-500/15 hover:text-red-400 hover:border-red-400/40 transition-all min-h-[36px]"
                title="Tocar para desactivar"
              >
                ✓ Activo
              </button>
            </div>

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-text-secondary">Progreso del cuatrimestre</span>
                <span className="text-xs font-semibold text-primary">{progress}%</span>
              </div>
              <ProgressBar value={progress} color="primary" size="md" />
              <div className="flex justify-between mt-1.5">
                <span className="text-[11px] text-text-secondary">{weeks} semanas total</span>
                <span className={`text-[11px] font-medium ${daysLeft < 30 ? 'text-amber-400' : 'text-text-secondary'}`}>
                  {daysLeft > 0 ? `${daysLeft} días restantes` : 'Finalizado'}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-3 pt-2 border-t border-primary/20">
              <div className="flex-1 text-center">
                <p className="text-xl font-bold text-text-primary">{subCount}</p>
                <p className="text-[11px] text-text-secondary">materias</p>
              </div>
              <div className="w-px bg-primary/20" />
              <div className="flex-1 text-center">
                <Link href="/subjects" className="block">
                  <p className="text-xs text-primary font-medium">Ver materias →</p>
                </Link>
              </div>
            </div>
          </div>
        )
      })() : (
        <div className="rounded-3xl bg-surface-2 border border-dashed border-border-subtle p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📚</span>
          </div>
          <p className="text-sm font-semibold text-text-primary mb-1">Sin cuatrimestre activo</p>
          <p className="text-xs text-text-secondary">
            Activá uno de los anteriores o creá uno nuevo
          </p>
        </div>
      )}

      {/* ── Create form / button ──────────────────────────────── */}
      {showForm ? (
        <Card variant="elevated">
          <CardTitle className="mb-4">Nuevo cuatrimestre</CardTitle>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1.5">Nombre</p>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: 1er Cuatrimestre 2025"
                className={inputClass}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-xs font-medium text-text-secondary mb-1.5">Inicio</p>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-text-secondary mb-1.5">Fin</p>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            {form.start_date && form.end_date && new Date(form.end_date) > new Date(form.start_date) && (
              <p className="text-xs text-text-secondary px-1">
                Duración: {getDurationWeeks(form.start_date, form.end_date)} semanas
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => { setShowForm(false); setForm({ name: '', start_date: '', end_date: '' }) }}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={createSemester}
                loading={creating}
                disabled={!form.name || !form.start_date || !form.end_date}
              >
                Crear
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Button variant="secondary" size="md" className="w-full" onClick={() => setShowForm(true)}>
          + Nuevo cuatrimestre
        </Button>
      )}

      {/* ── Previous semesters ────────────────────────────────── */}
      {inactiveSemesters.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary px-1">
            Anteriores
          </p>
          {displayedInactive.map(sem => {
            const progress = getSemesterProgress(sem.start_date, sem.end_date)
            const subCount = subjectCounts[sem.id] || 0
            const isFinished = progress === 100
            return (
              <div
                key={sem.id}
                className="flex items-center gap-4 p-4 rounded-2xl bg-surface border border-border-subtle"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-text-primary truncate">{sem.name}</p>
                    {isFinished && (
                      <Badge variant="success">Finalizado</Badge>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {formatDate(sem.start_date)} → {formatDate(sem.end_date)}
                  </p>
                  {subCount > 0 && (
                    <p className="text-xs text-text-secondary mt-0.5">{subCount} materias</p>
                  )}
                </div>
                <button
                  onClick={() => activateSemester(sem.id)}
                  className="px-3 py-1.5 rounded-xl border border-border-subtle text-xs text-text-secondary hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all min-h-[36px] shrink-0"
                >
                  Activar
                </button>
              </div>
            )
          })}

          {inactiveSemesters.length > 3 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="w-full py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              {showAll ? '▲ Ver menos' : `▼ Ver todos (${inactiveSemesters.length})`}
            </button>
          )}
        </div>
      )}

      {/* ── Empty ─────────────────────────────────────────────── */}
      {semesters.length === 0 && !showForm && (
        <div className="rounded-3xl bg-surface-2 border border-border-subtle p-10 text-center">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="text-base font-semibold text-text-primary mb-1">Sin cuatrimestres</p>
          <p className="text-sm text-text-secondary mb-5">Creá tu primer cuatrimestre para organizar tus materias y clases</p>
          <Button variant="primary" size="md" onClick={() => setShowForm(true)}>
            + Crear cuatrimestre
          </Button>
        </div>
      )}
    </div>
  )
}
