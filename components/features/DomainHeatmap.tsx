'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface HeatmapSubject {
  id: string
  name: string
  color: string
}

interface HeatmapData {
  subjects: HeatmapSubject[]
  weeks: string[]     // ISO week keys "YYYY-WNN"
  labels: string[]    // human-readable labels "Mar 9"
  grid: Record<string, Record<string, number | null>>
  inactive_subjects: string[]
}

/**
 * Returns a Tailwind bg class based on a 0-1 health score.
 * null = no data (grey)
 */
function scoreToColor(score: number | null): string {
  if (score === null) return 'bg-surface-2 border border-border-subtle'
  if (score >= 0.7) return 'bg-green-500/70'
  if (score >= 0.4) return 'bg-amber-400/70'
  if (score > 0)   return 'bg-red-500/60'
  return 'bg-surface-2 border border-border-subtle'
}

function scoreToLabel(score: number | null): string {
  if (score === null) return 'Sin datos'
  if (score >= 0.7) return `Dominado ${Math.round(score * 100)}%`
  if (score >= 0.4) return `En progreso ${Math.round(score * 100)}%`
  if (score > 0)   return `Débil ${Math.round(score * 100)}%`
  return 'Sin actividad'
}

interface TooltipState {
  subject: string
  week: string
  score: number | null
  x: number
  y: number
}

/**
 * DomainHeatmap
 *
 * Displays a CSS-grid heatmap of academic mastery over time.
 * Rows = subjects, Columns = weeks.
 * Color intensity: green (mastered) → amber (progressing) → red (weak) → grey (no data)
 *
 * Fetches its own data from /api/progress/snapshot on mount.
 */
export default function DomainHeatmap() {
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [snapshotting, setSnapshotting] = useState(false)

  useEffect(() => {
    loadHeatmap()
  }, [])

  async function loadHeatmap() {
    setLoading(true)
    setError(null)
    try {
      // Trigger today's snapshot upsert first (idempotent)
      await fetch('/api/progress/snapshot', { method: 'POST' })
      // Then fetch aggregated grid data
      const res = await fetch('/api/progress/snapshot?days=56')
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError('No se pudo cargar el mapa de dominio.')
      console.error('[DomainHeatmap]', err)
    } finally {
      setLoading(false)
    }
  }

  async function refreshSnapshot() {
    setSnapshotting(true)
    try {
      await fetch('/api/progress/snapshot', { method: 'POST' })
      await loadHeatmap()
    } finally {
      setSnapshotting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🗺️ Mapa de dominio</CardTitle>
        </CardHeader>
        <div className="h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🗺️ Mapa de dominio</CardTitle>
        </CardHeader>
        <p className="text-sm text-text-secondary text-center py-4">{error ?? 'Sin datos disponibles.'}</p>
      </Card>
    )
  }

  if (data.subjects.length === 0 || data.weeks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🗺️ Mapa de dominio</CardTitle>
        </CardHeader>
        <p className="text-sm text-text-secondary text-center py-6">
          Aún no hay suficientes datos para mostrar el mapa.
          Completá algunas materias y volvé mañana.
        </p>
      </Card>
    )
  }

  // Only show last 8 weeks max to keep it readable on mobile
  const displayWeeks = data.weeks.slice(-8)
  const displayLabels = data.labels.slice(-8)

  return (
    <Card>
      <CardHeader>
        <CardTitle>🗺️ Mapa de dominio</CardTitle>
        <button
          onClick={refreshSnapshot}
          disabled={snapshotting}
          className="text-xs text-primary disabled:opacity-50"
        >
          {snapshotting ? '↻ actualizando…' : '↻ actualizar'}
        </button>
      </CardHeader>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {[
          { color: 'bg-green-500/70', label: 'Dominado' },
          { color: 'bg-amber-400/70', label: 'Progreso' },
          { color: 'bg-red-500/60',   label: 'Débil' },
          { color: 'bg-surface-2 border border-border-subtle', label: 'Sin datos' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${item.color}`} />
            <span className="text-[10px] text-text-secondary">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(300, displayWeeks.length * 36 + 120) }}>
          {/* Column headers (week labels) */}
          <div
            className="grid gap-1 mb-1"
            style={{ gridTemplateColumns: `120px repeat(${displayWeeks.length}, 1fr)` }}
          >
            <div /> {/* spacer for row label column */}
            {displayLabels.map((label, i) => (
              <div key={i} className="text-[9px] text-text-secondary text-center leading-tight">
                {label}
              </div>
            ))}
          </div>

          {/* Rows (subjects) */}
          <div className="space-y-1">
            {data.subjects.map(subject => {
              const isInactive = data.inactive_subjects.includes(subject.id)
              return (
                <div
                  key={subject.id}
                  className="grid gap-1 items-center"
                  style={{ gridTemplateColumns: `120px repeat(${displayWeeks.length}, 1fr)` }}
                >
                  {/* Subject name + inactive flag */}
                  <div className="flex items-center gap-1.5 pr-2 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: subject.color }}
                    />
                    <span
                      className={`text-[10px] leading-tight truncate ${
                        isInactive ? 'text-red-400' : 'text-text-secondary'
                      }`}
                      title={subject.name}
                    >
                      {subject.name}
                    </span>
                    {isInactive && (
                      <span className="text-red-400 text-[9px] shrink-0" title="Sin actividad en 7+ días">
                        ⚠
                      </span>
                    )}
                  </div>

                  {/* Heat cells */}
                  {displayWeeks.map((week, wi) => {
                    const score = data.grid[subject.id]?.[week] ?? null
                    return (
                      <div
                        key={week}
                        className={`
                          aspect-square rounded-sm cursor-pointer transition-opacity hover:opacity-80
                          ${scoreToColor(score)}
                        `}
                        title={`${subject.name} — ${displayLabels[wi]}: ${scoreToLabel(score)}`}
                        onMouseEnter={e => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect()
                          setTooltip({
                            subject: subject.name,
                            week: displayLabels[wi],
                            score,
                            x: rect.left,
                            y: rect.top,
                          })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tooltip (desktop) */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 rounded-xl bg-surface border border-border-subtle shadow-xl text-xs text-text-primary pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y - 52 }}
        >
          <p className="font-medium">{tooltip.subject}</p>
          <p className="text-text-secondary">
            {tooltip.week} — {scoreToLabel(tooltip.score)}
          </p>
        </div>
      )}

      {/* Inactive subjects alert */}
      {data.inactive_subjects.length > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400 font-medium mb-0.5">Materias sin actividad reciente ⚠</p>
          <p className="text-xs text-text-secondary">
            {data.subjects
              .filter(s => data.inactive_subjects.includes(s.id))
              .map(s => s.name)
              .join(', ')}
            {' '}llevan más de 7 días sin progreso registrado.
          </p>
        </div>
      )}
    </Card>
  )
}
