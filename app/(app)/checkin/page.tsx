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

export default function CheckInPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [alreadyDone, setAlreadyDone] = useState(false)

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

  // Check if already done today
  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('checkins')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .single()
      if (data) setAlreadyDone(true)
    }
    check()
  }, [])

  function addTravelSegment() {
    setForm(f => ({
      ...f,
      travel_route: [
        ...f.travel_route,
        { origin: '', destination: '', duration_minutes: 30 },
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
      router.push('/today')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function canProceed(): boolean {
    if (step === 2 && form.has_faculty) {
      return !!form.faculty_mode && !!form.faculty_subject
    }
    if (step === 3) {
      return form.travel_route.every(s => s.origin && s.destination)
    }
    return true
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
    <div className="min-h-dvh flex flex-col px-4 pt-6 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Check-in matutino ☀️</h1>
        <p className="text-text-secondary text-sm mt-1 capitalize">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 mb-6">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i <= step ? 'bg-primary' : 'bg-surface-2'
            }`}
          />
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
              <Button variant="secondary" size="sm" onClick={addTravelSegment}>
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
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-text-primary">🚌 Tramo {i + 1}</p>
                  <button
                    onClick={() => removeSegment(i)}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={seg.origin}
                      onChange={e => updateSegment(i, 'origin', e.target.value)}
                      placeholder="Origen (ej: Casa)"
                      className="flex-1 h-10 px-3 rounded-xl bg-surface border border-border-subtle
                                 text-sm text-text-primary placeholder-text-secondary
                                 focus:outline-none focus:border-primary/50"
                    />
                    <span className="flex items-center text-text-secondary">→</span>
                    <input
                      type="text"
                      value={seg.destination}
                      onChange={e => updateSegment(i, 'destination', e.target.value)}
                      placeholder="Destino (ej: Trabajo)"
                      className="flex-1 h-10 px-3 rounded-xl bg-surface border border-border-subtle
                                 text-sm text-text-primary placeholder-text-secondary
                                 focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-text-secondary whitespace-nowrap">⏱ Duración</p>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={seg.duration_minutes}
                      onChange={e => updateSegment(i, 'duration_minutes', parseInt(e.target.value) || 30)}
                      className="w-20 h-10 px-3 rounded-xl bg-surface border border-border-subtle
                                 text-sm text-text-primary text-center
                                 focus:outline-none focus:border-primary/50"
                    />
                    <p className="text-xs text-text-secondary">minutos</p>
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
            <Card variant="elevated">
              <p className="text-sm font-semibold text-text-primary mb-3">Resumen del check-in</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Sueño</span>
                  <span className="text-text-primary">{form.sleep_quality}/5 {['😴','😕','😐','🙂','😁'][form.sleep_quality - 1]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Energía</span>
                  <span className="text-text-primary">{form.energy_level}/5 {['🪫','😮‍💨','⚡','🔥','🚀'][form.energy_level - 1]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Estrés</span>
                  <span className="text-text-primary">
                    {form.stress_level === 'low' ? '😌 Tranquilo' : form.stress_level === 'medium' ? '😤 Algo estresado' : '😰 Muy estresado'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Trabajo</span>
                  <span className="text-text-primary capitalize">{form.work_mode.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Facultad</span>
                  <span className="text-text-primary">
                    {form.has_faculty
                      ? `${form.faculty_mode === 'presencial' ? '🏫' : '💻'} ${form.faculty_subject}`
                      : 'No'}
                  </span>
                </div>
                {form.travel_route.length > 0 && (
                  <div>
                    <p className="text-text-secondary mb-1">Viajes</p>
                    {form.travel_route.map((s, i) => (
                      <p key={i} className="text-text-primary text-xs">
                        🚌 {s.origin} → {s.destination} ({s.duration_minutes}min)
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <p className="text-xs text-text-secondary text-center">
              La IA usará estos datos para generar tu plan personalizado del día
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        {step > 0 && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep(s => s - 1)}>
            ← Atrás
          </Button>
        )}

        {step < STEPS.length - 1 ? (
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed()}
          >
            Siguiente →
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={handleSubmit}
            loading={loading}
          >
            Guardar check-in ✅
          </Button>
        )}
      </div>
    </div>
  )
}
