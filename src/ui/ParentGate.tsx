import { useState } from 'react'
import { pick } from '@/engine/rng'
import { NumPad } from '@/ui/NumPad'

export interface ParentGateProps {
  onPass: () => void
  onCancel: () => void
}

const MAX_TRIES = 3

// Paires (a, b) dont le produit est entre 12 et 45 — hors de portée d'un enfant de CP.
const PAIRS: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<readonly [number, number]> = []
  for (let a = 3; a <= 9; a++) {
    for (let b = 3; b <= 9; b++) {
      const p = a * b
      if (p >= 12 && p <= 45) out.push([a, b])
    }
  }
  return out
})()

/** Porte parentale sobre : une multiplication au NumPad, 3 essais. */
export function ParentGate({ onPass, onCancel }: ParentGateProps) {
  const [pair] = useState(() => pick(PAIRS))
  const [value, setValue] = useState('')
  const [tries, setTries] = useState(0)
  const [shake, setShake] = useState(false)

  const [a, b] = pair
  const expected = a * b

  const validate = (): void => {
    if (Number(value) === expected) {
      onPass()
      return
    }
    const next = tries + 1
    if (next >= MAX_TRIES) {
      onCancel()
      return
    }
    setTries(next)
    setValue('')
    setShake(true)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper p-4">
      <div
        className={`card w-full max-w-sm p-6 ${shake ? 'animate-shake-soft' : ''}`}
        onAnimationEnd={() => setShake(false)}
      >
        <h2 className="text-center text-xl font-extrabold text-ink">🔒 Espace parents</h2>
        <p className="mt-1 text-center text-ink-soft">Cette zone est réservée aux grands.</p>

        <p className="mt-5 text-center text-2xl font-extrabold text-ink">
          Combien font {a} × {b} ?
        </p>

        {tries > 0 && (
          <p className="mt-2 text-center font-semibold text-coral-deep" role="alert">
            Ce n’est pas ça. Encore {MAX_TRIES - tries} essai{MAX_TRIES - tries > 1 ? 's' : ''}.
          </p>
        )}

        <div className="mt-4">
          <NumPad
            value={value}
            onChange={(v) => setValue(v)}
            onValidate={validate}
            maxLen={2}
          />
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="tap-target mt-2 w-full text-center font-semibold text-ink-soft underline underline-offset-4"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
