'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AcademicEvent } from '@/types'

interface Props {
  subjectId: string
  show: boolean
  onToggle: () => void
  onImported: (events: AcademicEvent[]) => void
}

export default function EventsImport({ subjectId, show, onToggle, onImported }: Props) {
  const router = useRouter()
  const [eventsFile, setEventsFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importCount, setImportCount] = useState<number | null>(null)

  async function importEvents() {
    if (!eventsFile) return
    if (eventsFile.size > 5_000_000) {
      alert('El archivo es muy grande (máx 5MB)')
      return
    }
    setParsing(true)
    setImportCount(null)
    try {
      const fd = new FormData()
      fd.append('file', eventsFile)
      fd.append('subject_id', subjectId)
      const res = await fetch('/api/ai/parse-events', { method: 'POST', body: fd })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      if (result.events?.length > 0) {
        onImported(result.events as AcademicEvent[])
      }
      setImportCount(result.count ?? 0)
      setEventsFile(null)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'desconocido'
      alert('Error al importar fechas: ' + msg)
    } finally {
      setParsing(false)
    }
  }

  if (!show) return null

  return (
    <div className="mb-3 p-3 rounded-2xl border border-dashed border-border-subtle bg-surface-2">
      <p className="text-xs text-text-secondary mb-2">Subi una foto del cronograma, PDF o captura de pantalla</p>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={e => { setEventsFile(e.target.files?.[0] ?? null); setImportCount(null) }}
          />
          <span className="text-xs text-primary underline">Elegir archivo…</span>
        </label>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { setEventsFile(e.target.files?.[0] ?? null); setImportCount(null) }}
          />
          <span className="text-xs text-cyan-400 underline">Sacar foto</span>
        </label>
      </div>
      {eventsFile && <p className="text-xs text-text-secondary mt-1">{eventsFile.name}</p>}
      {eventsFile && (
        <button
          onClick={importEvents}
          disabled={parsing}
          className="mt-2 w-full py-2 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50"
        >
          {parsing ? 'Importando…' : 'Importar fechas'}
        </button>
      )}
      {importCount !== null && (
        <p className="text-xs mt-1.5 text-text-secondary">
          {importCount > 0
            ? `${importCount} fecha${importCount !== 1 ? 's' : ''} importada${importCount !== 1 ? 's' : ''}`
            : 'No se encontraron fechas reconocibles en el archivo'}
        </p>
      )}
    </div>
  )
}
