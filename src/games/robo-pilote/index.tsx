import { useEffect, useState } from 'react'
import { say, sfx } from '@/engine/audio'
import { pget, pset } from '@/engine/storage'
import type { GameMeta, LevelResult } from '@/engine/types'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  BigButton,
  GameShell,
  LevelEnd,
  Mascot,
  ProgressDots,
  SpeakerButton,
  uiEntry,
} from '@/ui'
import { Builder, EMPTY_DRAFT } from './Builder'
import type { Draft } from './Builder'
import { ITEMS_PER_RUN, Play } from './Play'
import { E } from './entries'
import type { Puzzle } from './logic'
import { TIERS } from './logic'

// ============================================================
// Robo-Pilote 🤖 — programme le robot jusqu'au trésor.
// Écran d'accueil (choix du palier), parties de 8 puzzles,
// LevelEnd, et atelier bonus « Construis ton labyrinthe ».
// ============================================================

const GAME_ID = 'robo-pilote'
const SAVE_KEY = `game:${GAME_ID}`

const META: GameMeta = GAMES_BY_ID.get(GAME_ID) ?? {
  id: GAME_ID,
  title: 'Robo-Pilote',
  tagline: 'Programme le robot jusqu’au trésor !',
  icon: '🤖',
  island: 'robots',
  accent: '#00897b',
  skills: [],
  status: 'v2',
}

interface SaveState {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

const DEFAULT_SAVE: SaveState = { bestStars: {}, unlockedTier: 0, runs: 0 }

const TIER_NAMES = ['Mousse', 'Matelot', 'Capitaine', 'Amiral'] as const
const TIER_BADGES = ['⛵', '🚤', '⛴️', '🚢'] as const
const TIER_HINTS = ['2 à 4 pas', '4 à 7 pas', 'Grande île', 'Blocs 🔁'] as const

type Screen =
  | { kind: 'home' }
  | { kind: 'play'; tier: number }
  | { kind: 'end'; tier: number; result: LevelResult; newUnlock: boolean }
  | { kind: 'build' }
  | { kind: 'custom'; puzzle: Puzzle }

export default function RoboPilote() {
  const [save, setSave] = useState<SaveState>(DEFAULT_SAVE)
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const [selectedTier, setSelectedTier] = useState(0)
  const [progress, setProgress] = useState(0)
  const [runKey, setRunKey] = useState(0)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)

  useEffect(() => {
    void pget<SaveState>(SAVE_KEY).then((s) => {
      if (s === undefined) return
      const loaded: SaveState = { ...DEFAULT_SAVE, ...s }
      setSave(loaded)
      setSelectedTier(Math.min(loaded.unlockedTier, TIERS.length - 1))
    })
  }, [])

  // Fanfare différée si un nouveau palier vient d'être débloqué
  // (après l'annonce « niveau terminé » du LevelEnd).
  useEffect(() => {
    if (screen.kind !== 'end' || !screen.newUnlock) return
    const t = window.setTimeout(() => {
      sfx('levelup')
      void say(uiEntry('ui.nouveau-niveau'))
    }, 2200)
    return () => window.clearTimeout(t)
  }, [screen])

  function startRun(tier: number): void {
    setProgress(0)
    setRunKey((k) => k + 1)
    setScreen({ kind: 'play', tier })
  }

  function handleRunDone(tier: number, result: LevelResult | null): void {
    if (result === null) {
      // Fin (ou sortie) d'un labyrinthe de l'atelier : ni étoiles ni mastery.
      setScreen({ kind: 'build' })
      return
    }
    const prevBest = save.bestStars[tier] ?? 0
    const best = Math.max(prevBest, result.stars) as 0 | 1 | 2 | 3
    let unlockedTier = save.unlockedTier
    let newUnlock = false
    if (best >= 2 && tier === save.unlockedTier && tier < TIERS.length - 1) {
      unlockedTier = tier + 1
      newUnlock = true
    }
    const next: SaveState = {
      bestStars: { ...save.bestStars, [tier]: best },
      unlockedTier,
      runs: save.runs + 1,
    }
    setSave(next)
    void pset(SAVE_KEY, next)
    setScreen({ kind: 'end', tier, result, newUnlock })
  }

  const replayEntry =
    screen.kind === 'home'
      ? E('rp.intro')
      : screen.kind === 'build'
        ? E('rp.atelier')
        : screen.kind === 'play' || screen.kind === 'custom'
          ? E('rp.consigne')
          : null

  return (
    <GameShell
      meta={META}
      hud={
        screen.kind === 'play' ? (
          <ProgressDots total={ITEMS_PER_RUN} done={progress} />
        ) : undefined
      }
      onReplayInstruction={replayEntry !== null ? () => void say(replayEntry) : undefined}
    >
      {screen.kind === 'home' && (
        <Home
          save={save}
          selectedTier={selectedTier}
          accent={META.accent}
          onSelectTier={setSelectedTier}
          onPlay={() => startRun(selectedTier)}
          onBuild={() => setScreen({ kind: 'build' })}
        />
      )}

      {screen.kind === 'play' && (
        <Play
          key={`run-${runKey}`}
          mode={{ kind: 'tier', tier: screen.tier }}
          accent={META.accent}
          onProgress={setProgress}
          onDone={(result) => handleRunDone(screen.tier, result)}
        />
      )}

      {screen.kind === 'custom' && (
        <Play
          key={`custom-${runKey}`}
          mode={{ kind: 'custom', puzzle: screen.puzzle }}
          accent={META.accent}
          onDone={() => setScreen({ kind: 'build' })}
        />
      )}

      {screen.kind === 'build' && (
        <Builder
          accent={META.accent}
          draft={draft}
          onChange={setDraft}
          onPlay={(puzzle) => {
            setRunKey((k) => k + 1)
            setScreen({ kind: 'custom', puzzle })
          }}
        />
      )}

      {screen.kind === 'end' && (
        <div className="relative flex flex-1 flex-col">
          {screen.newUnlock && (
            <div className="animate-bounce-in card absolute top-3 left-1/2 z-10 -translate-x-1/2 px-5 py-2 text-base font-extrabold whitespace-nowrap text-ink">
              🔓 Nouveau niveau débloqué !
            </div>
          )}
          <LevelEnd
            result={screen.result}
            onReplay={() => startRun(screen.tier)}
            onHome={() => {
              window.location.hash = '#/'
            }}
          />
        </div>
      )}
    </GameShell>
  )
}

// ------------------------------------------------------------
// Écran d'accueil : gros robot, Plume, consigne audio, paliers.
// ------------------------------------------------------------

interface HomeProps {
  save: SaveState
  selectedTier: number
  accent: string
  onSelectTier: (tier: number) => void
  onPlay: () => void
  onBuild: () => void
}

function Home({ save, selectedTier, accent, onSelectTier, onPlay, onBuild }: HomeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-4">
      <div className="flex items-center gap-4">
        <Mascot mood="happy" size={88} />
        <div className="card animate-floaty flex h-28 w-28 items-center justify-center text-7xl">
          🤖
        </div>
        <SpeakerButton entry={E('rp.intro')} autoPlay />
      </div>

      <p className="max-w-md text-center text-lg font-bold text-ink-soft">
        Empile les flèches et guide le robot jusqu’au trésor !
      </p>

      <div className="grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
        {TIERS.map((_, tier) => {
          const locked = tier > save.unlockedTier
          const stars = save.bestStars[tier] ?? 0
          const selected = tier === selectedTier && !locked
          return (
            <button
              key={tier}
              type="button"
              disabled={locked}
              onClick={() => {
                sfx('tap')
                onSelectTier(tier)
              }}
              aria-label={`Niveau ${TIER_NAMES[tier]}${locked ? ' (verrouillé)' : ''}`}
              className={`tap-target card flex flex-col items-center justify-center gap-0.5 p-2 transition-transform active:scale-95 ${
                locked ? 'opacity-50' : ''
              }`}
              style={selected ? { boxShadow: `0 0 0 4px ${accent}`, background: `${accent}14` } : undefined}
            >
              <span className="text-2xl" aria-hidden="true">
                {locked ? '🔒' : TIER_BADGES[tier]}
              </span>
              <span className="text-sm font-extrabold text-ink">{TIER_NAMES[tier]}</span>
              <span className="text-xs font-bold text-ink-soft">{TIER_HINTS[tier]}</span>
              <span className="text-sm" aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}>
                {locked ? ' ' : '⭐'.repeat(stars) + '☆'.repeat(3 - stars)}
              </span>
            </button>
          )
        })}
      </div>

      <BigButton variant="accent" accent={accent} onClick={onPlay} className="px-12 text-2xl">
        ▶️ Jouer !
      </BigButton>

      <button
        type="button"
        onClick={() => {
          sfx('tap')
          onBuild()
        }}
        className="tap-target card flex items-center gap-2 px-5 text-base font-extrabold text-ink transition-transform active:scale-95"
      >
        🛠️ Construis ton labyrinthe
      </button>
    </div>
  )
}
