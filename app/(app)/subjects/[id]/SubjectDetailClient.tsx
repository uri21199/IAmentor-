'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { TopicPill } from '@/components/ui/TopicPill'
import Button from '@/components/ui/Button'
import { getDaysColor, getEventTypeLabel } from '@/lib/study-priority'
import type { SubjectWithDetails, AcademicEvent, Topic, TopicStatus, AcademicEventType } from '@/types'

// How many topics to show before collapsing per unit
const TOPICS_SHOWN_DEFAULT = 4
// How many class logs to show before collapsing
const LOGS_SHOWN_DEFAULT = 3

interface Props {
  subject: SubjectWithDetails
  events: AcademicEvent[]
  classLogs: any[]
  today: string
  userId: string
}

export default function SubjectDetailClient({ subject, events, classLogs, today, userId }: Props) {
  const supabase = createClient()
  const router = useRouter()

  // ── Topic statuses (optimistic updates) ───────────────────
  const [unitTopics, setUnitTopics] = useState<Record<string, Topic[]>>(
    Object.fromEntries(subject.units.map(u => [u.id, u.topics]))
  )

  // ── Local units list (for adding new units without page reload) ──
  const [localUnits, setLocalUnits] = useState<Array<{ id: string; name: string; order_index: number }>>(
    subject.units.map(u => ({ id: u.id, name: u.name, order_index: u.order_index }))
  )

  // ── Class logs (local state for CRUD) ─────────────────────
  const [localClassLogs, setLocalClassLogs] = useState<any[]>(classLogs)
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [showAllLogs, setShowAllLogs] = useState(false)

  // ── Collapsible unit topics ────────────────────────────────
  // true = collapsed (show only TOPICS_SHOWN_DEFAULT), false/missing = expanded
  const [collapsedUnits, setCollapsedUnits] = useState<Record<string, boolean>>(
    Object.fromEntries(
      subject.units.map(u => [u.id, (u.topics?.length ?? 0) > TOPICS_SHOWN_DEFAULT])
    )
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
    due_date: '',
    topics_covered: [] as string[],
  })
  const [logLoading, setLogLoading] = useState(false)

  // ── Quick-add topic from within the post-clase modal ──────
  const [quickAddUnitId, setQuickAddUnitId] = useState<string | null>(null)
  const [quickTopicName, setQuickTopicName] = useState('')
  const [quickAdding, setQuickAdding] = useState(false)

  // ── Event modal (create) ──────────────────────────────────
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventData, setEventData] = useState({
    type: 'parcial' as AcademicEventType,
    title: '',
    date: '',
    notes: '',
  })
  const [eventLoading, setEventLoading] = useState(false)

  // ── Event modal (edit) ────────────────────────────────────
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editEventData, setEditEventData] = useState({
    type: 'parcial' as AcademicEventType,
    title: '',
    date: '',
    notes: '',
  })

  // ── Class log view mode ───────────────────────────────────
  const [viewingLog, setViewingLog] = useState<any | null>(null)

  // ── Topic CRUD ────────────────────────────────────────────
  const [topicActionMenu, setTopicActionMenu] = useState<{ id: string; name: string; unitId: string } | null>(null)
  const [renamingTopic, setRenamingTopic] = useState<{ id: string; name: string; unitId: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [movingTopic, setMovingTopic] = useState<{ id: string; name: string; fromUnitId: string } | null>(null)
  const [topicActionLoading, setTopicActionLoading] = useState(false)

  // ── Collapsible units in class log modal ──────────────────
  const [classLogCollapsed, setClassLogCollapsed] = useState<Record<string, boolean>>({})
  const [editEventLoading, setEditEventLoading] = useState(false)

  // ── Local events state ────────────────────────────────────
  const [localEvents, setLocalEvents] = useState<AcademicEvent[]>(events)

  // ── Events accordion ──────────────────────────────────────
  const [showAllEvents, setShowAllEvents] = useState(false)

  // ── AI syllabus upload ────────────────────────────────────
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null)
  const [parsingSyllabus, setParsingSyllabus] = useState(false)
  const [syllabusResult, setSyllabusResult] = useState<{ units: number; topics: number } | null>(null)

  // ── AI events import ──────────────────────────────────────
  const [eventsFile, setEventsFile] = useState<File | null>(null)
  const [parsingEvents, setParsingEvents] = useState(false)

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
    // Refresh server cache so subject list shows updated progress on back navigation
    router.refresh()
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

  // ── Open class log modal (create or edit) ─────────────────
  function openClassLog(log?: any) {
    if (log) {
      setEditingLogId(log.id)
      setClassLogData({
        understanding_level: log.understanding_level,
        has_homework: log.has_homework,
        homework_description: log.homework_description || '',
        due_date: log.due_date || '',
        topics_covered: log.topics_covered_json || [],
      })
    } else {
      setEditingLogId(null)
      setClassLogData({ understanding_level: 3, has_homework: false, homework_description: '', due_date: '', topics_covered: [] })
    }
    setShowClassLog(true)
  }

  // ── Class log save (create or update) ─────────────────────
  async function saveClassLog() {
    setLogLoading(true)
    try {
      const payload = {
        user_id: userId,
        subject_id: subject.id,
        date: today,
        topics_covered_json: classLogData.topics_covered,
        understanding_level: classLogData.understanding_level,
        has_homework: classLogData.has_homework,
        homework_description: classLogData.has_homework ? classLogData.homework_description : null,
        due_date: classLogData.has_homework && classLogData.due_date ? classLogData.due_date : null,
      }

      if (editingLogId) {
        // UPDATE existing log
        const { data, error } = await supabase
          .from('class_logs')
          .update(payload)
          .eq('id', editingLogId)
          .select()
          .single()
        if (!error && data) {
          setLocalClassLogs(prev => prev.map(l => l.id === editingLogId ? data : l))
        }
      } else {
        // INSERT new log
        const { data, error } = await supabase
          .from('class_logs')
          .insert(payload)
          .select()
          .single()
        if (!error && data) {
          setLocalClassLogs(prev => [data, ...prev])

          // Auto-promote covered topics from 'red' → 'yellow'
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
        }
      }

      // Auto-create academic_event for homework with due_date (new logs only)
      if (classLogData.has_homework && classLogData.due_date && !editingLogId) {
        const { data: newEvent, error: evErr } = await supabase
          .from('academic_events')
          .insert({
            subject_id: subject.id,
            user_id: userId,
            type: 'entrega_tp' as AcademicEventType,
            title: classLogData.homework_description.trim() || 'Entrega TP',
            date: classLogData.due_date,
            notes: null,
          })
          .select()
          .single()
        if (!evErr && newEvent) {
          setLocalEvents(prev => [...prev, newEvent].sort((a, b) => a.date.localeCompare(b.date)))
        }
      }

      setShowClassLog(false)
      setEditingLogId(null)
      setClassLogData({ understanding_level: 3, has_homework: false, homework_description: '', due_date: '', topics_covered: [] })
      router.refresh()
    } finally {
      setLogLoading(false)
    }
  }

  // ── Delete class log ──────────────────────────────────────
  async function deleteClassLog(id: string) {
    await supabase.from('class_logs').delete().eq('id', id)
    setLocalClassLogs(prev => prev.filter(l => l.id !== id))
    router.refresh()
  }

  // ── Academic event — create ───────────────────────────────
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
        router.refresh()
      }
    } finally {
      setEventLoading(false)
    }
  }

  // ── Academic event — open edit modal ─────────────────────
  function openEditEvent(event: AcademicEvent) {
    setEditingEventId(event.id)
    setEditEventData({
      type: event.type,
      title: event.title,
      date: event.date,
      notes: event.notes || '',
    })
  }

  // ── Academic event — save edit ────────────────────────────
  async function updateEvent() {
    if (!editingEventId) return
    setEditEventLoading(true)
    try {
      const { data, error } = await supabase
        .from('academic_events')
        .update(editEventData)
        .eq('id', editingEventId)
        .select()
        .single()
      if (!error && data) {
        setLocalEvents(prev =>
          prev.map(e => e.id === editingEventId ? data : e)
            .sort((a, b) => a.date.localeCompare(b.date))
        )
        setEditingEventId(null)
        router.refresh()
      }
    } finally {
      setEditEventLoading(false)
    }
  }

  // ── Academic event — delete ───────────────────────────────
  async function deleteEvent(id: string) {
    if (!confirm('¿Eliminar esta fecha importante?')) return
    await supabase.from('academic_events').delete().eq('id', id)
    setLocalEvents(prev => prev.filter(e => e.id !== id))
    router.refresh()
  }

  // ── AI syllabus import ────────────────────────────────────
  async function importSyllabus() {
    if (!syllabusFile) return
    if (syllabusFile.size > 5_000_000) {
      alert('El archivo es muy grande (máx 5MB)')
      return
    }
    setParsingSyllabus(true)
    setSyllabusResult(null)
    try {
      const fd = new FormData()
      fd.append('file', syllabusFile)
      fd.append('subject_id', subject.id)
      const res = await fetch('/api/ai/parse-syllabus', { method: 'POST', body: fd })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setSyllabusResult(result)
      setSyllabusFile(null)
      router.refresh()
    } catch (err: any) {
      alert('Error al importar temario: ' + (err.message || 'desconocido'))
    } finally {
      setParsingSyllabus(false)
    }
  }

  // ── AI events import ──────────────────────────────────────
  async function importEvents() {
    if (!eventsFile) return
    if (eventsFile.size > 5_000_000) {
      alert('El archivo es muy grande (máx 5MB)')
      return
    }
    setParsingEvents(true)
    try {
      const fd = new FormData()
      fd.append('file', eventsFile)
      fd.append('subject_id', subject.id)
      const res = await fetch('/api/ai/parse-events', { method: 'POST', body: fd })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      if (result.events?.length > 0) {
        setLocalEvents(prev =>
          [...prev, ...result.events].sort((a: AcademicEvent, b: AcademicEvent) => a.date.localeCompare(b.date))
        )
      }
      setEventsFile(null)
      router.refresh()
    } catch (err: any) {
      alert('Error al importar fechas: ' + (err.message || 'desconocido'))
    } finally {
      setParsingEvents(false)
    }
  }

  // ── Topic CRUD handlers ───────────────────────────────────
  async function deleteTopic(topicId: string, unitId: string) {
    await supabase.from('topics').delete().eq('id', topicId)
    setUnitTopics(prev => ({ ...prev, [unitId]: prev[unitId].filter(t => t.id !== topicId) }))
    setTopicActionMenu(null)
    router.refresh()
  }

  async function saveRenameTopic() {
    if (!renamingTopic || !renameValue.trim()) return
    setTopicActionLoading(true)
    try {
      await supabase.from('topics').update({ name: renameValue.trim() }).eq('id', renamingTopic.id)
      setUnitTopics(prev => ({
        ...prev,
        [renamingTopic.unitId]: prev[renamingTopic.unitId].map(t =>
          t.id === renamingTopic.id ? { ...t, name: renameValue.trim() } : t
        ),
      }))
      setRenamingTopic(null)
    } finally {
      setTopicActionLoading(false)
    }
  }

  async function saveMoveTopic(toUnitId: string) {
    if (!movingTopic || movingTopic.fromUnitId === toUnitId) return
    setTopicActionLoading(true)
    try {
      await supabase.from('topics').update({ unit_id: toUnitId }).eq('id', movingTopic.id)
      const topic = unitTopics[movingTopic.fromUnitId].find(t => t.id === movingTopic.id)!
      setUnitTopics(prev => ({
        ...prev,
        [movingTopic.fromUnitId]: prev[movingTopic.fromUnitId].filter(t => t.id !== movingTopic.id),
        [toUnitId]: [...(prev[toUnitId] || []), topic],
      }))
      setMovingTopic(null)
    } finally {
      setTopicActionLoading(false)
    }
  }

  // ── Computed stats ────────────────────────────────────────
  const allTopics    = Object.values(unitTopics).flat()
  const total        = allTopics.length
  const greenCount   = allTopics.filter(t => t.status === 'green').length
  const pct          = total > 0 ? Math.round((greenCount / total) * 100) : 0
  const upcomingEvts = localEvents.filter(e => e.date >= today)

  // Events accordion: show first 2 by default
  const visibleEvents = showAllEvents ? upcomingEvts : upcomingEvts.slice(0, 2)

  // Class logs accordion: show first LOGS_SHOWN_DEFAULT (already sorted most recent first by page.tsx)
  const visibleLogs = showAllLogs ? localClassLogs : localClassLogs.slice(0, LOGS_SHOWN_DEFAULT)

  // ── Shared input classes ──────────────────────────────────
  const inlineInput = 'flex-1 h-9 px-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60'
  const modalInput  = 'w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60'

  return (
    <div className="px-4 pt-4 pb-28 space-y-5 max-w-lg mx-auto">

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
        <Button variant="secondary" size="md" className="flex-1" onClick={() => openClassLog()}>
          📝 Post-clase
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => setShowEventForm(true)}>
          📅 Agregar fecha
        </Button>
      </div>

      {/* ── Class log history ─────────────────────────────────── */}
      {localClassLogs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-2">Historial de clases</h2>
          <div className="space-y-2">
            {visibleLogs.map(log => (
              <button
                key={log.id}
                onClick={() => setViewingLog(log)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-surface border border-border-subtle text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center text-base shrink-0">
                  {['😕','😐','🙂','😊','🤩'][log.understanding_level - 1]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {format(parseISO(log.date), "d 'de' MMMM", { locale: es })}
                    </span>
                    {log.has_homework && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">📄 Tarea</span>
                    )}
                  </div>
                  {log.topics_covered_json?.length > 0 && (
                    <p className="text-xs text-text-secondary mt-0.5">
                      {log.topics_covered_json.length} tema{log.topics_covered_json.length !== 1 ? 's' : ''} vistos
                    </p>
                  )}
                </div>
                <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
          {/* Logs accordion toggle */}
          {localClassLogs.length > LOGS_SHOWN_DEFAULT && (
            <button
              onClick={() => setShowAllLogs(v => !v)}
              className="mt-2 w-full py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              {showAllLogs
                ? '▲ Ver menos'
                : `▼ Ver todos (${localClassLogs.length})`}
            </button>
          )}
        </div>
      )}

      {/* Upcoming events (with accordion) */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-2">Fechas importantes</h2>

        {/* AI events import */}
        <div className="mb-3 p-3 rounded-2xl border border-dashed border-border-subtle bg-surface-2">
          <p className="text-xs text-text-secondary mb-2">📸 Importar fechas con IA (calendario, imagen o PDF)</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={e => setEventsFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-xs text-primary underline">
              {eventsFile ? `📎 ${eventsFile.name}` : 'Elegir archivo…'}
            </span>
          </label>
          {eventsFile && (
            <button
              onClick={importEvents}
              disabled={parsingEvents}
              className="mt-2 w-full py-2 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50"
            >
              {parsingEvents ? '⏳ Importando fechas…' : '⚡ Importar fechas'}
            </button>
          )}
        </div>

        {upcomingEvts.length > 0 && (
          <div>
            <div className="space-y-2">
              {visibleEvents.map(event => {
                const days  = differenceInDays(parseISO(event.date), new Date())
                const color = getDaysColor(days)
                return (
                  <div key={event.id} className="flex items-center gap-2 p-3 rounded-2xl bg-surface border border-border-subtle">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{event.title}</p>
                      <p className="text-xs text-text-secondary">{getEventTypeLabel(event.type)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-right mr-1">
                        <Badge variant={color === 'red' ? 'danger' : color === 'amber' ? 'warning' : 'success'}>
                          {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                        </Badge>
                        <p className="text-xs text-text-secondary mt-1">{format(parseISO(event.date), 'dd/MM')}</p>
                      </div>
                      <button
                        onClick={() => openEditEvent(event)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface-2 text-text-secondary hover:text-text-primary transition-colors text-sm"
                        title="Editar"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteEvent(event.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 hover:text-red-300 transition-colors text-sm"
                        title="Eliminar"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Accordion toggle */}
            {upcomingEvts.length > 2 && (
              <button
                onClick={() => setShowAllEvents(e => !e)}
                className="mt-2 w-full py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                {showAllEvents
                  ? '▲ Ver menos'
                  : `▼ Ver todas (${upcomingEvts.length})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Temario (units + topics) ──────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Temario</h2>
          {total > 0 && (
            <p className="text-xs text-text-secondary">Tocá un tema → 🔴 → 🟡 → 🟢</p>
          )}
        </div>

        {/* AI syllabus import */}
        <div className="p-3 rounded-2xl border border-dashed border-border-subtle bg-surface-2">
          <p className="text-xs text-text-secondary mb-2">📤 Importar temario con IA (imagen o PDF)</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={e => setSyllabusFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-xs text-primary underline">
              {syllabusFile ? `📎 ${syllabusFile.name}` : 'Elegir archivo…'}
            </span>
          </label>
          {syllabusFile && (
            <button
              onClick={importSyllabus}
              disabled={parsingSyllabus}
              className="mt-2 w-full py-2 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50"
            >
              {parsingSyllabus ? '⏳ Importando…' : '⚡ Importar temario'}
            </button>
          )}
          {syllabusResult && (
            <p className="text-xs text-green-400 mt-1.5">
              ✅ {syllabusResult.units} unidades, {syllabusResult.topics} temas importados
            </p>
          )}
        </div>

        {localUnits.length === 0 && (
          <p className="text-xs text-text-secondary text-center py-2">
            Aún no hay unidades. Importá el temario o agregá la primera unidad manualmente.
          </p>
        )}

        {localUnits.map(unit => {
          const topics = unitTopics[unit.id] || []
          const isCollapsed = collapsedUnits[unit.id] ?? false
          const visibleTopics = isCollapsed ? topics.slice(0, TOPICS_SHOWN_DEFAULT) : topics

          return (
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
                {visibleTopics.map(topic => (
                  <TopicPill
                    key={topic.id}
                    topic={topic}
                    onStatusChange={handleTopicStatusChange}
                    onMenu={() => setTopicActionMenu({ id: topic.id, name: topic.name, unitId: unit.id })}
                    compact
                  />
                ))}
                {topics.length === 0 && addingTopicForUnit !== unit.id && (
                  <p className="text-xs text-text-secondary italic">Sin temas — usá "+ Tema" para agregar</p>
                )}
              </div>

              {/* Collapsible toggle for unit topics */}
              {topics.length > TOPICS_SHOWN_DEFAULT && (
                <button
                  onClick={() => setCollapsedUnits(prev => ({ ...prev, [unit.id]: !prev[unit.id] }))}
                  className="mt-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  {isCollapsed
                    ? `▼ Ver todos (${topics.length})`
                    : '▲ Ver menos'}
                </button>
              )}
            </div>
          )
        })}

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

      {/* ── Class log modal (create / edit) ──────────────────── */}
      {showClassLog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
              <h3 className="text-base font-semibold text-text-primary">
                {editingLogId ? 'Editar clase' : 'Post-clase'}
              </h3>
              <button
                onClick={() => { setShowClassLog(false); setEditingLogId(null) }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {/* Topics covered */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                  <p className="text-xs font-medium text-text-secondary">Temas vistos en clase</p>
                  {classLogData.topics_covered.length > 0 && (
                    <span className="text-xs text-primary font-medium">
                      {classLogData.topics_covered.length} seleccionado{classLogData.topics_covered.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {allTopics.length === 0 ? (
                  <div className="px-4 py-3">
                    <p className="text-xs text-text-secondary mb-2">
                      Aún no hay temas en el temario. Podés agregar uno ahora:
                    </p>
                    {localUnits.length > 0 ? (
                      quickAddUnitId === null ? (
                        <button
                          onClick={() => setQuickAddUnitId(localUnits[0].id)}
                          className="text-xs text-primary"
                        >+ Agregar primer tema</button>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={quickTopicName}
                            onChange={e => setQuickTopicName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') quickAddTopic(quickAddUnitId) }}
                            placeholder="Nombre del tema..."
                            autoFocus
                            className="flex-1 h-9 px-3 rounded-xl bg-surface border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none"
                          />
                          <button onClick={() => quickAddTopic(quickAddUnitId)} disabled={!quickTopicName.trim() || quickAdding} className="px-3 h-9 rounded-xl bg-primary text-white text-xs disabled:opacity-40">
                            {quickAdding ? '…' : '✓'}
                          </button>
                        </div>
                      )
                    ) : (
                      <p className="text-xs text-text-secondary italic">Primero creá unidades en el temario.</p>
                    )}
                  </div>
                ) : (
                  <div>
                    {localUnits.map((unit, uIdx) => {
                      const topics = unitTopics[unit.id] || []
                      if (topics.length === 0 && quickAddUnitId !== unit.id) return null
                      const isUnitCollapsed = classLogCollapsed[unit.id] ?? false
                      return (
                        <div key={unit.id} className={uIdx > 0 ? 'border-t border-border-subtle' : ''}>
                          {/* Unit header */}
                          <button
                            onClick={() => setClassLogCollapsed(p => ({ ...p, [unit.id]: !p[unit.id] }))}
                            className="w-full flex items-center justify-between px-4 py-2.5"
                          >
                            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{unit.name}</p>
                            <div className="flex items-center gap-2">
                              {topics.filter(t => classLogData.topics_covered.includes(t.id)).length > 0 && (
                                <span className="text-xs text-primary font-medium">
                                  {topics.filter(t => classLogData.topics_covered.includes(t.id)).length} ✓
                                </span>
                              )}
                              <svg className={`w-3.5 h-3.5 text-text-secondary transition-transform ${isUnitCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>

                          {!isUnitCollapsed && (
                            <div className="px-4 pb-3">
                              <div className="flex flex-wrap gap-2 mb-2">
                                {topics.map(topic => (
                                  <button
                                    key={topic.id}
                                    onClick={() => toggleTopicCovered(topic.id)}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all min-h-[32px] ${
                                      classLogData.topics_covered.includes(topic.id)
                                        ? 'border-primary bg-primary/20 text-text-primary'
                                        : 'border-border-subtle bg-surface text-text-secondary'
                                    }`}
                                  >
                                    {classLogData.topics_covered.includes(topic.id) ? '✓ ' : ''}{topic.name}
                                  </button>
                                ))}
                              </div>
                              {/* Quick-add topic */}
                              {quickAddUnitId === unit.id ? (
                                <div className="flex gap-2 mt-1">
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
                                    className="flex-1 h-8 px-3 rounded-lg bg-surface border border-border-subtle text-xs text-text-primary placeholder-text-secondary focus:outline-none"
                                  />
                                  <button onClick={() => quickAddTopic(unit.id)} disabled={!quickTopicName.trim() || quickAdding} className="h-8 px-2.5 rounded-lg bg-primary text-white text-xs disabled:opacity-40">{quickAdding ? '…' : '✓'}</button>
                                  <button onClick={() => { setQuickAddUnitId(null); setQuickTopicName('') }} className="h-8 w-8 flex items-center justify-center rounded-lg bg-surface-2 text-text-secondary text-xs">✕</button>
                                </div>
                              ) : (
                                <button onClick={() => { setQuickAddUnitId(unit.id); setQuickTopicName('') }} className="text-xs text-primary/70 hover:text-primary transition-colors">+ tema nuevo</button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Understanding level */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle p-4">
                <p className="text-xs text-text-secondary mb-2.5">Nivel de comprensión en clase</p>
                <div className="flex gap-2">
                  {[
                    { v: 1, label: 'Muy poco' },
                    { v: 2, label: 'Poco' },
                    { v: 3, label: 'Regular' },
                    { v: 4, label: 'Bien' },
                    { v: 5, label: 'Muy bien' },
                  ].map(l => (
                    <button
                      key={l.v}
                      onClick={() => setClassLogData(d => ({ ...d, understanding_level: l.v }))}
                      className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        classLogData.understanding_level === l.v
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-border-subtle bg-surface text-text-secondary'
                      }`}
                    >
                      {['😕','😐','🙂','😊','🤩'][l.v - 1]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-secondary text-center mt-1.5">
                  {['Muy poco','Poco','Regular','Bien','Muy bien'][classLogData.understanding_level - 1]}
                </p>
              </div>

              {/* Homework toggle */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <button
                  onClick={() => setClassLogData(d => ({ ...d, has_homework: !d.has_homework }))}
                  className="flex items-center justify-between w-full px-4 py-3"
                >
                  <span className="text-sm text-text-primary">Quedó tarea / TP</span>
                  <div className={`w-11 h-6 rounded-full transition-colors ${classLogData.has_homework ? 'bg-primary' : 'bg-surface'} border border-border-subtle relative`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${classLogData.has_homework ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </button>
                {classLogData.has_homework && (
                  <>
                    <div className="border-t border-border-subtle flex items-start gap-3 px-4 py-3">
                      <svg className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <textarea
                        value={classLogData.homework_description}
                        onChange={e => setClassLogData(d => ({ ...d, homework_description: e.target.value }))}
                        placeholder="Describí la tarea..."
                        rows={2}
                        className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none"
                      />
                    </div>
                    <div className="border-t border-border-subtle flex items-center gap-3 px-4 py-3">
                      <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span className="text-sm text-text-secondary w-24 shrink-0">Fecha entrega</span>
                      <input
                        type="date"
                        value={classLogData.due_date}
                        onChange={e => setClassLogData(d => ({ ...d, due_date: e.target.value }))}
                        className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none"
                      />
                    </div>
                    <div className="px-4 pb-2">
                      <p className="text-xs text-primary/70">Crea un evento de entrega automáticamente</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5 shrink-0">
              <Button variant="secondary" className="flex-1" onClick={() => { setShowClassLog(false); setEditingLogId(null) }}>
                Cancelar
              </Button>
              <Button variant="primary" className="flex-1" onClick={saveClassLog} loading={logLoading}>
                {editingLogId ? 'Guardar cambios' : 'Guardar clase'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── View class log modal ──────────────────────────────── */}
      {viewingLog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Clase del {format(parseISO(viewingLog.date), "d 'de' MMMM", { locale: es })}</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {['Muy poco','Poco','Regular','Bien','Muy bien'][viewingLog.understanding_level - 1]} comprensión
                  {' '}{['😕','😐','🙂','😊','🤩'][viewingLog.understanding_level - 1]}
                </p>
              </div>
              <button onClick={() => setViewingLog(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {/* Topics */}
              {viewingLog.topics_covered_json?.length > 0 && (
                <div className="rounded-2xl bg-surface-2 border border-border-subtle p-4">
                  <p className="text-xs text-text-secondary mb-2.5">Temas vistos</p>
                  <div className="flex flex-wrap gap-2">
                    {(viewingLog.topics_covered_json as string[]).map(id => {
                      const t = allTopics.find(t => t.id === id)
                      if (!t) return null
                      return (
                        <span key={id} className="px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-xs text-primary font-medium">
                          ✓ {t.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              {/* Homework */}
              {viewingLog.has_homework && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
                  <p className="text-xs font-medium text-amber-400 mb-1">📄 Tarea pendiente</p>
                  {viewingLog.homework_description && (
                    <p className="text-sm text-text-primary">{viewingLog.homework_description}</p>
                  )}
                  {viewingLog.due_date && (
                    <p className="text-xs text-text-secondary mt-1">Entrega: {format(parseISO(viewingLog.due_date), "d 'de' MMMM", { locale: es })}</p>
                  )}
                </div>
              )}
              {!viewingLog.topics_covered_json?.length && !viewingLog.has_homework && (
                <p className="text-sm text-text-secondary text-center py-4">Sin temas ni tarea registrados</p>
              )}
            </div>
            <div className="flex gap-3 px-5 pb-5 shrink-0">
              <button
                onClick={() => { deleteClassLog(viewingLog.id); setViewingLog(null) }}
                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-red-500/10 text-red-400 shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => { setViewingLog(null); openClassLog(viewingLog) }}
              >
                Editar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Topic action menu ──────────────────────────────────── */}
      {topicActionMenu && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm" onClick={() => setTopicActionMenu(null)}>
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-3 border-b border-border-subtle">
              <p className="text-xs text-text-secondary">Tema</p>
              <p className="text-sm font-semibold text-text-primary truncate">{topicActionMenu.name}</p>
            </div>
            <div className="p-2">
              <button
                onClick={() => {
                  setRenamingTopic({ id: topicActionMenu.id, name: topicActionMenu.name, unitId: topicActionMenu.unitId })
                  setRenameValue(topicActionMenu.name)
                  setTopicActionMenu(null)
                }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-surface-2 transition-colors text-left"
              >
                <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-sm text-text-primary">Renombrar</span>
              </button>
              {localUnits.length > 1 && (
                <button
                  onClick={() => {
                    setMovingTopic({ id: topicActionMenu.id, name: topicActionMenu.name, fromUnitId: topicActionMenu.unitId })
                    setTopicActionMenu(null)
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-surface-2 transition-colors text-left"
                >
                  <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span className="text-sm text-text-primary">Mover a otra unidad</span>
                </button>
              )}
              <button
                onClick={() => deleteTopic(topicActionMenu.id, topicActionMenu.unitId)}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-red-500/10 transition-colors text-left"
              >
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="text-sm text-red-400">Eliminar tema</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename topic modal ─────────────────────────────────── */}
      {renamingTopic && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
              <h3 className="text-base font-semibold text-text-primary">Renombrar tema</h3>
              <button onClick={() => setRenamingTopic(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden mb-3">
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveRenameTopic()}
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setRenamingTopic(null)}>Cancelar</Button>
                <Button variant="primary" className="flex-1" onClick={saveRenameTopic} loading={topicActionLoading} disabled={!renameValue.trim()}>Guardar</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Move topic modal ───────────────────────────────────── */}
      {movingTopic && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm" onClick={() => setMovingTopic(null)}>
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Mover tema</h3>
                <p className="text-xs text-text-secondary mt-0.5 truncate">{movingTopic.name}</p>
              </div>
              <button onClick={() => setMovingTopic(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-2">
              {localUnits.filter(u => u.id !== movingTopic.fromUnitId).map(unit => (
                <button
                  key={unit.id}
                  onClick={() => saveMoveTopic(unit.id)}
                  disabled={topicActionLoading}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-surface-2 transition-colors text-left disabled:opacity-50"
                >
                  <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-sm text-text-primary">{unit.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Event form modal (create) ─────────────────────────── */}
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

      {/* ── Event edit modal ──────────────────────────────────── */}
      {editingEventId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">✎ Editar fecha</h3>
              <button
                onClick={() => setEditingEventId(null)}
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
                      onClick={() => setEditEventData(d => ({ ...d, type: opt.value }))}
                      className={`flex-1 py-2.5 rounded-xl border text-xs transition-all min-h-[44px] ${
                        editEventData.type === opt.value
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
                value={editEventData.title}
                onChange={e => setEditEventData(d => ({ ...d, title: e.target.value }))}
                placeholder="Título"
                className={modalInput}
              />

              <input
                type="date"
                value={editEventData.date}
                onChange={e => setEditEventData(d => ({ ...d, date: e.target.value }))}
                className={modalInput}
              />

              <textarea
                value={editEventData.notes}
                onChange={e => setEditEventData(d => ({ ...d, notes: e.target.value }))}
                placeholder="Notas opcionales..."
                className="w-full h-16 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none focus:border-primary/60"
              />
            </div>

            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingEventId(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={updateEvent}
                loading={editEventLoading}
                disabled={!editEventData.title || !editEventData.date}
              >
                Guardar cambios
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
