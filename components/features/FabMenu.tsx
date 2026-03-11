'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import { getTodayArg } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TopicOption { id: string; name: string; status: string }
interface UnitOption  { id: string; name: string; topics: TopicOption[] }
interface SubjectOption { id: string; name: string; color: string; units: UnitOption[] }

interface Props {
  subjectsData: SubjectOption[]
  userId: string
}

type Modal = 'none' | 'menu' | 'imprevisto' | 'postclase' | 'evento'

const EVENT_TYPES = [
  { value: 'parcial',            label: 'Parcial' },
  { value: 'parcial_intermedio', label: 'Parcial intermedio' },
  { value: 'entrega_tp',         label: 'Entrega TP' },
  { value: 'medico',             label: 'Turno médico' },
  { value: 'personal',           label: 'Evento personal' },
] as const

// ── Helper: encode/decode extra fields in notes JSON ─────────────────────────
function encodeNotes(notes: string, extra: Record<string, unknown>): string {
  return JSON.stringify({ ...extra, _notes: notes })
}

// ── Imprevisto Modal ──────────────────────────────────────────────────────────
function ImprevistoModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handle() {
    if (!text.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change: text }),
      })
      if (!res.ok) throw new Error()
      setSuccess(true)
      setTimeout(() => {
        onClose()
        window.location.reload()
      }, 1500)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Imprevisto" onClose={onClose}>
      <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden mb-3">
        <div className="flex items-start gap-3 px-4 py-3">
          <svg className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="¿Qué pasó? La IA reorganizará tu día..."
            rows={4}
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
      <Button
        variant="primary"
        className="w-full"
        onClick={handle}
        loading={loading}
        disabled={!text.trim()}
      >
        Replanificar con IA
      </Button>
    </ModalShell>
  )
}

// ── Post-clase Modal ──────────────────────────────────────────────────────────
function PostClaseModal({ subjectsData, userId, onClose }: { subjectsData: SubjectOption[]; userId: string; onClose: () => void }) {
  const supabase = createClient()
  const today = getTodayArg()

  const [subjectId, setSubjectId] = useState('')
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [topicSearch, setTopicSearch] = useState('')
  const [understanding, setUnderstanding] = useState(3)
  const [hasHomework, setHasHomework] = useState(false)
  const [homeworkDesc, setHomeworkDesc] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const selectedSubject = subjectsData.find(s => s.id === subjectId)
  const allTopics = selectedSubject?.units.flatMap(u => u.topics) ?? []

  function toggleTopic(id: string) {
    setTopicIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
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
      // Update topic statuses to 'yellow' if they were 'red'
      if (topicIds.length > 0) {
        await supabase
          .from('topics')
          .update({ last_studied: new Date().toISOString(), status: 'yellow' })
          .in('id', topicIds)
          .eq('status', 'red')
      }
      setSuccess(true)
      setTimeout(onClose, 1200)
    } finally {
      setSaving(false)
    }
  }

  const LEVELS = [
    { v: 1, label: 'Muy poco' },
    { v: 2, label: 'Poco' },
    { v: 3, label: 'Regular' },
    { v: 4, label: 'Bien' },
    { v: 5, label: 'Muy bien' },
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
          <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <select
                value={subjectId}
                onChange={e => { setSubjectId(e.target.value); setTopicIds([]); setTopicSearch('') }}
                className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
              >
                <option value="">Seleccionar materia</option>
                {subjectsData.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Topics covered */}
          {subjectId && allTopics.length > 0 && (
            <div className="rounded-2xl bg-surface-2 border border-border-subtle p-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs text-text-secondary">Temas vistos en clase</p>
                {topicIds.length > 0 && (
                  <span className="text-xs text-primary font-medium">{topicIds.length} seleccionado{topicIds.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              {allTopics.length > 5 && (
                <div className="mb-2.5">
                  <input
                    type="text"
                    value={topicSearch}
                    onChange={e => setTopicSearch(e.target.value)}
                    placeholder="Buscar tema..."
                    className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/50"
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
                {(topicSearch.trim()
                  ? allTopics.filter(t => t.name.toLowerCase().includes(topicSearch.toLowerCase()))
                  : allTopics
                ).map(t => (
                  <button
                    key={t.id}
                    onClick={() => toggleTopic(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      topicIds.includes(t.id)
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border-subtle bg-surface text-text-secondary'
                    }`}
                  >
                    {t.status === 'green' ? '🟢' : t.status === 'yellow' ? '🟡' : '🔴'} {t.name}
                  </button>
                ))}
                {topicSearch.trim() && allTopics.filter(t => t.name.toLowerCase().includes(topicSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-text-secondary">Sin resultados</p>
                )}
              </div>
            </div>
          )}

          {/* Understanding level */}
          <div className="rounded-2xl bg-surface-2 border border-border-subtle p-4">
            <p className="text-xs text-text-secondary mb-2.5">Nivel de comprensión</p>
            <div className="flex gap-2">
              {LEVELS.map(l => (
                <button
                  key={l.v}
                  onClick={() => setUnderstanding(l.v)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    understanding === l.v
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border-subtle bg-surface text-text-secondary'
                  }`}
                >
                  {l.v}
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
              onClick={() => setHasHomework(h => !h)}
              className="flex items-center justify-between w-full px-4 py-3"
            >
              <span className="text-sm text-text-primary">Quedó tarea / TP</span>
              <div className={`w-11 h-6 rounded-full transition-colors ${hasHomework ? 'bg-primary' : 'bg-surface'} border border-border-subtle relative`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${hasHomework ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
            {hasHomework && (
              <>
                <div className="border-t border-border-subtle flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <input
                    type="text"
                    value={homeworkDesc}
                    onChange={e => setHomeworkDesc(e.target.value)}
                    placeholder="Descripción de la tarea"
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary focus:outline-none"
                  />
                </div>
                <div className="border-t border-border-subtle flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                  />
                </div>
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

  const [title, setTitle] = useState('')
  const [type, setType] = useState<string>('parcial')
  const [subjectId, setSubjectId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [aula, setAula] = useState('')
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const isAcademic = ['parcial', 'parcial_intermedio', 'entrega_tp'].includes(type)
  const selectedSubject = subjectsData.find(s => s.id === subjectId)
  const allTopics = selectedSubject?.units.flatMap(u => u.topics) ?? []

  function toggleTopic(id: string) {
    setTopicIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  async function save() {
    if (!title.trim() || !date) return
    setSaving(true)
    try {
      const encodedNotes = encodeNotes(notes, {
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
      setTimeout(onClose, 1200)
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
          {/* Title + type group */}
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
                onChange={e => { setType(e.target.value); if (!['parcial','parcial_intermedio','entrega_tp'].includes(e.target.value)) setSubjectId('') }}
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
                value={date}
                onChange={e => setDate(e.target.value)}
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
                  placeholder="Ej: Aula 3, SUM B"
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary text-right focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Subject (academic only) */}
          {isAcademic && (
            <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <select
                  value={subjectId}
                  onChange={e => { setSubjectId(e.target.value); setTopicIds([]) }}
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

          {/* Related topics */}
          {isAcademic && subjectId && allTopics.length > 0 && (
            <div className="rounded-2xl bg-surface-2 border border-border-subtle p-4">
              <p className="text-xs text-text-secondary mb-2.5">Temas relacionados</p>
              <div className="flex flex-wrap gap-2">
                {allTopics.map(t => (
                  <button
                    key={t.id}
                    onClick={() => toggleTopic(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      topicIds.includes(t.id)
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border-subtle bg-surface text-text-secondary'
                    }`}
                  >
                    {t.status === 'green' ? '🟢' : t.status === 'yellow' ? '🟡' : '🔴'} {t.name}
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
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notas adicionales (opcional)"
                rows={2}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none"
              />
            </div>
          </div>

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

// ── Shared ModalShell ─────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-6 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
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
]

// ── Main Export ───────────────────────────────────────────────────────────────
export default function FabMenu({ subjectsData, userId }: Props) {
  const [modal, setModal] = useState<Modal>('none')

  function close() { setModal('none') }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setModal('menu')}
        className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-xl shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
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
              <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">
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
    </>
  )
}
