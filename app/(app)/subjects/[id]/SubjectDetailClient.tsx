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

  // ── Topic statuses (optimistic updates) ───────────────────
  const [unitTopics, setUnitTopics] = useState<Record<string, Topic[]>>(
    Object.fromEntries(subject.units.map(u => [u.id, u.topics]))
  )

  // ── Local units list (for adding new units without page reload) ──
  const [localUnits, setLocalUnits] = useState<Array<{ id: string; name: string; order_index: number }>>(
    subject.units.map(u => ({ id: u.id, name: u.name, order_index: u.order_index }))
  )

  // ── Add unit ──────────────────────────────────────────────
  const [showAddUnit, setShowAddUnit] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [addingUnit, setAddingUnit] = useState(false)

  // ── Add topic ─────────────────────────────────────────────
  const [addingTopicForUnit, setAddingTopicForUnit] = useState<string | null>(null)
  const [newTopicName, setNewTopicName] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)

  // ── Class log modal ───────────────────────────────────────
  const [showClassLog, setShowClassLog] = useState(false)
  const [classLogData, setClassLogData] = useState({
    understanding_level: 3,
    has_homework: false,
    homework_description: '',
    topics_covered: [] as string[], // topic IDs seen in class
  })
  const [logLoading, setLogLoading] = useState(false)

  // ── Quick-add topic from within the post-clase modal ──────
  const [quickAddUnitId, setQuickAddUnitId] = useState<string | null>(null)
  const [quickTopicName, setQuickTopicName] = useState('')
  const [quickAdding, setQuickAdding] = useState(false)

  // ── Event modal ───────────────────────────────────────────
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventData, setEventData] = useState({
    type: 'parcial' as AcademicEventType,
    title: '',
    date: '',
    notes: '',
  })
  const [eventLoading, setEventLoading] = useState(false)
  const [localEvents, setLocalEvents] = useState<AcademicEvent[]>(events)

  // ── Topic status change ───────────────────────────────────
  async function handleTopicStatusChange(topicId: string, status: TopicStatus) {
    setUnitTopics(prev => {
      const next = { ...prev }
      for (const unitId in next) {
        next[unitId] = next[unitId].map(t => t.id === topicId ? { ...t, status } : t)
      }
      return next
    })
    await supabase
      .from('topics')
      .update({ status, last_studied: new Date().toISOString() })
      .eq('id', topicId)
  }

  // ── Add unit ──────────────────────────────────────────────
  async function addUnit() {
    if (!newUnitName.trim()) return
    setAddingUnit(true)
    try {
      const maxOrder = localUnits.reduce((m, u) => Math.max(m, u.order_index), -1)
      const { data, error } = await supabase
        .from('units')
        .insert({ subject_id: subject.id, name: newUnitName.trim(), order_index: maxOrder + 1 })
        .select()
        .single()
      if (!error && data) {
        setLocalUnits(prev => [...prev, { id: data.id, name: data.name, order_index: data.order_index }])
        setUnitTopics(prev => ({ ...prev, [data.id]: [] }))
        setNewUnitName('')
        setShowAddUnit(false)
      }
    } finally {
      setAddingUnit(false)
    }
  }

  // ── Add topic ─────────────────────────────────────────────
  async function addTopic(unitId: string) {
    if (!newTopicName.trim()) return
    setAddingTopic(true)
    try {
      const { data, error } = await supabase
        .from('topics')
        .insert({ unit_id: unitId, name: newTopicName.trim(), full_description: '', status: 'red' })
        .select()
        .single()
      if (!error && data) {
        setUnitTopics(prev => ({ ...prev, [unitId]: [...(prev[unitId] || []), data] }))
        setNewTopicName('')
        setAddingTopicForUnit(null)
      }
    } finally {
      setAddingTopic(false)
    }
  }

  // ── Quick-add topic from post-clase modal ─────────────────
  async function quickAddTopic(unitId: string) {
    if (!quickTopicName.trim()) return
    setQuickAdding(true)
    try {
      const { data, error } = await supabase
        .from('topics')
        .insert({ unit_id: unitId, name: quickTopicName.trim(), full_description: '', status: 'yellow' })
        .select()
        .single()
      if (!error && data) {
        setUnitTopics(prev => ({ ...prev, [unitId]: [...(prev[unitId] || []), data] }))
        // Auto-select the newly created topic
        setClassLogData(d => ({ ...d, topics_covered: [...d.topics_covered, data.id] }))
        setQuickTopicName('')
        setQuickAddUnitId(null)
      }
    } finally {
      setQuickAdding(false)
    }
  }

  function toggleTopicCovered(topicId: string) {
    setClassLogData(d => ({
      ...d,
      topics_covered: d.topics_covered.includes(topicId)
        ? d.topics_covered.filter(id => id !== topicId)
        : [...d.topics_covered, topicId],
    }))
  }

  // ── Class log ─────────────────────────────────────────────
  async function saveClassLog() {
    setLogLoading(true)
    try {
      const { error } = await supabase.from('class_logs').insert({
        user_id: userId,
        subject_id: subject.id,
        date: today,
        topics_covered_json: classLogData.topics_covered,
        understanding_level: classLogData.understanding_level,
        has_homework: classLogData.has_homework,
        homework_description: classLogData.has_homework ? classLogData.homework_description : null,
      })
      if (!error) {
        // Auto-promote covered topics from 'red' → 'yellow' (seen in class = at least partially known)
        const redCoveredIds = classLogData.topics_covered.filter(id => {
          for (const topics of Object.values(unitTopics)) {
            const t = topics.find(t => t.id === id)
            if (t && t.status === 'red') return true
          }
          return false
        })
        if (redCoveredIds.length > 0) {
          await supabase
            .from('topics')
            .update({ status: 'yellow', last_studied: new Date().toISOString() })
            .in('id', redCoveredIds)
          setUnitTopics(prev => {
            const next = { ...prev }
            for (const unitId in next) {
              next[unitId] = next[unitId].map(t =>
                redCoveredIds.includes(t.id) ? { ...t, status: 'yellow' as TopicStatus } : t
              )
            }
            return next
          })
        }
        setShowClassLog(false)
        setClassLogData({ understanding_level: 3, has_homework: false, homework_description: '', topics_covered: [] })
      }
    } finally {
      setLogLoading(false)
    }
  }

  // ── Academic event ────────────────────────────────────────
  async function saveEvent() {
    setEventLoading(true)
    try {
      const { data, error } = await supabase
        .from('academic_events')
        .insert({ subject_id: subject.id, user_id: userId, ...eventData })
        .select()
        .single()
      if (!error && data) {
        setLocalEvents(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
        setShowEventForm(false)
        setEventData({ type: 'parcial', title: '', date: '', notes: '' })
      }
    } finally {
      setEventLoading(false)
    }
  }

  // ── Computed stats ────────────────────────────────────────
  const allTopics    = Object.values(unitTopics).flat()
  const total        = allTopics.length
  const greenCount   = allTopics.filter(t => t.status === 'green').length
  const pct          = total > 0 ? Math.round((greenCount / total) * 100) : 0
  const upcomingEvts = localEvents.filter(e => e.date >= today)

  // ── Shared input classes ──────────────────────────────────
  const inlineInput = 'flex-1 h-9 px-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60'
  const modalInput  = 'w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60'

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/subjects"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
        >
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
      {upcomingEvts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-2">Fechas importantes</h2>
          <div className="space-y-2">
            {upcomingEvts.map(event => {
              const days  = differenceInDays(parseISO(event.date), new Date())
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

      {/* ── Temario (units + topics) ──────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Temario</h2>
          {total > 0 && (
            <p className="text-xs text-text-secondary">Tocá un tema → 🔴 → 🟡 → 🟢</p>
          )}
        </div>

        {localUnits.length === 0 && (
          <p className="text-xs text-text-secondary text-center py-4">
            Aún no hay unidades. Agregá la primera para empezar a organizar los temas.
          </p>
        )}

        {localUnits.map(unit => (
          <div key={unit.id}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {unit.name}
              </p>
              <button
                onClick={() => { setAddingTopicForUnit(unit.id); setNewTopicName('') }}
                className="text-xs text-primary hover:text-primary/80 transition-colors px-1 min-h-[28px]"
              >
                + Tema
              </button>
            </div>

            {addingTopicForUnit === unit.id && (
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newTopicName}
                  onChange={e => setNewTopicName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addTopic(unit.id)
                    if (e.key === 'Escape') { setAddingTopicForUnit(null); setNewTopicName('') }
                  }}
                  placeholder="Nombre del tema (ej: Proteínas, Recursividad…)"
                  autoFocus
                  className={inlineInput}
                />
                <button
                  onClick={() => addTopic(unit.id)}
                  disabled={!newTopicName.trim() || addingTopic}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-40"
                >
                  {addingTopic ? '…' : '✓'}
                </button>
                <button
                  onClick={() => { setAddingTopicForUnit(null); setNewTopicName('') }}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-2 text-text-secondary"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(unitTopics[unit.id] || []).map(topic => (
                <TopicPill key={topic.id} topic={topic} onStatusChange={handleTopicStatusChange} compact />
              ))}
              {(unitTopics[unit.id] || []).length === 0 && addingTopicForUnit !== unit.id && (
                <p className="text-xs text-text-secondary italic">Sin temas — usá "+ Tema" para agregar</p>
              )}
            </div>
          </div>
        ))}

        {showAddUnit ? (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newUnitName}
              onChange={e => setNewUnitName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addUnit()
                if (e.key === 'Escape') { setShowAddUnit(false); setNewUnitName('') }
              }}
              placeholder="Nombre de la unidad (ej: Unidad 1 — Introducción)"
              autoFocus
              className={inlineInput}
            />
            <button
              onClick={addUnit}
              disabled={!newUnitName.trim() || addingUnit}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-40"
            >
              {addingUnit ? '…' : '✓'}
            </button>
            <button
              onClick={() => { setShowAddUnit(false); setNewUnitName('') }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-2 text-text-secondary"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddUnit(true)}
            className="w-full py-3 rounded-xl border border-dashed border-border-subtle text-text-secondary text-sm hover:border-primary/50 hover:text-primary transition-colors"
          >
            + Agregar unidad
          </button>
        )}
      </div>

      {/* ── Class log modal ──────────────────────────────────── */}
      {showClassLog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-t-3xl shadow-2xl max-h-[88dvh] overflow-y-auto">
            <div className="p-5 pb-28">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-text-primary">📝 Registro post-clase</h3>
                <button
                  onClick={() => setShowClassLog(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
                >
                  ✕
                </button>
              </div>

              {/* ── Topics covered section ─────────────────────────── */}
              <div className="mb-5">
                <p className="text-sm font-medium text-text-primary mb-2">Temas vistos en clase</p>

                {allTopics.length === 0 ? (
                  /* No topics at all — guide user */
                  <div className="p-3 rounded-2xl bg-surface-2 border border-border-subtle">
                    <p className="text-xs text-text-secondary mb-2">
                      Aún no hay temas en el temario. Podés agregar uno ahora:
                    </p>
                    {localUnits.length > 0 ? (
                      quickAddUnitId === null ? (
                        <button
                          onClick={() => setQuickAddUnitId(localUnits[0].id)}
                          className="text-xs text-primary hover:text-primary/80"
                        >
                          + Agregar primer tema
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={quickTopicName}
                            onChange={e => setQuickTopicName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') quickAddTopic(quickAddUnitId) }}
                            placeholder="Nombre del tema..."
                            autoFocus
                            className="flex-1 h-9 px-3 rounded-xl bg-background border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60"
                          />
                          <button
                            onClick={() => quickAddTopic(quickAddUnitId)}
                            disabled={!quickTopicName.trim() || quickAdding}
                            className="px-3 h-9 rounded-xl bg-primary text-white text-xs disabled:opacity-40"
                          >
                            {quickAdding ? '…' : '✓'}
                          </button>
                        </div>
                      )
                    ) : (
                      <p className="text-xs text-text-secondary italic">
                        Primero creá unidades en el temario.
                      </p>
                    )}
                  </div>
                ) : (
                  /* Topics grouped by unit */
                  <div className="space-y-4">
                    {localUnits.map(unit => {
                      const topics = unitTopics[unit.id] || []
                      return (
                        <div key={unit.id}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                              {unit.name}
                            </p>
                            {/* Quick add topic within modal */}
                            {quickAddUnitId === unit.id ? (
                              <div className="flex gap-1 items-center">
                                <input
                                  type="text"
                                  value={quickTopicName}
                                  onChange={e => setQuickTopicName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') quickAddTopic(unit.id)
                                    if (e.key === 'Escape') { setQuickAddUnitId(null); setQuickTopicName('') }
                                  }}
                                  placeholder="Nuevo tema..."
                                  autoFocus
                                  className="w-32 h-7 px-2 rounded-lg bg-background border border-border-subtle text-xs text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60"
                                />
                                <button
                                  onClick={() => quickAddTopic(unit.id)}
                                  disabled={!quickTopicName.trim() || quickAdding}
                                  className="h-7 px-2 rounded-lg bg-primary text-white text-xs disabled:opacity-40"
                                >
                                  {quickAdding ? '…' : '✓'}
                                </button>
                                <button
                                  onClick={() => { setQuickAddUnitId(null); setQuickTopicName('') }}
                                  className="h-7 w-7 flex items-center justify-center rounded-lg bg-surface-2 text-text-secondary text-xs"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setQuickAddUnitId(unit.id); setQuickTopicName('') }}
                                className="text-xs text-primary hover:text-primary/80 transition-colors"
                              >
                                + tema nuevo
                              </button>
                            )}
                          </div>

                          {topics.length === 0 ? (
                            <p className="text-xs text-text-secondary italic">Sin temas en esta unidad</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {topics.map(topic => {
                                const selected = classLogData.topics_covered.includes(topic.id)
                                return (
                                  <button
                                    key={topic.id}
                                    onClick={() => toggleTopicCovered(topic.id)}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all min-h-[32px] ${
                                      selected
                                        ? 'border-primary bg-primary/20 text-text-primary'
                                        : 'border-border-subtle bg-surface-2 text-text-secondary'
                                    }`}
                                  >
                                    {selected ? '✓ ' : ''}{topic.name}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {classLogData.topics_covered.length > 0 && (
                      <p className="text-xs text-primary">
                        ✓ {classLogData.topics_covered.length} tema{classLogData.topics_covered.length !== 1 ? 's' : ''} seleccionado{classLogData.topics_covered.length !== 1 ? 's' : ''}
                        {' '}— se marcarán como 🟡 vistos automáticamente
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Understanding level */}
              <EmojiSelector
                label="¿Cómo fue la comprensión en clase?"
                options={UNDERSTANDING_OPTIONS}
                value={classLogData.understanding_level}
                onChange={v => setClassLogData(d => ({ ...d, understanding_level: v }))}
              />

              {/* Homework */}
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-text-secondary">¿Hay tarea o trabajo práctico?</p>
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

              <div className="flex gap-3 mt-5">
                <Button variant="secondary" className="flex-1" onClick={() => setShowClassLog(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" className="flex-1" onClick={saveClassLog} loading={logLoading}>
                  Guardar registro
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Event form modal ─────────────────────────────────── */}
      {showEventForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">📅 Nueva fecha importante</h3>
              <button
                onClick={() => setShowEventForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                ✕
              </button>
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
                className={modalInput}
              />

              <input
                type="date"
                value={eventData.date}
                onChange={e => setEventData(d => ({ ...d, date: e.target.value }))}
                className={modalInput}
              />

              <textarea
                value={eventData.notes}
                onChange={e => setEventData(d => ({ ...d, notes: e.target.value }))}
                placeholder="Notas opcionales..."
                className="w-full h-16 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none focus:border-primary/60"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setShowEventForm(false)}>
                Cancelar
              </Button>
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
