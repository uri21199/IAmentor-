'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getGreeting, blockTypeColor, blockTypeIcon } from '@/lib/utils'
import { getDaysColor as getColor } from '@/lib/study-priority'
import PomodoroFocus from '@/components/features/PomodoroFocus'
import EditEventModal from '@/components/features/EditEventModal'
import type { CheckIn, DailyPlan, TimeBlock as TimeBlockType, TopicComprehension } from '@/types'

// ── Event type labels ─────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  parcial:            'Parcial',
  parcial_intermedio: 'Parcial Int.',
  entrega_tp:         'Entrega TP',
  medico:             'Turno médico',
  personal:           'Personal',
}

function parseEventNotes(notes: string | null): { topic_ids?: string[] } {
  if (!notes) return {}
  try { const p = JSON.parse(notes); return typeof p === 'object' ? p : {} } catch { return {} }
}

// ── Subject/unit/topic hierarchy for the edit modal ──────────────────────────
interface TopicOption { id: string; name: string; status: string }
interface UnitOption  { id: string; name: string; topics: TopicOption[] }
interface SubjectOption { id: string; name: string; color: string; units: UnitOption[] }

interface Props {
  user: { id: string; email?: string }
  checkin: CheckIn | null
  plan: DailyPlan | null
  upcomingEvents: any[]
  energyHistory: { date: string; energy_level: number }[]
  today: string
  previewBlocks?: TimeBlockType[]
  actionParam?: string
  subjectsData?: SubjectOption[]
}

// ── Time grid helpers ─────────────────────────────────────────────────────────
const GRID_START = 6     // 6:00 AM
const GRID_END   = 24    // midnight
const HOUR_PX    = 64    // pixels per hour

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function blockTop(startTime: string): number {
  const mins = timeToMinutes(startTime)
  return Math.max(0, (mins - GRID_START * 60)) * (HOUR_PX / 60)
}

function blockHeight(startTime: string, endTime: string): number {
  const dur = timeToMinutes(endTime) - timeToMinutes(startTime)
  return Math.max(20, dur * (HOUR_PX / 60))
}

// ── Column assignment for overlapping blocks ──────────────────────────────────
function computeColumns(blocks: TimeBlockType[]): Array<TimeBlockType & { col: number; totalCols: number }> {
  const sorted = [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time))
  const result: Array<TimeBlockType & { col: number; totalCols: number }> = []
  const columnEnds: string[] = []

  for (const block of sorted) {
    let assigned = -1
    for (let i = 0; i < columnEnds.length; i++) {
      if (columnEnds[i] <= block.start_time) {
        assigned = i
        columnEnds[i] = block.end_time
        break
      }
    }
    if (assigned === -1) {
      assigned = columnEnds.length
      columnEnds.push(block.end_time)
    }
    result.push({ ...block, col: assigned, totalCols: 0 })
  }

  // Set totalCols for each block based on overlapping peers
  for (const block of result) {
    const startMins = timeToMinutes(block.start_time)
    const endMins   = timeToMinutes(block.end_time)
    let maxCol = block.col
    for (const other of result) {
      const oStart = timeToMinutes(other.start_time)
      const oEnd   = timeToMinutes(other.end_time)
      if (oStart < endMins && oEnd > startMins) {
        maxCol = Math.max(maxCol, other.col)
      }
    }
    block.totalCols = maxCol + 1
  }

  return result
}

// Block color by type (using inline Tailwind for the grid view)
const BLOCK_STYLE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  work:   { bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    text: 'text-blue-300',    dot: 'bg-blue-400' },
  class:  { bg: 'bg-cyan-500/15',    border: 'border-cyan-500/30',    text: 'text-cyan-300',    dot: 'bg-cyan-400' },
  study:  { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   text: 'text-amber-300',   dot: 'bg-amber-400' },
  travel: { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   text: 'text-amber-300',   dot: 'bg-amber-400' },
  gym:    { bg: 'bg-green-500/15',   border: 'border-green-500/30',   text: 'text-green-300',   dot: 'bg-green-400' },
  rest:   { bg: 'bg-surface-2',      border: 'border-border-subtle',  text: 'text-text-secondary', dot: 'bg-surface' },
  free:   { bg: 'bg-surface-2',      border: 'border-border-subtle',  text: 'text-text-secondary', dot: 'bg-surface' },
  exam:   { bg: 'bg-red-500/15',     border: 'border-red-500/40',     text: 'text-red-300',         dot: 'bg-red-400' },
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TodayClient({
  user,
  checkin,
  plan,
  upcomingEvents,
  energyHistory,
  today,
  previewBlocks = [],
  actionParam,
  subjectsData = [],
}: Props) {
  const supabase     = createClient()
  const gridRef      = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)

  const [blocks, setBlocks] = useState<TimeBlockType[]>(plan?.plan_json || [])
  const [generating, setGenerating] = useState(false)
  const [completion, setCompletion] = useState(plan?.completion_percentage || 0)
  const [upcomingExpanded, setUpcomingExpanded] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [localUpcoming, setLocalUpcoming] = useState<any[]>(upcomingEvents)
  const [editingEvent, setEditingEvent] = useState<any | null>(null)

  // ── Drag & drop state ────────────────────────────────────────────────────
  const [draggingBlock, setDraggingBlock] = useState<{
    id: string
    startY: number
    origStartMins: number
    origDuration: number
    curStartMins: number
  } | null>(null)
  const dragMovedRef = useRef(false)

  // ── Pomodoro state ────────────────────────────────────────────────────────
  const [pomodoroBlock, setPomodoroBlock] = useState<TimeBlockType | null>(null)

  // ── Block editing state ───────────────────────────────────────────────────
  const [editingBlock, setEditingBlock]     = useState<TimeBlockType | null>(null)
  const [editSubjectId, setEditSubjectId]   = useState('')
  const [editTopicId, setEditTopicId]       = useState('')
  const [editTitle, setEditTitle]           = useState('')
  const [editDesc, setEditDesc]             = useState('')
  const [editStartTime, setEditStartTime]   = useState('')
  const [editEndTime, setEditEndTime]       = useState('')
  const [savingEdit, setSavingEdit]         = useState(false)

  const greeting  = getGreeting()
  const dateLabelRaw = format(parseISO(today), "EEEE d 'de' MMMM", { locale: es })
  const dateLabel = dateLabelRaw.charAt(0).toUpperCase() + dateLabelRaw.slice(1)

  // Detect if today has an important academic event (parcial, TP, etc.)
  const IMPORTANT_EVENT_TYPES = ['parcial', 'parcial_intermedio', 'entrega_tp']
  const todayImportantEvent = localUpcoming.find(
    (e: any) => e.date === today && IMPORTANT_EVENT_TYPES.includes(e.type)
  ) ?? null

  // ── Scroll to current time on mount ──────────────────────────────────────
  useEffect(() => {
    if (!gridRef.current) return
    const now = new Date()
    const topPx = ((now.getHours() * 60 + now.getMinutes() - GRID_START * 60) * HOUR_PX) / 60
    gridRef.current.scrollTop = Math.max(0, topPx - 80)
  }, [])

  // ── Client-side clock (avoids UTC mismatch from SSR) ─────────────────────
  useEffect(() => {
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // ── Auto-replan ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (actionParam === 'replan' && blocks.length > 0) handleReplan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionParam])

  // ── Auto-generate plan on mount if none exists ────────────────────────────
  useEffect(() => {
    if (blocks.length > 0 || generating) return
    const controller = new AbortController()
    consumePlanStream(controller.signal)
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Persist ───────────────────────────────────────────────────────────────
  async function persistBlocks(updated: TimeBlockType[]) {
    const active = updated.filter(b => !b.deleted)
    const pct = active.length > 0
      ? Math.round((active.filter(b => b.completed).length / active.length) * 100)
      : 0
    setCompletion(pct)
    await fetch('/api/plan/update-block', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, blocks: updated, completion_percentage: pct }),
    })
  }

  /** Consume SSE stream from /api/ai/plan and update blocks progressively */
  async function consumePlanStream(signal?: AbortSignal) {
    setGenerating(true)
    // Keep a local ref so we can merge micro_review updates correctly
    const accumulated: TimeBlockType[] = []

    const mergeAndSet = (incoming: TimeBlockType[]) => {
      // Merge by id: newer entry wins
      const map = new Map(accumulated.map(b => [b.id, b]))
      for (const b of incoming) map.set(b.id, b)
      accumulated.length = 0
      accumulated.push(...map.values())
      const sorted = [...accumulated].sort((a, b) => a.start_time.localeCompare(b.start_time))
      setBlocks(sorted)
    }

    try {
      const res = await fetch('/api/ai/plan', { method: 'POST', signal })
      if (!res.ok || !res.body) throw new Error('Stream error')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        // SSE events are separated by double newlines
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const chunk of parts) {
          const eventMatch = chunk.match(/^event: (.+)$/m)
          const dataMatch  = chunk.match(/^data: (.+)$/ms)
          if (!dataMatch) continue
          const eventName = eventMatch?.[1] ?? ''
          const payload   = JSON.parse(dataMatch[1])

          if (eventName === 'fixed_blocks') {
            mergeAndSet(payload as TimeBlockType[])
          } else if (eventName === 'block') {
            mergeAndSet([payload as TimeBlockType])
          } else if (eventName === 'update_block') {
            // Attach micro_review (or other fields) to an existing block by id
            const { id, ...patch } = payload as { id: string; [k: string]: unknown }
            const updated = accumulated.map(b => b.id === id ? { ...b, ...patch } : b)
            accumulated.length = 0
            accumulated.push(...updated)
            setBlocks([...updated].sort((a, b) => a.start_time.localeCompare(b.start_time)))
          }
          // 'done' and 'error' events are no-ops in the UI; generation indicator clears via finally
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error('Plan stream error:', err)
    } finally {
      setGenerating(false)
      // Recalculate completion % from the final accumulated blocks.
      // The API preserves completed blocks so the count here is authoritative.
      if (accumulated.length > 0) {
        const active = accumulated.filter(b => !b.deleted)
        const pct = active.length > 0
          ? Math.round((active.filter(b => b.completed).length / active.length) * 100)
          : 0
        setCompletion(pct)
      }
    }
  }

  async function generatePlan() {
    scrollTopRef.current = gridRef.current?.scrollTop ?? 0
    const prevCompletion = completion
    setBlocks([])
    setCompletion(prevCompletion) // keep % visible while new plan streams in
    await consumePlanStream()
  }

  // Restore scroll position after blocks re-render following regeneration
  useEffect(() => {
    if (blocks.length > 0 && scrollTopRef.current > 0 && gridRef.current) {
      gridRef.current.scrollTop = scrollTopRef.current
      scrollTopRef.current = 0
    }
  }, [blocks.length > 0])

  async function handleReplan() {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change: 'Tengo más energía de lo esperado y quiero una sesión más productiva' }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.blocks?.length) setBlocks(data.blocks)
    } catch (err) { console.error(err) }
    finally { setGenerating(false) }
  }

  async function toggleBlock(id: string, completed: boolean) {
    const updated = blocks.map(b => b.id === id ? { ...b, completed } : b)
    setBlocks(updated)
    await persistBlocks(updated)
  }

  async function deleteBlock(id: string) {
    // Soft-delete: mark deleted so the time slot shows as free space,
    // other blocks don't shift, and the AI won't regenerate this slot.
    const updated = blocks.map(b => b.id === id ? { ...b, deleted: true } : b)
    setBlocks(updated)
    setEditingBlock(null)
    await persistBlocks(updated)
  }

  function openEdit(block: TimeBlockType) {
    setEditingBlock(block)
    setEditTitle(block.title)
    setEditDesc(block.description)
    setEditSubjectId(block.subject_id || '')
    setEditTopicId(block.topic_id || '')
    setEditStartTime(block.start_time)
    setEditEndTime(block.end_time)
  }

  async function saveEditedBlock() {
    if (!editingBlock) return
    setSavingEdit(true)
    try {
      const editedIdx = blocks.findIndex(b => b.id === editingBlock.id)
      const topicChanged = editTopicId !== (editingBlock.topic_id || '')

      let updated = blocks.map(b =>
        b.id === editingBlock.id
          ? { ...b, title: editTitle, description: editDesc, subject_id: editSubjectId || undefined, topic_id: editTopicId || undefined, start_time: editStartTime, end_time: editEndTime, manually_edited: true }
          : b
      )

      if (editedIdx >= 0 && editedIdx < updated.length - 1) {
        const next = updated[editedIdx + 1]
        if (editEndTime > next.start_time) {
          if (editEndTime >= next.end_time) {
            updated = updated.filter((_, i) => i !== editedIdx + 1)
          } else {
            updated = updated.map((b, i) => i === editedIdx + 1 ? { ...b, start_time: editEndTime } : b)
          }
        }
      }

      updated.sort((a, b) => a.start_time.localeCompare(b.start_time))
      setBlocks(updated)
      await persistBlocks(updated)

      if (topicChanged && editTopicId && editingBlock.type === 'study') {
        await supabase.from('topics').update({ last_studied: new Date().toISOString(), status: 'yellow' }).eq('id', editTopicId).eq('status', 'red')
      }
      setEditingBlock(null)
    } finally {
      setSavingEdit(false)
    }
  }

  const selectedSubjectUnits = subjectsData.find(s => s.id === editSubjectId)?.units ?? []

  // ── Pomodoro handlers ─────────────────────────────────────────────────────
  async function handlePomodoroComplete(status: TopicComprehension) {
    if (!pomodoroBlock) return
    // Mark the block as completed in the plan (topic status was already saved
    // inside PomodoroFocus before this callback fires)
    await toggleBlock(pomodoroBlock.id, true)
    setPomodoroBlock(null)
  }

  function handlePomodoroAbandon() {
    setPomodoroBlock(null)
  }

  // Lookup helpers for the active pomodoro block
  const pomodoroSubject = pomodoroBlock
    ? subjectsData.find(s => s.id === pomodoroBlock.subject_id)
    : undefined
  const pomodoroTopic = pomodoroSubject
    ? pomodoroSubject.units.flatMap(u => u.topics).find(t => t.id === pomodoroBlock?.topic_id)
    : undefined

  // ── Drag & drop handlers ──────────────────────────────────────────────────
  function handleDragStart(e: React.PointerEvent, block: TimeBlockType) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragMovedRef.current = false
    setDraggingBlock({
      id: block.id,
      startY: e.clientY,
      origStartMins: timeToMinutes(block.start_time),
      origDuration: timeToMinutes(block.end_time) - timeToMinutes(block.start_time),
      curStartMins: timeToMinutes(block.start_time),
    })
  }

  function handleDragMove(e: React.PointerEvent) {
    if (!draggingBlock) return
    const deltaY = e.clientY - draggingBlock.startY
    if (Math.abs(deltaY) > 5) dragMovedRef.current = true
    const rawDeltaMins = (deltaY * 60) / HOUR_PX
    const snappedDeltaMins = Math.round(rawDeltaMins / 15) * 15
    const newStart = Math.max(
      GRID_START * 60,
      Math.min(GRID_END * 60 - draggingBlock.origDuration, draggingBlock.origStartMins + snappedDeltaMins)
    )
    if (newStart !== draggingBlock.curStartMins) {
      setDraggingBlock(prev => prev ? { ...prev, curStartMins: newStart } : null)
    }
  }

  function handleDragEnd() {
    if (!draggingBlock) return
    if (dragMovedRef.current) {
      const pad = (n: number) =>
        `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
      const newStart = pad(draggingBlock.curStartMins)
      const newEnd   = pad(draggingBlock.curStartMins + draggingBlock.origDuration)
      const updated = blocks
        .map(b => b.id === draggingBlock.id ? { ...b, start_time: newStart, end_time: newEnd } : b)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
      setBlocks(updated)
      persistBlocks(updated)
    }
    setDraggingBlock(null)
  }

  // ── Current time indicator (now is client-only to avoid SSR UTC offset) ──
  const currentTimePx = now
    ? ((now.getHours() * 60 + now.getMinutes() - GRID_START * 60) * HOUR_PX) / 60
    : -1
  const showCurrentTime = now
    ? now.getHours() >= GRID_START && now.getHours() < GRID_END
    : false

  // ── Render ────────────────────────────────────────────────────────────────
  const displayBlocks = useMemo(
    () => blocks.length > 0 ? blocks.filter(b => !b.deleted) : previewBlocks,
    [blocks, previewBlocks]
  )
  const displayBlocksWithCols = useMemo(
    () => computeColumns(displayBlocks),
    [displayBlocks]
  )
  const hasTodayStudyBlock = useMemo(
    () => displayBlocks.some(b => b.type === 'study'),
    [displayBlocks]
  )

  return (
    <div className="flex flex-col max-w-lg mx-auto md:max-w-2xl lg:max-w-3xl">

      {/* ── Header strip ────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary leading-snug">
            {greeting}
            <span className="text-xs font-normal text-text-secondary ml-2">{dateLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Completion badge */}
          {blocks.length > 0 && (
            <div className="flex flex-col items-center bg-surface-2 border border-border-subtle rounded-2xl px-3 py-1.5 min-w-[52px]">
              <span className="text-base font-bold text-primary leading-none">{Math.round(completion)}%</span>
              <span className="text-[9px] text-text-secondary mt-0.5">hoy</span>
            </div>
          )}
          {/* Regenerate button */}
          {blocks.length > 0 && (
            <button
              onClick={generatePlan}
              disabled={generating}
              aria-label="Regenerar plan (conserva los bloques completados)"
              className="w-9 h-9 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
              title="Regenerar plan"
            >
              <svg className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>



      {/* ── Important event today banner (compact chip) ──────────────────────── */}
      {todayImportantEvent && (
        <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/35">
          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs font-semibold text-amber-300 shrink-0">
            {TYPE_LABELS[todayImportantEvent.type] ?? todayImportantEvent.type}:
          </p>
          <p className="text-xs text-amber-200/80 truncate flex-1" title={todayImportantEvent.title}>
            {todayImportantEvent.title}
          </p>
          {!checkin ? (
            <Link href="/checkin" className="text-xs font-medium text-amber-300 shrink-0 underline underline-offset-2">
              Check-in
            </Link>
          ) : (
            <Badge variant="exam-today">HOY</Badge>
          )}
        </div>
      )}

      {/* ── Check-in CTA ─────────────────────────────────────────────────────── */}
      {!checkin && !todayImportantEvent && (
        <div className="mx-4 mb-2 flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-primary/10 border border-primary/25">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </div>
          <p className="text-xs font-medium text-text-secondary flex-1">Personaliza tu plan con el check-in matutino</p>
          <Link href="/checkin" className="text-xs font-semibold text-primary shrink-0 px-2.5 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 transition-colors">
            Hacer →
          </Link>
        </div>
      )}

      {/* ── Empty plan CTA ───────────────────────────────────────────────────── */}
      {checkin && blocks.length === 0 && !generating && (
        <div className="mx-4 mb-3 rounded-3xl bg-surface-2 border border-border-subtle p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">Sin plan generado</p>
          <p className="text-xs text-text-secondary mb-4">La IA puede crear tu plan en segundos</p>
          <Button variant="primary" onClick={generatePlan} loading={generating}>
            Generar plan con IA
          </Button>
        </div>
      )}

      {generating && blocks.length === 0 && (
        <div className="mx-4 mb-3 rounded-3xl bg-surface-2 border border-border-subtle p-8 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-text-primary mb-1">Claude está generando tu plan...</p>
          <p className="text-xs text-text-secondary">Los bloques aparecerán a medida que se generen</p>
        </div>
      )}

      {/* Inline generating indicator — shown when blocks already exist but we're still streaming */}
      {generating && blocks.length > 0 && (
        <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-2xl bg-primary/10 border border-primary/20">
          <div className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-xs text-primary font-medium">Claude está escribiendo los bloques restantes...</p>
        </div>
      )}

      {/* Study-suppressed notice — exam day with no study blocks generated */}
      {!generating && todayImportantEvent && !hasTodayStudyBlock && blocks.length > 0 && (
        <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-amber-500/8 border border-amber-500/20">
          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-amber-300/80">Bloques de estudio suprimidos — concentración total en el evento de hoy.</p>
        </div>
      )}

      {/* ── Hourly timeline grid ──────────────────────────────────────────────── */}
      {displayBlocksWithCols.length > 0 && (
        <div
          ref={gridRef}
          className="overflow-y-auto px-4 pt-3 pb-24 md:pb-8"
          style={{ maxHeight: 'calc(100dvh - 12rem)' }}
        >
          <div className="relative" style={{ height: `${(GRID_END - GRID_START) * HOUR_PX}px` }}>

            {/* Hour lines + labels */}
            {Array.from({ length: GRID_END - GRID_START + 1 }, (_, i) => {
              const hour = GRID_START + i
              const isHalfVisible = hour < GRID_END
              return (
                <div
                  key={hour}
                  className="absolute left-0 right-0 flex items-start"
                  style={{ top: `${i * HOUR_PX}px` }}
                >
                  <span className="text-[10px] text-text-secondary w-10 shrink-0 -mt-1.5 select-none">
                    {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                  </span>
                  {isHalfVisible && (
                    <div className="flex-1 ml-1">
                      <div className="border-t border-border-subtle w-full" />
                      {/* Half-hour dashed line */}
                      <div
                        className="border-t border-border-subtle/40 border-dashed w-full"
                        style={{ marginTop: `${HOUR_PX / 2 - 1}px` }}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Current time indicator */}
            {showCurrentTime && (
              <div
                className="absolute left-10 right-0 z-20 flex items-center gap-1 pointer-events-none"
                style={{ top: `${currentTimePx}px` }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 -ml-1" />
                <div className="flex-1 border-t-2 border-red-500" />
              </div>
            )}

            {/* Time blocks */}
            {displayBlocksWithCols.map(block => {
              const isBeingDragged = draggingBlock !== null && draggingBlock.id === block.id
              const displayStartMins = isBeingDragged ? draggingBlock!.curStartMins : timeToMinutes(block.start_time)
              const top    = Math.max(0, (displayStartMins - GRID_START * 60)) * (HOUR_PX / 60)
              const height = blockHeight(block.start_time, block.end_time)
              const style  = BLOCK_STYLE[block.type] ?? BLOCK_STYLE.free
              const isPreview = !checkin
              // Column-aware positioning (left-11 = 2.75rem)
              // Column layout with 3px gap between overlapping blocks
              const gap = block.totalCols > 1 ? 3 : 0
              const leftVal  = block.totalCols > 1
                ? `calc(2.75rem + (100% - 2.75rem) * ${block.col / block.totalCols} + ${block.col > 0 ? gap : 0}px)`
                : '2.75rem'
              const rightVal = block.totalCols > 1
                ? `calc((100% - 2.75rem) * ${(block.totalCols - block.col - 1) / block.totalCols} + ${block.col < block.totalCols - 1 ? gap : 0}px)`
                : '0px'

              return (
                <button
                  key={block.id}
                  onPointerDown={!isPreview ? e => handleDragStart(e, block) : undefined}
                  onPointerMove={!isPreview ? handleDragMove : undefined}
                  onPointerUp={!isPreview ? handleDragEnd : undefined}
                  onPointerCancel={!isPreview ? handleDragEnd : undefined}
                  onClick={() => !isPreview && !dragMovedRef.current && openEdit(block)}
                  className={`absolute rounded-2xl border px-2.5 py-1.5 text-left ${style.bg} ${style.border} ${block.manually_edited ? 'ring-1 ring-amber-400/50' : ''} ${isPreview ? 'opacity-60 pointer-events-none' : ''} ${block.completed && !isBeingDragged ? 'opacity-40' : ''} ${isBeingDragged ? 'shadow-xl z-10 scale-[1.02]' : 'transition-all active:scale-[0.98]'}`}
                  style={{ top: `${top}px`, height: `${height}px`, minHeight: '20px', left: leftVal, right: rightVal, touchAction: isBeingDragged ? 'none' : 'pan-y', cursor: isBeingDragged ? 'grabbing' : 'grab' }}
                >
                  <div className="flex items-start gap-1.5 h-full overflow-hidden">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${style.dot}`} />
                    {block.manually_edited && (
                      <svg className="w-2.5 h-2.5 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                      </svg>
                    )}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className={`text-xs font-semibold leading-tight truncate ${style.text} ${block.completed ? 'line-through' : ''}`}>
                        {block.title}
                      </p>
                      {height >= 44 && (
                        <p className="text-[10px] text-text-secondary leading-tight mt-0.5 truncate">
                          {block.start_time} – {block.end_time}
                        </p>
                      )}
                      {height >= 64 && block.description && (
                        <p className="text-[10px] text-text-secondary mt-0.5 line-clamp-2 leading-tight">
                          {block.description}
                        </p>
                      )}
                    </div>
                    {/* Focus button — study blocks only, not completed */}
                    {!isPreview && block.type === 'study' && !block.completed && (
                      <div
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setPomodoroBlock(block) }}
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center -mr-1 bg-violet-500/20 border border-violet-500/40 hover:bg-violet-500/30 transition-colors"
                        title="Iniciar foco"
                      >
                        <svg className="w-3 h-3 ml-px" fill="#A78BFA" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    )}

                    {/* Completion dot — outer 32px hit area, inner 16px visual */}
                    {!isPreview && (
                      <div
                        onClick={e => { e.stopPropagation(); toggleBlock(block.id, !block.completed) }}
                        className="shrink-0 w-8 h-8 flex items-center justify-center -mr-1.5 cursor-pointer"
                      >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          block.completed
                            ? 'border-green-400 bg-green-400/20'
                            : 'border-current opacity-50'
                        }`}>
                          {block.completed && (
                            <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Upcoming academic events ──────────────────────────────────────────── */}
      {localUpcoming.length > 0 && (
        <div className="px-4 pb-4 mt-2">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-text-primary">Próximas fechas</p>
            <span className="ml-auto text-xs text-text-secondary">{localUpcoming.length}</span>
          </div>

          <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
            {(upcomingExpanded ? localUpcoming : localUpcoming.slice(0, 3)).map((event: any, i: number, arr: any[]) => {
              const days  = differenceInDays(parseISO(event.date), startOfDay(new Date()))
              const color = getColor(days)
              const isLast = i === arr.length - 1
              const isImportantToday = days === 0 && IMPORTANT_EVENT_TYPES.includes(event.type)
              return (
                <div
                  key={event.id}
                  onClick={() => setEditingEvent(event)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-surface transition-colors ${!isLast ? 'border-b border-border-subtle' : ''} ${isImportantToday ? 'bg-amber-500/[0.12] border-l-2 border-l-amber-500/60' : ''}`}
                >
                  <div className="flex flex-col items-center self-stretch py-0.5 shrink-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isImportantToday ? 'bg-amber-400 ring-2 ring-amber-400/40' : color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-400' : 'bg-green-500'}`} />
                    {!isLast && <div className="w-px flex-1 bg-border-subtle mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{event.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-text-secondary bg-surface px-2 py-0.5 rounded-full border border-border-subtle">
                        {TYPE_LABELS[event.type] ?? event.type}
                      </span>
                      {event.subjects?.name && (
                        <span className="text-xs text-text-secondary">{event.subjects.name}</span>
                      )}
                      {(() => {
                        const n = parseEventNotes(event.notes)
                        return n.topic_ids && n.topic_ids.length > 0
                          ? <span className="text-[10px] text-primary/70">{n.topic_ids.length} tema{n.topic_ids.length > 1 ? 's' : ''}</span>
                          : null
                      })()}
                    </div>
                  </div>
                  {isImportantToday ? (
                    <Badge variant="exam-today">HOY</Badge>
                  ) : (
                    <Badge variant={color === 'red' ? 'danger' : color === 'amber' ? 'warning' : 'success'}>
                      {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                    </Badge>
                  )}
                </div>
              )
            })}
            {localUpcoming.length > 3 && (
              <button
                onClick={() => setUpcomingExpanded(p => !p)}
                className="w-full px-4 py-2.5 border-t border-border-subtle text-xs text-primary font-medium text-left"
              >
                {upcomingExpanded ? 'Mostrar menos' : `Ver ${localUpcoming.length - 3} más`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Pomodoro fullscreen overlay ───────────────────────────────────────── */}
      {pomodoroBlock && (
        <PomodoroFocus
          blockId={pomodoroBlock.id}
          subjectId={pomodoroBlock.subject_id}
          topicId={pomodoroBlock.topic_id}
          subjectName={pomodoroSubject?.name}
          subjectColor={pomodoroSubject?.color}
          topicName={pomodoroTopic?.name}
          userId={user.id}
          planDate={today}
          onComplete={handlePomodoroComplete}
          onAbandon={handlePomodoroAbandon}
        />
      )}

      {/* ── Edit block modal ──────────────────────────────────────────────────── */}
      {editingBlock && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
              <h3 className="text-base font-semibold text-text-primary">Editar bloque</h3>
              <button onClick={() => setEditingBlock(null)} className="w-11 h-11 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {/* Micro-review card — travel blocks only */}
              {editingBlock.type === 'travel' && editingBlock.micro_review && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📚</span>
                    <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">Micro-repaso</p>
                  </div>
                  <p className="text-sm font-medium text-text-primary">{editingBlock.micro_review.topic}</p>
                  <div className="space-y-1.5">
                    {editingBlock.micro_review.pills.map((pill, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                        <p className="text-xs text-text-secondary leading-snug">{pill}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-amber-500/10 border border-amber-400/20 px-3 py-2.5">
                    <p className="text-[10px] text-amber-400 font-medium mb-1">Autoevaluación</p>
                    <p className="text-xs text-text-primary leading-snug">{editingBlock.micro_review.self_test}</p>
                  </div>
                </div>
              )}

              {/* Time group */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-text-secondary w-14 shrink-0">Inicio</span>
                  <input type="time" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none" />
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-text-secondary w-14 shrink-0">Fin</span>
                  <input type="time" value={editEndTime} onChange={e => setEditEndTime(e.target.value)} className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none" />
                </div>
              </div>

              {/* Title + Description */}
              <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Título" className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary focus:outline-none" />
                </div>
                <div className="flex items-start gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Descripción (opcional)" rows={2} className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none" />
                </div>
              </div>

              {/* Subject + Topic (study blocks only) */}
              {editingBlock.type === 'study' && subjectsData.length > 0 && (
                <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                    <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <select value={editSubjectId} onChange={e => { setEditSubjectId(e.target.value); setEditTopicId('') }} className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none">
                      <option value="">Sin materia</option>
                      {subjectsData.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  {editSubjectId && selectedSubjectUnits.length > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <select value={editTopicId} onChange={e => setEditTopicId(e.target.value)} className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none">
                        <option value="">Sin tema específico</option>
                        {selectedSubjectUnits.map(unit => (
                          <optgroup key={unit.id} label={unit.name}>
                            {unit.topics.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.status === 'green' ? '🟢' : t.status === 'yellow' ? '🟡' : '🔴'} {t.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 pb-3 shrink-0">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingBlock(null)}>Cancelar</Button>
              <Button variant="primary" className="flex-1" onClick={saveEditedBlock} loading={savingEdit} disabled={!editTitle.trim() || !editStartTime || !editEndTime}>
                Guardar
              </Button>
            </div>
            <div className="px-5 pb-5 shrink-0">
              <button
                type="button"
                onClick={() => deleteBlock(editingBlock.id)}
                className="w-full py-2 text-sm text-red-400 font-medium"
              >
                Eliminar bloque
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Event editing modal ───────────────────────────────────────────────── */}
      {editingEvent && (
        <EditEventModal
          event={editingEvent}
          subjects={subjectsData.map(s => ({ id: s.id, name: s.name, color: s.color, units: s.units.map(u => ({ id: u.id, name: u.name, topics: u.topics.map(t => ({ id: t.id, name: t.name })) })) }))}
          onClose={() => setEditingEvent(null)}
          onSaved={updated => {
            const newSubj = subjectsData.find(s => s.id === updated.subject_id)
            setLocalUpcoming(prev =>
              prev.map(e => e.id === updated.id
                ? { ...e, ...updated, subjects: newSubj ? { name: newSubj.name, color: newSubj.color } : e.subjects }
                : e
              ).sort((a, b) => a.date.localeCompare(b.date))
            )
            setEditingEvent(null)
          }}
          onDeleted={id => {
            setLocalUpcoming(prev => prev.filter(e => e.id !== id))
            setEditingEvent(null)
          }}
          onDuplicated={ev => {
            if (ev.date < today) return
            const newSubj = subjectsData.find(s => s.id === ev.subject_id)
            setLocalUpcoming(prev =>
              [...prev, { ...ev, subjects: newSubj ? { name: newSubj.name, color: newSubj.color } : null }]
                .sort((a, b) => a.date.localeCompare(b.date))
            )
          }}
        />
      )}
    </div>
  )
}
