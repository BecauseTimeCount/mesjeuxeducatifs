import type { CSSProperties, ReactNode } from 'react'
import { sfx } from '@/engine/audio'

export interface BigButtonProps {
  onClick: () => void
  variant?: 'primary' | 'soft' | 'accent'
  /** Couleur d'accent CSS (hex) — utilisée par variant="accent" */
  accent?: string
  disabled?: boolean
  className?: string
  children: ReactNode
}

const VARIANT_CLASSES: Record<NonNullable<BigButtonProps['variant']>, string> = {
  primary: 'bg-lagoon-500 text-white',
  soft: 'bg-white text-ink',
  accent: 'text-white',
}

/** Gros bouton enfant : rebond au tap, sfx('tap') intégré, ombre douce. */
export function BigButton({
  onClick,
  variant = 'primary',
  accent,
  disabled = false,
  className = '',
  children,
}: BigButtonProps) {
  const style: CSSProperties | undefined =
    variant === 'accent' ? { background: accent ?? 'var(--color-lagoon-500)' } : undefined

  return (
    <button
      type="button"
      disabled={disabled}
      style={style}
      onClick={() => {
        sfx('tap')
        onClick()
      }}
      className={`tap-target inline-flex items-center justify-center gap-2 rounded-full px-7 py-3 text-xl font-extrabold shadow-card transition-transform duration-100 active:scale-95 disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
