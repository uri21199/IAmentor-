'use client'

import { useState } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, addMonths, subMonths, getDay,
  differenceInDays, isToday, startOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { getDaysColor } from '@/lib/study-priority'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import type { AcademicEventType } from '@/types'

interface CalEvent {
  id: string
  title: string
  date: string
  type: string
  notes: string | null
  subject_id?: string | null
  subjects?: { name: string; color: string } | null
}

interface TopicOption  { id: string; name: string }
interface UnitOption   { id: string; name: string; topics: TopicOption[] }
interface SubjectOption { id: string; name: string; color: string; units: UnitOption[] }

interface Props {
  events: CalEvent[]
  today: string
  userId: string
  subjectsData: SubjectOption[]
}

function parseNotes(notes: string | null) {
  if (!notes) return {}
  try { return JSON.parse(notes) } catch { return { _notes: notes } }
}

const TYPE_LABELS: Record<string, string> = {
  parcial:            'Parcial',
  parcial_intermedio: 'Parcial Int.',
  entrega_tp:         'Entrega TP',
  medico:             'Turno médico',
  personal:           'Personal',
}

const EVENT_TYPES: { value: AcademicEventType; label: string }[] = [
  { value: 'parcial',             label: 'Parcial' },
  { value: 'parcial_intermedio',  label: 'Parcial Int.' },
  { value: 'entrega_tp',          label: 'Entrega TP' },
  { value: 'medico',              label: 'Turno médico' },
  { value: 'personal',            label: 'Personal' },
]

const WEEKDAYS = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D']

export default function CalendarClient({ events: initialEvents, today, userId, subjectsData }: Props) {
  const supabase = createClient()

  const [viewDate, setViewDate] = useState(new Date(today))
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date(today))
  const [localEvents, setLocalEvents] = useState<CalEvent[]>(initialEvents)

  // ── Edit modal state ──────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    date: '',
    type: 'parcial' as AcademicEventType,
    time: '',
    aula: '',
    notes: '',
    subjectId: '',
    unitId: '',
    topicIds: [] as string[],
  })
  const [editSaving, setEditSaving] = useState(false)

  // ── Calendar computed ─────────────────────────────────────
  const monthStart = startOfMonth(viewDate)
  const monthEnd   = endOfMonth(viewDate)
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const eventsByDate = localEvents.reduce<Record<string, CalEvent[]>>((acc, ev) => {
    acc[ev.date] = acc[ev.date] ? [...acc[ev.date], ev] : [ev]
    return acc
  }, {})

  const firstDow      = getDay(monthStart)
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1

  const selectedKey    = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const selectedEvents = selectedKey ? (eventsByDate[selectedKey] || []) : []

  const monthEventCount = days.reduce((sum, d) => {
    return sum + (eventsByDate[format(d, 'yyyy-MM-dd')]?.length ?? 0)
  }, 0)

  // ── Open edit ─────────────────────────────────────────────
  function openEdit(ev: CalEvent) {
    const extra = parseNotes(ev.notes)
    const topicIds: string[] = extra.topic_ids || []
    const subjectId = ev.subject_id || ''
    const isAcademic = ['parcial', 'parcial_intermedio', 'entrega_tp'].includes(ev.type)
    let unitId = ''
    if (isAcademic && subjectId && topicIds.length > 0) {
      const sub = subjectsData.find(s => s.id === subjectId)
      if (sub) {
        for (const unit of sub.units) {
          if (unit.topics.some(t => topicIds.includes(t.id))) {
            unitId = unit.id
            break
          }
        }
      }
    }
    setEditForm({
      title: ev.title,
      date:  ev.date,
      type:  ev.type as AcademicEventType,
      time:  extra.time  || '',
      aula:  extra.aula  || '',
      notes: extra._notes || '',
      subjectId,
      unitId,
      topicIds,
    })
    setEditingId(ev.id)
  }

  // ── Save edit ─────────────────────────────────────────────
  async function saveEdit() {
    if (!editingId) return
    setEditSaving(true)
    try {
      const isAcademic = ['parcial', 'parcial_intermedio', 'entrega_tp'].includes(editForm.type)
      const newNotes   = JSON.stringify({
        time:     editForm.time  || null,
        aula:     editForm.aula  || null,
        topic_ids: editForm.topicIds.length > 0 ? editForm.topicIds : null,
        _notes:   editForm.notes || null,
      })
      const { data, error } = await supabase
        .from('academic_events')
        .update({
          title: editForm.title,
          date: editForm.date,
          type: editForm.type,
          notes: newNotes,
          subject_id: isAcademic ? (editForm.subjectId || null) : null,
        })
        .eq('id', editingId)
        .select('id, title, date, type, notes, subject_id, subjects(name, color)')
        .single()
      if (!error && data) {
        setLocalEvents(prev =>
          prev.map(e => e.id === editingId ? (data as CalEvent) : e)
            .sort((a, b) => a.date.localeCompare(b.date))
        )
        // If the date changed, re-select new date
        if (editForm.date !== selectedKey) {
          setSelectedDate(parseISO(editForm.date))
          setViewDate(parseISO(editForm.date))
        }
        setEditingId(null)
      }
    } finally {
      setEditSaving(false)
    }
  }

  // ── Delete event ──────────────────────────────────────────
  async function deleteEvent(id: string) {
    if (!confirm('¿Eliminar esta fecha importante?')) return
    await supabase.from('academic_events').delete().eq('id', id)
    setLocalEvents(prev => prev.filter(e => e.id !== id))
  }

  // ── Edit modal derived values ──────────────────────────────
  const editIsAcademic   = ['parcial', 'parcial_intermedio', 'entrega_tp'].includes(editForm.type)
  const editSubject      = subjectsData.find(s => s.id === editForm.subjectId)
  const editUnitsWithTopics = editSubject?.units.filter(u => u.topics.length > 0) ?? []
  const editUnit         = editSubject?.units.find(u => u.id === editForm.unitId)

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-text-primary capitalize">
          {format(viewDate, 'MMMM yyyy', { locale: es })}
          {monthEventCount > 0 && (
            <span className="ml-2 text-xs font-medium text-text-secondary">
              {monthEventCount} evento{monthEventCount > 1 ? 's' : ''}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewDate(d => subMonths(d, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-2 border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => { setViewDate(new Date(today)); setSelectedDate(new Date(today)) }}
            className="px-3 h-9 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={() => setViewDate(d => addMonths(d, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-2 border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border-subtle">
          {WEEKDAYS.map(wd => (
            <div key={wd} className="py-2 text-center text-[10px] font-semibold text-text-secondary">
              {wd}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} className="aspect-square" />
          ))}

          {days.map(day => {
            const dateKey   = format(day, 'yyyy-MM-dd')
            const dayEvents = eventsByDate[dateKey] || []
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
            const isTodayDay = isToday(day)
            const hasEvents  = dayEvents.length > 0

            const urgentColor = hasEvents
              ? dayEvents.reduce<string>((worst, ev) => {
                  const d = differenceInDays(parseISO(ev.date), startOfDay(new Date()))
                  const c = getDaysColor(d)
                  if (c === 'red') return 'red'
                  if (c === 'amber' && worst !== 'red') return 'amber'
                  return worst
                }, 'green')
              : null

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(isSelected ? null : day)}
                className={`aspect-square flex flex-col items-center justify-center gap-0.5 relative transition-all ${
                  isSelected
                    ? 'bg-primary text-white rounded-2xl'
                    : isTodayDay
                      ? 'text-primary font-bold'
                      : 'text-text-primary hover:bg-surface'
                }`}
              >
                <span className={`text-xs font-medium ${isTodayDay && !isSelected ? 'text-primary' : ''}`}>
                  {format(day, 'd')}
                </span>
                {hasEvents && (
                  <div className="flex gap-0.5">
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full ${
                          isSelected ? 'bg-white/70' :
                          urgentColor === 'red'   ? 'bg-red-400' :
                          urgentColor === 'amber' ? 'bg-amber-400' :
                          'bg-green-400'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day events */}
      {selectedDate && (
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <p className={`text-sm font-bold ${isToday(selectedDate) ? 'text-primary' : 'text-text-primary'} capitalize`}>
              {isToday(selectedDate)
                ? 'Hoy'
                : format(selectedDate, "EEEE d 'De' MMMM", { locale: es })}
            </p>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="rounded-3xl bg-surface-2 border border-border-subtle px-4 py-5 text-center">
              <p className="text-xs text-text-secondary">Sin eventos este día</p>
            </div>
          ) : (
            <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
              {selectedEvents.map((ev, i) => {
                const extra  = parseNotes(ev.notes)
                const days   = differenceInDays(parseISO(ev.date), startOfDay(new Date()))
                const isLast = i === selectedEvents.length - 1

                return (
                  <div
                    key={ev.id}
                    className={`flex items-start gap-3 px-4 py-3.5 ${!isLast ? 'border-b border-border-subtle' : ''}`}
                  >
                    {/* Color dot */}
                    <div
                      className="w-3 h-3 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: ev.subjects?.color || '#6b7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-text-primary leading-tight">{ev.title}</p>
                        <Badge variant={days <= 0 ? 'danger' : days <= 7 ? 'warning' : 'success'}>
                          {days <= 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-text-secondary bg-surface px-2 py-0.5 rounded-full border border-border-subtle">
                          {TYPE_LABELS[ev.type] ?? ev.type}
                        </span>
                        {extra.time && (
                          <span className="text-xs text-text-secondary flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {extra.time}
                          </span>
                        )}
                        {extra.aula && (
                          <span className="text-xs text-text-secondary flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {extra.aula}
                          </span>
                        )}
                        {ev.subjects?.name && (
                          <span className="text-xs text-text-secondary">{ev.subjects.name}</span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() => openEdit(ev)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
                        title="Editar"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteEvent(ev.id)}
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
          )}
        </div>
      )}

      {/* ── Edit Event Modal ──────────────────────────────────── */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
              <h3 className="text-base font-semibold text-text-primary">Editar evento</h3>
              <button
                onClick={() => setEditingId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {/* Title + type group */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Título del evento"
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <select
                    value={editForm.type}
                    onChange={e => {
                      const t = e.target.value as AcademicEventType
                      const academic = ['parcial', 'parcial_intermedio', 'entrega_tp'].includes(t)
                      setEditForm(p => ({ ...p, type: t, subjectId: academic ? p.subjectId : '', unitId: academic ? p.unitId : '', topicIds: academic ? p.topicIds : [] }))
                    }}
                    className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                  >
                    {EVENT_TYPES.map(et => (
                      <option key={et.value} value={et.value}>{et.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date + time + aula */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="text-sm text-text-secondary w-12 shrink-0">Fecha</span>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))}
                    className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-text-secondary w-12 shrink-0">Hora</span>
                  <input
                    type="time"
                    value={editForm.time}
                    onChange={e => setEditForm(p => ({ ...p, time: e.target.value }))}
                    className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-text-secondary w-12 shrink-0">Aula</span>
                  <input
                    type="text"
                    value={editForm.aula}
                    onChange={e => setEditForm(p => ({ ...p, aula: e.target.value }))}
                    placeholder="Ej: Aula 3, SUM B"
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary text-right focus:outline-none"
                  />
                </div>
              </div>

              {/* Subject (academic only) */}
              {editIsAcademic && subjectsData.length > 0 && (
                <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <select
                      value={editForm.subjectId}
                      onChange={e => setEditForm(p => ({ ...p, subjectId: e.target.value, unitId: '', topicIds: [] }))}
                      className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                    >
                      <option value="">Materia (opcional)</option>
                      {subjectsData.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Unit selector */}
              {editIsAcademic && editForm.subjectId && editUnitsWithTopics.length > 0 && (
                <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <select
                      value={editForm.unitId}
                      onChange={e => setEditForm(p => ({ ...p, unitId: e.target.value, topicIds: [] }))}
                      className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                    >
                      <option value="">Unidad (opcional)</option>
                      {editUnitsWithTopics.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Topics */}
              {editUnit && editUnit.topics.length > 0 && (
                <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                    <p className="text-xs font-medium text-text-secondary">Temas del parcial</p>
                    {editForm.topicIds.length > 0 && (
                      <span className="text-xs text-primary font-medium">{editForm.topicIds.length} seleccionado{editForm.topicIds.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    {editUnit.topics.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setEditForm(p => ({
                          ...p,
                          topicIds: p.topicIds.includes(t.id) ? p.topicIds.filter(id => id !== t.id) : [...p.topicIds, t.id],
                        }))}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                          editForm.topicIds.includes(t.id)
                            ? 'border-primary bg-primary/20 text-text-primary'
                            : 'border-border-subtle bg-surface text-text-secondary'
                        }`}
                      >
                        {editForm.topicIds.includes(t.id) ? '✓ ' : ''}{t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                  <textarea
                    value={editForm.notes}
                    onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Notas adicionales (opcional)"
                    rows={2}
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5 shrink-0">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingId(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={saveEdit}
                loading={editSaving}
                disabled={!editForm.title.trim() || !editForm.date}
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
