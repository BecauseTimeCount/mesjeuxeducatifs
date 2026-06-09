import type { Cell, Dir } from './logic'
import { cellKey, sameCell } from './logic'

// ============================================================
// L'île quadrillée : cases sable dans un cadre lagon, obstacles
// (rochers/palmiers), coffre au trésor, et robot animé par-dessus
// (transform CSS uniquement — aucun re-render pendant la glissade).
// ============================================================

export const DIR_EMOJI: Record<Dir, string> = {
  up: '⬆️',
  down: '⬇️',
  left: '⬅️',
  right: '➡️',
}

/** Emoji d'obstacle stable par case (mélange de rochers et de palmiers). */
export function obstacleEmoji(c: Cell): string {
  return (c.x * 7 + c.y * 13) % 3 === 0 ? '🌴' : '🪨'
}

export interface IslandGridProps {
  size: number
  obstacles: readonly Cell[]
  treasure: Cell | null
  /** Coffre ouvert (📦 → 💰) quand le robot l'atteint. */
  treasureOpen?: boolean
  robot: Cell | null
  /** Direction affichée au-dessus du robot pendant l'exécution. */
  robotDir?: Dir | null
  /** Incrémenter pour faire rebondir le robot (collision). */
  shake?: number
  /** Étoiles d'étourdissement 💫 après une collision. */
  stunned?: boolean
  /** Case fautive qui clignote après une collision. */
  failCell?: Cell | null
  /** Cases du chemin optimal illuminées ✨ (indice automatique). */
  hintCells?: readonly Cell[] | null
  /** Mode atelier : la grille devient tappable. */
  onCellTap?: (c: Cell) => void
}

export function IslandGrid({
  size,
  obstacles,
  treasure,
  treasureOpen = false,
  robot,
  robotDir = null,
  shake = 0,
  stunned = false,
  failCell = null,
  hintCells = null,
  onCellTap,
}: IslandGridProps) {
  const obstacleByKey = new Map(obstacles.map((o): [string, Cell] => [cellKey(o), o]))
  const hintSet = new Set((hintCells ?? []).map(cellKey))

  const cells: Cell[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) cells.push({ x, y })
  }

  return (
    <div
      className="card mx-auto w-full max-w-[440px] p-2 sm:max-w-[500px]"
      style={{ background: 'var(--color-lagoon-100)' }}
    >
      <div className="relative">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {cells.map((c) => {
            const k = cellKey(c)
            const obstacle = obstacleByKey.get(k)
            const isTreasure = treasure !== null && sameCell(c, treasure)
            const isFail = failCell !== null && sameCell(c, failCell)
            const isHint = hintSet.has(k)
            const content = obstacle !== undefined
              ? obstacleEmoji(obstacle)
              : isTreasure
                ? (treasureOpen ? '💰' : '📦')
                : ''
            const inner = (
              <span
                className={`relative flex aspect-square items-center justify-center rounded-lg text-2xl sm:text-3xl ${
                  isFail ? 'ring-4 ring-coral animate-pulse' : ''
                }`}
                style={{ background: (c.x + c.y) % 2 === 0 ? 'var(--color-sand)' : '#fcf1de' }}
              >
                {content !== '' && (
                  <span
                    key={isTreasure && treasureOpen ? 'open' : 'closed'}
                    className={isTreasure && treasureOpen ? 'animate-pop' : undefined}
                    aria-hidden="true"
                  >
                    {content}
                  </span>
                )}
                {isHint && (
                  <span
                    aria-hidden="true"
                    className="animate-pulse absolute top-0 left-0.5 text-base sm:text-lg"
                  >
                    ✨
                  </span>
                )}
              </span>
            )
            return onCellTap ? (
              <button
                key={k}
                type="button"
                onClick={() => onCellTap(c)}
                aria-label={`Case ligne ${c.y + 1}, colonne ${c.x + 1}`}
                className="block w-full p-0.5 transition-transform active:scale-90"
              >
                {inner}
              </button>
            ) : (
              <div key={k} className="p-0.5">
                {inner}
              </div>
            )
          })}
        </div>

        {robot !== null && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div
              className="flex items-center justify-center"
              style={{
                width: `${100 / size}%`,
                height: `${100 / size}%`,
                transform: `translate(${robot.x * 100}%, ${robot.y * 100}%)`,
                transition: 'transform 0.3s ease-in-out',
              }}
            >
              <span
                key={`shake-${shake}`}
                className={`relative text-3xl sm:text-4xl ${shake > 0 ? 'animate-shake-soft' : ''}`}
              >
                🤖
                {robotDir !== null && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-base">
                    {DIR_EMOJI[robotDir]}
                  </span>
                )}
                {stunned && (
                  <span className="animate-wiggle absolute -top-3 -right-4 text-xl">💫</span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
