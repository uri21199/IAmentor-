'use client'

import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'

interface CorrelationPoint {
  date: string
  energy: number
  completion: number
}

interface SubjectProgressItem {
  id: string
  name: string
  color: string
  total: number
  green: number
  yellow: number
  red: number
  mastery: number
}

interface WorkoutItem {
  date: string
  type: string
  completed: boolean
  duration_minutes: number
}

interface Props {
  workouts: WorkoutItem[]
  subjectProgress: SubjectProgressItem[]
  correlationData: CorrelationPoint[]
}

export default function StatsClient({ workouts, subjectProgress, correlationData }: Props) {
  const totalWorkouts = workouts.filter(w => w.completed).length

  return (
    <div className="px-4 pt-4 pb-28 space-y-5 max-w-lg mx-auto md:max-w-3xl md:px-6 lg:max-w-4xl">

      {/* Academic progress */}
      {subjectProgress.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Progreso academico</h2>
          <div className="space-y-3 md:grid md:grid-cols-2 md:space-y-0 md:gap-3 lg:grid-cols-3">
            {subjectProgress.map((s) => (
              <Card key={s.id} variant="elevated">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <p className="text-sm font-medium text-text-primary flex-1 truncate">{s.name}</p>
                  <span className="text-sm font-bold text-text-primary">{s.mastery}%</span>
                </div>
                <ProgressBar value={s.mastery} color="green" size="sm" />
                <div className="flex gap-3 mt-2 text-xs">
                  <span className="text-green-400">&#10003; {s.green}</span>
                  <span className="text-amber-400">&#9679; {s.yellow}</span>
                  <span className="text-red-400">&#9679; {s.red}</span>
                  <span className="text-text-secondary ml-auto">{s.total} temas</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-surface-2 border border-border-subtle p-10 text-center">
          <p className="text-sm font-semibold text-text-primary mb-1">Sin materias activas</p>
          <p className="text-xs text-text-secondary">Agregá materias en el cuatrimestre activo para ver tu progreso</p>
        </div>
      )}

      {/* Energy / completion correlation */}
      {correlationData.length >= 3 ? (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Energia vs Completion del plan</CardTitle>
            <Badge variant="default">{correlationData.length} dias</Badge>
          </CardHeader>
          <p className="text-xs text-text-secondary mb-3">
            Cuando dormis bien y tenes energia, cumples mas del plan.
          </p>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={correlationData.map(d => ({
                ...d,
                label: format(parseISO(d.date), 'd MMM', { locale: es }),
                energyPct: Math.round((d.energy / 5) * 100),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                  width={32}
                />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, fontSize: 11 }}
                  labelStyle={{ color: '#9CA3AF' }}
                  formatter={(value: number, name: string) => [
                    `${value}%`,
                    name === 'energyPct' ? 'Energia' : 'Completion'
                  ]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {value === 'energyPct' ? 'Energia' : 'Completion plan'}
                    </span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="energyPct"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="completion"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : correlationData.length > 0 ? (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Energia vs Completion del plan</CardTitle>
          </CardHeader>
          <p className="text-xs text-text-secondary">
            Necesitas al menos 3 dias con check-in y plan para ver la correlacion. Llevas {correlationData.length}.
          </p>
        </Card>
      ) : null}

      {/* Workout stats */}
      <Card>
        <CardHeader>
          <CardTitle>Entrenamiento</CardTitle>
          <Badge variant="success">{totalWorkouts} completados</Badge>
        </CardHeader>
        {totalWorkouts > 0 ? (
          <div className="grid grid-cols-3 gap-2 text-center text-xs md:grid-cols-5">
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
        ) : (
          <p className="text-xs text-text-secondary text-center py-2">
            Todavia no hay entrenamientos registrados este mes
          </p>
        )}
      </Card>
    </div>
  )
}
