import type { CSSProperties } from 'react'

export type MascotMood = 'idle' | 'happy' | 'cheer' | 'thinking'

export interface MascotProps {
  mood?: MascotMood
  /** Diamètre de la bulle en pixels (défaut : 96) */
  size?: number
}

const MOOD_ANIMATION: Record<MascotMood, string> = {
  idle: 'animate-floaty',
  happy: 'animate-wiggle',
  cheer: 'animate-bounce-in',
  thinking: '',
}

const CHEER_STARS: ReadonlyArray<{ style: CSSProperties; delay: number }> = [
  { style: { top: '-12%', left: '-8%' }, delay: 0 },
  { style: { top: '-18%', right: '-4%' }, delay: 0.12 },
  { style: { bottom: '-8%', left: '-16%' }, delay: 0.24 },
  { style: { bottom: '-14%', right: '-10%' }, delay: 0.36 },
]

/** Plume le perroquet 🦜 — la mascotte de l'archipel, composée en CSS pur. */
export function Mascot({ mood = 'idle', size = 96 }: MascotProps) {
  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Plume le perroquet"
    >
      <div
        className={`flex h-full w-full items-center justify-center rounded-full shadow-card ${MOOD_ANIMATION[mood]}`}
        style={{
          background:
            'linear-gradient(150deg, var(--color-lagoon-100) 0%, var(--color-lagoon-50) 60%, white 100%)',
          transform: mood === 'thinking' ? 'rotate(-8deg)' : undefined,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: size * 0.54, lineHeight: 1 }}>
          🦜
        </span>
      </div>

      {mood === 'cheer' &&
        CHEER_STARS.map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="animate-pop absolute"
            style={{ ...s.style, fontSize: size * 0.22, animationDelay: `${s.delay}s` }}
          >
            ✨
          </span>
        ))}

      {mood === 'thinking' && (
        <span
          aria-hidden="true"
          className="animate-floaty absolute"
          style={{ top: '-16%', right: '-12%', fontSize: size * 0.34 }}
        >
          💭
        </span>
      )}
    </div>
  )
}
