'use client'

import { useState, useRef, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import { getTodayArg } from '@/lib/utils'
import { EVENT_TYPE_LABELS } from '@/lib/constants'
import PomodoroFocus from '@/components/features/PomodoroFocus'
import type { TopicComprehension } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TopicOption { id: string; name: string; status: string }
interface UnitOption  { id: string; name: string; topics: TopicOption[] }
interface SubjectOption { id: string; name: string; color: string; units: UnitOption[] }

interface Props {
  subjectsData: SubjectOption[]
  userId: string
}

type Modal = 'none' | 'menu' | 'imprevisto' | 'postclase' | 'evento' | 'estudio'

interface FreeStudySession {
  subjectId:    string
  subjectName:  string
  subjectColor: string
  topicId:      string
  topicName:    string
}

const EVENT_TYPES = [
  { value: 'parcial'            as const, label: EVENT_TYPE_LABELS.parcial },
  { value: 'parcial_intermedio' as const, label: EVENT_TYPE_LABELS.parcial_intermedio },
  { value: 'entrega_tp'         as const, label: EVENT_TYPE_LABELS.entrega_tp },
  { value: 'medico'             as const, label: EVENT_TYPE_LABELS.medico },
  { value: 'personal'           as const, label: EVENT_TYPE_LABELS.personal },
]

// ── Helper: encode extra fields in notes JSON ─────────────────────────────────
function encodeNotes(extra: Record<string, unknown>): string {
  return JSON.stringify(extra)
}

// ── Imprevisto Modal ──────────────────────────────────────────────────────────
function ImprevistoModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change: text }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Error ${res.status}`)
      }
      setSuccess(true)
      setTimeout(() => {
        onClose()
        router.refresh()
      }, 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el plan. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="⚡ Imprevisto" onClose={onClose}>
      <p className="text-xs text-text-secondary mb-3">
        Contanos qué cambió y la IA reorganizará los bloques pendientes del día.
      </p>
      <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden mb-3">
        <div className="flex items-start gap-3 px-4 py-3">
          <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Ej: Tuve una reunión imprevista de 2hs, llegué tarde, el parcial se adelantó..."
            rows={5}
            autoFocus
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none"
          />
        </div>
      </div>
      {success && (
        <div className="mb-3 p-3 rounded-2xl bg-green-500/10 border border-green-500/20">
          <p className="text-sm text-green-400 text-center">Plan actualizado</p>
        </div>
      )}
      {error && (
        <div className="mb-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400 text-center">{error}</p>
        </div>
      )}
      <Button
        variant="primary"
        className="w-full"
        onClick={handle}
        loading={loading}
        disabled={!text.trim()}
      >
        ✨ Replanificar con IA
      </Button>
    </ModalShell>
  )
}

// ── Post-clase Modal ──────────────────────────────────────────────────────────
function PostClaseModal({ subjectsData, userId, onClose }: { subjectsData: SubjectOption[]; userId: string; onClose: () => void }) {
  const supabase = createClient()
  const router = useRouter()
  const today = getTodayArg()

  const [subjectId, setSubjectId] = useState('')
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [openUnitId, setOpenUnitId] = useState<string | null>(null)
  const [understanding, setUnderstanding] = useState(3)
  const [hasHomework, setHasHomework] = useState(false)
  const [homeworkDesc, setHomeworkDesc] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [localUnitsPost, setLocalUnitsPost] = useState<UnitOption[]>([])
  const [addingTopicForUnitPost, setAddingTopicForUnitPost] = useState<string | null>(null)
  const [newTopicNamePost, setNewTopicNamePost] = useState('')
  const [addingTopicPost, setAddingTopicPost] = useState(false)
  const [subjectEvents, setSubjectEvents] = useState<{ id: string; title: string; date: string; type: string }[]>([])
  const [linkedEventId, setLinkedEventId] = useState('')
  const [isSuggested, setIsSuggested] = useState(false)
  const unitRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Suggest subject based on class history for current weekday
  useEffect(() => {
    async function suggestSubject() {
      const dayOfWeek = new Date().getDay()
      const cutoff = format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('class_logs')
        .select('subject_id, date')
        .eq('user_id', userId)
        .gte('date', cutoff)
      if (!data || data.length === 0) return
      const sameDayLogs = data.filter(log => log.date && parseISO(log.date).getDay() === dayOfWeek)
      if (sameDayLogs.length === 0) return
      const freq: Record<string, number> = {}
      sameDayLogs.forEach(log => {
        if (log.subject_id) freq[log.subject_id] = (freq[log.subject_id] || 0) + 1
      })
      const mostFrequent = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (mostFrequent && subjectsData.find(s => s.id === mostFrequent)) {
        handleSubjectChange(mostFrequent)
        setIsSuggested(true)
      }
    }
    suggestSubject()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to opened accordion
  useEffect(() => {
    if (openUnitId && unitRefs.current[openUnitId]) {
      unitRefs.current[openUnitId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [openUnitId])

  const unitsWithTopics = localUnitsPost

  function toggleTopic(id: string) {
    setTopicIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function toggleUnitAll(unit: UnitOption) {
    const ids    = unit.topics.map(t => t.id)
    const allSel = ids.every(id => topicIds.includes(id))
    if (allSel) {
      setTopicIds(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setTopicIds(prev => prev.concat(ids.filter(id => !prev.includes(id))))
    }
  }

  async function handleAddTopicPost(unitId: string) {
    const name = newTopicNamePost.trim()
    if (!name) return
    setAddingTopicPost(true)
    try {
      const { data, error } = await supabase
        .from('topics')
        .insert({ unit_id: unitId, name, status: 'pendiente' })
        .select('id, name, status')
        .single()
      if (error) throw error
      setLocalUnitsPost(prev =>
        prev.map(u => u.id === unitId ? { ...u, topics: [...u.topics, { id: data.id, name: data.name, status: data.status }] } : u)
      )
      setTopicIds(prev => [...prev, data.id])
      setNewTopicNamePost('')
      setAddingTopicForUnitPost(null)
    } catch (err) {
      console.error(err)
    } finally {
      setAddingTopicPost(false)
    }
  }

  function handleSubjectChange(id: string) {
    setSubjectId(id)
    setTopicIds([])
    setOpenUnitId(null)
    setLocalUnitsPost(subjectsData.find(s => s.id === id)?.units ?? [])
    setAddingTopicForUnitPost(null)
    setNewTopicNamePost('')
    setSubjectEvents([])
    setLinkedEventId('')
    if (id) {
      supabase
        .from('academic_events')
        .select('id, title, date, type')
        .eq('subject_id', id)
        .gte('date', today)
        .order('date', { ascending: true })
        .then(({ data }) => setSubjectEvents(data || []))
    }
  }

  async function save() {
    if (!subjectId) return
    setSaving(true)
    try {
      await supabase.from('class_logs').insert({
        user_id: userId,
        subject_id: subjectId,
        date: today,
        topics_covered_json: topicIds,
        understanding_level: understanding,
        has_homework: hasHomework,
        homework_description: hasHomework ? homeworkDesc || null : null,
        due_date: hasHomework && dueDate ? dueDate : null,
      })
      if (topicIds.length > 0) {
        await supabase
          .from('topics')
          .update({ last_studied: new Date().toISOString(), status: 'yellow' })
          .in('id', topicIds)
          .eq('status', 'red')
      }
      setSuccess(true)
      setTimeout(() => { onClose(); router.refresh() }, 1200)
    } finally {
      setSaving(false)
    }
  }

  const LEVELS = [
    { v: 1, emoji: '😕', label: 'Muy poco' },
    { v: 2, emoji: '😐', label: 'Poco' },
    { v: 3, emoji: '🙂', label: 'Regular' },
    { v: 4, emoji: '😊', label: 'Bien' },
    { v: 5, emoji: '🤩', label: 'Muy bien' },
  ]

  return (
    <ModalShell title="Post-clase" onClose={onClose}>
      {success ? (
        <div className="py-6 text-center">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-sm text-green-400 font-medium">Clase registrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Subject */}
          <div>
            <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <select
                  value={subjectId}
                  onChange={e => { handleSubjectChange(e.target.value); setIsSuggested(false) }}
                  className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                >
                  <option value="">Seleccionar materia</option>
                  {subjectsData.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {isSuggested && subjectId && (
              <p className="text-[10px] text-primary/70 px-2 mt-1">Sugerido según tu historial del día</p>
            )}
          </div>

          {/* Unit + Topic accordion */}
          {subjectId && unitsWithTopics.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-medium text-text-secondary">Temas vistos en clase</p>
                {topicIds.length > 0 && (
                  <span className="text-xs text-primary font-medium">{topicIds.length} seleccionado{topicIds.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="rounded-2xl border border-border-subtle overflow-hidden divide-y divide-border-subtle">
                {unitsWithTopics.map(unit => {
                  const isOpen    = openUnitId === unit.id
                  const selInUnit = unit.topics.filter(t => topicIds.includes(t.id)).length
                  const allSel    = selInUnit === unit.topics.length
                  return (
                    <div key={unit.id} className="bg-surface-2" ref={el => { unitRefs.current[unit.id] = el }}>
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
                      {isOpen && (
                        <div className="px-4 pb-3 bg-surface/40">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-text-secondary">{unit.topics.length} tema{unit.topics.length !== 1 ? 's' : ''}</span>
                            <button type="button" onClick={() => toggleUnitAll(unit)} className="text-[10px] font-medium text-primary">
                              {allSel ? 'Desmarcar todos' : 'Seleccionar todos'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {unit.topics.map(t => {
                              const sel = topicIds.includes(t.id)
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => toggleTopic(t.id)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
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
                          {addingTopicForUnitPost === unit.id ? (
                            <div className="flex items-center gap-1.5 mt-2">
                              <input
                                type="text"
                                value={newTopicNamePost}
                                onChange={e => setNewTopicNamePost(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddTopicPost(unit.id) }}
                                placeholder="Nombre del tema..."
                                autoFocus
                                className="flex-1 h-8 px-3 rounded-xl bg-surface border border-primary/50 text-xs text-text-primary placeholder-text-secondary focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddTopicPost(unit.id)}
                                disabled={!newTopicNamePost.trim() || addingTopicPost}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary/20 text-primary text-sm font-bold disabled:opacity-40"
                              >
                                {addingTopicPost ? '…' : '✓'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setAddingTopicForUnitPost(null); setNewTopicNamePost('') }}
                                className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface text-text-secondary text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAddingTopicForUnitPost(unit.id)}
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

          {/* Understanding level */}
          <div className="rounded-2xl bg-surface-2 border border-border-subtle p-4">
            <p className="text-xs text-text-secondary mb-2.5">Nivel de comprensión en clase</p>
            <div className="flex gap-2">
              {LEVELS.map(l => (
                <button
                  key={l.v}
                  onClick={() => setUnderstanding(l.v)}
                  className={`flex-1 py-2 rounded-xl border text-base transition-all ${
                    understanding === l.v
                      ? 'border-primary bg-primary/20'
                      : 'border-border-subtle bg-surface'
                  }`}
                >
                  {l.emoji}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-secondary text-center mt-1.5">
              {LEVELS.find(l => l.v === understanding)?.label}
            </p>
          </div>

          {/* Homework toggle */}
          <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
            <button
              onClick={() => { setHasHomework(h => !h); setLinkedEventId('') }}
              className="flex items-center justify-between w-full px-4 py-3"
            >
              <span className="text-sm text-text-primary">Quedó tarea / TP</span>
              <div className={`w-11 h-6 rounded-full transition-colors ${hasHomework ? 'bg-primary' : 'bg-surface'} border border-border-subtle relative`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${hasHomework ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
            {hasHomework && (
              <>
                <div className="border-t border-border-subtle flex items-start gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <textarea
                    value={homeworkDesc}
                    onChange={e => setHomeworkDesc(e.target.value)}
                    placeholder="Describí la tarea..."
                    rows={2}
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none"
                  />
                </div>
                {subjectId && subjectEvents.length > 0 && (
                  <div className="border-t border-border-subtle flex items-center gap-3 px-4 py-3">
                    <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <select
                      value={linkedEventId}
                      onChange={e => {
                        const ev = subjectEvents.find(ev => ev.id === e.target.value)
                        setLinkedEventId(e.target.value)
                        if (ev) setDueDate(ev.date)
                      }}
                      className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                    >
                      <option value="">Relacionar con fecha existente (opcional)</option>
                      {subjectEvents.map(ev => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} — {format(parseISO(ev.date), 'dd/MM')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="border-t border-border-subtle flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="text-sm text-text-secondary w-24 shrink-0">Fecha entrega</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => { setDueDate(e.target.value); setLinkedEventId('') }}
                    className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none"
                  />
                </div>
                {linkedEventId ? (
                  <div className="px-4 pb-2">
                    <p className="text-xs text-green-400/80">Vinculado a fecha existente</p>
                  </div>
                ) : (
                  <div className="px-4 pb-2">
                    <p className="text-xs text-text-secondary/60">Si agregás una fecha, se crea el evento automáticamente</p>
                  </div>
                )}
              </>
            )}
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={save}
            loading={saving}
            disabled={!subjectId}
          >
            Guardar clase
          </Button>
        </div>
      )}
    </ModalShell>
  )
}

// ── Fecha Importante Modal ────────────────────────────────────────────────────
function EventoModal({ subjectsData, userId, onClose }: { subjectsData: SubjectOption[]; userId: string; onClose: () => void }) {
  const supabase = createClient()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [type, setType] = useState<string>('parcial')
  const [subjectId, setSubjectId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [aula, setAula] = useState('')
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [openUnitId, setOpenUnitId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [localUnits, setLocalUnits] = useState<UnitOption[]>([])
  const [addingTopicForUnit, setAddingTopicForUnit] = useState<string | null>(null)
  const [newTopicName, setNewTopicName] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)
  const unitRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (openUnitId && unitRefs.current[openUnitId]) {
      unitRefs.current[openUnitId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [openUnitId])

  const isAcademic      = ['parcial', 'parcial_intermedio', 'entrega_tp'].includes(type)
  const unitsWithTopics = localUnits

  function toggleTopic(id: string) {
    setTopicIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function toggleUnitAll(unit: UnitOption) {
    const ids    = unit.topics.map(t => t.id)
    const allSel = ids.every(id => topicIds.includes(id))
    if (allSel) {
      setTopicIds(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setTopicIds(prev => prev.concat(ids.filter(id => !prev.includes(id))))
    }
  }

  async function handleAddTopicEvento(unitId: string) {
    const name = newTopicName.trim()
    if (!name) return
    setAddingTopic(true)
    try {
      const { data, error } = await supabase
        .from('topics')
        .insert({ unit_id: unitId, name, status: 'pendiente' })
        .select('id, name, status')
        .single()
      if (error) throw error
      setLocalUnits(prev =>
        prev.map(u => u.id === unitId ? { ...u, topics: [...u.topics, { id: data.id, name: data.name, status: data.status }] } : u)
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

  async function save() {
    if (!title.trim() || !date) return
    setSaving(true)
    try {
      const encodedNotes = encodeNotes({
        time: time || null,
        aula: aula || null,
        topic_ids: topicIds.length > 0 ? topicIds : null,
      })
      await supabase.from('academic_events').insert({
        user_id: userId,
        subject_id: (isAcademic && subjectId) ? subjectId : null,
        type: type as any,
        title: title.trim(),
        date,
        notes: encodedNotes,
      })
      setSuccess(true)
      setTimeout(() => { onClose(); router.refresh() }, 1200)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Fecha importante" onClose={onClose}>
      {success ? (
        <div className="py-6 text-center">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-sm text-green-400 font-medium">Evento guardado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Title + Type card */}
          <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
              <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
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
                value={type}
                onChange={e => { setType(e.target.value); if (!['parcial','parcial_intermedio','entrega_tp'].includes(e.target.value)) { setSubjectId(''); setTopicIds([]); setOpenUnitId(null) } }}
                className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none appearance-none"
              >
                {EVENT_TYPES.map(et => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + Time + Aula card */}
          <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
              <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="text-sm text-text-secondary w-12 shrink-0">Fecha</span>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none"
              />
            </div>
            <div className={`flex items-center gap-3 px-4 py-3${isAcademic ? ' border-b border-border-subtle' : ''}`}>
              <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-text-secondary w-12 shrink-0">Hora</span>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none"
              />
            </div>
            {isAcademic && (
              <div className="flex items-center gap-3 px-4 py-3">
                <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm text-text-secondary w-12 shrink-0">Aula</span>
                <input
                  type="text"
                  value={aula}
                  onChange={e => setAula(e.target.value)}
                  placeholder="Ej: Aula 3"
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary text-right focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Subject card (academic only) */}
          {isAcademic && subjectsData.length > 0 && (
            <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <select
                  value={subjectId}
                  onChange={e => { const id = e.target.value; setSubjectId(id); setTopicIds([]); setOpenUnitId(null); setLocalUnits(subjectsData.find(s => s.id === id)?.units ?? []); setAddingTopicForUnit(null); setNewTopicName('') }}
                  className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none appearance-none"
                >
                  <option value="">Sin materia</option>
                  {subjectsData.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
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
                  const isOpen    = openUnitId === unit.id
                  const selInUnit = unit.topics.filter(t => topicIds.includes(t.id)).length
                  const allSel    = selInUnit === unit.topics.length
                  return (
                    <div key={unit.id} className="bg-surface-2" ref={el => { unitRefs.current[unit.id] = el }}>
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
                      {isOpen && (
                        <div className="px-4 pb-3 bg-surface/40">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-text-secondary">{unit.topics.length} tema{unit.topics.length !== 1 ? 's' : ''}</span>
                            <button type="button" onClick={() => toggleUnitAll(unit)} className="text-[10px] font-medium text-primary">
                              {allSel ? 'Desmarcar todos' : 'Seleccionar todos'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {unit.topics.map(t => {
                              const sel = topicIds.includes(t.id)
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => toggleTopic(t.id)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
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
                                onKeyDown={e => { if (e.key === 'Enter') handleAddTopicEvento(unit.id) }}
                                placeholder="Nombre del tema..."
                                autoFocus
                                className="flex-1 h-8 px-3 rounded-xl bg-surface border border-primary/50 text-xs text-text-primary placeholder-text-secondary focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddTopicEvento(unit.id)}
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

          <Button
            variant="primary"
            className="w-full"
            onClick={save}
            loading={saving}
            disabled={!title.trim() || !date}
          >
            Guardar evento
          </Button>
        </div>
      )}
    </ModalShell>
  )
}

// ── Estudio libre Modal ───────────────────────────────────────────────────────
function EstudioModal({
  subjectsData,
  onStart,
  onClose,
}: {
  subjectsData: SubjectOption[]
  onStart: (session: FreeStudySession) => void
  onClose: () => void
}) {
  const [subjectId, setSubjectId]   = useState('')
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
  const [topicId, setTopicId]       = useState('')
  const [topicName, setTopicName]   = useState('')

  const subject = subjectsData.find(s => s.id === subjectId)

  function selectSubject(s: SubjectOption) {
    setSubjectId(s.id)
    setExpandedUnit(null)
    setTopicId('')
    setTopicName('')
  }

  function toggleUnit(unitId: string) {
    setExpandedUnit(prev => prev === unitId ? null : unitId)
  }

  function selectTopic(tid: string, tname: string) {
    setTopicId(tid)
    setTopicName(tname)
  }

  function handleStart() {
    if (!subject) return
    onStart({
      subjectId:    subject.id,
      subjectName:  subject.name,
      subjectColor: subject.color,
      topicId:      topicId || undefined,
      topicName:    topicName || undefined,
    })
  }

  return (
    <ModalShell title="Estudio libre" onClose={onClose}>
      <div className="space-y-3">

        {/* Step 1: subject list */}
        {!subjectId ? (
          <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle">
            {subjectsData.map(s => (
              <button
                key={s.id}
                onClick={() => selectSubject(s)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface active:bg-surface transition-colors text-left"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm font-medium text-text-primary flex-1">{s.name}</span>
                <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Selected subject header — tap to go back */}
            <button
              onClick={() => { setSubjectId(''); setExpandedUnit(null); setTopicId(''); setTopicName('') }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle"
            >
              <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subject?.color }} />
              <span className="text-sm font-semibold text-text-primary flex-1 text-left">{subject?.name}</span>
            </button>

            {/* Units + topics accordion */}
            <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle">
              {subject?.units.map(unit => (
                <div key={unit.id}>
                  {/* Unit row */}
                  <button
                    onClick={() => toggleUnit(unit.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors text-left"
                  >
                    <span className="text-sm font-medium text-text-primary flex-1">{unit.name}</span>
                    <span className="text-[10px] text-text-secondary mr-1">{unit.topics.length}</span>
                    <svg
                      className={`w-4 h-4 text-text-secondary transition-transform ${expandedUnit === unit.id ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Topic list */}
                  {expandedUnit === unit.id && (
                    <div className="border-t border-border-subtle bg-surface divide-y divide-border-subtle/50">
                      {unit.topics.map(t => {
                        const isSelected = topicId === t.id
                        return (
                          <button
                            key={t.id}
                            onClick={() => selectTopic(isSelected ? '' : t.id, isSelected ? '' : t.name)}
                            className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-surface-2'}`}
                          >
                            <span className={`text-xs ${isSelected ? 'text-primary font-semibold' : 'text-text-secondary'} flex-1`}>
                              {t.name}
                            </span>
                            {isSelected && (
                              <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {topicId && (
              <p className="text-xs text-primary/80 px-1">
                Tema seleccionado: <span className="font-medium">{topicName}</span>
              </p>
            )}
          </>
        )}

        <p className="text-xs text-text-secondary px-1">
          Pomodoro de 25 min. Al finalizar, se registra la sesión y podés actualizar el estado del tema.
        </p>
        <Button
          variant="primary"
          className="w-full"
          onClick={handleStart}
          disabled={!subjectId}
        >
          Iniciar Pomodoro
        </Button>
      </div>
    </ModalShell>
  )
}

// ── Shared ModalShell ─────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-6 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Menu Sheet ────────────────────────────────────────────────────────────────
const MENU_OPTIONS = [
  {
    key: 'imprevisto' as Modal,
    label: 'Imprevisto',
    desc: 'Algo cambió, la IA reorganiza tu día',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    color: 'bg-amber-500/15 text-amber-400',
  },
  {
    key: 'postclase' as Modal,
    label: 'Post-clase',
    desc: 'Registrar lo visto en clase hoy',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    color: 'bg-cyan-500/15 text-cyan-400',
  },
  {
    key: 'evento' as Modal,
    label: 'Fecha importante',
    desc: 'Parcial, TP, turno médico, evento...',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    color: 'bg-primary/15 text-primary',
  },
  {
    key: 'estudio' as Modal,
    label: 'Estudio libre',
    desc: 'Pomodoro sin plan — elegis materia y tema',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'bg-violet-500/15 text-violet-400',
  },
]

// ── Main Export ───────────────────────────────────────────────────────────────
export default function FabMenu({ subjectsData, userId }: Props) {
  const pathname = usePathname()
  const [modal, setModal] = useState<Modal>('none')
  const [freeStudy, setFreeStudy] = useState<FreeStudySession | null>(null)

  // Hide FAB during multi-step check-in flow
  if (pathname === '/checkin') return null

  function close() { setModal('none') }

  if (freeStudy) {
    return (
      <PomodoroFocus
        blockId={null}
        subjectId={freeStudy.subjectId}
        topicId={freeStudy.topicId}
        subjectName={freeStudy.subjectName}
        subjectColor={freeStudy.subjectColor}
        topicName={freeStudy.topicName}
        userId={userId}
        planDate={getTodayArg()}
        onComplete={(_status: TopicComprehension) => setFreeStudy(null)}
        onAbandon={() => setFreeStudy(null)}
      />
    )
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setModal('menu')}
        className="fixed right-4 md:right-8 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-xl shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))' }}
        aria-label="Agregar"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Menu sheet */}
      {modal === 'menu' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/50 backdrop-blur-sm" onClick={close}>
          <div
            className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4 border-b border-border-subtle flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">Agregar</p>
              <button onClick={close} className="w-11 h-11 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-3 space-y-1">
              {MENU_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setModal(opt.key)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-surface-2 transition-colors text-left"
                >
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${opt.color}`}>
                    {opt.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{opt.label}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{opt.desc}</p>
                  </div>
                  <svg className="w-4 h-4 text-text-secondary ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modal === 'imprevisto' && <ImprevistoModal onClose={close} />}
      {modal === 'postclase' && <PostClaseModal subjectsData={subjectsData} userId={userId} onClose={close} />}
      {modal === 'evento'    && <EventoModal    subjectsData={subjectsData} userId={userId} onClose={close} />}
      {modal === 'estudio'   && (
        <EstudioModal
          subjectsData={subjectsData}
          onStart={session => { setModal('none'); setFreeStudy(session) }}
          onClose={close}
        />
      )}
    </>
  )
}
