import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, GameMeta, LevelResult } from '@/engine/types'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  BigButton,
  FeedbackOverlay,
  GameShell,
  LevelEnd,
  Mascot,
  ProgressDots,
  SpeakerButton,
} from '@/ui'
import corpus from './corpus.json'
import {
  applyRun,
  candidates,
  CELLS,
  colOf,
  conflictCells,
  EMPTY,
  FRESH_PROGRESS,
  generateItem,
  gridKey,
  ITEMS_PER_RUN,
  isSolved,
  isValidPlacement,
  MAX_TUNER_LEVEL,
  PIECE_BY_SYM,
  PIECES,
  regionOf,
  rowOf,
  SIZE,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { CrmProgress, PuzzleItem, TierId } from './logic'

// ============================================================
// Le Carré Magique des Robots — sudoku 4x4 avec 4 pièces de robot.
// L'enfant PRODUIT la grille : tap-pièce (palette) puis tap-case vide.
// Une pose interdite rebondit hors de la case et la ligne/colonne/carré
// fautif clignote ; après 2 erreurs sur la même case, les pièces
// impossibles sont grisées dans la palette. Zéro QCM, l'erreur enseigne.
// ============================================================

const STORE_KEY = 'game:carre-magique'

const META: GameMeta = GAMES_BY_ID.get('carre-magique') ?? {
  id: 'carre-magique',
  title: 'Le Carré Magique des Robots',
  tagline: 'Un seul robot par ligne, par colonne et par carré !',
  icon: '🧩',
  island: 'robots',
  accent: '#5c6bc0',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🌱', name: 'Premiers pas', sub: '2 cases à compléter' },
  { emoji: '⚙️', name: "L'apprenti", sub: '3 ou 4 cases vides' },
  { emoji: '🔧', name: 'Le défi', sub: '5 cases vides' },
  { emoji: '🏆', name: 'Le maître', sub: '6 cases vides' },
]

// ---------- Corpus local typé ----------

function toVoice(v: string): CorpusEntry['voice'] {
  return v === 'denise' || v === 'eloise' || v === 'henri' ? v : undefined
}

const ENTRIES: ReadonlyMap<string, CorpusEntry> = new Map(
  corpus.entries.map((e): [string, CorpusEntry] => [
    e.id,
    { id: e.id, text: e.text, voice: toVoice(e.voice) },
  ]),
)

function E(id: string): CorpusEntry {
  return ENTRIES.get(id) ?? { id, text: '' }
}

/** Quelle contrainte est violée par la pose (pour le bon clip + surlignage) ? */
type ConflictKind = 'ligne' | 'colonne' | 'carre'

function conflictKind(grid: readonly number[], idx: number, sym: number): ConflictKind {
  const r = rowOf(idx)
  const c = colOf(idx)
  const reg = regionOf(idx)
  for (let i = 0; i < CELLS; i++) {
    if (i === idx || grid[i] !== sym) continue
    if (rowOf(i) === r) return 'ligne'
    if (colOf(i) === c) return 'colonne'
    if (regionOf(i) === reg) return 'carre'
  }
  return 'ligne'
}

const CONFLICT_CLIP: Readonly<Record<ConflictKind, string>> = {
  ligne: 'crm.deja-ligne',
  colonne: 'crm.deja-colonne',
  carre: 'crm.deja-carre',
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success'

export default function CarreMagique() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<CrmProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<PuzzleItem | null>(null)
  const [grid, setGrid] = useState<number[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  // Sélection courante de la palette + feedback d'erreur visuel.
  const [selected, setSelected] = useState<number | null>(null)
  const [bounceIdx, setBounceIdx] = useState<number | null>(null)
  const [flashCells, setFlashCells] = useState<readonly number[]>([])
  const [hintIdx, setHintIdx] = useState<number | null>(null)
  /** clé d'animation par case pour rejouer la pose (pop). */
  const [placedKey, setPlacedKey] = useState(0)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  /** échecs PAR CASE pour l'indice après 2 erreurs sur la même case. */
  const cellFailsRef = useRef<Record<number, number>>({})
  /** jeton de séquence audio : tout changement annule la séquence en cours. */
  const seqRef = useRef(0)

  useEffect(() => {
    let alive = true
    void pget<CrmProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback((): void => {
    const seq = ++seqRef.current
    void say(E('crm.consigne')).then(() => {
      if (seqRef.current !== seq) return
    })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') speakConsigne()
    else void say(E('crm.intro'))
  }, [screen, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const loadItem = (it: PuzzleItem): void => {
    setItem(it)
    setGrid([...it.given])
    setSelected(null)
    setBounceIdx(null)
    setFlashCells([])
    setHintIdx(null)
    cellFailsRef.current = {}
    firstTryRef.current = true
  }

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    const first = generateItem(t, 0)
    setTier(t)
    loadItem(first)
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    speakConsigne()
  }

  /** Grille entièrement et correctement remplie : maîtrise + Tuner, UNE fois. */
  const resolveSuccess = (it: PuzzleItem): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    sfx('fanfare')
    void say(E('crm.gagne'))
    window.setTimeout(() => setOverlay('success'), 700)
  }

  // ---------- Interaction : tap-pièce puis tap-case ----------

  const onTapPiece = (sym: number): void => {
    if (phase !== 'idle') return
    sfx('tap')
    setSelected((cur) => (cur === sym ? null : sym))
  }

  const onTapCell = (idx: number): void => {
    if (!item || phase !== 'idle') return
    if (grid[idx] !== EMPTY) return
    if (selected === null) {
      // Pas encore de pièce choisie : on guide vers la palette.
      sfx('slide')
      void say(E('crm.choisis-piece'))
      return
    }

    if (isValidPlacement(grid, idx, selected)) {
      // Pose réussie : la pièce se dépose (sfx + pop).
      sfx('pop')
      const next = [...grid]
      next[idx] = selected
      setGrid(next)
      setPlacedKey((k) => k + 1)
      setHintIdx(null)
      setBounceIdx(null)
      setFlashCells([])
      void say(E('crm.bien-pose'))
      if (isSolved(next)) resolveSuccess(item)
      return
    }

    // Pose interdite : la pièce rebondit hors de la case, l'erreur enseigne.
    firstTryRef.current = false
    cellFailsRef.current[idx] = (cellFailsRef.current[idx] ?? 0) + 1
    const kind = conflictKind(grid, idx, selected)
    sfx('wrong')
    setBounceIdx(idx)
    setFlashCells(conflictCells(grid, idx, selected))
    const seq = ++seqRef.current
    void say(E(CONFLICT_CLIP[kind])).then(() => {
      if (seqRef.current !== seq) return
      // Indice après 2 erreurs sur la MÊME case : griser les pièces impossibles.
      if ((cellFailsRef.current[idx] ?? 0) >= 2) {
        setHintIdx(idx)
        void say(E('crm.indice'), { interrupt: false })
      }
    })
    window.setTimeout(() => {
      setBounceIdx(null)
      setFlashCells([])
    }, 900)
  }

  // ---------- Suite ----------

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun(item.tier)
      return
    }
    setPhase('idle')
    const next = generateItem(item.tier, tunerRef.current.level, gridKey(item.given))
    loadItem(next)
    speakConsigne()
  }

  const finishRun = (t: TierId): void => {
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, t, stars)
    const unlockedNow = updated.unlockedTier > base.unlockedTier
    if (unlockedNow) sfx('levelup')
    setNewUnlock(unlockedNow)
    setProgress(updated)
    void pset(STORE_KEY, updated)
    setScreen('end')
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') advance()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🧩
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('crm.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🤖⚙️🔋💡
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Range chaque robot une seule fois par ligne, colonne et carré !
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          {TIER_INFO.map((info, i) => {
            const t = i as TierId
            const locked = t > progress.unlockedTier
            const stars = progress.bestStars[t] ?? 0
            const active = tier === t && !locked
            return (
              <button
                key={info.name}
                type="button"
                aria-pressed={active}
                aria-label={locked ? `${info.name} (verrouillé)` : info.name}
                onClick={() => {
                  if (locked) {
                    sfx('slide')
                    return
                  }
                  sfx('tap')
                  setTier(t)
                  void say(E(`crm.niveau.${t}`))
                }}
                className={`tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95 ${locked ? 'opacity-50' : ''}`}
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {locked ? '🔒' : info.emoji}
                </span>
                <span className="text-base leading-tight font-extrabold text-ink">{info.name}</span>
                <span className="text-xs font-semibold text-ink-soft">{info.sub}</span>
                <span
                  className="text-sm"
                  aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}
                >
                  {'⭐'.repeat(stars)}
                  <span className="opacity-30">{'☆'.repeat(3 - stars)}</span>
                </span>
              </button>
            )
          })}
        </div>
        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-2xl"
          onClick={() => startRun(tier)}
        >
          Jouer !
        </BigButton>
      </div>
    )
  }

  const renderGrid = (it: PuzzleItem): ReactNode => (
    <div
      className="grid gap-1.5 rounded-card bg-white/70 p-2"
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      role="group"
      aria-label="Grille du carré magique"
    >
      {grid.map((val, idx) => {
        const given = it.given[idx] !== EMPTY
        const filled = val !== EMPTY
        const piece = filled ? PIECE_BY_SYM.get(val) : undefined
        const isFlash = flashCells.includes(idx)
        const isBounce = bounceIdx === idx
        // Séparateurs épais entre les régions 2x2.
        const c = colOf(idx)
        const r = rowOf(idx)
        const thickLeft = c === 2
        const thickTop = r === 2
        const empty = !filled
        const cls = [
          'tap-target relative flex items-center justify-center rounded-xl text-4xl sm:text-5xl',
          'aspect-square min-h-16 min-w-16 transition-transform',
          given ? 'bg-paper-soft' : 'bg-white',
          empty ? 'border-2 border-dashed border-ink/30 active:scale-90' : '',
          isFlash ? 'animate-pulse-glow' : '',
          isBounce ? 'animate-wiggle' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={idx}
            type="button"
            disabled={phase !== 'idle' || filled}
            onClick={() => onTapCell(idx)}
            aria-label={
              filled
                ? `Case ${idx + 1} : ${piece?.name}`
                : `Case ${idx + 1} vide${selected !== null ? ', appuie pour poser' : ''}`
            }
            className={cls}
            style={{
              marginLeft: thickLeft ? 6 : undefined,
              marginTop: thickTop ? 6 : undefined,
              outline: isFlash ? `4px solid ${ACCENT}` : undefined,
            }}
          >
            {piece && (
              <span
                key={given ? 'g' : placedKey}
                className={given ? '' : 'animate-bounce-in'}
                aria-hidden="true"
              >
                {piece.emoji}
              </span>
            )}
            {empty && selected !== null && (
              <span aria-hidden="true" className="absolute text-xl opacity-30">
                ＋
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  const renderPalette = (idx: number | null): ReactNode => {
    // Indice : sur la case en difficulté, les pièces impossibles sont grisées.
    const allowed =
      idx !== null && hintIdx === idx ? new Set(candidates(grid, idx)) : null
    return (
      <div className="flex w-full max-w-md items-center justify-center gap-3">
        {PIECES.map((p) => {
          const isSel = selected === p.sym
          const dimmed = allowed !== null && !allowed.has(p.sym)
          return (
            <button
              key={p.sym}
              type="button"
              disabled={phase !== 'idle' || dimmed}
              aria-pressed={isSel}
              aria-label={`${p.name}${dimmed ? ' (impossible ici)' : ''}`}
              onClick={() => onTapPiece(p.sym)}
              className={`tap-target card flex flex-col items-center justify-center gap-0.5 px-2 py-2 transition-transform active:scale-90 ${dimmed ? 'opacity-25 grayscale' : ''} ${isSel ? 'animate-pop -translate-y-1' : ''}`}
              style={isSel ? { outline: `4px solid ${p.accent}` } : undefined}
            >
              <span className="text-3xl leading-none sm:text-4xl" aria-hidden="true">
                {p.emoji}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  // La case en cours d'indice (la plus récente en difficulté).
  const hintCellIdx = hintIdx

  const renderPlay = (it: PuzzleItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-3 pb-6">
      <p className="text-center text-base font-extrabold text-ink">
        {selected === null
          ? 'Choisis une pièce, puis une case vide.'
          : 'Appuie sur une case vide pour la poser.'}
      </p>
      {renderGrid(it)}
      {renderPalette(hintCellIdx)}
    </div>
  )

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouveau niveau débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
