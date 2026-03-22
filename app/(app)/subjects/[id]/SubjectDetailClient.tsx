'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'
import { TopicPill } from '@/components/ui/TopicPill'
import Button from '@/components/ui/Button'
import { getDaysColor, getEventTypeLabel } from '@/lib/study-priority'
import { parseEventNotes } from '@/lib/utils'
import type { SubjectWithDetails, AcademicEvent, Topic, TopicStatus, AcademicEventType, HallucinationChallenge, Grade, ClassLog } from '@/types'
import ProgressHallucinationGuard from '@/components/features/ProgressHallucinationGuard'
import EditEventModal from '@/components/features/EditEventModal'
import SyllabusImport from '@/components/features/SyllabusImport'
import EventsImport from '@/components/features/EventsImport'
import ClassLogModal from '@/components/features/ClassLogModal'
import type { ClassLogFormData } from '@/components/features/ClassLogModal'

// How many topics to show before collapsing per unit
const TOPICS_SHOWN_DEFAULT = 4
// How many class logs to show before collapsing
const LOGS_SHOWN_DEFAULT = 3


interface Props {
  subject: SubjectWithDetails
  events: AcademicEvent[]
  classLogs: ClassLog[]
  grades: Pick<Grade, 'id' | 'event_id' | 'score' | 'max_score'>[]
  today: string
  userId: string
}

export default function SubjectDetailClient({ subject, events, classLogs, grades, today, userId }: Props) {
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
  // true = collapsed (hidden), false = expanded (show all topics). Default: collapsed.
  const [collapsedUnits, setCollapsedUnits] = useState<Record<string, boolean>>(
    Object.fromEntries(
      subject.units.map(u => [u.id, true])
    )
  )

  // ── Topic search ──────────────────────────────────────────
  const [topicSearch, setTopicSearch] = useState('')

  // ── Add unit ──────────────────────────────────────────────
  const [showAddUnit, setShowAddUnit] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [addingUnit, setAddingUnit] = useState(false)

  // ── Delete unit ───────────────────────────────────────────
  const [deletingUnitId, setDeletingUnitId] = useState<string | null>(null)
  const [deleteUnitMode, setDeleteUnitMode] = useState<'delete_all' | 'move'>('delete_all')
  const [moveToUnitId, setMoveToUnitId] = useState('')
  const [deletingUnitLoading, setDeletingUnitLoading] = useState(false)

  // ── Add topic ─────────────────────────────────────────────
  const [addingTopicForUnit, setAddingTopicForUnit] = useState<string | null>(null)
  const [newTopicName, setNewTopicName] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)

  // ── Class log modal ───────────────────────────────────────
  const [showClassLog, setShowClassLog] = useState(false)
  const [classLogData, setClassLogData] = useState<ClassLogFormData>({
    understanding_level: 3,
    has_homework: false,
    homework_description: '',
    due_date: '',
    topics_covered: [],
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
  const [eventTime, setEventTime]           = useState('')
  const [eventAula, setEventAula]           = useState('')
  const [eventTopicIds, setEventTopicIds]   = useState<string[]>([])
  const [eventUnitId, setEventUnitId]       = useState('')
  const [eventLoading, setEventLoading]     = useState(false)

  // ── Event modal (edit) ────────────────────────────────────
  const [editingEvent, setEditingEvent] = useState<AcademicEvent | null>(null)

  // ── Class log view mode ───────────────────────────────────
  const [viewingLog, setViewingLog] = useState<any | null>(null)

  // ── Topic CRUD ────────────────────────────────────────────
  const [topicActionMenu, setTopicActionMenu] = useState<{ id: string; name: string; unitId: string } | null>(null)
  const [renamingTopic, setRenamingTopic] = useState<{ id: string; name: string; unitId: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [movingTopic, setMovingTopic] = useState<{ id: string; name: string; fromUnitId: string } | null>(null)
  const [topicActionLoading, setTopicActionLoading] = useState(false)
  const [editingTopicDesc, setEditingTopicDesc] = useState<{ id: string; name: string; unitId: string; desc: string } | null>(null)
  const [topicDescValue, setTopicDescValue] = useState('')

  // ── Feature 4: Hallucination detection ────────────────────────────────────
  const [hallucinationChallenge, setHallucinationChallenge] = useState<HallucinationChallenge | null>(null)

  // ── Selected unit in class log modal (accordion) ──────────
  const [classLogUnitId, setClassLogUnitId] = useState('')
  const [classLogOpenUnitId, setClassLogOpenUnitId] = useState<string | null>(null)
  const [linkedEventId, setLinkedEventId] = useState('')
  const classLogUnitRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (classLogOpenUnitId && classLogUnitRefs.current[classLogOpenUnitId]) {
      classLogUnitRefs.current[classLogOpenUnitId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [classLogOpenUnitId])

  // ── Local events state ────────────────────────────────────
  const [localEvents, setLocalEvents] = useState<AcademicEvent[]>(events)

  // ── Events accordion ──────────────────────────────────────
  const [showAllEvents, setShowAllEvents] = useState(false)

  // ── AI syllabus import toggle ─────────────────────────────
  const [showSyllabusImport, setShowSyllabusImport] = useState(subject.units.length === 0)

  // ── AI events import toggle ───────────────────────────────
  const [showEventsImport, setShowEventsImport] = useState(events.length === 0)

  // ── Topic status change ───────────────────────────────────
  async function handleTopicStatusChange(topicId: string, status: TopicStatus) {
    // Optimistic UI update
    setUnitTopics(prev => {
      const next = { ...prev }
      for (const unitId in next) {
        next[unitId] = next[unitId].map(t => t.id === topicId ? { ...t, status } : t)
      }
      return next
    })

    // Persist to DB
    await supabase
      .from('topics')
      .update({ status, last_studied: new Date().toISOString() })
      .eq('id', topicId)

    // Feature 4: When marking as mastered (green), check for hallucination of progress
    if (status === 'green') {
      try {
        const topicName = Object.values(unitTopics)
          .flat()
          .find(t => t.id === topicId)?.name ?? ''

        const res = await fetch('/api/topics/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic_id: topicId,
            subject_id: subject.id,
            topic_name: topicName,
          }),
        })
        const data = await res.json()
        if (data.needs_validation && data.challenge) {
          setHallucinationChallenge(data.challenge)
          // Don't refresh yet — wait for validation result
          return
        }
      } catch {
        // Non-critical: if detection fails, proceed normally
      }
    }

    router.refresh()
  }

  // Called by ProgressHallucinationGuard after validation completes
  function handleValidationResult(passed: boolean, newStatus: TopicStatus) {
    setHallucinationChallenge(null)
    if (!passed && hallucinationChallenge) {
      // Revert optimistic update to yellow
      setUnitTopics(prev => {
        const next = { ...prev }
        for (const unitId in next) {
          next[unitId] = next[unitId].map(t =>
            t.id === hallucinationChallenge.topic_id ? { ...t, status: newStatus } : t
          )
        }
        return next
      })
    }
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

  // ── Reorder unit ──────────────────────────────────────────
  async function reorderUnit(unitId: string, direction: 'up' | 'down') {
    const idx = localUnits.findIndex(u => u.id === unitId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= localUnits.length) return

    const reordered = [...localUnits]
    const temp = reordered[idx]
    reordered[idx] = reordered[swapIdx]
    reordered[swapIdx] = temp

    // Assign new order_index values
    const updated = reordered.map((u, i) => ({ ...u, order_index: i }))
    setLocalUnits(updated)

    // Persist both swapped units
    await Promise.all([
      supabase.from('units').update({ order_index: updated[idx].order_index }).eq('id', updated[idx].id),
      supabase.from('units').update({ order_index: updated[swapIdx].order_index }).eq('id', updated[swapIdx].id),
    ])
  }

  // ── Delete unit ───────────────────────────────────────────
  async function confirmDeleteUnit() {
    if (!deletingUnitId) return
    setDeletingUnitLoading(true)
    try {
      const topicsInUnit = unitTopics[deletingUnitId] || []
      const topicIds = topicsInUnit.map(t => t.id)

      if (topicIds.length > 0) {
        if (deleteUnitMode === 'move' && moveToUnitId && moveToUnitId !== deletingUnitId) {
          // Move topics to another unit
          await supabase
            .from('topics')
            .update({ unit_id: moveToUnitId })
            .in('id', topicIds)
          setUnitTopics(prev => ({
            ...prev,
            [moveToUnitId]: [...(prev[moveToUnitId] || []), ...topicsInUnit],
            [deletingUnitId]: [],
          }))
        } else {
          // Delete all topics — also clean them from any academic_events notes
          const { data: eventsWithTopics } = await supabase
            .from('academic_events')
            .select('id, notes')
            .eq('subject_id', subject.id)
          if (eventsWithTopics) {
            for (const ev of eventsWithTopics) {
              try {
                const parsed = JSON.parse(ev.notes || '')
                if (parsed?.topic_ids && Array.isArray(parsed.topic_ids)) {
                  const updated = parsed.topic_ids.filter((id: string) => !topicIds.includes(id))
                  if (updated.length !== parsed.topic_ids.length) {
                    const newNotes = JSON.stringify({ ...parsed, topic_ids: updated.length > 0 ? updated : null })
                    await supabase.from('academic_events').update({ notes: newNotes }).eq('id', ev.id)
                    setLocalEvents(prev =>
                      prev.map(e => e.id === ev.id ? { ...e, notes: newNotes } : e)
                    )
                  }
                }
              } catch { /* notes is plain text or null, no topic_ids */ }
            }
          }
          await supabase.from('topics').delete().in('id', topicIds)
          setUnitTopics(prev => ({ ...prev, [deletingUnitId]: [] }))
        }
      }

      // Delete the unit itself
      await supabase.from('units').delete().eq('id', deletingUnitId)
      setLocalUnits(prev => prev.filter(u => u.id !== deletingUnitId))
      setUnitTopics(prev => {
        const next = { ...prev }
        delete next[deletingUnitId]
        return next
      })
      setDeletingUnitId(null)
      router.refresh()
    } finally {
      setDeletingUnitLoading(false)
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
    setClassLogUnitId('')
    setClassLogOpenUnitId(null)
    setLinkedEventId('')
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

      // Auto-create academic_event for homework with due_date (new logs only, skip if linked to existing)
      if (classLogData.has_homework && classLogData.due_date && !editingLogId && !linkedEventId) {
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
      setLinkedEventId('')
      setClassLogOpenUnitId(null)
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
      const encodedNotes = JSON.stringify({
        time: eventTime || null,
        aula: eventAula || null,
        topic_ids: eventTopicIds.length > 0 ? eventTopicIds : null,
        _notes: eventData.notes,
      })
      const { data, error } = await supabase
        .from('academic_events')
        .insert({ subject_id: subject.id, user_id: userId, ...eventData, notes: encodedNotes })
        .select()
        .single()
      if (!error && data) {
        setLocalEvents(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
        setShowEventForm(false)
        setEventData({ type: 'parcial', title: '', date: '', notes: '' })
        setEventTime(''); setEventAula(''); setEventTopicIds([]); setEventUnitId('')
        // Re-evaluate deadline alerts for the new event (fire-and-forget)
        fetch('/api/notifications').catch(() => {})
        router.refresh()
      }
    } finally {
      setEventLoading(false)
    }
  }

  // ── Academic event — edit callbacks ──────────────────────
  function handleEventSaved(updated: { id: string; title: string; date: string; type: string; notes: string | null; subject_id?: string }) {
    setLocalEvents(prev =>
      prev.map(e => e.id === updated.id ? { ...e, ...updated, type: updated.type as AcademicEventType } : e)
        .sort((a, b) => a.date.localeCompare(b.date))
    )
    setEditingEvent(null)
    router.refresh()
  }

  function handleEventDeleted(id: string) {
    setLocalEvents(prev => prev.filter(e => e.id !== id))
    setEditingEvent(null)
    router.refresh()
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

  async function saveTopicDescription() {
    if (!editingTopicDesc) return
    setTopicActionLoading(true)
    try {
      await supabase.from('topics').update({ full_description: topicDescValue }).eq('id', editingTopicDesc.id)
      setUnitTopics(prev => ({
        ...prev,
        [editingTopicDesc.unitId]: prev[editingTopicDesc.unitId].map(t =>
          t.id === editingTopicDesc.id ? { ...t, full_description: topicDescValue } : t
        ),
      }))
      setEditingTopicDesc(null)
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

  // Gradeable event types — used for readiness score
  const GRADEABLE_TYPES = ['parcial', 'parcial_intermedio', 'entrega_tp', 'recuperatorio']

  // ── 7.4 Readiness score ───────────────────────────────────
  // Computed for the closest upcoming event within 14 days (if any)
  const nearestEvent = upcomingEvts.find(e => {
    const d = differenceInDays(parseISO(e.date), startOfDay(new Date()))
    return d >= 0 && d <= 14 && GRADEABLE_TYPES.includes(e.type)
  })

  const readinessScore = (() => {
    if (!nearestEvent || total === 0) return null
    const daysLeft = differenceInDays(parseISO(nearestEvent.date), startOfDay(new Date()))
    // Base score from green topic percentage (0-70 pts)
    const greenScore = Math.round((greenCount / total) * 70)
    // Yellow topics count as partial progress (0-15 pts)
    const yellowCount = allTopics.filter(t => t.status === 'yellow').length
    const yellowScore = Math.round((yellowCount / total) * 15)
    // Recent class activity bonus (0-15 pts): class logs in last 14 days
    const recentLogs = localClassLogs.filter(l => {
      const dAgo = differenceInDays(startOfDay(new Date()), parseISO(l.date))
      return dAgo >= 0 && dAgo <= 14
    })
    const activityScore = Math.min(15, recentLogs.length * 5)
    const raw = greenScore + yellowScore + activityScore
    return { score: Math.min(100, raw), daysLeft, event: nearestEvent }
  })()

  // Class logs accordion: show first LOGS_SHOWN_DEFAULT (already sorted most recent first by page.tsx)
  const visibleLogs = showAllLogs ? localClassLogs : localClassLogs.slice(0, LOGS_SHOWN_DEFAULT)

  // Risk indicator: upcoming event within 7 days + overall progress < 50%
  const hasUrgentRisk = pct < 50 && upcomingEvts.some(e => {
    const d = differenceInDays(parseISO(e.date), startOfDay(new Date()))
    return d >= 0 && d <= 7
  })

  // Pending homework badge for post-clase button
  const hasPendingHomework = localClassLogs.some(l => l.has_homework)

  // SM-2: topics with next_review due today or earlier
  const todayISO = new Date().toISOString().split('T')[0]
  const reviewDueCount = allTopics.filter(t =>
    t.status === 'green' && t.next_review && t.next_review.split('T')[0] <= todayISO
  ).length

  // ── Shared input classes ──────────────────────────────────
  const inlineInput = 'flex-1 h-9 px-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60'

  return (
    <div className="px-4 pt-4 pb-28 space-y-5 max-w-lg mx-auto md:max-w-3xl md:px-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/subjects"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
            <h1 className="text-base font-bold text-text-primary truncate">{subject.name}</h1>
            {hasUrgentRisk && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" title="Evento próximo con bajo progreso" />
            )}
          </div>
          {/* Compact progress inline */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden shrink-0">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-medium text-text-secondary">{pct}%</span>
            <span className="text-[10px] text-text-secondary/40 mx-0.5">·</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            <span className="text-[10px] text-text-secondary">{greenCount}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="text-[10px] text-text-secondary">{allTopics.filter(t => t.status === 'yellow').length}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-[10px] text-text-secondary">{allTopics.filter(t => t.status === 'red').length}</span>
            {reviewDueCount > 0 && (
              <>
                <span className="text-[10px] text-text-secondary/40 mx-0.5">·</span>
                <span className="text-[10px] font-medium text-amber-400">
                  {reviewDueCount} para repasar
                </span>
              </>
            )}
          </div>
        </div>
        {/* Action icon buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => openClassLog()}
            className="relative w-9 h-9 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
            title="Registrar clase"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {hasPendingHomework && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 border-2 border-[#0A0F1E]" />
            )}
          </button>
          <button
            onClick={() => setShowEventForm(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
            title="Agregar fecha importante"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── 7.4 Readiness score card ─────────────────────────── */}
      {readinessScore && (
        <div className={`rounded-3xl border p-4 ${
          readinessScore.score >= 70
            ? 'bg-green-500/8 border-green-500/25'
            : readinessScore.score >= 45
              ? 'bg-amber-500/8 border-amber-500/25'
              : 'bg-red-500/8 border-red-500/25'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 shrink-0 ${readinessScore.score >= 70 ? 'text-green-400' : readinessScore.score >= 45 ? 'text-amber-400' : 'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <p className="text-xs font-semibold text-text-primary">Índice de preparación</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-lg font-bold ${readinessScore.score >= 70 ? 'text-green-400' : readinessScore.score >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                {readinessScore.score}
              </span>
              <span className="text-xs text-text-secondary">/100</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${readinessScore.score >= 70 ? 'bg-green-500' : readinessScore.score >= 45 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${readinessScore.score}%` }}
            />
          </div>
          <p className="text-[11px] text-text-secondary">
            {readinessScore.daysLeft === 0 ? '¡Hoy!' : `${readinessScore.daysLeft}d`} para{' '}
            <span className="text-text-primary font-medium">{readinessScore.event.title}</span>
            {readinessScore.score < 70 && (
              <span className="ml-1">
                · {readinessScore.score < 45
                  ? `Marcá más temas como dominados para subir`
                  : `Estás bien encaminado/a`}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Upcoming events (with accordion) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-text-primary">Fechas importantes</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEventForm(true)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-primary hover:bg-surface transition-colors"
              title="Agregar fecha"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => setShowEventsImport(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                showEventsImport
                  ? 'bg-primary/20 text-primary'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Importar IA
            </button>
          </div>
        </div>

        {/* AI events import — collapsible */}
        <EventsImport
          subjectId={subject.id}
          show={showEventsImport}
          onToggle={() => setShowEventsImport(v => !v)}
          onImported={newEvents => setLocalEvents(prev =>
            [...prev, ...newEvents].sort((a, b) => a.date.localeCompare(b.date))
          )}
        />

        {upcomingEvts.length > 0 && (
          <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
            {visibleEvents.map((event, i, arr) => {
              const extra = parseEventNotes(event.notes)
              const days  = differenceInDays(parseISO(event.date), startOfDay(new Date()))
              const color = getDaysColor(days)
              const isLast = i === arr.length - 1 && upcomingEvts.length <= 2
              const grade = grades.find(g => g.event_id === event.id)
              const gradeColor = grade?.score != null
                ? grade.score / grade.max_score >= 0.6 ? 'text-green-400'
                : grade.score / grade.max_score >= 0.4 ? 'text-amber-400'
                : 'text-red-400'
                : ''
              return (
                <div
                  key={event.id}
                  onClick={() => setEditingEvent(event)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-surface transition-colors ${!isLast ? 'border-b border-border-subtle' : ''}`}
                >
                  <div className="flex flex-col items-center self-stretch py-0.5 shrink-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`} />
                    {!isLast && <div className="w-px flex-1 bg-border-subtle mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{event.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-text-secondary bg-surface px-2 py-0.5 rounded-full border border-border-subtle">
                        {getEventTypeLabel(event.type)}
                      </span>
                      {extra.topic_ids && extra.topic_ids.length > 0 && (
                        <span className="text-[10px] text-primary/70">
                          {extra.topic_ids.length} tema{extra.topic_ids.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {grade ? (
                    <span className={`text-sm font-bold shrink-0 ${gradeColor}`}>
                      {grade.score ?? '—'}/{grade.max_score}
                    </span>
                  ) : (
                    <Badge variant={color === 'red' ? 'danger' : color === 'amber' ? 'warning' : 'success'}>
                      {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                    </Badge>
                  )}
                </div>
              )
            })}
            {upcomingEvts.length > 2 && (
              <button
                onClick={() => setShowAllEvents(e => !e)}
                className="w-full px-4 py-2.5 text-xs text-primary font-medium text-left border-t border-border-subtle"
              >
                {showAllEvents ? 'Mostrar menos' : `Ver ${upcomingEvts.length - 2} más`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Temario (units + topics) ──────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Temario</h2>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <p className="text-xs text-text-secondary hidden sm:block">Tocá un tema → 🔴 → 🟡 → 🟢</p>
            )}
            <button
              onClick={() => setShowSyllabusImport(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                showSyllabusImport
                  ? 'bg-primary/20 text-primary'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar IA
            </button>
          </div>
        </div>

        {/* AI syllabus import — collapsible */}
        <SyllabusImport
          subjectId={subject.id}
          show={showSyllabusImport}
          onToggle={() => setShowSyllabusImport(v => !v)}
        />

        {/* Topic search */}
        {total > 0 && (
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary/50 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={topicSearch}
              onChange={e => {
                setTopicSearch(e.target.value)
                if (e.target.value) {
                  // Expand all units when searching
                  setCollapsedUnits(Object.fromEntries(localUnits.map(u => [u.id, false])))
                }
              }}
              placeholder="Buscar tema…"
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-primary/60"
            />
            {topicSearch && (
              <button
                onClick={() => setTopicSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-text-secondary/60 hover:text-text-primary"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {localUnits.length === 0 && (
          <p className="text-xs text-text-secondary text-center py-2">
            Aún no hay unidades. Importá el temario o agregá la primera unidad manualmente.
          </p>
        )}

        {localUnits.map((unit, unitIdx) => {
          const topics = unitTopics[unit.id] || []
          const filteredTopics = topicSearch
            ? topics.filter(t => t.name.toLowerCase().includes(topicSearch.toLowerCase()))
            : topics
          const isCollapsed = collapsedUnits[unit.id] ?? true
          const greenInUnit = topics.filter(t => t.status === 'green').length
          const yellowInUnit = topics.filter(t => t.status === 'yellow').length
          // Hide unit entirely if searching and no matching topics
          if (topicSearch && filteredTopics.length === 0) return null

          return (
            <div key={unit.id} className={`rounded-2xl border transition-all duration-200 overflow-hidden ${isCollapsed ? 'border-border-subtle' : 'border-primary/20'}`}>

              {/* Unit header — always clickable */}
              <div className={`flex items-center gap-2 px-3 py-3 transition-colors ${isCollapsed ? 'bg-surface-2' : 'bg-primary/5'}`}>
                <button
                  onClick={() => setCollapsedUnits(prev => ({ ...prev, [unit.id]: !prev[unit.id] }))}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <svg
                    className={`w-3.5 h-3.5 text-text-secondary/50 shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="text-xs font-semibold text-text-primary truncate">{unit.name}</span>
                  {topics.length > 0 && (
                    <div className="flex items-center gap-1.5 ml-auto shrink-0 pr-2">
                      {greenInUnit > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          {greenInUnit}
                        </span>
                      )}
                      {yellowInUnit > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          {yellowInUnit}
                        </span>
                      )}
                      {topics.length - greenInUnit - yellowInUnit > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                          {topics.length - greenInUnit - yellowInUnit}
                        </span>
                      )}
                      <span className="text-[10px] text-text-secondary/40 ml-0.5">({topics.length})</span>
                    </div>
                  )}
                  {topics.length === 0 && (
                    <span className="text-[10px] text-text-secondary/40 ml-auto shrink-0 pr-2">sin temas</span>
                  )}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Reorder buttons */}
                  {!topicSearch && (
                    <>
                      <button
                        onClick={() => reorderUnit(unit.id, 'up')}
                        disabled={unitIdx === 0}
                        className="w-5 h-5 flex items-center justify-center rounded text-text-secondary/40 hover:text-text-secondary disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Mover arriba"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => reorderUnit(unit.id, 'down')}
                        disabled={unitIdx === localUnits.length - 1}
                        className="w-5 h-5 flex items-center justify-center rounded text-text-secondary/40 hover:text-text-secondary disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Mover abajo"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setAddingTopicForUnit(unit.id)
                      setNewTopicName('')
                      setCollapsedUnits(prev => ({ ...prev, [unit.id]: false }))
                    }}
                    className="text-xs text-primary hover:text-primary/80 transition-colors px-1 min-h-[28px]"
                  >
                    + Tema
                  </button>
                  <button
                    onClick={() => {
                      setDeletingUnitId(unit.id)
                      setDeleteUnitMode('delete_all')
                      setMoveToUnitId(localUnits.filter(u => u.id !== unit.id)[0]?.id || '')
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-400/10 transition-all"
                    title="Eliminar unidad"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded content */}
              {!isCollapsed && (
                <div className="px-3 pt-2.5 pb-3 border-t border-border-subtle/50 space-y-2.5">
                  {addingTopicForUnit === unit.id && (
                    <div className="flex gap-2">
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
                    {filteredTopics.map(topic => (
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
                    {topicSearch && filteredTopics.length === 0 && topics.length > 0 && (
                      <p className="text-xs text-text-secondary italic">Sin coincidencias</p>
                    )}
                  </div>
                </div>
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
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Tarea</span>
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
          {localClassLogs.length > LOGS_SHOWN_DEFAULT && (
            <button
              onClick={() => setShowAllLogs(v => !v)}
              className="mt-2 w-full py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              {showAllLogs ? '▲ Ver menos' : `▼ Ver todos (${localClassLogs.length})`}
            </button>
          )}
        </div>
      )}

      {/* ── Delete Unit Modal ─────────────────────────────────── */}
      {deletingUnitId && (() => {
        const unit = localUnits.find(u => u.id === deletingUnitId)
        const topics = unitTopics[deletingUnitId] || []
        const otherUnits = localUnits.filter(u => u.id !== deletingUnitId)
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">Eliminar unidad</h3>
                  <p className="text-xs text-text-secondary mt-0.5">{unit?.name}</p>
                </div>
                <button
                  onClick={() => setDeletingUnitId(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                {topics.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    Esta unidad no tiene temas. Se eliminará directamente.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-text-secondary">
                      Esta unidad tiene <span className="font-semibold text-text-primary">{topics.length} tema{topics.length !== 1 ? 's' : ''}</span>. ¿Qué hacemos con ellos?
                    </p>

                    {/* Options */}
                    <div className="space-y-2">
                      <button
                        onClick={() => setDeleteUnitMode('delete_all')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                          deleteUnitMode === 'delete_all'
                            ? 'border-red-500/50 bg-red-500/10'
                            : 'border-border-subtle bg-surface-2'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          deleteUnitMode === 'delete_all' ? 'border-red-400' : 'border-text-secondary/40'
                        }`}>
                          {deleteUnitMode === 'delete_all' && <div className="w-2 h-2 rounded-full bg-red-400" />}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${deleteUnitMode === 'delete_all' ? 'text-red-300' : 'text-text-secondary'}`}>
                            Eliminar todos los temas
                          </p>
                          <p className="text-xs text-text-secondary mt-0.5">Se quitarán también de fechas y post-clases</p>
                        </div>
                      </button>

                      {otherUnits.length > 0 && (
                        <button
                          onClick={() => { setDeleteUnitMode('move'); if (!moveToUnitId) setMoveToUnitId(otherUnits[0].id) }}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                            deleteUnitMode === 'move'
                              ? 'border-primary/50 bg-primary/10'
                              : 'border-border-subtle bg-surface-2'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            deleteUnitMode === 'move' ? 'border-primary' : 'border-text-secondary/40'
                          }`}>
                            {deleteUnitMode === 'move' && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <p className={`text-sm font-medium ${deleteUnitMode === 'move' ? 'text-primary' : 'text-text-secondary'}`}>
                            Mover temas a otra unidad
                          </p>
                        </button>
                      )}
                    </div>

                    {/* Destination unit selector */}
                    {deleteUnitMode === 'move' && otherUnits.length > 0 && (
                      <div>
                        <p className="text-xs text-text-secondary mb-1.5">Mover a:</p>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {otherUnits.map(u => (
                            <button
                              key={u.id}
                              onClick={() => setMoveToUnitId(u.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                moveToUnitId === u.id
                                  ? 'border-primary/50 bg-primary/10 text-primary'
                                  : 'border-border-subtle bg-surface text-text-secondary'
                              }`}
                            >
                              <span className="text-sm">{u.name}</span>
                              {moveToUnitId === u.id && (
                                <svg className="w-4 h-4 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-3 px-5 pb-5">
                <Button variant="secondary" className="flex-1" onClick={() => setDeletingUnitId(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={confirmDeleteUnit}
                  loading={deletingUnitLoading}
                  disabled={deleteUnitMode === 'move' && !moveToUnitId}
                >
                  Eliminar unidad
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Class log modal (create / edit) ──────────────────── */}
      {showClassLog && (
        <ClassLogModal
          isEditing={!!editingLogId}
          localUnits={localUnits}
          unitTopics={unitTopics}
          allTopics={allTopics}
          upcomingEvts={upcomingEvts}
          classLogData={classLogData}
          classLogOpenUnitId={classLogOpenUnitId}
          classLogUnitRefs={classLogUnitRefs}
          quickAddUnitId={quickAddUnitId}
          quickTopicName={quickTopicName}
          quickAdding={quickAdding}
          linkedEventId={linkedEventId}
          logLoading={logLoading}
          onClose={() => { setShowClassLog(false); setEditingLogId(null) }}
          onSave={saveClassLog}
          onClassLogDataChange={setClassLogData}
          onSetOpenUnit={setClassLogOpenUnitId}
          onToggleTopic={toggleTopicCovered}
          onQuickAddTopic={quickAddTopic}
          onSetQuickAddUnit={setQuickAddUnitId}
          onSetQuickTopicName={setQuickTopicName}
          onSetLinkedEventId={setLinkedEventId}
        />
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
                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-surface-2 text-text-secondary hover:text-red-400 transition-colors shrink-0"
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
                  const topic = unitTopics[topicActionMenu.unitId]?.find(t => t.id === topicActionMenu.id)
                  setEditingTopicDesc({ id: topicActionMenu.id, name: topicActionMenu.name, unitId: topicActionMenu.unitId, desc: topic?.full_description ?? '' })
                  setTopicDescValue(topic?.full_description ?? '')
                  setTopicActionMenu(null)
                }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-surface-2 transition-colors text-left"
              >
                <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-text-primary">Descripción / notas</span>
              </button>
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

      {/* ── Topic description modal ────────────────────────────── */}
      {editingTopicDesc && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Descripción / notas</h3>
                <p className="text-xs text-text-secondary mt-0.5 truncate">{editingTopicDesc.name}</p>
              </div>
              <button onClick={() => setEditingTopicDesc(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <textarea
                value={topicDescValue}
                onChange={e => setTopicDescValue(e.target.value)}
                placeholder="Agregá notas, definiciones, fórmulas o cualquier descripción para este tema..."
                rows={5}
                className="w-full px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60 transition-colors resize-none"
              />
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setEditingTopicDesc(null)}>Cancelar</Button>
                <Button variant="primary" className="flex-1" onClick={saveTopicDescription} loading={topicActionLoading}>Guardar</Button>
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
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
              <h3 className="text-base font-semibold text-text-primary">Fecha importante</h3>
              <button
                onClick={() => setShowEventForm(false)}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
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
                    value={eventData.title}
                    onChange={e => setEventData(d => ({ ...d, title: e.target.value }))}
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
                    value={eventData.type}
                    onChange={e => setEventData(d => ({ ...d, type: e.target.value as AcademicEventType }))}
                    className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                  >
                    <option value="parcial">Parcial</option>
                    <option value="parcial_intermedio">Parcial intermedio</option>
                    <option value="entrega_tp">Entrega TP</option>
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
                    value={eventData.date}
                    onChange={e => setEventData(d => ({ ...d, date: e.target.value }))}
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
                    value={eventTime}
                    onChange={e => setEventTime(e.target.value)}
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
                    value={eventAula}
                    onChange={e => setEventAula(e.target.value)}
                    placeholder="Ej: Aula 3, SUM B"
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary text-right focus:outline-none"
                  />
                </div>
              </div>

              {/* Unit selector */}
              {localUnits.filter(u => (unitTopics[u.id]?.length ?? 0) > 0).length > 0 && (
                <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <select
                      value={eventUnitId}
                      onChange={e => { setEventUnitId(e.target.value); setEventTopicIds([]) }}
                      className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                    >
                      <option value="">Unidad (opcional)</option>
                      {localUnits.filter(u => (unitTopics[u.id]?.length ?? 0) > 0).map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Topics for selected unit */}
              {eventUnitId && (unitTopics[eventUnitId]?.length ?? 0) > 0 && (
                <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                    <p className="text-xs font-medium text-text-secondary">Temas del parcial</p>
                    {eventTopicIds.length > 0 && (
                      <span className="text-xs text-primary font-medium">{eventTopicIds.length} seleccionado{eventTopicIds.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    {unitTopics[eventUnitId].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setEventTopicIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                          eventTopicIds.includes(t.id)
                            ? 'border-primary bg-primary/20 text-text-primary'
                            : 'border-border-subtle bg-surface text-text-secondary'
                        }`}
                      >
                        {eventTopicIds.includes(t.id) ? '✓ ' : ''}{t.name}
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
                    value={eventData.notes}
                    onChange={e => setEventData(d => ({ ...d, notes: e.target.value }))}
                    placeholder="Notas adicionales (opcional)"
                    rows={2}
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 shrink-0">
              <Button
                variant="primary"
                className="w-full"
                onClick={saveEvent}
                loading={eventLoading}
                disabled={!eventData.title || !eventData.date}
              >
                Guardar evento
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingEvent && (
        <EditEventModal
          event={{ ...editingEvent, subject_id: editingEvent.subject_id ?? undefined }}
          subjects={[{ id: subject.id, name: subject.name, color: subject.color, units: subject.units.map(u => ({ id: u.id, name: u.name, topics: u.topics.map((t: any) => ({ id: t.id, name: t.name })) })) }]}
          onClose={() => setEditingEvent(null)}
          onSaved={handleEventSaved}
          onDeleted={handleEventDeleted}
          onDuplicated={(ev) => {
            setLocalEvents(prev => [...prev, ev as AcademicEvent].sort((a, b) => a.date.localeCompare(b.date)))
            router.refresh()
          }}
        />
      )}

      {/* ── Feature 4: Hallucination detection challenge modal ──────────────── */}
      {hallucinationChallenge && (
        <ProgressHallucinationGuard
          challenge={hallucinationChallenge}
          onResult={handleValidationResult}
          onClose={() => {
            setHallucinationChallenge(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
