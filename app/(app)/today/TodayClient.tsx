'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { TimeBlock } from '@/components/ui/TimeBlock'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import Button from '@/components/ui/Button'
import { getGreeting, stressLabel } from '@/lib/utils'
import { getDaysColor as getColor } from '@/lib/study-priority'
import type { CheckIn, DailyPlan, TimeBlock as TimeBlockType } from '@/types'

// ── dnd-kit imports ───────────────────────────────────────────────────────────
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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

// ── Sortable block wrapper ────────────────────────────────────────────────────
function SortableBlockRow({
  block,
  menuOpen,
  onMenuToggle,
  onToggle,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  isFirst,
  isLast,
}: {
  block: TimeBlockType
  menuOpen: boolean
  onMenuToggle: () => void
  onToggle: (id: string, completed: boolean) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onDelete: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="flex items-stretch gap-1">
        {/* ≡ drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-7 shrink-0 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors text-base cursor-grab active:cursor-grabbing touch-none"
          aria-label="Mover bloque"
        >
          ≡
        </button>
        {/* ⋮ options menu */}
        <button
          onClick={onMenuToggle}
          className="w-7 shrink-0 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors text-base"
          aria-label="Opciones"
        >
          ⋮
        </button>
        {/* TimeBlock */}
        <div className="flex-1 min-w-0">
          <TimeBlock block={block} onToggle={onToggle} />
        </div>
      </div>

      {/* Action row */}
      {menuOpen && (
        <div className="flex gap-2 mt-1 ml-[56px] animate-in slide-in-from-top-1 duration-150">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="flex-1 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors min-h-[36px] disabled:opacity-30"
          >
            ↑ Subir
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="flex-1 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors min-h-[36px] disabled:opacity-30"
          >
            ↓ Bajar
          </button>
          <button
            onClick={onEdit}
            className="flex-1 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors min-h-[36px]"
          >
            ✎ Editar
          </button>
          <button
            onClick={onDelete}
            className="flex-1 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 hover:text-red-300 transition-colors min-h-[36px]"
          >
            🗑 Borrar
          </button>
        </div>
      )}
    </div>
  )
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
  const router = useRouter()
  const supabase = createClient()

  const [blocks, setBlocks] = useState<TimeBlockType[]>(plan?.plan_json || [])
  const [generating, setGenerating] = useState(false)
  const [completion, setCompletion] = useState(plan?.completion_percentage || 0)

  // ── Block editing state ───────────────────────────────────────────────────
  const [blockMenuId, setBlockMenuId]       = useState<string | null>(null)
  const [editingBlock, setEditingBlock]     = useState<TimeBlockType | null>(null)
  const [editSubjectId, setEditSubjectId]   = useState('')
  const [editTopicId, setEditTopicId]       = useState('')
  const [editTitle, setEditTitle]           = useState('')
  const [editDesc, setEditDesc]             = useState('')
  const [editStartTime, setEditStartTime]   = useState('')
  const [editEndTime, setEditEndTime]       = useState('')
  const [savingEdit, setSavingEdit]         = useState(false)

  const greeting  = getGreeting()
  const dateLabel = format(parseISO(today), "EEEE d 'de' MMMM", { locale: es })

  // ── dnd-kit sensors (pointer + touch + keyboard) ──────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Auto-replan ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (actionParam === 'replan' && blocks.length > 0) {
      handleReplan()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionParam])

  // ── Persist blocks to DB ──────────────────────────────────────────────────
  async function persistBlocks(updated: TimeBlockType[]) {
    const completedCount = updated.filter(b => b.completed).length
    const pct = updated.length > 0 ? Math.round((completedCount / updated.length) * 100) : 0
    setCompletion(pct)
    await fetch('/api/plan/update-block', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, blocks: updated, completion_percentage: pct }),
    })
  }

  // ── Generate plan ─────────────────────────────────────────────────────────
  async function generatePlan() {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/plan', { method: 'POST' })
      if (!res.ok) throw new Error('Error al generar el plan')
      const data = await res.json()
      setBlocks(data.blocks)
    } catch (err) {
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  // ── Replan ────────────────────────────────────────────────────────────────
  async function handleReplan() {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change: 'Tengo más energía de lo esperado y quiero una sesión más productiva' }),
      })
      if (!res.ok) throw new Error('Error al replanificar')
      const data = await res.json()
      if (data.blocks?.length) setBlocks(data.blocks)
    } catch (err) {
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  // ── Toggle block completion ───────────────────────────────────────────────
  async function toggleBlock(id: string, completed: boolean) {
    const updated = blocks.map(b => b.id === id ? { ...b, completed } : b)
    setBlocks(updated)
    await persistBlocks(updated)
  }

  // ── Delete block — next block inherits deleted block's start_time ─────────
  async function deleteBlock(id: string) {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    const deletedStartTime = blocks[idx].start_time

    let updated = blocks.filter(b => b.id !== id)
    // The block that was immediately after the deleted one takes the freed start_time
    if (idx < updated.length) {
      updated = updated.map((b, i) =>
        i === idx ? { ...b, start_time: deletedStartTime } : b
      )
    }
    setBlocks(updated)
    setBlockMenuId(null)
    await persistBlocks(updated)
  }

  // ── Move block up/down — swap content, keep timeslots in position ─────────
  async function moveBlock(id: string, direction: 'up' | 'down') {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    if (direction === 'up'   && idx === 0) return
    if (direction === 'down' && idx === blocks.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const updated = [...blocks]

    // Save the timeslots at both positions
    const timeA = { start_time: updated[idx].start_time, end_time: updated[idx].end_time }
    const timeB = { start_time: updated[swapIdx].start_time, end_time: updated[swapIdx].end_time }

    // Swap the blocks in the array
    ;[updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]]

    // Re-apply the original timeslots to each position
    updated[idx]     = { ...updated[idx],     start_time: timeA.start_time, end_time: timeA.end_time }
    updated[swapIdx] = { ...updated[swapIdx], start_time: timeB.start_time, end_time: timeB.end_time }

    setBlocks(updated)
    setBlockMenuId(null)
    await persistBlocks(updated)
  }

  // ── Drag end — swap content, keep timeslots in position ──────────────────
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = blocks.findIndex(b => b.id === String(active.id))
    const newIndex  = blocks.findIndex(b => b.id === String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    // Preserve each position's timeslot
    const timeslots = blocks.map(b => ({ start_time: b.start_time, end_time: b.end_time }))
    const reordered = arrayMove([...blocks], oldIndex, newIndex)
    const updated   = reordered.map((block, i) => ({
      ...block,
      start_time: timeslots[i].start_time,
      end_time:   timeslots[i].end_time,
    }))

    setBlocks(updated)
    await persistBlocks(updated)
  }

  // ── Open edit modal ───────────────────────────────────────────────────────
  function openEdit(block: TimeBlockType) {
    setEditingBlock(block)
    setEditTitle(block.title)
    setEditDesc(block.description)
    setEditSubjectId(block.subject_id || '')
    setEditTopicId(block.topic_id || '')
    setEditStartTime(block.start_time)
    setEditEndTime(block.end_time)
    setBlockMenuId(null)
  }

  // ── Save edited block — with time conflict resolution ─────────────────────
  async function saveEditedBlock() {
    if (!editingBlock) return
    setSavingEdit(true)
    try {
      const topicChanged = editTopicId !== (editingBlock.topic_id || '')
      const editedIdx = blocks.findIndex(b => b.id === editingBlock.id)

      let updated = blocks.map(b =>
        b.id === editingBlock.id
          ? {
              ...b,
              title:       editTitle,
              description: editDesc,
              subject_id:  editSubjectId || undefined,
              topic_id:    editTopicId   || undefined,
              start_time:  editStartTime,
              end_time:    editEndTime,
            }
          : b
      )

      // ── Conflict resolution with the next block ──────────────────────────
      // Compare times as "HH:MM" strings (lexicographic comparison works for time)
      if (editedIdx >= 0 && editedIdx < updated.length - 1) {
        const next = updated[editedIdx + 1]
        if (editEndTime > next.start_time) {
          if (editEndTime >= next.end_time) {
            // Edited block completely swallows next block → delete next
            updated = updated.filter((_, i) => i !== editedIdx + 1)
          } else {
            // Partial overlap → push next block's start_time forward
            updated = updated.map((b, i) =>
              i === editedIdx + 1 ? { ...b, start_time: editEndTime } : b
            )
          }
        }
      }

      // Re-sort by start_time so order stays consistent
      updated.sort((a, b) => a.start_time.localeCompare(b.start_time))

      setBlocks(updated)
      await persistBlocks(updated)

      // Sync topic status when study block's topic changes
      if (topicChanged && editTopicId && editingBlock.type === 'study') {
        await supabase
          .from('topics')
          .update({ last_studied: new Date().toISOString(), status: 'yellow' })
          .eq('id', editTopicId)
          .eq('status', 'red')
      }

      setEditingBlock(null)
    } finally {
      setSavingEdit(false)
    }
  }

  // ── Derived subjects/units/topics for dropdowns ───────────────────────────
  const selectedSubjectUnits = subjectsData.find(s => s.id === editSubjectId)?.units ?? []

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">

      {/* Header */}
      <div>
        <p className="text-text-secondary text-sm capitalize">{dateLabel}</p>
        <h1 className="text-2xl font-bold text-text-primary mt-1">
          {greeting} 👋
        </h1>
      </div>

      {/* Check-in status / CTA */}
      {!checkin ? (
        <div className="gradient-card border border-primary/20 rounded-3xl p-5">
          <p className="text-sm text-text-secondary mb-1">Sin check-in matutino</p>
          <p className="text-text-primary font-medium mb-4">
            Completá tu check-in para que la IA genere tu plan personalizado
          </p>
          <Link href="/checkin">
            <Button variant="primary" size="md" className="w-full">
              Hacer check-in ahora ✅
            </Button>
          </Link>
        </div>
      ) : (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Check-in del día</CardTitle>
            <Badge variant="success">Completado</Badge>
          </CardHeader>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-2xl">{['🪫','😮‍💨','⚡','🔥','🚀'][checkin.energy_level - 1]}</p>
              <p className="text-xs text-text-secondary mt-1">Energía {checkin.energy_level}/5</p>
            </div>
            <div className="text-center">
              <p className="text-2xl">{['😴','😕','😐','🙂','😁'][checkin.sleep_quality - 1]}</p>
              <p className="text-xs text-text-secondary mt-1">Sueño {checkin.sleep_quality}/5</p>
            </div>
            <div className="text-center">
              <p className="text-2xl">
                {checkin.stress_level === 'low' ? '😌' : checkin.stress_level === 'medium' ? '😤' : '😰'}
              </p>
              <p className="text-xs text-text-secondary mt-1">{stressLabel(checkin.stress_level)}</p>
            </div>
          </div>

          {checkin.travel_route_json.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <p className="text-xs text-text-secondary mb-1.5">🚌 Ruta del día</p>
              <div className="space-y-1">
                {checkin.travel_route_json.map((seg, i) => (
                  <p key={i} className="text-xs text-text-primary">
                    {seg.origin} → {seg.destination} ({seg.duration_minutes}min)
                  </p>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Preview blocks (no check-in) */}
      {!checkin && previewBlocks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-base font-semibold text-text-primary">Tu día de hoy</h2>
            <span className="px-2 py-0.5 rounded-full bg-surface-2 border border-border-subtle text-text-secondary text-xs">
              Vista previa
            </span>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Tus bloques fijos (trabajo y clases). Completá el check-in para que la IA personalice el resto.
          </p>
          <div className="space-y-2 pointer-events-none opacity-60">
            {previewBlocks.map(block => (
              <TimeBlock key={block.id} block={block} onToggle={() => {}} />
            ))}
          </div>
        </div>
      )}

      {/* Daily plan */}
      {checkin && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary">Plan del día</h2>
            {blocks.length > 0 && (
              <span className="text-sm text-text-secondary">{Math.round(completion)}% completado</span>
            )}
          </div>

          {blocks.length > 0 && (
            <ProgressBar value={completion} color="primary" size="sm" className="mb-4" />
          )}

          {blocks.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">🤖</p>
              <p className="text-text-secondary text-sm mb-4">La IA puede generar tu plan personalizado</p>
              <Button variant="primary" onClick={generatePlan} loading={generating} disabled={generating}>
                Generar plan con IA ✨
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={blocks.map(b => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {blocks.map((block, idx) => (
                    <SortableBlockRow
                      key={block.id}
                      block={block}
                      menuOpen={blockMenuId === block.id}
                      onMenuToggle={() => setBlockMenuId(prev => prev === block.id ? null : block.id)}
                      onToggle={toggleBlock}
                      onMoveUp={() => moveBlock(block.id, 'up')}
                      onMoveDown={() => moveBlock(block.id, 'down')}
                      onEdit={() => openEdit(block)}
                      onDelete={() => deleteBlock(block.id)}
                      isFirst={idx === 0}
                      isLast={idx === blocks.length - 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {blocks.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-text-secondary"
              onClick={generatePlan}
              loading={generating}
            >
              🔄 Regenerar plan
            </Button>
          )}
        </div>
      )}

      {/* Upcoming academic events (active semester only) */}
      {upcomingEvents.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-text-primary mb-3">Próximas fechas 📅</h2>
          <div className="space-y-2">
            {upcomingEvents.map((event: any) => {
              const days = differenceInDays(parseISO(event.date), new Date())
              const color = getColor(days)
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-surface border border-border-subtle"
                >
                  <div className={`w-2 h-2 rounded-full ${color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{event.title}</p>
                    <p className="text-xs text-text-secondary">{event.subjects?.name}</p>
                  </div>
                  <Badge variant={color === 'red' ? 'danger' : color === 'amber' ? 'warning' : 'success'}>
                    {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Edit block modal ──────────────────────────────────────────────────── */}
      {editingBlock && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-6 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">✎ Editar bloque</h3>
              <button
                onClick={() => setEditingBlock(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Time range */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1.5">Inicio</p>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={e => setEditStartTime(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1.5">
                    Fin{' '}
                    <span className="text-primary/60 text-[10px]">(conflictos se ajustan auto)</span>
                  </p>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={e => setEditEndTime(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <p className="text-xs text-text-secondary mb-1.5">Título</p>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60"
                />
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-text-secondary mb-1.5">Descripción</p>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none focus:border-primary/60"
                />
              </div>

              {/* Subject + Topic (study blocks only) */}
              {editingBlock.type === 'study' && subjectsData.length > 0 && (
                <>
                  <div>
                    <p className="text-xs text-text-secondary mb-1.5">Materia</p>
                    <select
                      value={editSubjectId}
                      onChange={e => { setEditSubjectId(e.target.value); setEditTopicId('') }}
                      className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                    >
                      <option value="">— Sin materia —</option>
                      {subjectsData.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {editSubjectId && selectedSubjectUnits.length > 0 && (
                    <div>
                      <p className="text-xs text-text-secondary mb-1.5">
                        Tema <span className="text-primary/70">(actualiza progreso automáticamente)</span>
                      </p>
                      <select
                        value={editTopicId}
                        onChange={e => setEditTopicId(e.target.value)}
                        className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                      >
                        <option value="">— Sin tema específico —</option>
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
                </>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingBlock(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={saveEditedBlock}
                loading={savingEdit}
                disabled={!editTitle.trim() || !editStartTime || !editEndTime}
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
