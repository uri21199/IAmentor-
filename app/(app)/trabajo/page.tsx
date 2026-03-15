'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

const DAYS = [
  { value: 1, label: 'Lun', short: 'L' },
  { value: 2, label: 'Mar', short: 'M' },
  { value: 3, label: 'Mié', short: 'X' },
  { value: 4, label: 'Jue', short: 'J' },
  { value: 5, label: 'Vie', short: 'V' },
  { value: 6, label: 'Sáb', short: 'S' },
  { value: 0, label: 'Dom', short: 'D' },
]

const MODALITY_OPTIONS = [
  { value: 'presencial', label: 'Presencial', icon: '🏢', desc: 'Vas todos los días a la oficina' },
  { value: 'remoto', label: 'Remoto', icon: '🏠', desc: 'Trabajás desde casa siempre' },
  { value: 'mixto', label: 'Mixto', icon: '🔀', desc: 'Combinás presencial y remoto' },
] as const

type WorkMode = 'presencial' | 'remoto' | 'mixto'

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
}

export default function TrabajoPage() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [config, setConfig] = useState({
    is_employed: true,
    work_days_json: [1, 2, 3, 4, 5] as number[],
    work_start: '09:00',
    work_end: '18:00',
    work_default_mode: 'presencial' as WorkMode,
    presential_days_json: [] as number[],
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data } = await supabase
        .from('user_config')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setConfig({
          is_employed: data.is_employed !== false,
          work_days_json: data.work_days_json || [1, 2, 3, 4, 5],
          work_start: data.work_start || '09:00',
          work_end: data.work_end || '18:00',
          work_default_mode: data.work_default_mode || 'presencial',
          presential_days_json: data.presential_days_json || [],
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  function toggleDay(day: number) {
    setConfig(prev => ({
      ...prev,
      work_days_json: prev.work_days_json.includes(day)
        ? prev.work_days_json.filter(d => d !== day)
        : [...prev.work_days_json, day].sort((a, b) => a - b),
    }))
  }

  function togglePresentialDay(day: number) {
    setConfig(prev => ({
      ...prev,
      presential_days_json: prev.presential_days_json.includes(day)
        ? prev.presential_days_json.filter(d => d !== day)
        : [...prev.presential_days_json, day].sort((a, b) => a - b),
    }))
  }

  async function save() {
    if (!user) return
    setSaving(true)
    try {
      await supabase.from('user_config').upsert(
        { user_id: user.id, ...config, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const totalHours = config.is_employed
    ? ((timeToMinutes(config.work_end) - timeToMinutes(config.work_start)) / 60).toFixed(1)
    : '0'

  const weeklyHours = config.is_employed
    ? (parseFloat(totalHours) * config.work_days_json.length).toFixed(0)
    : '0'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-5 pb-28 space-y-5 max-w-lg mx-auto">

      {/* ── Summary card ──────────────────────────────────────── */}
      <div className={`rounded-3xl p-5 border transition-all ${
        config.is_employed
          ? 'bg-primary/10 border-primary/30'
          : 'bg-surface border border-border-subtle'
      }`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-1">
              Estado actual
            </p>
            <p className="text-2xl font-bold text-text-primary">
              {config.is_employed ? '💼 Trabajando' : '🏖️ Sin empleo'}
            </p>
            {config.is_employed && (
              <p className="text-sm text-text-secondary mt-1">
                {config.work_days_json.map(d => DAYS.find(x => x.value === d)?.short).join(' ')}
                {' · '}
                {config.work_start}–{config.work_end}
              </p>
            )}
          </div>
          <div className="text-right">
            {config.is_employed && (
              <>
                <p className="text-3xl font-bold text-primary">{weeklyHours}<span className="text-base font-normal text-text-secondary">hs</span></p>
                <p className="text-xs text-text-secondary">por semana</p>
              </>
            )}
          </div>
        </div>

        {config.is_employed && (
          <div className="flex gap-2 mt-4">
            {/* Visual week strip */}
            {DAYS.map(d => (
              <div
                key={d.value}
                className={`flex-1 rounded-lg py-1.5 text-center text-[11px] font-semibold transition-all ${
                  config.work_days_json.includes(d.value)
                    ? 'bg-primary/30 text-primary'
                    : 'bg-surface-2 text-text-secondary/40'
                }`}
              >
                {d.short}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Employment toggle ─────────────────────────────────── */}
      <Card variant="elevated">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">¿Actualmente trabajás?</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Desactivá si no tenés empleo actualmente
            </p>
          </div>
          <button
            onClick={() => setConfig(p => ({ ...p, is_employed: !p.is_employed }))}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              config.is_employed ? 'bg-primary' : 'bg-surface border border-border-subtle'
            }`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${
              config.is_employed ? 'translate-x-7' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </Card>

      {config.is_employed && (
        <>
          {/* ── Work days ─────────────────────────────────────── */}
          <Card variant="elevated">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-text-primary">Días laborales</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {config.work_days_json.length > 0
                    ? `${config.work_days_json.length} día${config.work_days_json.length > 1 ? 's' : ''} seleccionado${config.work_days_json.length > 1 ? 's' : ''}`
                    : 'Ningún día seleccionado'}
                </p>
              </div>
              <Badge variant={config.work_days_json.length > 0 ? 'primary' : 'default'}>
                {config.work_days_json.length}/7
              </Badge>
            </div>
            <div className="flex gap-1.5">
              {DAYS.map(d => (
                <button
                  key={d.value}
                  onClick={() => toggleDay(d.value)}
                  className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border text-xs font-semibold transition-all min-h-[52px] gap-0.5 ${
                    config.work_days_json.includes(d.value)
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border-subtle bg-surface text-text-secondary hover:border-border-subtle/60'
                  }`}
                >
                  <span>{d.short}</span>
                  <span className="text-[9px] font-normal opacity-70">{d.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* ── Hours ─────────────────────────────────────────── */}
          <Card variant="elevated">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-text-primary">Horario de trabajo</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {totalHours}hs por jornada
                </p>
              </div>
              <Badge variant="cyan">{config.work_start}–{config.work_end}</Badge>
            </div>

            {/* Visual time bar */}
            <div className="relative h-10 rounded-xl bg-surface border border-border-subtle overflow-hidden mb-4">
              <div className="absolute inset-0 flex items-center px-3">
                {[6, 8, 10, 12, 14, 16, 18, 20, 22].map(h => (
                  <div key={h} className="flex-1 text-center">
                    <span className="text-[9px] text-text-secondary/50">{h}</span>
                  </div>
                ))}
              </div>
              {(() => {
                const startMin = timeToMinutes(config.work_start)
                const endMin = timeToMinutes(config.work_end)
                const totalMin = (22 - 6) * 60
                const leftPct = Math.max(0, ((startMin - 360) / totalMin) * 100)
                const widthPct = Math.min(100 - leftPct, ((endMin - startMin) / totalMin) * 100)
                return (
                  <div
                    className="absolute top-0 bottom-0 bg-primary/30 border-x border-primary/60"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                )
              })()}
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-xs text-text-secondary mb-1.5">Entrada</p>
                <input
                  type="time"
                  value={config.work_start}
                  onChange={e => setConfig(p => ({ ...p, work_start: e.target.value }))}
                  className="w-full h-11 px-3 rounded-xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60 text-center"
                />
              </div>
              <div className="flex items-end pb-1 text-text-secondary text-lg font-light">→</div>
              <div className="flex-1">
                <p className="text-xs text-text-secondary mb-1.5">Salida</p>
                <input
                  type="time"
                  value={config.work_end}
                  onChange={e => setConfig(p => ({ ...p, work_end: e.target.value }))}
                  className="w-full h-11 px-3 rounded-xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60 text-center"
                />
              </div>
            </div>
          </Card>

          {/* ── Modality ──────────────────────────────────────── */}
          <Card variant="elevated">
            <p className="text-sm font-semibold text-text-primary mb-1">Modalidad habitual</p>
            <p className="text-xs text-text-secondary mb-4">
              El check-in usará esto como sugerencia por defecto
            </p>
            <div className="space-y-2">
              {MODALITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setConfig(p => ({ ...p, work_default_mode: opt.value }))}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
                    config.work_default_mode === opt.value
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border-subtle bg-surface hover:border-border-subtle/60'
                  }`}
                >
                  <span className="text-2xl">{opt.icon}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${config.work_default_mode === opt.value ? 'text-primary' : 'text-text-primary'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-text-secondary">{opt.desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    config.work_default_mode === opt.value
                      ? 'border-primary bg-primary'
                      : 'border-border-subtle'
                  }`}>
                    {config.work_default_mode === opt.value && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Presential days for mixto */}
            {config.work_default_mode === 'mixto' && config.work_days_json.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <p className="text-xs font-medium text-text-secondary mb-3">
                  ¿Qué días vas presencialmente?
                </p>
                <div className="flex gap-1.5">
                  {DAYS.filter(d => config.work_days_json.includes(d.value)).map(d => (
                    <button
                      key={d.value}
                      onClick={() => togglePresentialDay(d.value)}
                      className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-all min-h-[40px] ${
                        config.presential_days_json.includes(d.value)
                          ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                          : 'border-border-subtle bg-surface text-text-secondary'
                      }`}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-secondary mt-2">
                  {config.presential_days_json.length > 0
                    ? `${config.presential_days_json.length} día${config.presential_days_json.length > 1 ? 's' : ''} presencial${config.presential_days_json.length > 1 ? 'es' : ''}`
                    : 'Ningún día presencial marcado'}
                </p>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Save ──────────────────────────────────────────────── */}
      <Button
        variant={saved ? 'success' : 'primary'}
        size="lg"
        className="w-full"
        onClick={save}
        loading={saving}
      >
        {saved ? '✓ Cambios guardados' : 'Guardar cambios'}
      </Button>
    </div>
  )
}
