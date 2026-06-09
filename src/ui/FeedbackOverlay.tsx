import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { say, sfx } from '@/engine/audio'
import { pick } from '@/engine/rng'
import { uiEntry } from '@/ui/corpus'

export interface FeedbackOverlayProps {
  kind: 'success' | 'retry' | null
  message?: string
  onDone: () => void
}

const SUCCESS_MESSAGES = [
  'Bravo !',
  'Super !',
  'Génial !',
  'Bien joué !',
  'Quel talent !',
  'Magnifique !',
] as const

const SUCCESS_CLIPS = ['ui.bravo', 'ui.super'] as const

const SPARKLES: ReadonlyArray<{ style: CSSProperties; delay: number }> = [
  { style: { top: -12, left: -10 }, delay: 0 },
  { style: { top: -16, right: -8 }, delay: 0.1 },
  { style: { bottom: -12, left: '50%' }, delay: 0.2 },
]

const SUCCESS_MS = 1400
const RETRY_MS = 1600

/**
 * Overlay de feedback centré, non bloquant (pointer-events-none).
 * success : 🎉 + message positif + sfx + clip ui.* — retry : 💪 « Presque ! ».
 * Jamais le mot « faux ».
 */
export function FeedbackOverlay({ kind, message, onDone }: FeedbackOverlayProps) {
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  })

  const label = useMemo(
    () => (kind === 'success' ? (message ?? pick(SUCCESS_MESSAGES)) : ''),
    [kind, message],
  )

  useEffect(() => {
    if (kind === null) return
    if (kind === 'success') {
      sfx('correct')
      void say(uiEntry(pick(SUCCESS_CLIPS)))
      const t = window.setTimeout(() => onDoneRef.current(), SUCCESS_MS)
      return () => window.clearTimeout(t)
    }
    sfx('wrong')
    const t = window.setTimeout(() => onDoneRef.current(), RETRY_MS)
    return () => window.clearTimeout(t)
  }, [kind, message])

  if (kind === null) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6"
      role="status"
      aria-live="polite"
    >
      {kind === 'success' ? (
        <div className="animate-pop relative rounded-card bg-white px-10 py-7 text-center shadow-card">
          {SPARKLES.map((s, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="animate-pop absolute text-2xl"
              style={{ ...s.style, animationDelay: `${s.delay}s` }}
            >
              ✨
            </span>
          ))}
          <div aria-hidden="true" className="text-6xl">🎉</div>
          <div className="mt-2 text-3xl font-extrabold text-leaf-deep">{label}</div>
        </div>
      ) : (
        <div className="animate-shake-soft rounded-card bg-white px-10 py-7 text-center shadow-card">
          <div aria-hidden="true" className="text-6xl">💪</div>
          <div className="mt-2 text-3xl font-extrabold text-ink">Presque !</div>
          {message && (
            <div className="mt-1 text-lg font-semibold text-ink-soft">{message}</div>
          )}
        </div>
      )}
    </div>
  )
}
