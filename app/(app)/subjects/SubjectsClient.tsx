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
      {/* Page header — semester badge + new button */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-2 border border-border-subtle text-xs text-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {semesterName}
        </span>
        <button
          onClick={() => setShowNewSubject(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-primary text-white text-sm font-medium active:scale-95 transition-transform"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nueva
        </button>
      </div>

      {/* Subject cards */}
      {subjects.length > 0 ? (
        <div className="space-y-3">
          {subjects.map(subject => {
            const progress      = getProgress(subject)
            const nearestEvent  = getNearestEvent(subject.id)
            const daysToEvent   = nearestEvent
              ? differenceInDays(parseISO(nearestEvent.date), new Date())
              : null

            return (
              <Link key={subject.id} href={`/subjects/${subject.id}`}>
                <div className="flex rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden active:scale-[0.98] transition-transform cursor-pointer">
                  {/* Left color accent */}
                  <div className="w-1 shrink-0 rounded-l-3xl" style={{ backgroundColor: subject.color }} />

                  <div className="flex-1 p-4 min-w-0">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{subject.name}</p>
                        {progress.total > 0 && (
                          <span className="text-xs text-text-secondary shrink-0">{progress.total} temas</span>
                        )}
                      </div>
                      {nearestEvent && daysToEvent !== null && (
                        <Badge variant={
                          getDaysColor(daysToEvent) === 'red'   ? 'danger'  :
                          getDaysColor(daysToEvent) === 'amber' ? 'warning' : 'success'
                        }>
                          {daysToEvent === 0 ? 'Hoy' : `${daysToEvent}d`}
                        </Badge>
                      )}
                    </div>

                    {/* Progress bar */}
                    <ProgressBar value={progress.pct} color="green" size="sm" className="mb-2.5" />

                    {/* Stats row */}
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <span className="text-text-secondary">{progress.green}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-text-secondary">{progress.yellow}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <span className="text-text-secondary">{progress.red}</span>
                      </div>
                      <span className="ml-auto text-text-secondary font-medium" style={{ color: subject.color }}>
                        {progress.pct}%
                      </span>
                    </div>

                    {/* Next event footer */}
                    {nearestEvent && (
                      <div className="mt-3 pt-3 border-t border-border-subtle flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-xs text-text-secondary truncate">
                          {nearestEvent.title}
                          <span className="text-text-primary ml-1">{format(parseISO(nearestEvent.date), 'dd/MM')}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-3xl bg-surface-2 border border-border-subtle p-10 text-center">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text-primary mb-1">Sin materias cargadas</p>
          <p className="text-xs text-text-secondary mb-5">
            Agregá tu primera materia para empezar a organizar tu cursada
          </p>
          <Button variant="primary" size="md" onClick={() => setShowNewSubject(true)}>
            Agregar primera materia
          </Button>
        </div>
      )}

      {/* ── New Subject Modal ──────────────────────────────────── */}
      {showNewSubject && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
              <h3 className="text-base font-semibold text-text-primary">Nueva materia</h3>
              <button
                onClick={() => setShowNewSubject(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Name field */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && createSubject()}
                    placeholder="Nombre de la materia"
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary focus:outline-none"
                  />
                </div>
              </div>

              {/* Color picker */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle px-4 py-3">
                <p className="text-xs text-text-secondary mb-2.5">Color identificador</p>
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
                <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-xl bg-surface border border-border-subtle">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: form.color }} />
                  <span className="text-sm text-text-primary truncate">{form.name || 'Nombre de la materia'}</span>
                </div>
              </div>

              {/* AI syllabus upload */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <label className="flex-1 flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-text-secondary">
                      {syllabus ? syllabus.name : 'Temario con IA'}
                    </span>
                    <span className="text-xs text-primary font-medium">
                      {syllabus ? 'Cambiar' : 'Subir PDF'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={e => {
                        setSyllabus(e.target.files?.[0] ?? null)
                        setSyllabusResult(null)
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
                {syllabusResult && (
                  <div className="px-4 pb-3 -mt-1">
                    <p className="text-xs text-green-400">
                      {syllabusResult.units} unidades y {syllabusResult.topics} temas importados
                    </p>
                  </div>
                )}
                {syllabus && syllabus.size > 3_000_000 && (
                  <div className="px-4 pb-3 -mt-1">
                    <p className="text-xs text-red-400">Archivo demasiado grande (max 3MB)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
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
                {parsingSyllabus ? 'Importando...' : 'Crear materia'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
