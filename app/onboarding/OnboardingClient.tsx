'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const STEPS = ['Bienvenida', 'Trabajo', 'Cuatrimestre', 'Materias', 'Listo']

const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]

const COLORS = [
  '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6',
  '#F59E0B', '#EF4444', '#F97316', '#EC4899', '#14B8A6',
]

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const defaultSemesterName = currentMonth <= 7
  ? `1er Cuatrimestre ${currentYear}`
  : `2do Cuatrimestre ${currentYear}`
const defaultStartDate = currentMonth <= 7 ? `${currentYear}-03-01` : `${currentYear}-08-01`
const defaultEndDate = currentMonth <= 7 ? `${currentYear}-07-31` : `${currentYear}-12-15`

export default function OnboardingClient() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // ── Work config ──────────────────────────────────────────
  const [doesWork, setDoesWork] = useState(true)
  const [workConfig, setWorkConfig] = useState({
    work_days_json: [1, 2, 3, 4, 5] as number[],
    work_start: '09:00',
    work_end: '18:00',
    work_default_mode: 'presencial' as 'presencial' | 'remoto' | 'mixto',
    presential_days_json: [] as number[],
  })

  // ── Semester ─────────────────────────────────────────────
  const [semester, setSemester] = useState({
    name: defaultSemesterName,
    start_date: defaultStartDate,
    end_date: defaultEndDate,
  })
  const [semesterId, setSemesterId] = useState<string | null>(null)
  const [semesterDateError, setSemesterDateError] = useState('')

  // ── Subjects ─────────────────────────────────────────────
  const [subjects, setSubjects] = useState<{ name: string; color: string }[]>([])
  const [newSubject, setNewSubject] = useState({ name: '', color: COLORS[0] })
  const [showSubjectForm, setShowSubjectForm] = useState(false)

  // ── Helpers ──────────────────────────────────────────────

  function toggleWorkDay(day: number) {
    setWorkConfig(prev => ({
      ...prev,
      work_days_json: prev.work_days_json.includes(day)
        ? prev.work_days_json.filter(d => d !== day)
        : [...prev.work_days_json, day].sort((a, b) => a - b),
    }))
  }

  function addSubject() {
    if (!newSubject.name.trim()) return
    setSubjects(prev => [...prev, { name: newSubject.name.trim(), color: newSubject.color }])
    setNewSubject({ name: '', color: COLORS[subjects.length % COLORS.length] })
    setShowSubjectForm(false)
  }

  function removeSubject(i: number) {
    setSubjects(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Step savers ──────────────────────────────────────────

  async function saveWorkAndAdvance() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('user_config').upsert(
        {
          user_id: user.id,
          is_employed: doesWork,
          work_days_json: doesWork ? workConfig.work_days_json : [],
          work_start: workConfig.work_start,
          work_end: workConfig.work_end,
          work_default_mode: workConfig.work_default_mode,
          presential_days_json: workConfig.presential_days_json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      setStep(2)
    } finally {
      setSaving(false)
    }
  }

  async function saveSemesterAndAdvance() {
    if (!semester.name || !semester.start_date || !semester.end_date) return
    if (semester.start_date >= semester.end_date) {
      setSemesterDateError('La fecha de inicio debe ser anterior a la fecha de fin')
      return
    }
    setSemesterDateError('')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase.from('semesters').insert({
        user_id: user.id,
        name: semester.name,
        start_date: semester.start_date,
        end_date: semester.end_date,
        is_active: true,
      }).select('id').single()
      if (!error && data) {
        setSemesterId(data.id)
        setStep(3)
      }
    } finally {
      setSaving(false)
    }
  }

  function skipSemesterAndSubjects() {
    setStep(4)
  }

  async function saveSubjectsAndAdvance() {
    if (subjects.length === 0) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // If semesterId is null (e.g. page was refreshed mid-onboarding), create the semester first
      let activeSemesterId = semesterId
      if (!activeSemesterId) {
        const { data, error } = await supabase.from('semesters').insert({
          user_id: user.id,
          name: semester.name,
          start_date: semester.start_date,
          end_date: semester.end_date,
          is_active: true,
        }).select('id').single()
        if (error || !data) return
        activeSemesterId = data.id
        setSemesterId(activeSemesterId)
      }

      await supabase.from('subjects').insert(
        subjects.map(s => ({
          user_id: user.id,
          semester_id: activeSemesterId,
          name: s.name,
          color: s.color,
        }))
      )
      setStep(4)
    } finally {
      setSaving(false)
    }
  }

  function handleNext() {
    if (step === 1) saveWorkAndAdvance()
    else if (step === 2) saveSemesterAndAdvance()
    else if (step === 3) saveSubjectsAndAdvance()
    else setStep(s => s + 1)
  }

  function canGoNext() {
    if (step === 2) return !!semester.name && !!semester.start_date && !!semester.end_date
    return true
  }

  const inputClass = 'w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60 transition-colors'

  return (
    <div className="min-h-dvh flex flex-col px-4 pt-6 pb-16 max-w-lg mx-auto">

      {/* Progress bar (steps 1–3 only) */}
      {step >= 1 && step <= 3 && (
        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-primary' : 'bg-surface-2'
              }`}
            />
          ))}
        </div>
      )}

      {/* ── STEP 0: Welcome ──────────────────────────────────── */}
      {step === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
          <p className="text-7xl mb-6">🎓</p>
          <h1 className="text-2xl font-bold text-text-primary mb-3">¡Bienvenido a Mentor IA!</h1>
          <p className="text-text-secondary text-sm mb-2 max-w-xs">
            Tu mentor personal de productividad. En 2 minutos configuramos tu perfil para que la IA personalice tu día.
          </p>

          <div className="space-y-2.5 w-full max-w-xs text-left my-7">
            {[
              { emoji: '💼', text: 'Tu horario de trabajo' },
              { emoji: '🎓', text: 'Tu cuatrimestre actual' },
              { emoji: '📚', text: 'Las materias que cursás' },
            ].map(item => (
              <div
                key={item.text}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface-2 border border-border-subtle"
              >
                <span className="text-xl">{item.emoji}</span>
                <span className="text-sm text-text-primary">{item.text}</span>
              </div>
            ))}
          </div>

          <Button variant="primary" size="lg" className="w-full" onClick={() => setStep(1)}>
            Comenzar →
          </Button>
        </div>
      )}

      {/* ── STEP 1: Work config ──────────────────────────────── */}
      {step === 1 && (
        <div className="flex-1 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-text-primary">💼 Horario de trabajo</h2>
            <p className="text-text-secondary text-sm mt-1">Configurá tus días y horarios habituales</p>
          </div>

          {/* Does work? */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-2 border border-border-subtle">
            <span className="text-sm text-text-primary">¿Trabajás actualmente?</span>
            <div className="flex gap-2">
              <button
                onClick={() => setDoesWork(true)}
                className={`px-4 py-2 rounded-xl border text-xs font-medium transition-all min-h-[36px] ${
                  doesWork
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'border-border-subtle bg-surface text-text-secondary'
                }`}
              >
                Sí
              </button>
              <button
                onClick={() => { setDoesWork(false); setWorkConfig(p => ({ ...p, work_days_json: [] })) }}
                className={`px-4 py-2 rounded-xl border text-xs font-medium transition-all min-h-[36px] ${
                  !doesWork
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'border-border-subtle bg-surface text-text-secondary'
                }`}
              >
                No
              </button>
            </div>
          </div>

          {doesWork && (
            <>
              {/* Work days */}
              <div>
                <p className="text-xs text-text-secondary mb-2">Días que trabajás</p>
                <div className="flex gap-1.5">
                  {DAYS.map(d => (
                    <button
                      key={d.value}
                      onClick={() => toggleWorkDay(d.value)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all min-h-[36px] ${
                        workConfig.work_days_json.includes(d.value)
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-border-subtle bg-surface-2 text-text-secondary'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hours */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1.5">Hora de entrada</p>
                  <input
                    type="time"
                    value={workConfig.work_start}
                    onChange={e => setWorkConfig(p => ({ ...p, work_start: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1.5">Hora de salida</p>
                  <input
                    type="time"
                    value={workConfig.work_end}
                    onChange={e => setWorkConfig(p => ({ ...p, work_end: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
              </div>

              {/* Mode */}
              <div>
                <p className="text-xs text-text-secondary mb-2">Modalidad por defecto</p>
                <div className="flex gap-2">
                  {([
                    { value: 'presencial', label: '🏢 Presencial' },
                    { value: 'remoto', label: '🏠 Remoto' },
                    { value: 'mixto', label: '🔀 Mixto' },
                  ] as { value: 'presencial' | 'remoto' | 'mixto'; label: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setWorkConfig(p => ({ ...p, work_default_mode: opt.value }))}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-medium transition-all min-h-[40px] ${
                        workConfig.work_default_mode === opt.value
                          ? 'border-primary bg-primary/20 text-text-primary'
                          : 'border-border-subtle bg-surface-2 text-text-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: Semester ─────────────────────────────────── */}
      {step === 2 && (
        <div className="flex-1 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-text-primary">🎓 Cuatrimestre actual</h2>
            <p className="text-text-secondary text-sm mt-1">Creá el cuatrimestre que estás cursando ahora</p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-secondary mb-1.5">Nombre</p>
              <input
                type="text"
                value={semester.name}
                onChange={e => setSemester(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: 1er Cuatrimestre 2026"
                className={inputClass}
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-xs text-text-secondary mb-1.5">Fecha de inicio</p>
                <input
                  type="date"
                  value={semester.start_date}
                  onChange={e => { setSemester(p => ({ ...p, start_date: e.target.value })); setSemesterDateError('') }}
                  className={`${inputClass} ${semesterDateError ? 'border-red-500/60' : ''}`}
                />
              </div>
              <div className="flex-1">
                <p className="text-xs text-text-secondary mb-1.5">Fecha de fin</p>
                <input
                  type="date"
                  value={semester.end_date}
                  onChange={e => { setSemester(p => ({ ...p, end_date: e.target.value })); setSemesterDateError('') }}
                  className={`${inputClass} ${semesterDateError ? 'border-red-500/60' : ''}`}
                />
              </div>
            </div>
            {semesterDateError && (
              <p className="text-xs text-red-400 mt-1">{semesterDateError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: Subjects ─────────────────────────────────── */}
      {step === 3 && (
        <div className="flex-1 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-text-primary">📚 Materias</h2>
            <p className="text-text-secondary text-sm mt-1">
              Agregá las materias que cursás este cuatrimestre
            </p>
          </div>

          {/* Subject list */}
          {subjects.length > 0 && (
            <div className="space-y-2">
              {subjects.map((sub, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-surface-2 border border-border-subtle"
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                  <span className="flex-1 text-sm text-text-primary">{sub.name}</span>
                  <button
                    onClick={() => removeSubject(i)}
                    className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-red-400 transition-colors text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add subject form */}
          {showSubjectForm ? (
            <Card variant="elevated">
              <p className="text-sm font-medium text-text-primary mb-3">Nueva materia</p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newSubject.name}
                  onChange={e => setNewSubject(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addSubject()
                    if (e.key === 'Escape') setShowSubjectForm(false)
                  }}
                  placeholder="Nombre de la materia"
                  autoFocus
                  className={inputClass}
                />
                <div>
                  <p className="text-xs text-text-secondary mb-2">Color</p>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewSubject(p => ({ ...p, color: c }))}
                        className={`w-8 h-8 rounded-full transition-all ${
                          newSubject.color === c
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-surface scale-110'
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => setShowSubjectForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={addSubject}
                    disabled={!newSubject.name.trim()}
                  >
                    Agregar
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <button
              onClick={() => setShowSubjectForm(true)}
              className="w-full py-4 rounded-2xl border-2 border-dashed border-border-subtle text-text-secondary hover:text-text-primary hover:border-primary/40 transition-all text-sm"
            >
              + Agregar materia
            </button>
          )}

          {subjects.length === 0 && !showSubjectForm && (
            <p className="text-center text-xs text-text-secondary">
              Necesitás agregar al menos una materia para continuar
            </p>
          )}
        </div>
      )}

      {/* ── STEP 4: Done ─────────────────────────────────────── */}
      {step === 4 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
          <p className="text-7xl mb-6">🎉</p>
          <h2 className="text-2xl font-bold text-text-primary mb-3">¡Todo listo!</h2>
          <p className="text-text-secondary text-sm mb-6 max-w-xs">
            Tu perfil está configurado. Ahora hacé tu primer check-in para que la IA genere tu plan del día personalizado.
          </p>

          <div className="space-y-2.5 w-full max-w-xs text-left mb-8">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-2 border border-border-subtle">
              <span className="text-lg">✅</span>
              <span className="text-sm text-text-primary">
                {doesWork
                  ? `Trabajo ${workConfig.work_days_json.length > 0 ? `${workConfig.work_days_json.length} días/semana` : 'configurado'}`
                  : 'Sin trabajo actualmente'}
              </span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-2 border border-border-subtle">
              <span className="text-lg">{semester.name ? '✅' : '⏭️'}</span>
              <span className="text-sm text-text-primary">
                {semester.name || 'Cuatrimestre: omitido por ahora'}
              </span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-2 border border-border-subtle">
              <span className="text-lg">{subjects.length > 0 ? '✅' : '⏭️'}</span>
              <span className="text-sm text-text-primary">
                {subjects.length > 0
                  ? `${subjects.length} materia${subjects.length !== 1 ? 's' : ''} agregada${subjects.length !== 1 ? 's' : ''}`
                  : 'Materias: podés agregarlas después'}
              </span>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => router.push('/checkin')}
          >
            Hacer mi primer check-in ✅
          </Button>
        </div>
      )}

      {/* Navigation buttons (steps 1–3) */}
      {step >= 1 && step <= 3 && (
        <div className="space-y-2 mt-6">
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => setStep(s => s - 1)}
              disabled={saving}
            >
              ← Atrás
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={handleNext}
              loading={saving}
              disabled={!canGoNext() || saving || (step === 3 && subjects.length === 0)}
            >
              {step === 3 ? 'Guardar y continuar →' : 'Siguiente →'}
            </Button>
          </div>

          {/* Skip options */}
          {step === 2 && (
            <button
              onClick={skipSemesterAndSubjects}
              className="w-full py-2.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              El cuatrimestre aún no comenzó — omitir por ahora →
            </button>
          )}
          {step === 3 && (
            <button
              onClick={() => setStep(4)}
              className="w-full py-2.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Omitir materias por ahora — las agrego después →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
