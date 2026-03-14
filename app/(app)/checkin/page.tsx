'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { EmojiSelector, SLEEP_OPTIONS, ENERGY_OPTIONS } from '@/components/ui/EmojiSelector'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { StressLevel, WorkMode, CheckInFormData, TravelSegment } from '@/types'

const STEPS = ['Estado', 'Trabajo', 'Facultad', 'Viaje', 'Resumen']

const LOCATION_CHIPS = ['Casa', 'Trabajo', 'Facultad']

function calcDuration(dep: string, arr: string): number {
  if (!dep || !arr) return 30
  const [dh, dm] = dep.split(':').map(Number)
  const [ah, am] = arr.split(':').map(Number)
  const diff = (ah * 60 + am) - (dh * 60 + dm)
  return diff > 0 ? diff : 30
}

export default function CheckInPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [checking, setChecking] = useState(true)

  const [form, setForm] = useState<CheckInFormData>({
    sleep_quality: 3,
    energy_level: 3,
    stress_level: 'low',
    work_mode: 'remoto',
    has_faculty: false,
    faculty_mode: null,
    faculty_subject: null,
    travel_route: [],
    unexpected_events: '',
  })

  // Check if already done today + pre-fill work_mode from user_config
  useEffect(() => {
    async function check() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setChecking(false); return }

        const today = format(new Date(), 'yyyy-MM-dd')
        const { data: existing } = await supabase
          .from('checkins')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', today)
          .single()
        if (existing) {
          setAlreadyDone(true)
          setChecking(false)
          return
        }

        // Pre-fill work_mode from user_config
        const { data: config } = await supabase
          .from('user_config')
          .select('work_days_json, work_default_mode, presential_days_json, is_employed')
          .eq('user_id', user.id)
          .single()

        if (config) {
          // If user marked themselves as not employed, default to no_work
          if (config.is_employed === false) {
            setForm(f => ({ ...f, work_mode: 'no_work' }))
          } else {
            const todayDow = new Date().getDay()
            const workDays: number[] = config.work_days_json || [1, 2, 3, 4, 5]
            if (workDays.includes(todayDow)) {
              let defaultMode: WorkMode = 'remoto'
              if (config.work_default_mode === 'presencial') {
                defaultMode = 'presencial'
              } else if (config.work_default_mode === 'remoto') {
                defaultMode = 'remoto'
              } else if (config.work_default_mode === 'mixto') {
                const presentialDays: number[] = config.presential_days_json || []
                defaultMode = presentialDays.includes(todayDow) ? 'presencial' : 'remoto'
              }
              setForm(f => ({ ...f, work_mode: defaultMode }))
            } else {
              setForm(f => ({ ...f, work_mode: 'no_work' }))
            }
          }
        }
      } finally {
        setChecking(false)
      }
    }
    check()
  }, [])

  function addTravelSegment() {
    setForm(f => ({
      ...f,
      travel_route: [
        ...f.travel_route,
        { origin: '', destination: '', duration_minutes: 30, departure_time: '', arrival_time: '' },
      ],
    }))
  }

  function updateSegment(i: number, field: keyof TravelSegment, value: string | number) {
    setForm(f => ({
      ...f,
      travel_route: f.travel_route.map((seg, idx) =>
        idx === i ? { ...seg, [field]: value } : seg
      ),
    }))
  }

  function removeSegment(i: number) {
    setForm(f => ({
      ...f,
      travel_route: f.travel_route.filter((_, idx) => idx !== i),
    }))
  }

  async function handleSubmit() {
    setLoading(true)
    setLoadingMsg('Guardando check-in...')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const today = format(new Date(), 'yyyy-MM-dd')
      const { error } = await supabase.from('checkins').upsert({
        user_id: user.id,
        date: today,
        sleep_quality: form.sleep_quality,
        energy_level: form.energy_level,
        stress_level: form.stress_level,
        work_mode: form.work_mode,
        has_faculty: form.has_faculty,
        faculty_mode: form.faculty_mode,
        faculty_subject: form.faculty_subject,
        travel_route_json: form.travel_route,
        unexpected_events: form.unexpected_events || null,
      })
      if (error) throw error

      // Auto-generate plan with AI after check-in is saved
      setLoadingMsg('Generando plan con IA ✨')
      try {
        const planRes = await fetch('/api/ai/plan', { method: 'POST' })
        if (!planRes.ok) {
          const planErrBody = await planRes.json().catch(() => ({}))
          console.error('Plan generation failed:', planRes.status, planErrBody)
        }
      } catch (planErr) {
        console.error('Plan generation network error:', planErr)
      }

      router.push('/today')
    } catch (err) {
      console.error(err)
      setLoading(false)
      setLoadingMsg('')
    }
  }

  function canProceed(): boolean {
    if (step === 2 && form.has_faculty) {
      return !!form.faculty_mode && !!form.faculty_subject
    }
    if (step === 3) {
      return form.travel_route.every(s =>
        s.origin && s.origin !== '__custom__' &&
        s.destination && s.destination !== '__custom__'
      )
    }
    return true
  }

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (alreadyDone) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
        <span className="text-5xl mb-4">✅</span>
        <h2 className="text-xl font-bold text-text-primary">Check-in ya realizado</h2>
        <p className="text-text-secondary text-sm mt-2 mb-6">
          Ya completaste el check-in de hoy. Podés ver tu plan.
        </p>
        <Button variant="primary" onClick={() => router.push('/today')}>
          Ver mi plan de hoy
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col px-4 pt-6 pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-5">
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-2 border border-border-subtle text-xs text-text-secondary capitalize">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </span>
        <h1 className="text-xl font-bold text-text-primary mt-2">Check-in matutino</h1>
      </div>

      {/* Progress — numbered step pills */}
      <div className="flex items-center gap-1.5 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                i <= step ? 'bg-primary' : 'bg-surface-2'
              }`}
            />
            {i === step && (
              <span className="text-[10px] text-primary font-medium">{s}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 space-y-5">

        {/* STEP 0: Estado */}
        {step === 0 && (
          <>
            <EmojiSelector
              label="¿Cómo dormiste?"
              options={SLEEP_OPTIONS}
              value={form.sleep_quality}
              onChange={v => setForm(f => ({ ...f, sleep_quality: v }))}
            />

            <EmojiSelector
              label="¿Cómo está tu energía?"
              options={ENERGY_OPTIONS}
              value={form.energy_level}
              onChange={v => setForm(f => ({ ...f, energy_level: v }))}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-secondary">¿Cómo está tu estrés?</p>
              <div className="flex gap-2">
                {([
                  { value: 'low', label: '😌 Tranquilo' },
                  { value: 'medium', label: '😤 Algo estresado' },
                  { value: 'high', label: '😰 Muy estresado' },
                ] as { value: StressLevel; label: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, stress_level: opt.value }))}
                    className={`
                      flex-1 py-3 px-2 rounded-2xl border text-xs font-medium transition-all duration-200 min-h-[52px]
                      ${form.stress_level === opt.value
                        ? 'border-primary bg-primary/20'
                        : 'border-border-subtle bg-surface-2'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* STEP 1: Trabajo */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-text-secondary">Modalidad del día</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'presencial', label: '🏢 Presencial', desc: 'Oficina / trabajo en persona' },
                { value: 'remoto', label: '🏠 Remoto', desc: 'Home office' },
                { value: 'no_work', label: '🚫 No trabajo', desc: 'Sin trabajo hoy' },
                { value: 'libre', label: '🎉 Día libre', desc: 'Vacaciones / libre' },
              ] as { value: WorkMode; label: string; desc: string }[]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(f => ({ ...f, work_mode: opt.value }))}
                  className={`
                    p-4 rounded-2xl border text-left transition-all duration-200 min-h-[80px]
                    ${form.work_mode === opt.value
                      ? 'border-primary bg-primary/20'
                      : 'border-border-subtle bg-surface-2'
                    }
                  `}
                >
                  <p className="font-medium text-text-primary text-sm">{opt.label}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: Facultad */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-secondary">¿Tenés facultad hoy?</p>
              <div className="flex gap-3">
                {[true, false].map(v => (
                  <button
                    key={String(v)}
                    onClick={() => setForm(f => ({ ...f, has_faculty: v, faculty_mode: null, faculty_subject: null }))}
                    className={`
                      flex-1 py-3 rounded-2xl border text-sm font-medium transition-all duration-200 min-h-[48px]
                      ${form.has_faculty === v
                        ? 'border-primary bg-primary/20 text-text-primary'
                        : 'border-border-subtle bg-surface-2 text-text-secondary'
                      }
                    `}
                  >
                    {v ? '✅ Sí' : '❌ No'}
                  </button>
                ))}
              </div>
            </div>

            {form.has_faculty && (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-text-secondary">¿Presencial o remoto?</p>
                  <div className="flex gap-3">
                    {(['presencial', 'remoto'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setForm(f => ({ ...f, faculty_mode: v }))}
                        className={`
                          flex-1 py-3 rounded-2xl border text-sm font-medium transition-all duration-200 min-h-[48px]
                          ${form.faculty_mode === v
                            ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                            : 'border-border-subtle bg-surface-2 text-text-secondary'
                          }
                        `}
                      >
                        {v === 'presencial' ? '🏫 Presencial' : '💻 Remoto'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-text-secondary">¿Qué materia tenés hoy?</p>
                  <input
                    type="text"
                    value={form.faculty_subject || ''}
                    onChange={e => setForm(f => ({ ...f, faculty_subject: e.target.value }))}
                    placeholder="Ej: Química Básica"
                    className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
                               text-text-primary placeholder-text-secondary text-sm
                               focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 3: Viaje */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Ruta del día</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Agregá cada tramo de viaje (ida y vuelta separados)
                </p>
              </div>
              <Button variant="secondary" size="sm" className="whitespace-nowrap shrink-0" onClick={addTravelSegment}>
                + Agregar
              </Button>
            </div>

            {form.travel_route.length === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">🏠</p>
                <p className="text-sm text-text-secondary">Sin viajes (quedás en casa)</p>
              </div>
            )}

            {form.travel_route.map((seg, i) => (
              <Card key={i} variant="elevated">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-text-primary">🚌 Tramo {i + 1}</p>
                  <button
                    onClick={() => removeSegment(i)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4">

                  {/* Desde */}
                  <div>
                    <p className="text-xs text-text-secondary mb-2">Desde</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {LOCATION_CHIPS.map(place => (
                        <button
                          key={place}
                          type="button"
                          onClick={() => updateSegment(i, 'origin', place)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-medium border transition-colors min-h-[44px] ${
                            seg.origin === place
                              ? 'border-primary bg-primary/20 text-primary'
                              : 'border-border-subtle bg-surface text-text-secondary'
                          }`}
                        >
                          {place}
                        </button>
                      ))}
                      {(seg.origin === '' || LOCATION_CHIPS.includes(seg.origin)) && (
                        <button
                          type="button"
                          onClick={() => updateSegment(i, 'origin', '__custom__')}
                          className="px-4 py-2.5 rounded-xl text-xs font-medium border border-border-subtle bg-surface text-text-secondary min-h-[44px]"
                        >
                          + Otro
                        </button>
                      )}
                    </div>
                    {seg.origin !== '' && !LOCATION_CHIPS.includes(seg.origin) && (
                      <input
                        type="text"
                        value={seg.origin === '__custom__' ? '' : seg.origin}
                        onChange={e => updateSegment(i, 'origin', e.target.value || '__custom__')}
                        placeholder="Lugar de origen"
                        autoFocus
                        className="w-full h-11 px-4 rounded-2xl bg-surface border border-border-subtle
                                   text-sm text-text-primary placeholder-text-secondary
                                   focus:outline-none focus:border-primary/60"
                      />
                    )}
                  </div>

                  {/* Hasta */}
                  <div>
                    <p className="text-xs text-text-secondary mb-2">Hasta</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {LOCATION_CHIPS.map(place => (
                        <button
                          key={place}
                          type="button"
                          onClick={() => updateSegment(i, 'destination', place)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-medium border transition-colors min-h-[44px] ${
                            seg.destination === place
                              ? 'border-primary bg-primary/20 text-primary'
                              : 'border-border-subtle bg-surface text-text-secondary'
                          }`}
                        >
                          {place}
                        </button>
                      ))}
                      {(seg.destination === '' || LOCATION_CHIPS.includes(seg.destination)) && (
                        <button
                          type="button"
                          onClick={() => updateSegment(i, 'destination', '__custom__')}
                          className="px-4 py-2.5 rounded-xl text-xs font-medium border border-border-subtle bg-surface text-text-secondary min-h-[44px]"
                        >
                          + Otro
                        </button>
                      )}
                    </div>
                    {seg.destination !== '' && !LOCATION_CHIPS.includes(seg.destination) && (
                      <input
                        type="text"
                        value={seg.destination === '__custom__' ? '' : seg.destination}
                        onChange={e => updateSegment(i, 'destination', e.target.value || '__custom__')}
                        placeholder="Lugar de destino"
                        className="w-full h-11 px-4 rounded-2xl bg-surface border border-border-subtle
                                   text-sm text-text-primary placeholder-text-secondary
                                   focus:outline-none focus:border-primary/60"
                      />
                    )}
                  </div>

                  {/* Horario */}
                  <div>
                    <p className="text-xs text-text-secondary mb-2">Horario</p>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-text-secondary mb-1">Salida</p>
                        <input
                          type="time"
                          value={seg.departure_time || ''}
                          onChange={e => {
                            const dep = e.target.value
                            updateSegment(i, 'departure_time', dep)
                            const dur = calcDuration(dep, seg.arrival_time || '')
                            updateSegment(i, 'duration_minutes', dur)
                          }}
                          className="w-full h-11 px-3 rounded-2xl bg-surface border border-border-subtle
                                     text-sm text-text-primary focus:outline-none focus:border-primary/60"
                        />
                      </div>
                      <span className="text-text-secondary mb-3">→</span>
                      <div className="flex-1">
                        <p className="text-[10px] text-text-secondary mb-1">Llegada</p>
                        <input
                          type="time"
                          value={seg.arrival_time || ''}
                          onChange={e => {
                            const arr = e.target.value
                            updateSegment(i, 'arrival_time', arr)
                            const dur = calcDuration(seg.departure_time || '', arr)
                            updateSegment(i, 'duration_minutes', dur)
                          }}
                          className="w-full h-11 px-3 rounded-2xl bg-surface border border-border-subtle
                                     text-sm text-text-primary focus:outline-none focus:border-primary/60"
                        />
                      </div>
                    </div>
                    {seg.departure_time && seg.arrival_time && (
                      <p className="text-xs text-text-secondary mt-1.5 text-center">
                        ⏱ {seg.duration_minutes} min de viaje
                      </p>
                    )}
                  </div>

                </div>
              </Card>
            ))}

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-secondary">¿Imprevistos a tener en cuenta?</p>
              <textarea
                value={form.unexpected_events}
                onChange={e => setForm(f => ({ ...f, unexpected_events: e.target.value }))}
                placeholder="Opcional: mecánico a las 17hs, turno médico, etc."
                className="w-full h-20 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle
                           text-text-primary placeholder-text-secondary text-sm resize-none
                           focus:outline-none focus:border-primary/60"
              />
            </div>
          </div>
        )}

        {/* STEP 4: Resumen */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                <span className="text-sm text-text-secondary">Sueño</span>
                <span className="text-sm font-medium text-text-primary">{form.sleep_quality}/5</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                <span className="text-sm text-text-secondary">Energía</span>
                <span className="text-sm font-medium text-text-primary">{form.energy_level}/5</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                <span className="text-sm text-text-secondary">Estrés</span>
                <span className="text-sm font-medium text-text-primary">
                  {form.stress_level === 'low' ? 'Tranquilo' : form.stress_level === 'medium' ? 'Algo estresado' : 'Muy estresado'}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                <span className="text-sm text-text-secondary">Trabajo</span>
                <span className="text-sm font-medium text-text-primary capitalize">{form.work_mode.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-text-secondary">Facultad</span>
                <span className="text-sm font-medium text-text-primary">
                  {form.has_faculty
                    ? `${form.faculty_mode === 'presencial' ? 'Presencial' : 'Remoto'} — ${form.faculty_subject}`
                    : 'No'}
                </span>
              </div>
              {form.travel_route.length > 0 && (
                <div className="border-t border-border-subtle px-4 py-3 space-y-1">
                  <p className="text-xs text-text-secondary mb-1.5">Viajes</p>
                  {form.travel_route.map((s, i) => (
                    <p key={i} className="text-sm text-text-primary">
                      {s.origin} → {s.destination}
                      <span className="text-text-secondary ml-1 text-xs">
                        {s.departure_time && s.arrival_time
                          ? `${s.departure_time}–${s.arrival_time}`
                          : `${s.duration_minutes}min`}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-text-secondary text-center">
              Al guardar, la IA generará automáticamente tu plan del día
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      {step < STEPS.length - 1 ? (
        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep(s => s - 1)}>
              ← Atrás
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed()}
          >
            Siguiente →
          </Button>
        </div>
      ) : (
        <div className="space-y-2 mt-6">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleSubmit}
            loading={loading}
          >
            Guardar y generar plan ✨
          </Button>
          {loading && loadingMsg && (
            <p className="text-center text-xs text-text-secondary animate-pulse">{loadingMsg}</p>
          )}
          <Button variant="secondary" size="md" className="w-full" onClick={() => setStep(s => s - 1)}>
            ← Atrás
          </Button>
        </div>
      )}
    </div>
  )
}
