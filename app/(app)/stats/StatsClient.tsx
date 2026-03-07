'use client'

import { useState } from 'react'
import { format, parseISO, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

interface Props {
  checkins: any[]
  plans: any[]
  workouts: any[]
  subjectProgress: any[]
  travelRatio: number
  today: string
  userId: string
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function StatsClient({
  checkins,
  plans,
  workouts,
  subjectProgress,
  travelRatio,
  today,
  userId,
}: Props) {
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)

  // ── Compute averages ────────────────────────────────────────
  const avgEnergy = checkins.length > 0
    ? (checkins.reduce((s, c) => s + c.energy_level, 0) / checkins.length).toFixed(1)
    : '–'

  const avgSleep = checkins.length > 0
    ? (checkins.reduce((s, c) => s + c.sleep_quality, 0) / checkins.length).toFixed(1)
    : '–'

  const avgCompletion = plans.length > 0
    ? Math.round(plans.reduce((s, p) => s + p.completion_percentage, 0) / plans.length)
    : 0

  const totalWorkouts = workouts.filter(w => w.completed).length

  // ── Energy by day of week ───────────────────────────────────
  const energyByDay: Record<number, number[]> = {}
  for (const c of checkins) {
    const day = getDay(parseISO(c.date))
    if (!energyByDay[day]) energyByDay[day] = []
    energyByDay[day].push(c.energy_level)
  }
  const avgEnergyByDay = DAY_NAMES.map((_, i) => {
    const values = energyByDay[i] || []
    return values.length > 0
      ? values.reduce((s, v) => s + v, 0) / values.length
      : 0
  })

  // ── Last 14 days plan completion ────────────────────────────
  const last14 = plans.slice(-14)

  async function fetchInsight() {
    setLoadingInsight(true)
    try {
      const res = await fetch('/api/ai/weekly-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avg_energy: parseFloat(String(avgEnergy)),
          avg_completion: avgCompletion,
          total_workouts: totalWorkouts,
          travel_ratio: travelRatio,
        }),
      })
      const data = await res.json()
      setAiInsight(data.insight)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingInsight(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Estadísticas 📊</h1>
        <p className="text-text-secondary text-sm mt-0.5">Últimos 30 días</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        <Card variant="elevated" className="text-center p-4">
          <p className="text-3xl font-bold text-primary">{avgEnergy}</p>
          <p className="text-xs text-text-secondary mt-1">Energía promedio</p>
          <div className="mt-2 flex justify-center gap-0.5">
            {[1,2,3,4,5].map(i => (
              <div key={i} className={`w-2 h-2 rounded-full ${
                i <= parseFloat(String(avgEnergy)) ? 'bg-primary' : 'bg-surface-2'
              }`} />
            ))}
          </div>
        </Card>
        <Card variant="elevated" className="text-center p-4">
          <p className="text-3xl font-bold text-amber-400">{avgSleep}</p>
          <p className="text-xs text-text-secondary mt-1">Sueño promedio</p>
          <div className="mt-2 flex justify-center gap-0.5">
            {[1,2,3,4,5].map(i => (
              <div key={i} className={`w-2 h-2 rounded-full ${
                i <= parseFloat(String(avgSleep)) ? 'bg-amber-400' : 'bg-surface-2'
              }`} />
            ))}
          </div>
        </Card>
        <Card variant="elevated" className="text-center p-4">
          <p className="text-3xl font-bold text-green-400">{avgCompletion}%</p>
          <p className="text-xs text-text-secondary mt-1">Plan completado</p>
          <ProgressBar value={avgCompletion} color="green" size="sm" className="mt-2" />
        </Card>
        <Card variant="elevated" className="text-center p-4">
          <p className="text-3xl font-bold text-cyan-400">{Math.round(travelRatio * 100)}%</p>
          <p className="text-xs text-text-secondary mt-1">Viajes aprovechados</p>
          <ProgressBar value={travelRatio * 100} color="cyan" size="sm" className="mt-2" />
        </Card>
      </div>

      {/* Energy by day of week */}
      <Card>
        <CardHeader>
          <CardTitle>Energía por día de la semana</CardTitle>
        </CardHeader>
        <div className="flex items-end gap-2 h-16">
          {avgEnergyByDay.map((val, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-t-xl transition-all ${
                  val === Math.max(...avgEnergyByDay) ? 'bg-green-500' : 'bg-primary/50'
                }`}
                style={{ height: val > 0 ? `${(val / 5) * 100}%` : 4, minHeight: 4 }}
              />
              <span className="text-[10px] text-text-secondary">{DAY_NAMES[i]}</span>
            </div>
          ))}
        </div>
        {avgEnergyByDay.some(v => v > 0) && (
          <p className="text-xs text-text-secondary mt-2">
            💡 Tu mejor día es{' '}
            <span className="text-text-primary font-medium">
              {DAY_NAMES[avgEnergyByDay.indexOf(Math.max(...avgEnergyByDay))]}
            </span>
          </p>
        )}
      </Card>

      {/* Plan completion (last 14 days) */}
      {last14.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cumplimiento del plan</CardTitle>
            <span className="text-xs text-text-secondary">14 días</span>
          </CardHeader>
          <div className="flex items-end gap-1 h-12">
            {last14.map((p: any, i) => (
              <div key={i} className="flex-1 flex flex-col items-end">
                <div
                  className="w-full rounded-t bg-primary/60"
                  style={{
                    height: `${(p.completion_percentage / 100) * 100}%`,
                    minHeight: p.completion_percentage > 0 ? 4 : 0,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-text-secondary">
              {last14[0] && format(parseISO(last14[0].date), 'd/M')}
            </span>
            <span className="text-[9px] text-text-secondary">
              {last14[last14.length - 1] && format(parseISO(last14[last14.length - 1].date), 'd/M')}
            </span>
          </div>
        </Card>
      )}

      {/* Academic progress */}
      {subjectProgress.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Progreso académico 📚</h2>
          <div className="space-y-3">
            {subjectProgress.map((s: any) => (
              <Card key={s.id} variant="elevated">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <p className="text-sm font-medium text-text-primary flex-1 truncate">{s.name}</p>
                  <span className="text-sm font-bold text-text-primary">{s.mastery}%</span>
                </div>
                <ProgressBar value={s.mastery} color="green" size="sm" />
                <div className="flex gap-3 mt-2 text-xs">
                  <span className="text-green-400">✅ {s.green}</span>
                  <span className="text-amber-400">🟡 {s.yellow}</span>
                  <span className="text-red-400">🔴 {s.red}</span>
                  <span className="text-text-secondary ml-auto">{s.total} temas</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Workout stats */}
      <Card>
        <CardHeader>
          <CardTitle>Entrenamiento 💪</CardTitle>
          <Badge variant="success">{totalWorkouts} completados</Badge>
        </CardHeader>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {(['empuje', 'jale', 'piernas', 'cardio', 'movilidad'] as const).map(type => {
            const count = workouts.filter(w => w.type === type && w.completed).length
            const icons: Record<string, string> = {
              empuje: '🏋️', jale: '💪', piernas: '🦵', cardio: '🏃', movilidad: '🧘'
            }
            return (
              <div key={type} className="p-2 rounded-xl bg-background">
                <p className="text-lg">{icons[type]}</p>
                <p className="font-bold text-text-primary">{count}</p>
                <p className="text-text-secondary capitalize">{type}</p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* AI weekly insight */}
      <Card className="border border-primary/20">
        <CardHeader>
          <CardTitle>🤖 Insight semanal IA</CardTitle>
        </CardHeader>
        {aiInsight ? (
          <p className="text-sm text-text-primary leading-relaxed">{aiInsight}</p>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-text-secondary mb-4">
              La IA puede analizar tus patrones y darte recomendaciones personalizadas
            </p>
            <Button
              variant="primary"
              size="md"
              onClick={fetchInsight}
              loading={loadingInsight}
            >
              Generar insight ✨
            </Button>
          </div>
        )}
      </Card>

      {/* Check-in count */}
      <div className="text-center py-2">
        <p className="text-xs text-text-secondary">
          {checkins.length} check-ins registrados en los últimos 30 días
        </p>
      </div>
    </div>
  )
}
