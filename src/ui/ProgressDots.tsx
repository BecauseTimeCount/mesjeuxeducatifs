export interface ProgressDotsProps {
  total: number
  done: number
}

/** Progression d'une partie : un point rempli par item réussi. */
export function ProgressDots({ total, done }: ProgressDotsProps) {
  return (
    <div
      className="flex items-center gap-1.5 sm:gap-2"
      role="img"
      aria-label={`${done} sur ${total}`}
    >
      {Array.from({ length: total }, (_, i) =>
        i < done ? (
          // La clé change quand le point se remplit → petite animation pop.
          <span key={`d-${i}`} className="animate-pop h-4 w-4 rounded-full bg-lagoon-500 sm:h-5 sm:w-5" />
        ) : (
          <span key={`t-${i}`} className="h-4 w-4 rounded-full border-2 border-ink-soft/30 bg-white sm:h-5 sm:w-5" />
        ),
      )}
    </div>
  )
}
