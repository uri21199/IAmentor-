'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import type { Grade, AcademicEvent, Subject, AcademicEventType, GradeType } from '@/types'
import { EVENT_TYPE_LABELS, GRADEABLE_EVENT_TYPES } from '@/lib/constants'
import { useToast } from '@/lib/toast-context'

// Only these event types can receive a grade
const GRADEABLE_TYPES: AcademicEventType[] = GRADEABLE_EVENT_TYPES

const GRADE_LABELS: Record<string, string> = {
  parcial: 'Parcial',
  parcial_intermedio: 'Parcial Int.',
  tp: 'TP',
  final: 'Final',
  laboratorio: 'Lab',
}

interface Props {
  grades: Grade[]
  subjects: Subject[]
  events: AcademicEvent[]
  today: string
  userId: string
}

export default function GradesClient({ grades: initialGrades, subjects, events, today, userId }: Props) {
  const supabase = createClient()
  const { addToast } = useToast()

  const [localGrades, setLocalGrades] = useState<Grade[]>(initialGrades)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Modal state — 3 steps: subject → event → score
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'subject' | 'event' | 'score'>('subject')
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<AcademicEvent | null>(null)
  const [score, setScore] = useState('')
  const [recoveryDate, setRecoveryDate] = useState('')
  const [saving, setSaving] = useState(false)

  function openModal() {
    setStep(subjects.length === 1 ? 'event' : 'subject')
    setSelectedSubject(subjects.length === 1 ? subjects[0] : null)
    setSelectedEvent(null)
    setScore('')
    setRecoveryDate('')
    setOpen(true)
  }

  function closeModal() {
    setOpen(false)
  }

  // Only gradeable event types — medico/personal are excluded
  const gradeableEvents = events.filter(e => GRADEABLE_TYPES.includes(e.type))

  // Events for the selected subject shown first, then the rest
  const availableEvents = selectedSubject
    ? [
        ...gradeableEvents.filter(e => e.subject_id === selectedSubject.id),
        ...gradeableEvents.filter(e => e.subject_id !== selectedSubject.id),
      ]
    : gradeableEvents

  async function handleSave() {
    if (!selectedSubject || !selectedEvent || saving) return
    setSaving(true)
    try {
      const parsedScore = score !== '' ? parseFloat(score) : null
      if (parsedScore !== null && (parsedScore < 0 || parsedScore > 10)) {
        setSaving(false)
        return
      }
      const gradeType: GradeType =
        selectedEvent.type === 'entrega_tp'
          ? 'tp'
          : selectedEvent.type === 'recuperatorio'
          ? 'parcial'
          : (selectedEvent.type as GradeType)

      const existingGrade = localGrades.find(g => g.event_id === selectedEvent.id)

      if (existingGrade) {
        // Update existing grade
        const res = await fetch(`/api/grades/${existingGrade.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: parsedScore, grade_type: gradeType }),
        })
        if (res.ok) {
          const updated = await res.json()
          setLocalGrades(prev => prev.map(g => g.id === existingGrade.id ? updated : g))
        }
      } else {
        // Create new grade
        const res = await fetch('/api/grades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject_id: selectedSubject.id,
            event_id: selectedEvent.id,
            title: selectedEvent.title,
            grade_type: gradeType,
            score: parsedScore,
            max_score: 10,
            notes: null,
            exam_date: selectedEvent.date,
          }),
        })
        if (res.ok) {
          const newGrade = await res.json()
          setLocalGrades(prev => [newGrade, ...prev])
        }
      }

      // Create recuperatorio event if failed
      if (parsedScore !== null && parsedScore < 4 && recoveryDate) {
        await supabase.from('academic_events').insert({
          user_id: userId,
          subject_id: selectedSubject.id,
          type: 'recuperatorio' as AcademicEventType,
          title: `Recuperatorio — ${selectedEvent.title}`,
          date: recoveryDate,
          notes: null,
        })
      }

      addToast({ type: 'success', message: 'Calificación guardada' })
      closeModal()
    } catch {
      addToast({ type: 'error', message: 'No se pudo guardar la calificación. Intentá de nuevo.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(gradeId: string) {
    setDeletingId(gradeId)
    try {
      const res = await fetch(`/api/grades/${gradeId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setLocalGrades(prev => prev.filter(g => g.id !== gradeId))
    } catch {
      addToast({ type: 'error', message: 'No se pudo eliminar la calificación.' })
    } finally {
      setDeletingId(null)
    }
  }

  // Group grades by subject
  const gradesBySubject = subjects
    .map(s => ({
      subject: s,
      grades: localGrades.filter(g => g.subject_id === s.id),
    }))
    .filter(g => g.grades.length > 0)

  const scoreColor = (score: number | null, max: number) => {
    if (score === null) return ''
    const pct = (score / max) * 100
    return pct >= 60 ? 'text-green-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'
  }

  // Show "Registrar" button whenever there are subjects with gradeable events
  const hasUngradedEvents = subjects.length > 0 && gradeableEvents.length > 0

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-text-primary">Calificaciones</h1>
          {hasUngradedEvents && (
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 px-3 h-9 rounded-2xl bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Registrar
            </button>
          )}
        </div>

        {/* Content */}
        {gradesBySubject.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-3xl bg-surface-2 border border-border-subtle flex items-center justify-center">
              <svg className="w-8 h-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">Sin calificaciones</p>
              <p className="text-xs text-text-secondary mt-1">
                {hasUngradedEvents
                  ? 'Registrá una nota usando el botón de arriba.'
                  : 'Cargá fechas importantes en tus materias para poder registrar calificaciones.'}
              </p>
            </div>
            {hasUngradedEvents && (
              <button
                onClick={openModal}
                className="px-5 h-11 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Registrar calificación
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {gradesBySubject.map(({ subject, grades }) => (
              <div key={subject.id}>
                {/* Subject header */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: subject.color }}
                  />
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider truncate">
                    {subject.name}
                  </p>
                </div>

                {/* Grades list */}
                <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
                  {grades.map((grade, i) => {
                    const isLast = i === grades.length - 1
                    return (
                      <div
                        key={grade.id}
                        className={`flex items-center gap-3 px-4 py-3.5 ${!isLast ? 'border-b border-border-subtle' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{grade.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-text-secondary bg-surface px-2 py-0.5 rounded-full border border-border-subtle">
                              {GRADE_LABELS[grade.grade_type] ?? grade.grade_type}
                            </span>
                            {grade.exam_date && (
                              <span className="text-[10px] text-text-secondary">
                                {format(parseISO(grade.exam_date), "d MMM", { locale: es })}
                              </span>
                            )}
                          </div>
                        </div>

                        {grade.score !== null ? (
                          <div className="text-right shrink-0">
                            <span className={`text-lg font-bold ${scoreColor(grade.score, grade.max_score)}`}>
                              {grade.score}
                            </span>
                            <span className="text-xs text-text-secondary">/{grade.max_score}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-text-secondary shrink-0">Sin nota</span>
                        )}

                        <button
                          onClick={() => handleDelete(grade.id)}
                          disabled={deletingId === grade.id}
                          className="w-8 h-8 flex items-center justify-center rounded-full text-text-secondary hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40 shrink-0"
                          title="Eliminar"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
      </div>

      {/* ── Modal ──────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  {step === 'subject' && 'Elegí la materia'}
                  {step === 'event' && 'Elegí el examen'}
                  {step === 'score' && 'Registrar resultado'}
                </h3>
                {step === 'score' && selectedEvent && (
                  <p className="text-xs text-text-secondary mt-0.5 truncate">{selectedEvent.title}</p>
                )}
              </div>
              <button
                onClick={closeModal}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step: subject */}
            {step === 'subject' && (
              <div className="px-5 py-3 space-y-1.5 max-h-72 overflow-y-auto">
                {subjects.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedSubject(s)
                      setStep('event')
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-sm font-medium text-text-primary flex-1 truncate">{s.name}</span>
                    <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Step: event */}
            {step === 'event' && (
              <div className="px-5 py-3 max-h-80 overflow-y-auto">
                {availableEvents.length === 0 ? (
                  <p className="text-sm text-text-secondary text-center py-6">
                    No hay fechas importantes cargadas.
                  </p>
                ) : (() => {
                  const subjectEvents = availableEvents.filter(e => e.subject_id === selectedSubject?.id)
                  const otherEvents = availableEvents.filter(e => e.subject_id !== selectedSubject?.id)
                  const renderEvent = (e: AcademicEvent) => {
                    const existingGrade = localGrades.find(g => g.event_id === e.id)
                    return (
                      <button
                        key={e.id}
                        onClick={() => {
                          setSelectedEvent(e)
                          setScore(existingGrade?.score != null ? String(existingGrade.score) : '')
                          setStep('score')
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle hover:border-primary/40 hover:bg-primary/5 transition-all text-left mb-1.5"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{e.title}</p>
                          <p className="text-xs text-text-secondary mt-0.5">
                            <span className="mr-1.5">{EVENT_TYPE_LABELS[e.type] ?? e.type}</span>
                            &middot;
                            <span className="ml-1.5">{format(parseISO(e.date), "d 'de' MMMM", { locale: es })}</span>
                          </p>
                        </div>
                        {existingGrade ? (
                          <span className={`text-sm font-bold shrink-0 ${scoreColor(existingGrade.score, existingGrade.max_score)}`}>
                            {existingGrade.score ?? '—'}/{existingGrade.max_score}
                          </span>
                        ) : (
                          <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    )
                  }
                  return (
                    <>
                      {subjectEvents.map(renderEvent)}
                      {otherEvents.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary px-1 pt-2 pb-1">
                            Otras fechas
                          </p>
                          {otherEvents.map(renderEvent)}
                        </>
                      )}
                    </>
                  )
                })()}
              </div>
            )}

            {/* Step: score */}
            {step === 'score' && (
              <div className="px-5 py-4 space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs text-text-secondary">Nota obtenida (opcional)</p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      placeholder="—"
                      min="0"
                      max="10"
                      step="0.25"
                      value={score}
                      onChange={e => {
                        const v = e.target.value
                        if (v === '' || (parseFloat(v) >= 0 && parseFloat(v) <= 10)) setScore(v)
                      }}
                      className="w-24 h-11 px-3 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60 text-center"
                      autoFocus
                    />
                    <span className="text-text-secondary text-sm">/ 10</span>
                  </div>
                </div>

                {/* Recuperatorio — only when failed */}
                {score !== '' && parseFloat(score) < 4 && (
                  <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3 space-y-2">
                    <p className="text-xs font-medium text-red-400">Desaprobado — ¿tenés recuperatorio?</p>
                    <input
                      type="date"
                      value={recoveryDate}
                      onChange={e => setRecoveryDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                    />
                    <p className="text-[11px] text-text-secondary">
                      Si ingresás la fecha se crea automáticamente en tus fechas importantes.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-2 px-5 pb-5 pt-2">
              {step !== 'subject' && (
                <button
                  onClick={() => setStep(step === 'score' ? 'event' : 'subject')}
                  className="h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Atrás
                </button>
              )}
              <button
                onClick={closeModal}
                className={`h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-secondary hover:text-text-primary transition-colors ${step === 'subject' ? 'flex-1' : ''}`}
              >
                Cancelar
              </button>
              {step === 'score' && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 h-11 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
