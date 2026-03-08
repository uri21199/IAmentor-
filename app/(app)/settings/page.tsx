'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import type { Semester } from '@/types'

const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function SettingsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // ── Work config ──────────────────────────────────────────
  const [workConfig, setWorkConfig] = useState({
    work_days_json: [1, 2, 3, 4, 5] as number[],
    work_start: '09:00',
    work_end: '18:00',
    work_default_mode: 'presencial' as 'presencial' | 'remoto' | 'mixto',
    presential_days_json: [] as number[],
  })
  const [savingWork, setSavingWork] = useState(false)
  const [workSaved, setWorkSaved] = useState(false)
  const [workExpanded, setWorkExpanded] = useState(true)

  // ── Class schedule ───────────────────────────────────────
  const [classes, setClasses] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [showClassForm, setShowClassForm] = useState(false)
  const [classForm, setClassForm] = useState({
    subject_id: '',
    day_of_week: 1,
    start_time: '08:00',
    end_time: '10:00',
    modality: 'presencial' as 'presencial' | 'virtual',
  })
  const [savingClass, setSavingClass] = useState(false)

  // ── Semesters ────────────────────────────────────────────
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [showNewSemester, setShowNewSemester] = useState(false)
  const [newSemester, setNewSemester] = useState({ name: '', start_date: '', end_date: '' })
  const [creating, setCreating] = useState(false)

  // ── Google Calendar ──────────────────────────────────────
  const [calendarConnected, setCalendarConnected] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)

      // Load work config
      const { data: config } = await supabase
        .from('user_config')
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (config) {
        setWorkConfig({
          work_days_json: config.work_days_json || [1, 2, 3, 4, 5],
          work_start: config.work_start || '09:00',
          work_end: config.work_end || '18:00',
          work_default_mode: config.work_default_mode || 'presencial',
          presential_days_json: config.presential_days_json || [],
        })
        setWorkExpanded(false) // Collapse when already configured
      }

      // Load active semester subjects for dropdown FIRST (needed to enable + Agregar button)
      // Use limit(1) instead of .single() to avoid errors on 0 or 2+ active semesters
      const { data: semesterRows, error: semErr } = await supabase
        .from('semesters')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
      console.debug('[Settings] Active semester query:', { semesterRows, semErr })

      const activeSemesterId = semesterRows?.[0]?.id ?? null

      if (activeSemesterId) {
        const { data: subs, error: subErr } = await supabase
          .from('subjects')
          .select('id, name, color')
          .eq('semester_id', activeSemesterId)
          .order('name')
        console.debug('[Settings] Subjects query:', { subs, subErr })
        const subList = subs || []
        setSubjects(subList)
        if (subList.length > 0) {
          setClassForm(f => ({ ...f, subject_id: subList[0].id }))
        }
      } else {
        // Fallback: no active semester — try to load subjects from ANY semester
        console.debug('[Settings] No active semester found. Loading subjects from all semesters as fallback.')
        const { data: allSubs, error: allSubErr } = await supabase
          .from('subjects')
          .select('id, name, color')
          .eq('user_id', user.id)
          .order('name')
        console.debug('[Settings] All-subjects fallback:', { allSubs, allSubErr })
        const subList = allSubs || []
        setSubjects(subList)
        if (subList.length > 0) {
          setClassForm(f => ({ ...f, subject_id: subList[0].id }))
        }
      }

      // Load class schedule with subject names (wrapped in try-catch in case table isn't migrated yet)
      try {
        const { data: classData } = await supabase
          .from('class_schedule')
          .select('*, subjects(name, color)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('day_of_week')
          .order('start_time')
        setClasses(classData || [])
      } catch (e) {
        console.warn('class_schedule not available:', e)
        setClasses([])
      }

      // Load semesters
      const { data: semData } = await supabase
        .from('semesters')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setSemesters(semData || [])

      // Check Google Calendar
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar')
        .single()
      setCalendarConnected(!!integration)

      setLoading(false)
    }
    load()
  }, [])

  // ── Work config helpers ──────────────────────────────────

  function toggleWorkDay(day: number) {
    setWorkConfig(prev => ({
      ...prev,
      work_days_json: prev.work_days_json.includes(day)
        ? prev.work_days_json.filter(d => d !== day)
        : [...prev.work_days_json, day].sort((a, b) => a - b),
    }))
  }

  function togglePresentialDay(day: number) {
    setWorkConfig(prev => ({
      ...prev,
      presential_days_json: prev.presential_days_json.includes(day)
        ? prev.presential_days_json.filter(d => d !== day)
        : [...prev.presential_days_json, day].sort((a, b) => a - b),
    }))
  }

  async function saveWorkConfig() {
    if (!user) return
    setSavingWork(true)
    try {
      await supabase.from('user_config').upsert(
        { user_id: user.id, ...workConfig, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      setWorkSaved(true)
      setWorkExpanded(false) // Collapse after saving
      setTimeout(() => setWorkSaved(false), 2500)
    } finally {
      setSavingWork(false)
    }
  }

  // ── Class schedule helpers ───────────────────────────────

  async function addClass() {
    if (!user || !classForm.subject_id) return
    setSavingClass(true)
    try {
      const { data, error } = await supabase
        .from('class_schedule')
        .insert({ user_id: user.id, ...classForm })
        .select('*, subjects(name, color)')
        .single()
      if (!error && data) {
        setClasses(prev =>
          [...prev, data].sort((a, b) =>
            a.day_of_week !== b.day_of_week
              ? a.day_of_week - b.day_of_week
              : a.start_time.localeCompare(b.start_time)
          )
        )
        setShowClassForm(false)
        setClassForm({
          subject_id: subjects[0]?.id || '',
          day_of_week: 1,
          start_time: '08:00',
          end_time: '10:00',
          modality: 'presencial',
        })
      }
    } finally {
      setSavingClass(false)
    }
  }

  async function deleteClass(id: string) {
    await supabase.from('class_schedule').update({ is_active: false }).eq('id', id)
    setClasses(prev => prev.filter(c => c.id !== id))
  }

  // ── Semester helpers ─────────────────────────────────────

  async function activateSemester(semesterId: string) {
    if (!user) return
    // Deactivate all, then activate the selected one
    await supabase.from('semesters').update({ is_active: false }).eq('user_id', user.id)
    await supabase.from('semesters').update({ is_active: true }).eq('id', semesterId)
    setSemesters(prev => prev.map(s => ({ ...s, is_active: s.id === semesterId })))
  }

  async function deactivateSemester(semesterId: string) {
    if (!user) return
    await supabase.from('semesters').update({ is_active: false }).eq('id', semesterId)
    setSemesters(prev => prev.map(s => s.id === semesterId ? { ...s, is_active: false } : s))
  }

  async function createSemester() {
    if (!user || !newSemester.name || !newSemester.start_date || !newSemester.end_date) return
    setCreating(true)
    try {
      const { data, error } = await supabase.from('semesters').insert({
        user_id: user.id,
        ...newSemester,
        is_active: false,
      }).select().single()
      if (!error && data) {
        setSemesters(prev => [data, ...prev])
        setShowNewSemester(false)
        setNewSemester({ name: '', start_date: '', end_date: '' })
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const timeInputClass = 'w-full h-10 px-3 rounded-xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60'

  return (
    <div className="px-4 pt-6 pb-4 space-y-6 max-w-lg mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Configuración ⚙️</h1>
        <p className="text-text-secondary text-sm mt-0.5">{user?.email}</p>
      </div>

      {/* ── SECTION 1: Work schedule ─────────────────────────── */}
      <Card variant="elevated">
        {/* Header row with toggle */}
        <div className="flex items-center justify-between mb-2">
          <CardTitle>💼 Horario de trabajo</CardTitle>
          <button
            onClick={() => setWorkExpanded(e => !e)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors text-sm"
            title={workExpanded ? 'Contraer' : 'Expandir'}
          >
            {workExpanded ? '▲' : '▼'}
          </button>
        </div>

        {/* Collapsed summary view */}
        {!workExpanded && (
          <button
            onClick={() => setWorkExpanded(true)}
            className="w-full text-left p-3 rounded-xl bg-surface-2 border border-border-subtle hover:border-primary/30 transition-all mt-1"
          >
            <p className="text-sm text-text-primary">
              {workConfig.work_days_json.length > 0
                ? workConfig.work_days_json.map(d => DAYS.find(day => day.value === d)?.label).filter(Boolean).join(' · ')
                : 'Sin días laborales'}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {workConfig.work_start}–{workConfig.work_end}
              {' · '}
              {workConfig.work_default_mode === 'presencial' ? '🏢 Presencial' : workConfig.work_default_mode === 'remoto' ? '🏠 Remoto' : '🔀 Mixto'}
            </p>
            <p className="text-xs text-primary mt-1">Tocar para editar ✏️</p>
          </button>
        )}

        {/* Expanded form */}
        {workExpanded && (
          <>
            <p className="text-xs text-text-secondary mb-4">
              El check-in pre-seleccionará tu modalidad según este horario. Podés cambiarlo ese día.
            </p>

            {/* Days */}
            <div className="mb-4">
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
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <p className="text-xs text-text-secondary mb-1.5">Hora de entrada</p>
                <input
                  type="time"
                  value={workConfig.work_start}
                  onChange={e => setWorkConfig(p => ({ ...p, work_start: e.target.value }))}
                  className={timeInputClass}
                />
              </div>
              <div className="flex-1">
                <p className="text-xs text-text-secondary mb-1.5">Hora de salida</p>
                <input
                  type="time"
                  value={workConfig.work_end}
                  onChange={e => setWorkConfig(p => ({ ...p, work_end: e.target.value }))}
                  className={timeInputClass}
                />
              </div>
            </div>

            {/* Default mode */}
            <div className="mb-4">
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

            {/* Presential days (mixto only) */}
            {workConfig.work_default_mode === 'mixto' && (
              <div className="mb-4">
                <p className="text-xs text-text-secondary mb-2">Días presenciales habituales</p>
                <div className="flex gap-1.5">
                  {DAYS.filter(d => workConfig.work_days_json.includes(d.value)).map(d => (
                    <button
                      key={d.value}
                      onClick={() => togglePresentialDay(d.value)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all min-h-[36px] ${
                        workConfig.presential_days_json.includes(d.value)
                          ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                          : 'border-border-subtle bg-surface-2 text-text-secondary'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={saveWorkConfig}
              loading={savingWork}
            >
              {workSaved ? '✅ Guardado' : 'Guardar configuración de trabajo'}
            </Button>
          </>
        )}
      </Card>

      {/* ── SECTION 2: University class schedule ─────────────── */}
      <Card variant="elevated">
        <div className="flex items-center justify-between mb-1">
          <CardTitle>🎓 Cursada universitaria</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowClassForm(true)}
            disabled={subjects.length === 0}
          >
            + Agregar
          </Button>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Tus clases fijas se agregan automáticamente al plan diario como bloques de clase.
          {subjects.length === 0 && ' Necesitás tener materias cargadas (creá un cuatrimestre con materias).'}
        </p>

        {classes.length > 0 ? (
          <div className="space-y-2">
            {classes.map(cls => (
              <div
                key={cls.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border-subtle"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cls.subjects?.color || '#06B6D4' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {cls.subjects?.name || 'Materia'}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {DAY_NAMES[cls.day_of_week]} · {cls.start_time}–{cls.end_time} · {cls.modality}
                  </p>
                </div>
                <button
                  onClick={() => deleteClass(cls.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-surface text-text-secondary hover:text-red-400 transition-colors shrink-0 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-3xl mb-2">📅</p>
            <p className="text-text-secondary text-sm">No hay clases cargadas</p>
            <p className="text-xs text-text-secondary mt-1">Agregá tus clases fijas semanales</p>
          </div>
        )}
      </Card>

      {/* ── Google Calendar ──────────────────────────────────── */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>📅 Google Calendar</CardTitle>
          <Badge variant={calendarConnected ? 'success' : 'default'}>
            {calendarConnected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </CardHeader>
        <p className="text-xs text-text-secondary mb-4">
          Conectá tu calendario para que la IA incluya tus eventos en el plan diario
        </p>
        <Button
          variant={calendarConnected ? 'secondary' : 'primary'}
          size="md"
          className="w-full"
          onClick={() => { window.location.href = '/api/calendar/auth' }}
        >
          {calendarConnected ? '🔄 Reconectar calendario' : '🔗 Conectar Google Calendar'}
        </Button>
      </Card>

      {/* ── Semesters ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">Cuatrimestres</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowNewSemester(!showNewSemester)}>
            + Nuevo
          </Button>
        </div>

        {showNewSemester && (
          <Card variant="elevated" className="mb-3">
            <CardTitle className="mb-3">Nuevo cuatrimestre</CardTitle>
            <div className="space-y-3">
              <input
                type="text"
                value={newSemester.name}
                onChange={e => setNewSemester(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: 2do Cuatrimestre 2025"
                className="w-full h-11 px-4 rounded-2xl bg-background border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1">Inicio</p>
                  <input
                    type="date"
                    value={newSemester.start_date}
                    onChange={e => setNewSemester(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full h-11 px-4 rounded-2xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1">Fin</p>
                  <input
                    type="date"
                    value={newSemester.end_date}
                    onChange={e => setNewSemester(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full h-11 px-4 rounded-2xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowNewSemester(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={createSemester}
                  loading={creating}
                  disabled={!newSemester.name || !newSemester.start_date || !newSemester.end_date}
                >
                  Crear
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="space-y-2">
          {semesters.map(sem => (
            <div
              key={sem.id}
              className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                sem.is_active
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border-subtle bg-surface'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{sem.name}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {sem.start_date} → {sem.end_date}
                </p>
              </div>
              {sem.is_active ? (
                <button
                  onClick={() => deactivateSemester(sem.id)}
                  title="Tocá para desactivar"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/20 text-primary text-xs font-medium border border-primary/40 hover:bg-red-500/15 hover:text-red-400 hover:border-red-400/40 transition-all min-h-[36px]"
                >
                  ✓ Activo
                </button>
              ) : (
                <button
                  onClick={() => activateSemester(sem.id)}
                  className="px-3 py-1.5 rounded-xl border border-border-subtle text-xs text-text-secondary hover:text-primary hover:border-primary/50 transition-all min-h-[36px]"
                >
                  Activar
                </button>
              )}
            </div>
          ))}

          {semesters.length === 0 && (
            <p className="text-center text-sm text-text-secondary py-8">
              No hay cuatrimestres. Creá el primero con el botón &quot;+ Nuevo&quot;.
            </p>
          )}
        </div>
      </div>

      {/* App info */}
      <Card variant="bordered">
        <div className="space-y-2 text-xs text-text-secondary">
          <div className="flex justify-between"><span>Versión</span><span>0.2.0</span></div>
          <div className="flex justify-between"><span>Motor IA</span><span>Claude Sonnet 4.5</span></div>
          <div className="flex justify-between"><span>Base de datos</span><span>Supabase</span></div>
        </div>
      </Card>

      <Button variant="danger" size="lg" className="w-full" onClick={handleSignOut}>
        🚪 Cerrar sesión
      </Button>

      {/* ── Add class modal ──────────────────────────────────── */}
      {showClassForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text-primary">🎓 Agregar clase fija</h3>
              <button
                onClick={() => setShowClassForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5">
              {/* Subject dropdown */}
              <div>
                <p className="text-xs text-text-secondary mb-2">Materia</p>
                <select
                  value={classForm.subject_id}
                  onChange={e => setClassForm(p => ({ ...p, subject_id: e.target.value }))}
                  className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Day selector */}
              <div>
                <p className="text-xs text-text-secondary mb-1.5">Día de la semana</p>
                <div className="flex gap-1.5">
                  {DAYS.map(d => (
                    <button
                      key={d.value}
                      onClick={() => setClassForm(p => ({ ...p, day_of_week: d.value }))}
                      className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all min-h-[36px] ${
                        classForm.day_of_week === d.value
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-border-subtle bg-surface-2 text-text-secondary'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time range */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1.5">Hora inicio</p>
                  <input
                    type="time"
                    value={classForm.start_time}
                    onChange={e => setClassForm(p => ({ ...p, start_time: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1.5">Hora fin</p>
                  <input
                    type="time"
                    value={classForm.end_time}
                    onChange={e => setClassForm(p => ({ ...p, end_time: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
              </div>

              {/* Modality */}
              <div>
                <p className="text-xs text-text-secondary mb-1.5">Modalidad</p>
                <div className="flex gap-2">
                  {([
                    { value: 'presencial', label: '🏫 Presencial' },
                    { value: 'virtual', label: '💻 Virtual' },
                  ] as { value: 'presencial' | 'virtual'; label: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setClassForm(p => ({ ...p, modality: opt.value }))}
                      className={`flex-1 py-2.5 rounded-xl border text-sm transition-all min-h-[44px] ${
                        classForm.modality === opt.value
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                          : 'border-border-subtle bg-surface-2 text-text-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button variant="secondary" className="flex-1" onClick={() => setShowClassForm(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={addClass}
                loading={savingClass}
                disabled={!classForm.subject_id}
              >
                Agregar clase
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
