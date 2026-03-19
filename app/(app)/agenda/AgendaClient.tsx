'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO, differenceInDays, isToday, isYesterday, isTomorrow, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { getDaysColor } from '@/lib/study-priority'
import { Badge } from '@/components/ui/Badge'
import EditEventModal from '@/components/features/EditEventModal'
import { createClient } from '@/lib/supabase'

interface Event {
  id: string
  title: string
  date: string
  type: string
  notes: string | null
  subject_id?: string
  subjects?: { name: string; color: string } | null
}

interface Subject {
  id: string
  name: string
  color: string
  units?: { id: string; name: string; topics: { id: string; name: string }[] }[]
}

interface Props {
  events: Event[]
  today: string
  subjects?: Subject[]
}

// Parse extra fields stored as JSON in notes
function parseNotes(notes: string | null): { time?: string; aula?: string; topic_ids?: string[]; _notes?: string } {
  if (!notes) return {}
  try {
    const parsed = JSON.parse(notes)
    if (typeof parsed === 'object') return parsed
  } catch {}
  return { _notes: notes }
}

const TYPE_LABELS: Record<string, string> = {
  parcial:            'Parcial',
  parcial_intermedio: 'Parcial Int.',
  entrega_tp:         'Entrega TP',
  medico:             'Turno médico',
  personal:           'Personal',
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  parcial:            { bg: 'bg-red-500/15',    text: 'text-red-300' },
  parcial_intermedio: { bg: 'bg-amber-500/15',  text: 'text-amber-300' },
  entrega_tp:         { bg: 'bg-violet-500/15', text: 'text-violet-300' },
  medico:             { bg: 'bg-cyan-500/15',   text: 'text-cyan-300' },
  personal:           { bg: 'bg-surface-2',     text: 'text-text-secondary' },
}

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isYesterday(d)) return 'Ayer'
  if (isToday(d)) return 'Hoy'
  if (isTomorrow(d)) return 'Mañana'
  return format(d, "EEEE d 'de' MMMM", { locale: es })
}

const ALL_TYPES = [
  { value: '',                   label: 'Todos' },
  { value: 'parcial',            label: 'Parcial' },
  { value: 'parcial_intermedio', label: 'Parcial Int.' },
  { value: 'entrega_tp',         label: 'Entrega TP' },
  { value: 'medico',             label: 'Médico' },
  { value: 'personal',           label: 'Personal' },
]

export default function AgendaClient({ events: initialEvents, today, subjects = [] }: Props) {
  const supabase = createClient()
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  // ── Filters ────────────────────────────────────────────────
  const [filterType, setFilterType] = useState('')
  const [filterSubject, setFilterSubject] = useState('')

  // ── Past events toggle ─────────────────────────────────────
  const [showPast, setShowPast] = useState(false)
  const [pastEvents, setPastEvents] = useState<Event[]>([])
  const [loadingPast, setLoadingPast] = useState(false)

  async function handleTogglePast() {
    if (showPast) { setShowPast(false); return }
    if (pastEvents.length > 0) { setShowPast(true); return }
    setLoadingPast(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const cutoff = format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('academic_events')
        .select('*, subjects(name, color)')
        .eq('user_id', user.id)
        .lt('date', today)
        .gte('date', cutoff)
        .order('date', { ascending: false })
      setPastEvents(data || [])
      setShowPast(true)
    } finally {
      setLoadingPast(false)
    }
  }

  // ── Edit callbacks ─────────────────────────────────────────
  function handleSaved(updated: Event) {
    const newSubject = subjects.find(s => s.id === updated.subject_id)
    const enrich = (e: Event) =>
      e.id === updated.id
        ? { ...e, ...updated, subjects: newSubject ? { name: newSubject.name, color: newSubject.color } : e.subjects }
        : e
    setEvents(prev => prev.map(enrich).sort((a, b) => a.date.localeCompare(b.date)))
    setPastEvents(prev => prev.map(enrich).sort((a, b) => a.date.localeCompare(b.date)))
    setEditingEvent(null)
  }

  function handleDeleted(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id))
    setPastEvents(prev => prev.filter(e => e.id !== id))
    setEditingEvent(null)
  }

  function handleDuplicated(ev: Event) {
    const newSubject = subjects.find(s => s.id === ev.subject_id)
    const newEvent = { ...ev, subjects: newSubject ? { name: newSubject.name, color: newSubject.color } : null }
    if (ev.date >= today) {
      setEvents(prev => [...prev, newEvent].sort((a, b) => a.date.localeCompare(b.date)))
    } else {
      setPastEvents(prev => [...prev, newEvent].sort((a, b) => a.date.localeCompare(b.date)))
    }
  }

  // ── Filtered + grouped events ──────────────────────────────
  const allDisplayEvents = showPast ? [...pastEvents, ...events] : events
  const filteredEvents = allDisplayEvents.filter(ev => {
    if (filterType && ev.type !== filterType) return false
    if (filterSubject && ev.subject_id !== filterSubject) return false
    return true
  })

  const grouped = filteredEvents.reduce<Record<string, Event[]>>((acc, ev) => {
    acc[ev.date] = acc[ev.date] ? [...acc[ev.date], ev] : [ev]
    return acc
  }, {})

  const dates = Object.keys(grouped).sort()

  return (
    <>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-text-primary">Agenda</h1>
        <Link
          href="/calendar"
          className="flex items-center gap-1 text-xs text-primary font-medium"
        >
          Ver calendario
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="space-y-2 mb-4">
        {/* Type chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {ALL_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`shrink-0 px-3 h-7 rounded-full text-xs font-medium border transition-all ${
                filterType === t.value
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-2 text-text-secondary border-border-subtle'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Subject select + past toggle */}
        <div className="flex gap-2 items-center">
          {subjects.length > 0 && (
            <select
              value={filterSubject}
              onChange={e => setFilterSubject(e.target.value)}
              className="flex-1 h-8 px-3 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-primary focus:outline-none appearance-none"
            >
              <option value="">Todas las materias</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleTogglePast}
            disabled={loadingPast}
            className={`shrink-0 h-8 px-3 rounded-xl border text-xs font-medium transition-all disabled:opacity-40 ${
              showPast
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-surface-2 border-border-subtle text-text-secondary'
            }`}
          >
            {loadingPast ? '...' : showPast ? 'Ocultar pasadas' : 'Ver pasadas'}
          </button>
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────── */}
      {dates.length === 0 && (
        <div className="rounded-3xl bg-surface-2 border border-border-subtle p-10 text-center mt-2">
          <div className="w-14 h-14 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-text-primary mb-1">Sin eventos</p>
          <p className="text-xs text-text-secondary">
            {filterType || filterSubject ? 'Ningún evento coincide con los filtros.' : 'Usá el botón + para agregar parciales, TPs o turnos médicos'}
          </p>
        </div>
      )}

      {/* ── Event groups ─────────────────────────────────────── */}
      {dates.length > 0 && (
        <div className="space-y-5">
          {dates.map(date => {
            const dayEvents = grouped[date]
            const days = differenceInDays(parseISO(date), startOfDay(new Date()))
            const isDateToday = date === today

            return (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-baseline gap-2 mb-2">
                  <p className={`text-sm font-bold ${isDateToday ? 'text-primary' : 'text-text-primary'} capitalize`}>
                    {dayLabel(date)}
                  </p>
                  {!isDateToday && (
                    <p className="text-xs text-text-secondary">
                      {format(parseISO(date), 'dd/MM/yyyy')}
                    </p>
                  )}
                  <span className="ml-auto">
                    <Badge variant={
                      days < 0  ? 'default' :
                      days === 0 ? 'warning' :
                      getDaysColor(days) === 'red'   ? 'danger'  :
                      getDaysColor(days) === 'amber'  ? 'warning' : 'success'
                    }>
                      {days < 0
                        ? `Hace ${Math.abs(days)}d`
                        : days === 0 ? 'Hoy'
                        : days === 1 ? 'Mañana'
                        : `${days}d`}
                    </Badge>
                  </span>
                </div>

                {/* Events for this date */}
                <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
                  {dayEvents.map((ev, i) => {
                    const extra  = parseNotes(ev.notes)
                    const tStyle = TYPE_COLORS[ev.type] ?? TYPE_COLORS.personal
                    const isLast = i === dayEvents.length - 1

                    return (
                      <div
                        key={ev.id}
                        onClick={() => setEditingEvent(ev)}
                        className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer active:bg-surface transition-colors ${!isLast ? 'border-b border-border-subtle' : ''}`}
                      >
                        {/* Left accent */}
                        <div className="flex flex-col items-center shrink-0 pt-0.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: ev.subjects?.color || '#6b7280' }}
                          />
                          {!isLast && <div className="w-px flex-1 bg-border-subtle mt-1 min-h-[16px]" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-text-primary leading-tight">{ev.title}</p>
                            <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${tStyle.bg} ${tStyle.text}`}>
                              {TYPE_LABELS[ev.type] ?? ev.type}
                            </span>
                          </div>

                          {/* Metadata row */}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {extra.time && (
                              <span className="flex items-center gap-1 text-xs text-text-secondary">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {extra.time}
                              </span>
                            )}
                            {extra.aula && (
                              <span className="flex items-center gap-1 text-xs text-text-secondary">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {extra.aula}
                              </span>
                            )}
                            {ev.subjects?.name && (
                              <span className="flex items-center gap-1 text-xs text-text-secondary">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                                {ev.subjects.name}
                              </span>
                            )}
                          </div>

                          {/* Topics count */}
                          {extra.topic_ids && extra.topic_ids.length > 0 && (
                            <p className="text-xs text-primary mt-1">{extra.topic_ids.length} tema{extra.topic_ids.length > 1 ? 's' : ''} relacionado{extra.topic_ids.length > 1 ? 's' : ''}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editingEvent && (
        <EditEventModal
          event={editingEvent}
          subjects={subjects}
          onClose={() => setEditingEvent(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onDuplicated={handleDuplicated}
        />
      )}
    </>
  )
}
