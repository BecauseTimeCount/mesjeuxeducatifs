import { useEffect, useRef, useState } from 'react'
import { say, sfx, stopSpeech } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import type { LevelResult } from '@/engine/types'
import { BigButton, FeedbackOverlay } from '@/ui'
import { DIR_EMOJI, IslandGrid, obstacleEmoji } from './Grid'
import { E } from './entries'
import type { Block, Cell, Dir, Puzzle } from './logic'
import { REPEAT_MAX, REPEAT_MIN, TIERS, generatePuzzle, simulate, tracePath } from './logic'

// ============================================================
// Une partie de Robo-Pilote : 8 puzzles procéduraux (mode palier)
// ou 1 labyrinthe construit dans l'atelier (mode custom).
// ============================================================

export const ITEMS_PER_RUN = 8

const STEP_MS = 350
const GAME_ID = 'robo-pilote'

const PALETTE: readonly Dir[] = ['left', 'up', 'down', 'right']

const DIR_LABEL: Record<Dir, string> = {
  up: 'En haut',
  down: 'En bas',
  left: 'À gauche',
  right: 'À droite',
}

const DIR_CLIP: Record<Dir, string> = {
  up: 'rp.dir.haut',
  down: 'rp.dir.bas',
  left: 'rp.dir.gauche',
  right: 'rp.dir.droite',
}

const REPEAT_CHOICES = Array.from(
  { length: REPEAT_MAX - REPEAT_MIN + 1 },
  (_, i) => REPEAT_MIN + i,
)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Longueur cible du chemin : la difficulté monte au fil des 8 items. */
function targetLenFor(tier: number, itemIndex: number): number {
  const [lo, hi] = TIERS[tier].pathLen
  return lo + Math.round((itemIndex / (ITEMS_PER_RUN - 1)) * (hi - lo))
}

export type PlayMode =
  | { kind: 'tier'; tier: number }
  | { kind: 'custom'; puzzle: Puzzle }

export interface PlayProps {
  mode: PlayMode
  accent: string
  /** Résultat de la partie (mode palier), ou null (sortie du mode atelier). */
  onDone: (result: LevelResult | null) => void
  /** Items résolus, pour les ProgressDots du HUD. */
  onProgress?: (done: number) => void
}

export function Play({ mode, accent, onDone, onProgress }: PlayProps) {
  const tier = mode.kind === 'custom' ? TIERS.length - 1 : mode.tier
  const loops = mode.kind === 'custom' || TIERS[tier].loops

  const [puzzle, setPuzzle] = useState<Puzzle>(() =>
    mode.kind === 'custom' ? mode.puzzle : generatePuzzle(mode.tier, targetLenFor(mode.tier, 0)),
  )
  const [itemIndex, setItemIndex] = useState(0)
  const [program, setProgram] = useState<Block[]>([])
  const [robot, setRobot] = useState<Cell>(puzzle.robot)
  const [robotDir, setRobotDir] = useState<Dir | null>(null)
  const [running, setRunning] = useState(false)
  const [shake, setShake] = useState(0)
  const [stunned, setStunned] = useState(false)
  const [treasureOpen, setTreasureOpen] = useState(false)
  const [failCell, setFailCell] = useState<Cell | null>(null)
  const [hintCells, setHintCells] = useState<Cell[] | null>(null)
  const [feedback, setFeedback] = useState<'success' | 'retry' | null>(null)
  const [retryMessage, setRetryMessage] = useState<string | undefined>(undefined)
  const [rowWiggle, setRowWiggle] = useState(0)
  const [picker, setPicker] = useState<{ open: boolean; dir: Dir | null }>({
    open: false,
    dir: null,
  })

  const alive = useRef(true)
  const runningRef = useRef(false)
  const firstTry = useRef(true)
  const fails = useRef(0) // échecs consécutifs sur l'item courant
  const firstTryCount = useRef(0)
  const solved = useRef(0)
  const hintTimer = useRef(0)

  // Consigne au lancement (+ pitch de la boucle magique au palier Amiral).
  useEffect(() => {
    alive.current = true
    void (async () => {
      await say(E('rp.consigne'))
      if (loops && alive.current) await say(E('rp.boucle'), { interrupt: false })
    })()
    return () => {
      alive.current = false
      window.clearTimeout(hintTimer.current)
      stopSpeech()
    }
    // Tout est constant pour la durée de vie du composant (remonté par partie).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function rejectFull(): void {
    sfx('wrong')
    setRowWiggle((w) => w + 1)
    void say(E(loops ? 'rp.plein-boucle' : 'rp.plein'))
  }

  function addBlock(b: Block): void {
    if (running || feedback !== null) return
    if (program.length >= puzzle.budget) {
      rejectFull()
      return
    }
    sfx('tap')
    // Palier Mousse : chaque flèche est nommée à voix haute (gauche/droite/haut/bas).
    if (mode.kind === 'tier' && mode.tier === 0 && b.kind === 'move') {
      void say(E(DIR_CLIP[b.dir]))
    }
    setProgram((p) => [...p, b])
  }

  function removeBlock(index: number): void {
    if (running || feedback !== null) return
    sfx('pop')
    setProgram((p) => p.filter((_, i) => i !== index))
  }

  function clearProgram(): void {
    if (running || program.length === 0) return
    sfx('pop')
    setProgram([])
  }

  function openPicker(): void {
    if (running || feedback !== null) return
    if (program.length >= puzzle.budget) {
      rejectFull()
      return
    }
    sfx('tap')
    setPicker({ open: true, dir: null })
  }

  function pickRepeatDir(dir: Dir): void {
    sfx('tap')
    setPicker({ open: true, dir })
  }

  function pickRepeatCount(times: number): void {
    if (picker.dir === null) return
    const dir = picker.dir
    setPicker({ open: false, dir: null })
    addBlock({ kind: 'repeat', dir, times })
  }

  async function execute(): Promise<void> {
    if (runningRef.current || feedback !== null || program.length === 0) return
    runningRef.current = true
    setRunning(true)
    setFailCell(null)
    setHintCells(null)
    window.clearTimeout(hintTimer.current)
    sfx('whoosh')

    const sim = simulate(puzzle, program)
    await sleep(350)
    for (const step of sim.steps) {
      if (!alive.current) return
      setRobotDir(step.dir)
      if (!step.ok) break
      sfx('slide')
      setRobot(step.to)
      await sleep(STEP_MS)
    }
    if (!alive.current) return
    setRobotDir(null)

    if (sim.outcome === 'treasure') {
      // 🎉 Le coffre s'ouvre — l'item est résolu à la première exécution réussie.
      solved.current += 1
      if (firstTry.current) firstTryCount.current += 1
      onProgress?.(solved.current)
      if (mode.kind === 'tier') {
        void recordAttempt(TIERS[tier].skill, firstTry.current)
      }
      setTreasureOpen(true)
      sfx('coin')
      await sleep(600)
      if (!alive.current) return
      setFeedback('success')
    } else {
      // 💥 Le robot a coincé : rebond, étourdissement, la case fautive clignote.
      firstTry.current = false
      fails.current += 1
      sfx('wrong')
      setShake((s) => s + 1)
      setStunned(true)
      if (sim.outcome === 'rock' && sim.failCell !== undefined) {
        setFailCell(sim.failCell)
        void say(E(obstacleEmoji(sim.failCell) === '🌴' ? 'rp.oups-palmier' : 'rp.oups-rocher'))
      } else if (sim.outcome === 'wall') {
        void say(E('rp.oups-bord'))
      } else {
        void say(E('rp.trop-court'))
      }
      await sleep(1000)
      if (!alive.current) return
      setStunned(false)
      setRetryMessage(sim.outcome === 'short' ? 'Ajoute des flèches !' : 'Corrige ton programme !')
      setFeedback('retry')
    }
    runningRef.current = false
    setRunning(false)
  }

  function nextItem(): void {
    if (mode.kind !== 'tier') return
    const nextIndex = itemIndex + 1
    const next = generatePuzzle(mode.tier, targetLenFor(mode.tier, nextIndex))
    setItemIndex(nextIndex)
    setPuzzle(next)
    setProgram([])
    setRobot(next.robot)
    setTreasureOpen(false)
    setFailCell(null)
    setHintCells(null)
    firstTry.current = true
    fails.current = 0
  }

  function handleFeedbackDone(): void {
    const kind = feedback
    setFeedback(null)
    if (kind === 'success') {
      if (mode.kind === 'custom') {
        sfx('fanfare')
        onDone(null)
        return
      }
      if (itemIndex + 1 >= ITEMS_PER_RUN) {
        const ratio = firstTryCount.current / ITEMS_PER_RUN
        const stars: LevelResult['stars'] = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : 1
        onDone({
          gameId: GAME_ID,
          stars,
          firstTryCorrect: firstTryCount.current,
          total: ITEMS_PER_RUN,
        })
        return
      }
      nextItem()
      return
    }
    // Retry : le robot glisse jusqu'au départ, le programme reste éditable.
    setRobot(puzzle.robot)
    setFailCell(null)
    if (fails.current >= 2) {
      // Indice automatique : le chemin optimal s'illumine brièvement.
      setHintCells(tracePath(puzzle.robot, puzzle.optimalPath))
      void say(E('rp.indice'))
      hintTimer.current = window.setTimeout(() => {
        if (alive.current) setHintCells(null)
      }, 3000)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-3 px-3 pb-4 md:flex-row md:items-center md:justify-center md:gap-8 md:px-6">
      <div className="w-full md:max-w-[500px] md:flex-1">
        <IslandGrid
          size={puzzle.size}
          obstacles={puzzle.obstacles}
          treasure={puzzle.treasure}
          treasureOpen={treasureOpen}
          robot={robot}
          robotDir={robotDir}
          shake={shake}
          stunned={stunned}
          failCell={failCell}
          hintCells={hintCells}
        />
      </div>

      <div className="flex w-full max-w-[440px] flex-col gap-3 md:w-[380px]">
        {/* Le programme : un emplacement vide par pas de budget */}
        <div
          key={`row-${rowWiggle}`}
          className={`card flex flex-wrap items-center justify-center gap-1.5 p-2.5 ${
            rowWiggle > 0 ? 'animate-shake-soft' : ''
          }`}
        >
          {Array.from({ length: puzzle.budget }, (_, i) => {
            const block = program.at(i)
            return block !== undefined ? (
              <button
                key={`b-${i}`}
                type="button"
                onClick={() => removeBlock(i)}
                aria-label="Retirer ce bloc du programme"
                className="animate-pop flex h-[52px] min-w-[52px] items-center justify-center rounded-xl px-1.5 shadow-card transition-transform active:scale-90"
                style={{ background: accent }}
              >
                {block.kind === 'move' ? (
                  <span className="text-2xl">{DIR_EMOJI[block.dir]}</span>
                ) : (
                  <span className="flex items-center gap-0.5 text-lg font-extrabold text-white">
                    🔁{block.times}
                    <span className="text-xl">{DIR_EMOJI[block.dir]}</span>
                  </span>
                )}
              </button>
            ) : (
              <span
                key={`s-${i}`}
                aria-hidden="true"
                className="h-[52px] w-[52px] rounded-xl border-2 border-dashed border-ink-soft/30 bg-paper"
              />
            )
          })}
        </div>

        {/* La palette de blocs */}
        <div className="flex items-center justify-center gap-2">
          {PALETTE.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => addBlock({ kind: 'move', dir: d })}
              aria-label={DIR_LABEL[d]}
              className="tap-target card flex items-center justify-center text-3xl transition-transform active:scale-90"
            >
              {DIR_EMOJI[d]}
            </button>
          ))}
          {loops && (
            <button
              type="button"
              onClick={openPicker}
              aria-label="Ajouter un bloc répéter"
              className="tap-target flex items-center justify-center rounded-card text-3xl shadow-card transition-transform active:scale-90"
              style={{ background: accent }}
            >
              🔁
            </button>
          )}
        </div>

        {/* GO + effacer */}
        <div className="flex items-center justify-center gap-2">
          <BigButton
            variant="soft"
            onClick={clearProgram}
            disabled={running || program.length === 0}
            className="text-base"
          >
            🗑️ Effacer
          </BigButton>
          <BigButton
            variant="accent"
            accent={accent}
            onClick={() => void execute()}
            disabled={running || program.length === 0}
            className="flex-1 text-2xl"
          >
            ▶️ GO !
          </BigButton>
        </div>

        {mode.kind === 'custom' && (
          <BigButton variant="soft" onClick={() => onDone(null)} className="text-base">
            ↩️ Retour à l’atelier
          </BigButton>
        )}
      </div>

      {/* Mini-sélecteur du bloc répéter : direction puis nombre */}
      {picker.open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 p-4"
          onClick={() => setPicker({ open: false, dir: null })}
        >
          <div
            className="card flex flex-col items-center gap-3 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-extrabold text-ink">🔁 Répéter quelle flèche ?</div>
            <div className="flex gap-2">
              {PALETTE.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickRepeatDir(d)}
                  aria-label={DIR_LABEL[d]}
                  className={`tap-target flex items-center justify-center rounded-xl text-3xl shadow-card transition-transform active:scale-90 ${
                    picker.dir === d ? 'animate-pop' : 'bg-white'
                  }`}
                  style={picker.dir === d ? { background: accent } : undefined}
                >
                  {DIR_EMOJI[d]}
                </button>
              ))}
            </div>
            <div
              className={`text-base font-extrabold ${picker.dir === null ? 'text-ink-soft' : 'text-ink'}`}
            >
              … combien de fois ?
            </div>
            <div className="flex gap-2">
              {REPEAT_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={picker.dir === null}
                  onClick={() => pickRepeatCount(n)}
                  aria-label={`${n} fois`}
                  className="tap-target rounded-xl bg-white text-2xl font-extrabold text-ink shadow-card transition-transform active:scale-90 disabled:opacity-40"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <FeedbackOverlay
        kind={feedback}
        message={feedback === 'retry' ? retryMessage : undefined}
        onDone={handleFeedbackDone}
      />
    </div>
  )
}
