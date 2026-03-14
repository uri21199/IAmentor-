'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import Button from '@/components/ui/Button'
import { getGreeting, blockTypeColor, blockTypeIcon } from '@/lib/utils'
import { getDaysColor as getColor } from '@/lib/study-priority'
import type { CheckIn, DailyPlan, TimeBlock as TimeBlockType } from '@/types'

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
  return Math.max(28, dur * (HOUR_PX / 60))
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
  study:  { bg: 'bg-violet-500/15',  border: 'border-violet-500/30',  text: 'text-violet-300',  dot: 'bg-violet-400' },
  travel: { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   text: 'text-amber-300',   dot: 'bg-amber-400' },
  gym:    { bg: 'bg-green-500/15',   border: 'border-green-500/30',   text: 'text-green-300',   dot: 'bg-green-400' },
  rest:   { bg: 'bg-surface-2',      border: 'border-border-subtle',  text: 'text-text-secondary', dot: 'bg-surface' },
  free:   { bg: 'bg-surface-2',      border: 'border-border-subtle',  text: 'text-text-secondary', dot: 'bg-surface' },
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
  const supabase = createClient()
  const gridRef  = useRef<HTMLDivElement>(null)

  const [blocks, setBlocks] = useState<TimeBlockType[]>(plan?.plan_json || [])
  const [generating, setGenerating] = useState(false)
  const [completion, setCompletion] = useState(plan?.completion_percentage || 0)
  const [upcomingExpanded, setUpcomingExpanded] = useState(false)

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

  // ── Scroll to current time on mount ──────────────────────────────────────
  useEffect(() => {
    if (!gridRef.current) return
    const now = new Date()
    const topPx = ((now.getHours() * 60 + now.getMinutes() - GRID_START * 60) * HOUR_PX) / 60
    gridRef.current.scrollTop = Math.max(0, topPx - 80)
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
    setGenerating(true)
    fetch('/api/ai/plan', { method: 'POST', signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => setBlocks(data.blocks))
      .catch(err => { if (err.name !== 'AbortError') console.error(err) })
      .finally(() => setGenerating(false))
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Persist ───────────────────────────────────────────────────────────────
  async function persistBlocks(updated: TimeBlockType[]) {
    const pct = updated.length > 0
      ? Math.round((updated.filter(b => b.completed).length / updated.length) * 100)
      : 0
    setCompletion(pct)
    await fetch('/api/plan/update-block', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, blocks: updated, completion_percentage: pct }),
    })
  }

  async function generatePlan() {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/plan', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setBlocks(data.blocks)
    } catch (err) { console.error(err) }
    finally { setGenerating(false) }
  }

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
    const idx = blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    const deletedStart = blocks[idx].start_time
    let updated = blocks.filter(b => b.id !== id)
    if (idx < updated.length) {
      updated = updated.map((b, i) => i === idx ? { ...b, start_time: deletedStart } : b)
    }
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
          ? { ...b, title: editTitle, description: editDesc, subject_id: editSubjectId || undefined, topic_id: editTopicId || undefined, start_time: editStartTime, end_time: editEndTime }
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

  // ── Current time indicator ────────────────────────────────────────────────
  const now = new Date()
  const currentTimePx = ((now.getHours() * 60 + now.getMinutes() - GRID_START * 60) * HOUR_PX) / 60
  const showCurrentTime = now.getHours() >= GRID_START && now.getHours() < GRID_END

  // ── Render ────────────────────────────────────────────────────────────────
  const displayBlocks = checkin ? blocks : previewBlocks
  const displayBlocksWithCols = computeColumns(displayBlocks)

  return (
    <div className="flex flex-col max-w-lg mx-auto">

      {/* ── Header strip ────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-text-secondary">{dateLabel}</p>
          <p className="text-lg font-bold text-text-primary mt-0.5">{greeting}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Completion badge */}
          {checkin && blocks.length > 0 && (
            <div className="flex flex-col items-center bg-surface-2 border border-border-subtle rounded-2xl px-3 py-1.5 min-w-[52px]">
              <span className="text-base font-bold text-primary leading-none">{Math.round(completion)}%</span>
              <span className="text-[9px] text-text-secondary mt-0.5">hoy</span>
            </div>
          )}
          {/* Regenerate button */}
          {checkin && blocks.length > 0 && (
            <button
              onClick={generatePlan}
              disabled={generating}
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

      {/* Progress bar */}
      {checkin && blocks.length > 0 && (
        <div className="px-4 pb-2">
          <ProgressBar value={completion} color="primary" size="sm" />
        </div>
      )}


      {/* ── Check-in CTA ─────────────────────────────────────────────────────── */}
      {!checkin && (
        <div className="mx-4 mb-3 rounded-3xl p-4 bg-primary/10 border border-primary/25">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Check-in matutino</p>
              <p className="text-xs text-text-secondary">Completalo para personalizar tu plan</p>
            </div>
          </div>
          <Link href="/checkin">
            <Button variant="primary" size="md" className="w-full">Hacer check-in ahora</Button>
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
          <p className="text-xs text-text-secondary">Generando tu plan...</p>
        </div>
      )}

      {/* ── Hourly timeline grid ──────────────────────────────────────────────── */}
      {displayBlocksWithCols.length > 0 && (
        <div
          ref={gridRef}
          className="overflow-y-auto px-4 pt-3 pb-32"
          style={{ maxHeight: 'calc(100dvh - 200px)' }}
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
              const top    = blockTop(block.start_time)
              const height = blockHeight(block.start_time, block.end_time)
              const style  = BLOCK_STYLE[block.type] ?? BLOCK_STYLE.free
              const isPreview = !checkin
              // Column-aware positioning (left-11 = 2.75rem)
              const leftVal  = block.totalCols > 1
                ? `calc(2.75rem + (100% - 2.75rem) * ${block.col / block.totalCols})`
                : '2.75rem'
              const rightVal = block.totalCols > 1
                ? `calc((100% - 2.75rem) * ${(block.totalCols - block.col - 1) / block.totalCols} + 1px)`
                : '0px'

              return (
                <button
                  key={block.id}
                  onClick={() => !isPreview && openEdit(block)}
                  className={`absolute rounded-2xl border px-2.5 py-1.5 text-left transition-all active:scale-[0.98] ${style.bg} ${style.border} ${isPreview ? 'opacity-60 pointer-events-none' : ''} ${block.completed ? 'opacity-40' : ''}`}
                  style={{ top: `${top}px`, height: `${height}px`, minHeight: '28px', left: leftVal, right: rightVal }}
                >
                  <div className="flex items-start gap-1.5 h-full overflow-hidden">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${style.dot}`} />
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
                    {/* Completion dot */}
                    {!isPreview && (
                      <div
                        onClick={e => { e.stopPropagation(); toggleBlock(block.id, !block.completed) }}
                        className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                          block.completed
                            ? 'border-green-400 bg-green-400/20'
                            : `border-current opacity-50`
                        }`}
                      >
                        {block.completed && (
                          <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
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
      {upcomingEvents.length > 0 && (
        <div className="px-4 pb-4 mt-2">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-text-primary">Próximas fechas</p>
            <span className="ml-auto text-xs text-text-secondary">{upcomingEvents.length}</span>
          </div>

          <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
            {(upcomingExpanded ? upcomingEvents : upcomingEvents.slice(0, 3)).map((event: any, i: number, arr: any[]) => {
              const days  = differenceInDays(parseISO(event.date), new Date())
              const color = getColor(days)
              const isLast = i === arr.length - 1
              return (
                <div key={event.id} className={`flex items-center gap-3 px-4 py-3 ${!isLast ? 'border-b border-border-subtle' : ''}`}>
                  <div className="flex flex-col items-center self-stretch py-0.5 shrink-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-400' : 'bg-green-500'}`} />
                    {!isLast && <div className="w-px flex-1 bg-border-subtle mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{event.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{event.subjects?.name}</p>
                  </div>
                  <Badge variant={color === 'red' ? 'danger' : color === 'amber' ? 'warning' : 'success'}>
                    {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                  </Badge>
                </div>
              )
            })}
            {upcomingEvents.length > 3 && (
              <button
                onClick={() => setUpcomingExpanded(p => !p)}
                className="w-full px-4 py-2.5 border-t border-border-subtle text-xs text-primary font-medium text-left"
              >
                {upcomingExpanded ? 'Mostrar menos' : `Ver ${upcomingEvents.length - 3} más`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Edit block modal ──────────────────────────────────────────────────── */}
      {editingBlock && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
              <h3 className="text-base font-semibold text-text-primary">Editar bloque</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => deleteBlock(editingBlock.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/10 text-red-400"
                  title="Eliminar bloque"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <button onClick={() => setEditingBlock(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3">
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

            <div className="flex gap-3 px-5 pb-5 shrink-0">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingBlock(null)}>Cancelar</Button>
              <Button variant="primary" className="flex-1" onClick={saveEditedBlock} loading={savingEdit} disabled={!editTitle.trim() || !editStartTime || !editEndTime}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
