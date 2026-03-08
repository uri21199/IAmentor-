'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[AppError]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <div className="text-4xl mb-4">⚠️</div>
      <h2 className="text-lg font-semibold text-white mb-2">Algo salió mal</h2>
      <p className="text-sm text-gray-400 mb-6 max-w-xs">
        {error.message || 'Ocurrió un error inesperado. Intentá de nuevo.'}
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
