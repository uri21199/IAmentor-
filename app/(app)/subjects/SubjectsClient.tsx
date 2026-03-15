'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, differenceInDays, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import Button from '@/components/ui/Button'
import { getDaysColor, getEventTypeLabel } from '@/lib/study-priority'
import type { AcademicEvent, AcademicEventType } from '@/types'

const SUBJECT_COLORS = [
  '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6',
  '#F59E0B', '#EF4444', '#F97316', '#EC4899', '#14B8A6',
]

const DELETE_REASONS = [
  { value: 'mistake',  label: 'Me equivoqué al cargarla' },
  { value: 'dropped',  label: 'Dejé la materia' },
  { value: 'passed',   label: 'Aprobé la materia' },
  { value: 'other',    label: 'Otro motivo' },
]

const EVENT_TYPES: { value: AcademicEventType; label: string }[] = [
  { value: 'parcial',             label: 'Parcial' },
  { value: 'parcial_intermedio',  label: 'Parcial intermedio' },
  { value: 'entrega_tp',          label: 'Entrega TP' },
  { value: 'medico',              label: 'Cita médica' },
  { value: 'personal',            label: 'Personal' },
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
  events: initialEvents,
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

  // ── Options menu (per subject card) ──────────────────────
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // ── Edit subject ──────────────────────────────────────────
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null)
  const [editForm, setEditForm] = useState({ name: '', color: '' })
  const [editSaving, setEditSaving] = useState(false)

  // ── Delete subject ────────────────────────────────────────
  const [deletingSubject, setDeletingSubject] = useState<SubjectItem | null>(null)
  const [deleteReason, setDeleteReason] = useState('mistake')
  const [deleteReasonOther, setDeleteReasonOther] = useState('')
  const [deleteSaving, setDeleteSaving] = useState(false)

  // ── Events (centralized calendar view) ───────────────────
  const [localEvents, setLocalEvents] = useState<AcademicEvent[]>(initialEvents)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editEventForm, setEditEventForm] = useState<{
    type: AcademicEventType; title: string; date: string
  }>({ type: 'parcial', title: '', date: '' })
  const [editEventSaving, setEditEventSaving] = useState(false)
  const [showAllEvents, setShowAllEvents] = useState(false)

  // ── Helpers ───────────────────────────────────────────────
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
    return localEvents
      .filter(e => e.subject_id === subjectId && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
  }

  function getSubjectName(subjectId: string | null) {
    if (!subjectId) return 'Personal'
    return subjects.find(s => s.id === subjectId)?.name ?? 'Materia'
  }

  function getSubjectColor(subjectId: string | null) {
    if (!subjectId) return '#6B7280'
    return subjects.find(s => s.id === subjectId)?.color ?? '#6B7280'
  }

  // ── Create subject ────────────────────────────────────────
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

  // ── Edit subject ──────────────────────────────────────────
  function openEditSubject(subject: SubjectItem) {
    setMenuOpenId(null)
    setEditingSubject(subject)
    setEditForm({ name: subject.name, color: subject.color })
  }

  async function saveEditSubject() {
    if (!editingSubject || !editForm.name.trim()) return
    setEditSaving(true)
    try {
      const { error } = await supabase
        .from('subjects')
        .update({ name: editForm.name.trim(), color: editForm.color })
        .eq('id', editingSubject.id)
      if (!error) {
        setSubjects(prev =>
          prev.map(s =>
            s.id === editingSubject.id
              ? { ...s, name: editForm.name.trim(), color: editForm.color }
              : s
          ).sort((a, b) => a.name.localeCompare(b.name))
        )
        setEditingSubject(null)
        router.refresh()
      }
    } finally {
      setEditSaving(false)
    }
  }

  // ── Delete subject (soft) ─────────────────────────────────
  function openDeleteSubject(subject: SubjectItem) {
    setMenuOpenId(null)
    setDeletingSubject(subject)
    setDeleteReason('mistake')
    setDeleteReasonOther('')
  }

  async function confirmDeleteSubject() {
    if (!deletingSubject) return
    setDeleteSaving(true)
    const finalReason = deleteReason === 'other'
      ? `other:${deleteReasonOther.trim() || 'sin especificar'}`
      : deleteReason
    try {
      const { error } = await supabase
        .from('subjects')
        .update({ deleted_at: new Date().toISOString(), deletion_reason: finalReason })
        .eq('id', deletingSubject.id)
      if (!error) {
        setSubjects(prev => prev.filter(s => s.id !== deletingSubject.id))
        setLocalEvents(prev => prev.filter(e => e.subject_id !== deletingSubject.id))
        setDeletingSubject(null)
        router.refresh()
      }
    } finally {
      setDeleteSaving(false)
    }
  }

  // ── Edit event (from centralized view) ───────────────────
  function openEditEvent(event: AcademicEvent) {
    setEditingEventId(event.id)
    setEditEventForm({ type: event.type, title: event.title, date: event.date })
  }

  async function saveEditEvent() {
    if (!editingEventId) return
    setEditEventSaving(true)
    try {
      const { data, error } = await supabase
        .from('academic_events')
        .update({ type: editEventForm.type, title: editEventForm.title, date: editEventForm.date })
        .eq('id', editingEventId)
        .select()
        .single()
      if (!error && data) {
        setLocalEvents(prev =>
          prev.map(e => e.id === editingEventId ? { ...e, ...data } : e)
            .sort((a, b) => a.date.localeCompare(b.date))
        )
        setEditingEventId(null)
        router.refresh()
      }
    } finally {
      setEditEventSaving(false)
    }
  }

  async function deleteEventFromCalendar(id: string) {
    if (!confirm('¿Eliminar esta fecha importante?')) return
    await supabase.from('academic_events').delete().eq('id', id)
    setLocalEvents(prev => prev.filter(e => e.id !== id))
    router.refresh()
  }

  // ── Computed ──────────────────────────────────────────────
  const upcomingEvents = localEvents.filter(e => e.date >= today)
  const visibleEvents  = showAllEvents ? upcomingEvents : upcomingEvents.slice(0, 4)

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
              ? differenceInDays(parseISO(nearestEvent.date), startOfDay(new Date()))
              : null

            return (
              <div key={subject.id} className="relative">
                {/* Options menu backdrop */}
                {menuOpenId === subject.id && (
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuOpenId(null)}
                  />
                )}

                {/* Dropdown menu — fuera del overflow-hidden, relativo al wrapper externo */}
                {menuOpenId === subject.id && (
                  <div className="absolute right-0 top-12 z-30 min-w-[180px] bg-surface border border-border-subtle rounded-2xl shadow-xl overflow-hidden">
                    <button
                      onClick={() => openEditSubject(subject)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-surface-2 transition-colors text-left"
                    >
                      <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Editar materia
                    </button>
                    <div className="h-px bg-border-subtle mx-3" />
                    <button
                      onClick={() => openDeleteSubject(subject)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Eliminar materia
                    </button>
                  </div>
                )}

                <div className="flex rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
                  {/* Left color accent */}
                  <div className="w-1 shrink-0 rounded-l-3xl" style={{ backgroundColor: subject.color }} />

                  {/* Card content — navigates to detail */}
                  <Link href={`/subjects/${subject.id}`} className="flex-1 p-4 min-w-0 flex gap-3 active:bg-surface transition-colors">
                    {/* Subject avatar */}
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-sm font-bold mt-0.5"
                      style={{ backgroundColor: subject.color + '25', color: subject.color }}
                    >
                      {subject.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
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
                      {progress.total > 0 ? (
                        <>
                          <ProgressBar value={progress.pct} color="green" size="sm" className="mb-2.5" />
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
                            <span className="ml-auto font-medium" style={{ color: subject.color }}>
                              {progress.pct}%
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs font-medium" style={{ color: subject.color }}>
                          + Cargar temario
                        </p>
                      )}

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
                  </Link>

                  {/* Options button */}
                  <div className="flex items-start pt-3 pr-3">
                    <button
                      onClick={e => { e.preventDefault(); setMenuOpenId(menuOpenId === subject.id ? null : subject.id) }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
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

      {/* ── Centralized upcoming events (calendar view) ───────── */}
      {upcomingEvents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary">Próximas fechas</h2>
            <span className="text-xs text-text-secondary">{upcomingEvents.length} evento{upcomingEvents.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {visibleEvents.map(event => {
              const days  = differenceInDays(parseISO(event.date), startOfDay(new Date()))
              const color = getDaysColor(days)
              const subColor = getSubjectColor(event.subject_id)
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-surface border border-border-subtle"
                >
                  {/* Subject color dot */}
                  <div
                    className="w-2 h-full min-h-[36px] rounded-full shrink-0"
                    style={{ backgroundColor: subColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{event.title}</p>
                    <p className="text-xs text-text-secondary">
                      {getSubjectName(event.subject_id)} · {getEventTypeLabel(event.type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="text-right mr-1">
                      <Badge variant={color === 'red' ? 'danger' : color === 'amber' ? 'warning' : 'success'}>
                        {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                      </Badge>
                      <p className="text-xs text-text-secondary mt-1">
                        {format(parseISO(event.date), "d MMM", { locale: es })}
                      </p>
                    </div>
                    <button
                      onClick={() => openEditEvent(event)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
                      title="Editar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteEventFromCalendar(event.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
                      title="Eliminar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {upcomingEvents.length > 4 && (
            <button
              onClick={() => setShowAllEvents(v => !v)}
              className="mt-2 w-full py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              {showAllEvents ? '▲ Ver menos' : `▼ Ver todas (${upcomingEvents.length})`}
            </button>
          )}
        </div>
      )}

      {/* ── New Subject Modal ──────────────────────────────────── */}
      {showNewSubject && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">
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
                      onChange={e => { setSyllabus(e.target.files?.[0] ?? null); setSyllabusResult(null) }}
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

      {/* ── Edit Subject Modal ────────────────────────────────── */}
      {editingSubject && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
              <h3 className="text-base font-semibold text-text-primary">Editar materia</h3>
              <button
                onClick={() => setEditingSubject(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Name */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveEditSubject()}
                    placeholder="Nombre de la materia"
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary focus:outline-none"
                  />
                </div>
              </div>

              {/* Color */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle px-4 py-3">
                <p className="text-xs text-text-secondary mb-2.5">Color identificador</p>
                <div className="flex gap-2 flex-wrap">
                  {SUBJECT_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setEditForm(p => ({ ...p, color }))}
                      className={`w-9 h-9 rounded-full border-2 transition-all ${
                        editForm.color === color
                          ? 'border-white scale-110 shadow-lg'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-xl bg-surface border border-border-subtle">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: editForm.color }} />
                  <span className="text-sm text-text-primary truncate">{editForm.name || 'Nombre de la materia'}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingSubject(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={saveEditSubject}
                loading={editSaving}
                disabled={!editForm.name.trim()}
              >
                Guardar cambios
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Subject Modal ──────────────────────────────── */}
      {deletingSubject && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Eliminar materia</h3>
                <p className="text-xs text-text-secondary mt-0.5">{deletingSubject.name}</p>
              </div>
              <button
                onClick={() => setDeletingSubject(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-text-secondary">
                ¿Por qué eliminás esta materia? Esto nos ayuda a mejorar la app.
              </p>

              {/* Reason selector */}
              <div className="space-y-2">
                {DELETE_REASONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setDeleteReason(r.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                      deleteReason === r.value
                        ? 'border-red-500/50 bg-red-500/10 text-red-300'
                        : 'border-border-subtle bg-surface-2 text-text-secondary hover:border-border-subtle/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      deleteReason === r.value ? 'border-red-400' : 'border-text-secondary/40'
                    }`}>
                      {deleteReason === r.value && <div className="w-2 h-2 rounded-full bg-red-400" />}
                    </div>
                    <span className="text-sm">{r.label}</span>
                  </button>
                ))}
              </div>

              {/* Free text for "other" */}
              {deleteReason === 'other' && (
                <input
                  type="text"
                  value={deleteReasonOther}
                  onChange={e => setDeleteReasonOther(e.target.value)}
                  placeholder="Contanos más (opcional)..."
                  autoFocus
                  className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-red-500/40"
                />
              )}

              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-300">
                  Esta acción es irreversible. Se eliminarán todas las unidades, temas y eventos asociados.
                </p>
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <Button variant="secondary" className="flex-1" onClick={() => setDeletingSubject(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={confirmDeleteSubject}
                loading={deleteSaving}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Event Modal (from calendar view) ────────────── */}
      {editingEventId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
              <h3 className="text-base font-semibold text-text-primary">Editar fecha</h3>
              <button
                onClick={() => setEditingEventId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Title */}
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Título</p>
                <input
                  type="text"
                  value={editEventForm.title}
                  onChange={e => setEditEventForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Ej: Primer parcial"
                  autoFocus
                  className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60"
                />
              </div>

              {/* Date */}
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Fecha</p>
                <input
                  type="date"
                  value={editEventForm.date}
                  onChange={e => setEditEventForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                />
              </div>

              {/* Type */}
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1.5">Tipo</p>
                <div className="grid grid-cols-2 gap-2">
                  {EVENT_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setEditEventForm(p => ({ ...p, type: t.value }))}
                      className={`py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        editEventForm.type === t.value
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border-subtle bg-surface-2 text-text-secondary'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingEventId(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={saveEditEvent}
                loading={editEventSaving}
                disabled={!editEventForm.title.trim() || !editEventForm.date}
              >
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
