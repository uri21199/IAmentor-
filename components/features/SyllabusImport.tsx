'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  subjectId: string
  show: boolean
  onToggle: () => void
}

export default function SyllabusImport({ subjectId, show, onToggle }: Props) {
  const router = useRouter()
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<{ units: number; topics: number } | null>(null)

  async function importSyllabus() {
    if (!syllabusFile) return
    if (syllabusFile.size > 5_000_000) {
      alert('El archivo es muy grande (máx 5MB)')
      return
    }
    setParsing(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', syllabusFile)
      fd.append('subject_id', subjectId)
      const res = await fetch('/api/ai/parse-syllabus', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      setSyllabusFile(null)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'desconocido'
      alert('Error al importar temario: ' + msg)
    } finally {
      setParsing(false)
    }
  }

  if (!show) return null

  return (
    <div className="p-3 rounded-2xl border border-dashed border-border-subtle bg-surface-2">
      <p className="text-xs text-text-secondary mb-2">Subi el programa de la materia (imagen o PDF)</p>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={e => setSyllabusFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-xs text-primary underline">Elegir archivo…</span>
        </label>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => setSyllabusFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-xs text-cyan-400 underline">Sacar foto</span>
        </label>
      </div>
      {syllabusFile && <p className="text-xs text-text-secondary mt-1">{syllabusFile.name}</p>}
      {syllabusFile && (
        <button
          onClick={importSyllabus}
          disabled={parsing}
          className="mt-2 w-full py-2 rounded-xl bg-primary text-white text-xs font-medium disabled:opacity-50"
        >
          {parsing ? 'Importando…' : 'Importar temario'}
        </button>
      )}
      {result && (
        <p className="text-xs text-green-400 mt-1.5">
          {result.units} unidades, {result.topics} temas importados
        </p>
      )}
    </div>
  )
}
