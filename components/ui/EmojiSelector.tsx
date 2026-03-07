'use client'

interface EmojiSelectorProps {
  options: Array<{ value: number; emoji: string; label: string }>
  value: number
  onChange: (value: number) => void
  label: string
}

export function EmojiSelector({ options, value, onChange, label }: EmojiSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <div className="flex gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`
              flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl border transition-all duration-200
              min-h-[64px] active:scale-95
              ${value === opt.value
                ? 'border-primary bg-primary/20 shadow-md shadow-primary/20'
                : 'border-border-subtle bg-surface-2 hover:border-primary/40'
              }
            `}
            aria-label={opt.label}
          >
            <span className="text-2xl">{opt.emoji}</span>
            <span className="text-[10px] text-text-secondary">{opt.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Preset option sets
export const SLEEP_OPTIONS = [
  { value: 1, emoji: '😴', label: 'Muy mal' },
  { value: 2, emoji: '😕', label: 'Mal' },
  { value: 3, emoji: '😐', label: 'Regular' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '😁', label: 'Excelente' },
]

export const ENERGY_OPTIONS = [
  { value: 1, emoji: '🪫', label: 'Sin energía' },
  { value: 2, emoji: '😮‍💨', label: 'Baja' },
  { value: 3, emoji: '⚡', label: 'Normal' },
  { value: 4, emoji: '🔥', label: 'Alta' },
  { value: 5, emoji: '🚀', label: 'Máxima' },
]

export const UNDERSTANDING_OPTIONS = [
  { value: 1, emoji: '❓', label: 'Perdido' },
  { value: 2, emoji: '😕', label: 'Poco' },
  { value: 3, emoji: '😐', label: 'Regular' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '✅', label: 'Dominado' },
]
