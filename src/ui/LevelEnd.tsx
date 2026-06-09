import { useEffect, useState } from 'react'
import { say, sfx } from '@/engine/audio'
import type { LevelResult } from '@/engine/types'
import { BigButton } from '@/ui/BigButton'
import { ConfettiBurst } from '@/ui/ConfettiBurst'
import { Mascot } from '@/ui/Mascot'
import { uiEntry } from '@/ui/corpus'

export interface LevelEndProps {
  result: LevelResult
  onReplay: () => void
  onHome: () => void
}

const MESSAGES: Record<LevelResult['stars'], string> = {
  3: 'Incroyable !',
  2: 'Bravo !',
  1: 'Bien joué, continue !',
}

const STAR_DELAY_MS = 400

/**
 * Écran de fin de partie : Plume en fête, étoiles révélées une à une
 * (sfx('coin')), fanfare + confettis si 3 étoiles, rejouer / retour hub.
 */
export function LevelEnd({ result, onReplay, onHome }: LevelEndProps) {
  const [shown, setShown] = useState(0)
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    setShown(0)
    void say(uiEntry('ui.niveau-termine'))
    const timers: number[] = []
    for (let i = 1; i <= result.stars; i++) {
      timers.push(
        window.setTimeout(() => {
          setShown(i)
          sfx('coin')
        }, STAR_DELAY_MS * i),
      )
    }
    if (result.stars === 3) {
      timers.push(
        window.setTimeout(() => {
          sfx('fanfare')
          setBurst((b) => b + 1)
        }, STAR_DELAY_MS * 3 + 350),
      )
    }
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [result])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <Mascot mood="cheer" size={130} />

      <div
        className="flex items-center gap-2"
        role="img"
        aria-label={`${result.stars} étoile${result.stars > 1 ? 's' : ''} sur 3`}
      >
        {[1, 2, 3].map((i) =>
          i <= shown ? (
            <span key={`on-${i}`} aria-hidden="true" className="animate-pop text-6xl leading-none">
              ⭐
            </span>
          ) : (
            <span
              key={`off-${i}`}
              aria-hidden="true"
              className="text-6xl leading-none text-ink-soft/25"
            >
              ☆
            </span>
          ),
        )}
      </div>

      <div>
        <h2 className="text-4xl font-extrabold text-ink">{MESSAGES[result.stars]}</h2>
        <p className="mt-2 text-lg font-semibold text-ink-soft">
          {result.firstTryCorrect} réussite{result.firstTryCorrect > 1 ? 's' : ''} du premier
          coup sur {result.total}
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <BigButton variant="primary" onClick={onReplay}>
          Encore une partie !
        </BigButton>
        <BigButton variant="soft" onClick={onHome}>
          Retour aux jeux
        </BigButton>
      </div>

      <ConfettiBurst burst={burst} />
    </div>
  )
}
