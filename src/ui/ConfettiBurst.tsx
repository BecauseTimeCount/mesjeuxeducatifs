import { useEffect, useRef, useState } from 'react'

export interface ConfettiBurstProps {
  /** Incrémenter cette valeur déclenche une salve de confettis. */
  burst: number
}

const COLORS = [
  'var(--color-coral)',
  'var(--color-sun)',
  'var(--color-leaf)',
  'var(--color-grape)',
  'var(--color-sky)',
  'var(--color-lagoon-300)',
] as const

const PIECES_PER_BURST = 36
const CLEANUP_MS = 3800

interface Confetto {
  id: string
  left: number
  color: string
  size: number
  delay: number
  duration: number
  round: boolean
}

function makePieces(burst: number): Confetto[] {
  return Array.from({ length: PIECES_PER_BURST }, (_, i) => ({
    id: `${burst}-${i}`,
    left: Math.random() * 100,
    color: COLORS[i % COLORS.length],
    size: 8 + Math.random() * 8,
    delay: Math.random() * 0.5,
    duration: 1.9 + Math.random() * 1.3,
    round: Math.random() < 0.4,
  }))
}

/**
 * Salve de confettis DOM (animation `confetti-fall` de index.css,
 * transform/opacity uniquement). État interne : zéro re-render du parent.
 */
export function ConfettiBurst({ burst }: ConfettiBurstProps) {
  const [pieces, setPieces] = useState<readonly Confetto[]>([])
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (burst <= 0) return
    const prefix = `${burst}-`
    // Filtre d'abord le même préfixe (StrictMode rejoue l'effet en dev).
    setPieces((prev) => [...prev.filter((c) => !c.id.startsWith(prefix)), ...makePieces(burst)])
    timers.current.push(
      window.setTimeout(() => {
        setPieces((prev) => prev.filter((c) => !c.id.startsWith(prefix)))
      }, CLEANUP_MS),
    )
  }, [burst])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  if (pieces.length === 0) return null

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((c) => (
        <div
          key={c.id}
          className="absolute top-0"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.round ? c.size : c.size * 0.55,
            background: c.color,
            borderRadius: c.round ? '50%' : 2,
            animation: `confetti-fall ${c.duration}s ease-in ${c.delay}s both`,
          }}
        />
      ))}
    </div>
  )
}
