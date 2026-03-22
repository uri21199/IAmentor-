'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TopicOption { id: string; name: string }
interface UnitOption  { id: string; name: string; topics: TopicOption[] }

interface EventData {
  id: string
  title: string
  date: string
  type: string
  notes: string | null
  subject_id?: string
}

interface Subject {
  id: string
  name: string
  color: string
  units?: UnitOption[]
}

interface Props {
  event: EventData
  subjects: Subject[]
  onClose: () => void
  onSaved: (updated: EventData) => void
  onDeleted: (id: string) => void
  onDuplicated?: (ev: EventData) => void
}

const EVENT_TYPES = [
  { value: 'parcial',            label: 'Parcial' },
  { value: 'parcial_intermedio', label: 'Parcial Int.' },
  { value: 'entrega_tp',         label: 'Entrega TP' },
  { value: 'medico',             label: 'Turno médico' },
  { value: 'personal',           label: 'Personal' },
]

const ACADEMIC_TYPES = ['parcial', 'parcial_intermedio', 'entrega_tp']

function parseNotes(notes: string | null): { time?: string; aula?: string; topic_ids?: string[]; _notes?: string } {
  if (!notes) return {}
  try {
    const parsed = JSON.parse(notes)
    if (typeof parsed === 'object') return parsed
  } catch {}
  return { _notes: notes }
}

function buildNotes(extra: { time?: string; aula?: string; topic_ids?: string[] }): string | null {
  const obj: Record<string, unknown> = {}
  if (extra.time)  obj.time  = extra.time
  if (extra.aula)  obj.aula  = extra.aula
  if (extra.topic_ids && extra.topic_ids.length > 0) obj.topic_ids = extra.topic_ids
  if (Object.keys(obj).length === 0) return null
  return JSON.stringify(obj)
}

export default function EditEventModal({ event, subjects, onClose, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const extra    = parseNotes(event.notes)

  const [title,  setTitle]   = useState(event.title)
  const [date,   setDate]    = useState(event.date)
  const [type,   setType]    = useState(event.type)
  const [subjectId, setSubjectId] = useState(event.subject_id || '')
  const [time,   setTime]    = useState(extra.time  || '')
  const [aula,   setAula]    = useState(extra.aula  || '')
  const [topicIds, setTopicIds] = useState<string[]>(() =>
    Array.isArray(extra.topic_ids) ? extra.topic_ids : []
  )
  const [openUnitId, setOpenUnitId] = useState<string | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const[localUnits, setLocalUnits] = useState<UnitOption[]>(() =>
    subjects.find(s => s.id === (event.subject_id || ''))?.units ?? []
  )
  const [addingTopicForUnit, setAddingTopicForUnit] = useState<string | null>(null)
  const [newTopicName, setNewTopicName] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)

  // ── Derived ───────────────────────────────────────────────
  const isAcademic      = ACADEMIC_TYPES.includes(type)
  const unitsWithTopics = localUnits
  const initialTopicIds = Array.isArray(extra.topic_ids) ? extra.topic_ids : []
  const isDirty =
    title !== event.title ||
    date  !== event.date  ||
    type  !== event.type  ||
    subjectId !== (event.subject_id || '') ||
    time !== (extra.time || '') ||
    aula !== (extra.aula || '') ||
    topicIds.length !== initialTopicIds.length ||
    !topicIds.every(id => initialTopicIds.includes(id))

  // ── Handlers ──────────────────────────────────────────────
  function handleClose() {
    if (isDirty) setConfirmClose(true)
    else onClose()
  }

  function handleSubjectChange(id: string) {
    setSubjectId(id)
    setTopicIds([])
    setOpenUnitId(null)
    setLocalUnits(subjects.find(s => s.id === id)?.units ?? [])
    setAddingTopicForUnit(null)
    setNewTopicName('')
  }

  async function handleAddTopic(unitId: string) {
    const name = newTopicName.trim()
    if (!name) return
    setAddingTopic(true)
    try {
      const { data, error } = await supabase
        .from('topics')
        .insert({ unit_id: unitId, name, status: 'pendiente' })
        .select('id, name')
        .single()
      if (error) throw error
      setLocalUnits(prev =>
        prev.map(u => u.id === unitId ? { ...u, topics: [...u.topics, { id: data.id, name: data.name }] } : u)
      )
      setTopicIds(prev => [...prev, data.id])
      setNewTopicName('')
      setAddingTopicForUnit(null)
    } catch (err) {
      console.error(err)
    } finally {
      setAddingTopic(false)
    }
  }

  function handleTypeChange(newType: string) {
    setType(newType)
    if (!ACADEMIC_TYPES.includes(newType)) {
      setTopicIds([])
      setOpenUnitId(null)
    }
  }

  function toggleTopic(id: string) {
    setTopicIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function toggleUnitAll(unit: UnitOption) {
    const ids      = unit.topics.map(t => t.id)
    const allSel   = ids.every(id => topicIds.includes(id))
    if (allSel) {
      setTopicIds(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setTopicIds(prev => prev.concat(ids.filter(id => !prev.includes(id))))
    }
  }

  async function handleSave() {
    if (!title.trim() || !date) return
    setSaving(true)
    try {
      const notes = buildNotes({
        time:      time  || undefined,
        aula:      aula  || undefined,
        topic_ids: topicIds.length > 0 ? topicIds : undefined,
      })
      const { error } = await supabase
        .from('academic_events')
        .update({ title: title.trim(), date, type, subject_id: subjectId || null, notes })
        .eq('id', event.id)
      if (error) throw error
      onSaved({ ...event, title: title.trim(), date, type, subject_id: subjectId || undefined, notes })
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const { error } = await supabase.from('academic_events').delete().eq('id', event.id)
      if (error) throw error
      onDeleted(event.id)
    } catch (err) {
      console.error(err)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-6 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col relative">

        {/* Unsaved changes confirmation overlay */}
        {confirmClose && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/90 backdrop-blur-sm rounded-3xl p-8">
            <div className="text-center w-full max-w-xs">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-text-primary mb-1">¿Descartar cambios?</p>
              <p className="text-xs text-text-secondary mb-5">Los cambios no guardados se perderán.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="flex-1 py-2.5 rounded-2xl border border-border-subtle text-sm text-text-secondary"
                >
                  Seguir editando
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-sm text-red-400 font-medium"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
          <h3 className="text-base font-semibold text-text-primary">Editar evento</h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary text-sm"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary font-medium">Título</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
                         text-text-primary text-sm focus:outline-none focus:border-primary/60"
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary font-medium">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
                         text-text-primary text-sm focus:outline-none focus:border-primary/60"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary font-medium">Tipo</label>
            <select
              value={type}
              onChange={e => handleTypeChange(e.target.value)}
              className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
                         text-text-primary text-sm focus:outline-none focus:border-primary/60 appearance-none"
            >
              {EVENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          {subjects.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary font-medium">Materia</label>
              <select
                value={subjectId}
                onChange={e => handleSubjectChange(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
                           text-text-primary text-sm focus:outline-none focus:border-primary/60 appearance-none"
              >
                <option value="">Sin materia</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Unit + Topic accordion — academic events with a subject that has units */}
          {isAcademic && subjectId && unitsWithTopics.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary font-medium">Temas del evento</label>
                {topicIds.length > 0 && (
                  <span className="text-xs text-primary font-medium">
                    {topicIds.length} seleccionado{topicIds.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="rounded-2xl border border-border-subtle overflow-hidden divide-y divide-border-subtle">
                {unitsWithTopics.map(unit => {
                  const isOpen       = openUnitId === unit.id
                  const selInUnit    = unit.topics.filter(t => topicIds.includes(t.id)).length
                  const allSelected  = selInUnit === unit.topics.length

                  return (
                    <div key={unit.id} className="bg-surface-2">
                      {/* Unit header */}
                      <button
                        type="button"
                        onClick={() => setOpenUnitId(isOpen ? null : unit.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <span className="text-sm text-text-primary font-medium truncate pr-2">{unit.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {selInUnit > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                              {selInUnit}/{unit.topics.length}
                            </span>
                          )}
                          <svg
                            className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Topics (expanded) */}
                      {isOpen && (
                        <div className="px-4 pb-3 bg-surface/40">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-text-secondary">
                              {unit.topics.length} tema{unit.topics.length !== 1 ? 's' : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleUnitAll(unit)}
                              className="text-[10px] font-medium text-primary"
                            >
                              {allSelected ? 'Desmarcar todos' : 'Seleccionar todos'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {unit.topics.map(t => {
                              const sel = topicIds.includes(t.id)
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => toggleTopic(t.id)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                    sel
                                      ? 'border-primary bg-primary/20 text-text-primary'
                                      : 'border-border-subtle bg-surface text-text-secondary'
                                  }`}
                                >
                                  {sel && '✓ '}{t.name}
                                </button>
                              )
                            })}
                          </div>

                          {/* Inline add topic */}
                          {addingTopicForUnit === unit.id ? (
                            <div className="flex items-center gap-1.5 mt-2">
                              <input
                                type="text"
                                value={newTopicName}
                                onChange={e => setNewTopicName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddTopic(unit.id) }}
                                placeholder="Nombre del tema..."
                                autoFocus
                                className="flex-1 h-8 px-3 rounded-xl bg-surface border border-primary/50 text-xs text-text-primary placeholder-text-secondary focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddTopic(unit.id)}
                                disabled={!newTopicName.trim() || addingTopic}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary/20 text-primary text-sm font-bold disabled:opacity-40"
                              >
                                {addingTopic ? '…' : '✓'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setAddingTopicForUnit(null); setNewTopicName('') }}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface text-text-secondary text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAddingTopicForUnit(unit.id)}
                              className="mt-2 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                              Agregar tema
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Time + Aula */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-text-secondary font-medium">Hora (opcional)</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl bg-surface-2 border border-border-subtle
                           text-text-primary text-sm focus:outline-none focus:border-primary/60"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-text-secondary font-medium">Aula (opcional)</label>
              <input
                type="text"
                value={aula}
                onChange={e => setAula(e.target.value)}
                placeholder="Ej: 204"
                className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
                           text-text-primary text-sm placeholder-text-secondary
                           focus:outline-none focus:border-primary/60"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-5 border-t border-border-subtle shrink-0 space-y-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleSave}
            loading={saving}
            disabled={!title.trim() || !date}
          >
            Guardar cambios
          </Button>

          {!confirmDelete ? (
            <div className="flex items-center justify-end px-1">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-red-400 font-medium"
              >
                Eliminar evento
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-2xl border border-border-subtle text-sm text-text-secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-sm text-red-400 font-medium"
              >
                {deleting ? 'Eliminando...' : 'Confirmar eliminación'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
