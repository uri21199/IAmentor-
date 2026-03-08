'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, differenceInDays, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import Button from '@/components/ui/Button'
import { getDaysColor } from '@/lib/study-priority'
import type { AcademicEvent } from '@/types'

const SUBJECT_COLORS = [
  '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6',
  '#F59E0B', '#EF4444', '#F97316', '#EC4899', '#14B8A6',
]

interface SubjectItem {
  id: string
  name: string
  color: string
  units: Array<{
    id: string
    topics: Array<{ id: string; status: string }>
  }>
}

interface Props {
  semesterId: string
  semesterName: string
  subjects: SubjectItem[]
  events: AcademicEvent[]
  today: string
  userId: string
}

export default function SubjectsClient({
  semesterId,
  semesterName,
  subjects: initialSubjects,
  events,
  today,
  userId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [subjects, setSubjects] = useState<SubjectItem[]>(initialSubjects)
  const [showNewSubject, setShowNewSubject] = useState(false)
  const [form, setForm] = useState({ name: '', color: '#3B82F6' })
  const [saving, setSaving] = useState(false)

  // ── AI syllabus upload ────────────────────────────────────
  const [syllabus, setSyllabus] = useState<File | null>(null)
  const [parsingSyllabus, setParsingSyllabus] = useState(false)
  const [syllabusResult, setSyllabusResult] = useState<{ units: number; topics: number } | null>(null)

  function getProgress(subject: SubjectItem) {
    const allTopics = subject.units.flatMap(u => u.topics)
    const total = allTopics.length
    if (total === 0) return { total: 0, green: 0, yellow: 0, red: 0, pct: 0 }
    const green  = allTopics.filter(t => t.status === 'green').length
    const yellow = allTopics.filter(t => t.status === 'yellow').length
    const red    = allTopics.filter(t => t.status === 'red').length
    return { total, green, yellow, red, pct: Math.round((green / total) * 100) }
  }

  function getNearestEvent(subjectId: string) {
    return events
      .filter(e => e.subject_id === subjectId && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
  }

  async function createSubject() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('subjects')
        .insert({ semester_id: semesterId, user_id: userId, name: form.name.trim(), color: form.color })
        .select()
        .single()
      if (!error && data) {
        setSubjects(prev =>
          [...prev, { ...data, units: [] }].sort((a, b) => a.name.localeCompare(b.name))
        )

        // ── AI syllabus parse (optional) ──────────────────────
        if (syllabus) {
          if (syllabus.size > 3_000_000) {
            console.warn('Syllabus file too large (max 3MB). Skipping AI parse.')
          } else {
            setParsingSyllabus(true)
            try {
              const fd = new FormData()
              fd.append('file', syllabus)
              fd.append('subject_id', data.id)
              const res = await fetch('/api/ai/parse-syllabus', { method: 'POST', body: fd })
              if (res.ok) {
                const result = await res.json()
                setSyllabusResult(result)
              }
            } finally {
              setParsingSyllabus(false)
            }
          }
        }

        setShowNewSubject(false)
        setSyllabus(null)
        setForm({ name: '', color: '#3B82F6' })
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Materias 📚</h1>
          <p className="text-text-secondary text-sm mt-0.5">{semesterName}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowNewSubject(true)}>
          + Nueva
        </Button>
      </div>

      {/* Subject cards */}
      {subjects.length > 0 ? (
        <div className="space-y-5">
          {subjects.map(subject => {
            const progress      = getProgress(subject)
            const nearestEvent  = getNearestEvent(subject.id)
            const daysToEvent   = nearestEvent
              ? differenceInDays(parseISO(nearestEvent.date), new Date())
              : null

            return (
              <Link key={subject.id} href={`/subjects/${subject.id}`}>
                <Card variant="elevated" className="active:scale-[0.98] transition-transform cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
                      <CardTitle className="line-clamp-1">{subject.name}</CardTitle>
                    </div>
                    {nearestEvent && daysToEvent !== null && (
                      <Badge variant={
                        getDaysColor(daysToEvent) === 'red'   ? 'danger'  :
                        getDaysColor(daysToEvent) === 'amber' ? 'warning' : 'success'
                      }>
                        {nearestEvent.type === 'parcial' ? '📝' :
                         nearestEvent.type === 'parcial_intermedio' ? '📋' : '📄'}{' '}
                        {daysToEvent === 0 ? 'Hoy' : `${daysToEvent}d`}
                      </Badge>
                    )}
                  </CardHeader>

                  <ProgressBar value={progress.pct} color="green" size="sm" className="mb-3" />

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
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📖</p>
          <p className="text-text-secondary text-sm">No hay materias cargadas</p>
          <p className="text-xs text-text-secondary mt-1 mb-5">
            Agregá tu primera materia para empezar a organizar tu cursada
          </p>
          <Button variant="primary" size="md" onClick={() => setShowNewSubject(true)}>
            + Agregar primera materia
          </Button>
        </div>
      )}

      {/* ── New Subject Modal ──────────────────────────────────── */}
      {showNewSubject && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">📚 Nueva materia</h3>
              <button
                onClick={() => setShowNewSubject(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-secondary mb-1.5">Nombre de la materia</p>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && createSubject()}
                  placeholder="Ej: Cálculo I, Anatomía, Algoritmos..."
                  autoFocus
                  className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60"
                />
              </div>

              <div>
                <p className="text-xs text-text-secondary mb-2">Color identificador</p>
                <div className="flex gap-2 flex-wrap">
                  {SUBJECT_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setForm(p => ({ ...p, color }))}
                      className={`w-9 h-9 rounded-full border-2 transition-all ${
                        form.color === color
                          ? 'border-white scale-110 shadow-lg'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {/* Preview */}
                <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-surface-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: form.color }} />
                  <span className="text-sm text-text-primary">{form.name || 'Nombre de la materia'}</span>
                </div>
              </div>

              {/* ── AI syllabus upload (optional) ───────────────── */}
              <div>
                <p className="text-xs text-text-secondary mb-1.5">Temario con IA <span className="text-primary/60">(opcional)</span></p>
                <label className="flex items-center gap-2 p-3 rounded-2xl border border-dashed border-border-subtle bg-surface-2 cursor-pointer hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={e => {
                      setSyllabus(e.target.files?.[0] ?? null)
                      setSyllabusResult(null)
                    }}
                    className="hidden"
                  />
                  {syllabus ? (
                    <span className="text-sm text-text-primary truncate">📎 {syllabus.name}</span>
                  ) : (
                    <span className="text-sm text-text-secondary">📤 Subir programa/syllabus (imagen o PDF)</span>
                  )}
                </label>
                {syllabusResult && (
                  <p className="text-xs text-green-400 mt-1.5">
                    ✅ {syllabusResult.units} unidades y {syllabusResult.topics} temas importados
                  </p>
                )}
                {syllabus && syllabus.size > 3_000_000 && (
                  <p className="text-xs text-red-400 mt-1.5">⚠️ Archivo demasiado grande (máx 3MB)</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button variant="secondary" className="flex-1" onClick={() => setShowNewSubject(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={createSubject}
                loading={saving || parsingSyllabus}
                disabled={!form.name.trim() || (syllabus !== null && syllabus.size > 3_000_000)}
              >
                {parsingSyllabus ? '⏳ Importando temario...' : 'Crear materia'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
