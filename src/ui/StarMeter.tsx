export interface StarMeterProps {
  value: number
  max?: number
}

/** Rangée d'étoiles pleines ⭐ / creuses ☆ — lisible d'un coup d'œil. */
export function StarMeter({ value, max = 3 }: StarMeterProps) {
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`${value} étoile${value > 1 ? 's' : ''} sur ${max}`}
    >
      {Array.from({ length: max }, (_, i) =>
        i < value ? (
          // La clé change quand l'étoile se remplit → l'animation pop rejoue.
          <span key={`on-${i}`} aria-hidden="true" className="animate-pop text-3xl leading-none">
            ⭐
          </span>
        ) : (
          <span key={`off-${i}`} aria-hidden="true" className="text-3xl leading-none text-ink-soft/30">
            ☆
          </span>
        ),
      )}
    </div>
  )
}
