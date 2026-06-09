import { useEffect, useRef, useState } from 'react'
import { say, sfx, stopSpeech } from '@/engine/audio'
import { BigButton, Mascot, SpeakerButton } from '@/ui'
import { IslandGrid } from './Grid'
import { E } from './entries'
import type { Cell, Puzzle } from './logic'
import { makeCustomPuzzle, sameCell } from './logic'

// ============================================================
// Mode bonus « Construis ton labyrinthe » : l'enfant place robot,
// trésor et rochers ; le BFS valide la solvabilité en direct ;
// puis il fait jouer un parent. Sans étoiles ni mastery.
// ============================================================

export interface Draft {
  robot: Cell | null
  treasure: Cell | null
  rocks: Cell[]
}

export const EMPTY_DRAFT: Draft = { robot: null, treasure: null, rocks: [] }

const BUILDER_SIZE = 6

type Tool = 'robot' | 'treasure' | 'rock' | 'erase'

const TOOLS: ReadonlyArray<{ id: Tool; emoji: string; label: string }> = [
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'treasure', emoji: '📦', label: 'Trésor' },
  { id: 'rock', emoji: '🪨', label: 'Rocher' },
  { id: 'erase', emoji: '🧽', label: 'Gomme' },
]

export interface BuilderProps {
  accent: string
  draft: Draft
  onChange: (d: Draft) => void
  onPlay: (puzzle: Puzzle) => void
}

export function Builder({ accent, draft, onChange, onPlay }: BuilderProps) {
  const [tool, setTool] = useState<Tool>('robot')

  const puzzle =
    draft.robot !== null && draft.treasure !== null
      ? makeCustomPuzzle(draft.robot, draft.treasure, draft.rocks, BUILDER_SIZE)
      : null
  const ready = puzzle !== null

  // Petite fanfare quand le labyrinthe devient jouable.
  const wasReady = useRef(false)
  useEffect(() => {
    if (ready && !wasReady.current) {
      sfx('magic')
      void say(E('rp.atelier-pret'))
    }
    wasReady.current = ready
  }, [ready])

  useEffect(() => () => stopSpeech(), [])

  function tapCell(c: Cell): void {
    sfx('pop')
    const isRobot = draft.robot !== null && sameCell(draft.robot, c)
    const isTreasure = draft.treasure !== null && sameCell(draft.treasure, c)
    const hasRock = draft.rocks.some((r) => sameCell(r, c))
    // Base : la case tapée est vidée de ce qu'elle contient.
    const cleared: Draft = {
      robot: isRobot ? null : draft.robot,
      treasure: isTreasure ? null : draft.treasure,
      rocks: hasRock ? draft.rocks.filter((r) => !sameCell(r, c)) : draft.rocks,
    }
    switch (tool) {
      case 'robot':
        onChange({ ...cleared, robot: c })
        break
      case 'treasure':
        onChange({ ...cleared, treasure: c })
        break
      case 'rock':
        // Re-taper un rocher avec l'outil rocher = le retirer (toggle).
        onChange(hasRock ? cleared : { ...cleared, rocks: [...cleared.rocks, c] })
        break
      case 'erase':
        onChange(cleared)
        break
    }
  }

  const message =
    draft.robot === null
      ? 'Pose le robot 🤖 sur l’île !'
      : draft.treasure === null
        ? 'Pose le trésor 📦 !'
        : ready
          ? 'Ton labyrinthe est prêt !'
          : 'Oh non, le robot ne peut pas atteindre le trésor !'

  return (
    <div className="flex flex-1 flex-col items-center gap-3 px-3 pb-4">
      <div className="flex w-full max-w-[440px] items-center gap-2">
        <Mascot mood={ready ? 'happy' : 'thinking'} size={56} />
        <p className="flex-1 text-center text-base font-extrabold text-ink">{message}</p>
        <SpeakerButton entry={E('rp.atelier')} autoPlay />
      </div>

      <IslandGrid
        size={BUILDER_SIZE}
        obstacles={draft.rocks}
        treasure={draft.treasure}
        robot={draft.robot}
        onCellTap={tapCell}
      />

      <div className="flex items-center justify-center gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              sfx('tap')
              setTool(t.id)
            }}
            aria-label={t.label}
            className={`tap-target flex flex-col items-center justify-center rounded-card shadow-card transition-transform active:scale-90 ${
              tool === t.id ? 'text-white' : 'bg-white text-ink'
            }`}
            style={tool === t.id ? { background: accent } : undefined}
          >
            <span className="text-2xl" aria-hidden="true">
              {t.emoji}
            </span>
            <span className="text-xs font-bold">{t.label}</span>
          </button>
        ))}
      </div>

      <BigButton
        variant="accent"
        accent={accent}
        disabled={!ready}
        onClick={() => {
          if (puzzle !== null) onPlay(puzzle)
        }}
        className="px-10 text-xl"
      >
        ▶️ Faire jouer !
      </BigButton>
    </div>
  )
}
