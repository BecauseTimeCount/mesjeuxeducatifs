import { sfx } from '@/engine/audio'

export interface NumPadProps {
  value: string
  onChange: (v: string) => void
  onValidate: () => void
  maxLen?: number
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const KEY_CLASS =
  'tap-target rounded-bubble bg-white text-3xl font-extrabold text-ink shadow-card ring-1 ring-ink/5 transition-transform active:scale-95'

/**
 * Pavé numérique enfant : grille 3×4 (1-9, ⌫, 0, ✓) avec affichage
 * géant en lecture seule au-dessus — jamais de clavier système.
 */
export function NumPad({ value, onChange, onValidate, maxLen = 3 }: NumPadProps) {
  const pressDigit = (d: string): void => {
    sfx('tap')
    if (value.length < maxLen) onChange(value + d)
  }

  const erase = (): void => {
    sfx('tap')
    onChange(value.slice(0, -1))
  }

  const validate = (): void => {
    if (value.length === 0) return
    sfx('tap')
    onValidate()
  }

  return (
    <div className="mx-auto w-full max-w-xs">
      <div
        aria-live="polite"
        className="mb-3 flex h-20 items-center justify-center rounded-bubble bg-sand/50 text-5xl font-extrabold tracking-widest text-ink"
      >
        {value.length > 0 ? value : (
          <span aria-hidden="true" className="text-ink-soft/40">···</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {DIGITS.map((d) => (
          <button key={d} type="button" onClick={() => pressDigit(d)} className={KEY_CLASS}>
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={erase}
          aria-label="Effacer"
          className="tap-target rounded-bubble bg-sand text-3xl font-extrabold text-ink shadow-card transition-transform active:scale-95"
        >
          ⌫
        </button>
        <button type="button" onClick={() => pressDigit('0')} className={KEY_CLASS}>
          0
        </button>
        <button
          type="button"
          onClick={validate}
          disabled={value.length === 0}
          aria-label="Valider"
          className="tap-target rounded-bubble bg-leaf text-3xl font-extrabold text-white shadow-card transition-transform active:scale-95 disabled:opacity-40"
        >
          ✓
        </button>
      </div>
    </div>
  )
}
