'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO, differenceInDays } from 'date-fns'
import { createClient } from '@/lib/supabase'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { TopicPill } from '@/components/ui/TopicPill'
import Button from '@/components/ui/Button'
import { EmojiSelector, UNDERSTANDING_OPTIONS } from '@/components/ui/EmojiSelector'
import { getDaysColor, getEventTypeLabel } from '@/lib/study-priority'
import type { SubjectWithDetails, AcademicEvent, Topic, TopicStatus, AcademicEventType } from '@/types'

interface Props {
  subject: SubjectWithDetails
  events: AcademicEvent[]
  classLogs: any[]
  today: string
  userId: string
}

export default function SubjectDetailClient({ subject, events, classLogs, today, userId }: Props) {
  const supabase = createClient()

  // Local state for topic statuses (optimistic updates)
  const [unitTopics, setUnitTopics] = useState<Record<string, Topic[]>>(
    Object.fromEntries(subject.units.map(u => [u.id, u.topics]))
  )

  // Class log modal
  const [showClassLog, setShowClassLog] = useState(false)
  const [classLogData, setClassLogData] = useState({
    understanding_level: 3,
    has_homework: false,
    homework_description: '',
    notes: '',
  })
  const [logLoading, setLogLoading] = useState(false)

  // Event modal
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventData, setEventData] = useState({
    type: 'parcial' as AcademicEventType,
    title: '',
    date: '',
    notes: '',
  })
  const [eventLoading, setEventLoading] = useState(false)
  const [localEvents, setLocalEvents] = useState<AcademicEvent[]>(events)

  async function handleTopicStatusChange(topicId: string, status: TopicStatus) {
    // Optimistic update
    setUnitTopics(prev => {
      const next = { ...prev }
      for (const unitId in next) {
        next[unitId] = next[unitId].map(t =>
          t.id === topicId ? { ...t, status } : t
        )
      }
      return next
    })

    await supabase
      .from('topics')
      .update({ status, last_studied: new Date().toISOString() })
      .eq('id', topicId)
  }

  async function saveClassLog() {
    setLogLoading(true)
    try {
      const { error } = await supabase.from('class_logs').insert({
        user_id: userId,
        subject_id: subject.id,
        date: today,
        topics_covered_json: [],
        understanding_level: classLogData.understanding_level,
        has_homework: classLogData.has_homework,
        homework_description: classLogData.has_homework ? classLogData.homework_description : null,
      })
      if (!error) setShowClassLog(false)
    } catch (err) {
      console.error(err)
    } finally {
      setLogLoading(false)
    }
  }

  async function saveEvent() {
    setEventLoading(true)
    try {
      const { data, error } = await supabase.from('academic_events').insert({
        subject_id: subject.id,
        user_id: userId,
        ...eventData,
      }).select().single()
      if (!error && data) {
        setLocalEvents(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
        setShowEventForm(false)
        setEventData({ type: 'parcial', title: '', date: '', notes: '' })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setEventLoading(false)
    }
  }

  // Calculate overall progress
  const allTopics = Object.values(unitTopics).flat()
  const total = allTopics.length
  const greenCount = allTopics.filter(t => t.status === 'green').length
  const pct = total > 0 ? Math.round((greenCount / total) * 100) : 0

  const upcomingEvents = localEvents.filter(e => e.date >= today)

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/subjects" className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors">
          ←
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
            <h1 className="text-lg font-bold text-text-primary truncate">{subject.name}</h1>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">{total} temas · {pct}% dominados</p>
        </div>
      </div>

      {/* Overall progress */}
      <Card variant="elevated">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-secondary">Progreso general</span>
          <span className="text-sm font-semibold text-text-primary">{pct}%</span>
        </div>
        <ProgressBar value={pct} color="green" size="md" />
        <div className="flex gap-4 mt-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-text-secondary">{greenCount} dominados</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-text-secondary">{allTopics.filter(t => t.status === 'yellow').length} con dudas</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-text-secondary">{allTopics.filter(t => t.status === 'red').length} a estudiar</span>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" size="md" className="flex-1" onClick={() => setShowClassLog(true)}>
          📝 Post-clase
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => setShowEventForm(true)}>
          📅 Agregar fecha
        </Button>
      </div>

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-2">Fechas importantes</h2>
          <div className="space-y-2">
            {upcomingEvents.map(event => {
              const days = differenceInDays(parseISO(event.date), new Date())
              const color = getDaysColor(days)
              return (
                <div key={event.id} className="flex items-center gap-3 p-3 rounded-2xl bg-surface border border-border-subtle">
                  <div className={`w-2 h-2 rounded-full ${color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{event.title}</p>
                    <p className="text-xs text-text-secondary">{getEventTypeLabel(event.type)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant={color === 'red' ? 'danger' : color === 'amber' ? 'warning' : 'success'}>
                      {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                    </Badge>
                    <p className="text-xs text-text-secondary mt-1">{format(parseISO(event.date), 'dd/MM')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Units and topics */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">Temario</h2>
        <p className="text-xs text-text-secondary -mt-2">Tocá un tema para cambiar su estado → 🔴 → 🟡 → 🟢</p>

        {subject.units.map(unit => (
          <div key={unit.id}>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {unit.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {(unitTopics[unit.id] || []).map(topic => (
                <TopicPill
                  key={topic.id}
                  topic={topic}
                  onStatusChange={handleTopicStatusChange}
                  compact
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Class log modal */}
      {showClassLog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">📝 Registro post-clase</h3>
              <button onClick={() => setShowClassLog(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">✕</button>
            </div>

            <EmojiSelector
              label="¿Cómo fue la comprensión en clase?"
              options={UNDERSTANDING_OPTIONS}
              value={classLogData.understanding_level}
              onChange={v => setClassLogData(d => ({ ...d, understanding_level: v }))}
            />

            <div className="mt-4 space-y-2">
              <p className="text-sm text-text-secondary">¿Hay tarea o trabajo práctico?</p>
              <div className="flex gap-3">
                {[true, false].map(v => (
                  <button
                    key={String(v)}
                    onClick={() => setClassLogData(d => ({ ...d, has_homework: v }))}
                    className={`flex-1 py-2.5 rounded-2xl border text-sm transition-all min-h-[44px] ${
                      classLogData.has_homework === v
                        ? 'border-primary bg-primary/20 text-text-primary'
                        : 'border-border-subtle bg-surface-2 text-text-secondary'
                    }`}
                  >
                    {v ? '✅ Sí' : '❌ No'}
                  </button>
                ))}
              </div>

              {classLogData.has_homework && (
                <textarea
                  value={classLogData.homework_description}
                  onChange={e => setClassLogData(d => ({ ...d, homework_description: e.target.value }))}
                  placeholder="Describí la tarea..."
                  className="w-full h-20 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none focus:border-primary/60"
                />
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setShowClassLog(false)}>Cancelar</Button>
              <Button variant="primary" className="flex-1" onClick={saveClassLog} loading={logLoading}>Guardar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Event form modal */}
      {showEventForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">📅 Nueva fecha importante</h3>
              <button onClick={() => setShowEventForm(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm text-text-secondary mb-1.5">Tipo</p>
                <div className="flex gap-2">
                  {([
                    { value: 'parcial', label: '📝 Parcial' },
                    { value: 'parcial_intermedio', label: '📋 Parcial Int.' },
                    { value: 'entrega_tp', label: '📄 Entrega TP' },
                  ] as { value: AcademicEventType; label: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setEventData(d => ({ ...d, type: opt.value }))}
                      className={`flex-1 py-2.5 rounded-xl border text-xs transition-all min-h-[44px] ${
                        eventData.type === opt.value
                          ? 'border-primary bg-primary/20 text-text-primary'
                          : 'border-border-subtle bg-surface-2 text-text-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={eventData.title}
                onChange={e => setEventData(d => ({ ...d, title: e.target.value }))}
                placeholder="Título (ej: Primer Parcial)"
                className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60"
              />

              <input
                type="date"
                value={eventData.date}
                onChange={e => setEventData(d => ({ ...d, date: e.target.value }))}
                className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
              />

              <textarea
                value={eventData.notes}
                onChange={e => setEventData(d => ({ ...d, notes: e.target.value }))}
                placeholder="Notas opcionales..."
                className="w-full h-16 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none focus:border-primary/60"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setShowEventForm(false)}>Cancelar</Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={saveEvent}
                loading={eventLoading}
                disabled={!eventData.title || !eventData.date}
              >
                Guardar fecha
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
