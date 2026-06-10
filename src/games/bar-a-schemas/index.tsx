// ============================================================
// Le Bar à Schémas — problèmes en barres (modèle de Singapour).
// La démarche en 4 phases est le cœur du jeu :
// 1. ÉCOUTER l'histoire (clips + nombres), 2. MODÉLISER en
// plaçant les nombres entendus dans le schéma, 3. CALCULER le
// « ? » au pavé numérique, 4. RACONTER la phrase-réponse.
// Toute la génération/validation vit dans logic.ts (pure, testée).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { numberEntry } from '@/content/numbers'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, GameMeta, LevelResult } from '@/engine/types'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  BigButton,
  ConfettiBurst,
  FeedbackOverlay,
  GameShell,
  LevelEnd,
  Mascot,
  NumPad,
  ProgressDots,
} from '@/ui'
import {
  applyRun,
  correctRolesFor,
  COUNT_ALOUD_MAX,
  FRESH_PROGRESS,
  generateItem,
  isAnswerCorrect,
  isModelComplete,
  isPlacementValid,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { BscItem, BscProgress, Placement, SlotRole, TierId } from './logic'
import { SchemaView } from './Schema'
import {
  ALL_CLIP_IDS,
  answerEntries,
  bsc,
  placementHelpEntries,
  storyEntries,
} from './speech'

const STORE_KEY = 'game:bar-a-schemas'

const META: GameMeta = GAMES_BY_ID.get('bar-a-schemas') ?? {
  id: 'bar-a-schemas',
  title: 'Le Bar à Schémas',
  tagline: 'Écoute l’histoire, dessine le problème !',
  icon: '📊',
  island: 'nombres',
  accent: '#00796b',
  skills: [...TIER_SKILLS],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🧺', name: 'Réunir', sub: 'Deux parties, un tout' },
  { emoji: '🎈', name: 'Gagner ou perdre', sub: 'Avant et après' },
  { emoji: '🫣', name: 'La partie cachée', sub: 'Trouve ce qui manque' },
  { emoji: '⚖️', name: 'Comparer', sub: 'Combien de plus ?' },
]

const HINT_FLASH_MS = 2600
const ADVANCE_DELAY_MS = 700

type Screen = 'menu' | 'play' | 'end'
type Phase = 'listen' | 'model' | 'calc' | 'count' | 'tell'

export default function BarASchemas() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<BscProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<BscItem | null>(null)
  const [phase, setPhase] = useState<Phase>('listen')
  const [placed, setPlaced] = useState<Placement>({})
  const [usedTiles, setUsedTiles] = useState<number[]>([])
  const [selectedTile, setSelectedTile] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [counting, setCounting] = useState<number | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hintRoles, setHintRoles] = useState<SlotRole[]>([])
  const [answerShown, setAnswerShown] = useState(false)
  const [burst, setBurst] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  /**
   * Action différée jouée à la fin de l'overlay retry. Les entrées de jeu
   * (tuiles, emplacements, pavé) sont gelées tant que l'overlay est affiché :
   * sinon une action correcte pendant les 1600 ms rendrait ce callback périmé
   * (recordAttempt/Tuner comptés deux fois, régression de phase).
   */
  const afterOverlayRef = useRef<(() => void) | null>(null)
  const hintTimerRef = useRef<number | undefined>(undefined)
  const advanceTimerRef = useRef<number | undefined>(undefined)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<BscProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips([...ALL_CLIP_IDS, ...Array.from({ length: 21 }, (_, n) => `nombre.${n}`)])
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(hintTimerRef.current)
      window.clearTimeout(advanceTimerRef.current)
    }
  }, [])

  // ---------- Audio ----------

  /** Enchaîne des clips ; retourne true si la séquence est allée au bout. */
  const speakSeq = useCallback(async (entries: readonly CorpusEntry[]): Promise<boolean> => {
    const seq = ++seqRef.current
    for (let i = 0; i < entries.length; i++) {
      if (seqRef.current !== seq) return false
      await say(entries[i], { interrupt: i === 0 })
    }
    return seqRef.current === seq
  }, [])

  /** Phase RACONTER : lit la phrase-réponse puis enchaîne sur l'item suivant. */
  const speakTell = useCallback(
    (it: BscItem): void => {
      void (async () => {
        const ok = await speakSeq(answerEntries(it))
        if (!ok) return
        window.clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = window.setTimeout(() => advanceRef.current(), ADVANCE_DELAY_MS)
      })()
    },
    [speakSeq],
  )

  const replayInstruction = useCallback((): void => {
    if (screen !== 'play' || !item) {
      void speakSeq([bsc('intro')])
      return
    }
    // Pendant le comptage, ne pas casser la séquence en cours.
    if (phase === 'count') return
    if (phase === 'calc') {
      void speakSeq([...storyEntries(item).slice(-1), bsc('phase.calcule')])
      return
    }
    if (phase === 'tell') {
      window.clearTimeout(advanceTimerRef.current)
      speakTell(item)
      return
    }
    void speakSeq(storyEntries(item))
  }, [screen, item, phase, speakSeq, speakTell])

  // ---------- Déroulé d'une partie ----------

  const setupItem = useCallback(
    (it: BscItem): void => {
      window.clearTimeout(hintTimerRef.current)
      firstTryRef.current = true
      failsRef.current = 0
      setItem(it)
      setPhase('listen')
      setPlaced({})
      setUsedTiles([])
      setSelectedTile(null)
      setTyped('')
      setCounting(null)
      setHintRoles([])
      setAnswerShown(false)
      void speakSeq(storyEntries(it))
    },
    [speakSeq],
  )

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    setupItem(generateItem(t, 0))
  }

  const finishRun = useCallback((): void => {
    if (!item) return
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, item.tier, stars)
    const unlockedNow = updated.unlockedTier > base.unlockedTier
    if (unlockedNow) sfx('levelup')
    setNewUnlock(unlockedNow)
    setProgress(updated)
    void pset(STORE_KEY, updated)
    setScreen('end')
  }, [item, firstTryCorrect, progress])

  const advance = useCallback((): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    setupItem(generateItem(item.tier, tunerRef.current.level, item.template.id))
  }, [item, resolved, finishRun, setupItem])

  /** advance() le plus frais — les séquences audio se terminent bien plus tard. */
  const advanceRef = useRef(advance)
  useEffect(() => {
    advanceRef.current = advance
  })

  // ---------- Phase ÉCOUTER ----------

  const toModel = (): void => {
    setPhase('model')
    void speakSeq([bsc('phase.modelise')])
  }

  // ---------- Phase MODÉLISER ----------

  const tapTile = (idx: number): void => {
    if (overlay !== null || phase !== 'model' || usedTiles.includes(idx)) return
    sfx('tap')
    setSelectedTile((cur) => (cur === idx ? null : idx))
  }

  const flashHint = (roles: SlotRole[], persistent: boolean): void => {
    setHintRoles(roles)
    window.clearTimeout(hintTimerRef.current)
    if (!persistent) {
      hintTimerRef.current = window.setTimeout(() => setHintRoles([]), HINT_FLASH_MS)
    }
  }

  const tapSlot = (role: SlotRole): void => {
    if (overlay !== null || !item || phase !== 'model') return
    if (selectedTile === null) {
      sfx('slide')
      return
    }
    const value = item.tiles[selectedTile]

    if (isPlacementValid(item, role, value, placed)) {
      sfx('pop')
      failsRef.current = 0
      const next: Placement = { ...placed, [role]: value }
      setPlaced(next)
      setUsedTiles((u) => [...u, selectedTile])
      setSelectedTile(null)
      setHintRoles([])
      window.clearTimeout(hintTimerRef.current)
      if (isModelComplete(item, next)) {
        sfx('magic')
        setPhase('calc')
        void speakSeq([bsc('schema.bravo'), bsc('phase.calcule')])
      }
      return
    }

    // Placement raté : l'item perd son premier essai, l'emplacement correct
    // s'illumine et l'audio explique POURQUOI (feedback élaboratif).
    firstTryRef.current = false
    failsRef.current += 1
    const persistent = failsRef.current >= 2
    const roles = correctRolesFor(item, value, placed)
    afterOverlayRef.current = () => {
      flashHint(roles.length > 0 ? [roles[0]] : [], persistent)
      const entries =
        roles.length > 0 ? placementHelpEntries(value, roles[0]) : [numberEntry(value)]
      void speakSeq(persistent ? [...entries, bsc('indice.place')] : entries)
    }
    setOverlay('retry')
  }

  // ---------- Phase CALCULER ----------

  const runCounting = useCallback(
    async (it: BscItem): Promise<void> => {
      const seq = ++seqRef.current
      setPhase('count')
      setCounting(0)
      await say(bsc('compte.regarde'))
      if (seqRef.current !== seq) return
      if (it.answer <= COUNT_ALOUD_MAX) {
        for (let i = 1; i <= it.answer; i++) {
          if (seqRef.current !== seq) return
          setCounting(i)
          sfx('tap')
          await say(numberEntry(i), { interrupt: false })
        }
      } else {
        setCounting(it.answer)
      }
      if (seqRef.current !== seq) return
      await say(bsc('compte.ca-fait'), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(numberEntry(it.answer), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(bsc('compte.a-toi'), { interrupt: false })
      if (seqRef.current !== seq) return
      setCounting(null)
      setPhase('calc')
      if (failsRef.current >= 2) {
        // Indice : le nombre mystère reste affiché sur la barre qui brille.
        setAnswerShown(true)
        void say(bsc('indice.calc'), { interrupt: false })
      }
    },
    [],
  )

  const onValidate = (): void => {
    if (overlay !== null || !item || phase !== 'calc') return
    const n = Number(typed)
    if (!Number.isInteger(n)) return

    if (isAnswerCorrect(item, n)) {
      // Item résolu : maîtrise + Tuner, UNE seule fois, premiers essais seulement.
      const wasFirst = firstTryRef.current
      void recordAttempt(TIER_SKILLS[item.tier], wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      sfx('correct')
      setTyped('')
      setAnswerShown(true)
      setPhase('tell')
      setBurst((b) => b + 1)
      // Phase RACONTER : la phrase-réponse est lue, puis on enchaîne.
      speakTell(item)
      return
    }

    firstTryRef.current = false
    failsRef.current += 1
    setTyped('')
    afterOverlayRef.current = () => void runCounting(item)
    setOverlay('retry')
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'retry') {
      const fn = afterOverlayRef.current
      afterOverlayRef.current = null
      fn?.()
    }
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            📊
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <ReplayBubble onTap={() => void speakSeq([bsc('intro')])} autoPlayIntro />
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute l’histoire, dessine-la en barres, trouve le nombre mystère !
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
                  void speakSeq([bsc(`niveau.${t}`)])
                }}
                className={`tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95 ${locked ? 'opacity-50' : ''}`}
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {locked ? '🔒' : info.emoji}
                </span>
                <span className="text-base leading-tight font-extrabold text-ink">{info.name}</span>
                <span className="text-xs font-semibold text-ink-soft">{info.sub}</span>
                <span className="text-sm" aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}>
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

  const renderListen = (it: BscItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 p-4">
      <div className="card flex w-full flex-col items-center gap-4 p-5">
        <div className="flex items-end justify-center gap-3">
          <span aria-hidden="true" className="animate-bounce-in text-7xl">
            {it.template.emoji.hero}
          </span>
          {it.template.emoji.rival && (
            <span aria-hidden="true" className="animate-bounce-in text-6xl" style={{ animationDelay: '0.15s' }}>
              {it.template.emoji.rival}
            </span>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <NumberCard value={it.a} emoji={it.template.emoji.object} />
          <NumberCard value={it.b} emoji={it.template.emoji.object} />
        </div>
        <ReplayBubble onTap={() => void speakSeq(storyEntries(it))} />
      </div>
      <BigButton variant="accent" accent={ACCENT} className="w-full max-w-xs text-2xl" onClick={toModel}>
        Je dessine le schéma ! ✏️
      </BigButton>
    </div>
  )

  const renderBoard = (it: BscItem): ReactNode => {
    const unknownDisplay =
      phase === 'tell'
        ? String(it.answer)
        : phase === 'calc' && typed.length > 0
          ? typed
          : answerShown
            ? String(it.answer)
            : null
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 px-3 pb-6 md:flex-row md:gap-8">
        {/* Le schéma en barres */}
        <div className="flex w-full max-w-md flex-col items-center gap-3 md:flex-1">
          <p className="text-center text-lg font-extrabold text-ink" aria-live="polite">
            {phase === 'model' && 'Pose chaque nombre au bon endroit !'}
            {phase === 'calc' && 'Écris le nombre mystère !'}
            {phase === 'count' && 'On compte ensemble…'}
            {phase === 'tell' && 'Et voilà l’histoire ! 🎉'}
          </p>
          <div className="card w-full p-4">
            <div className="mb-3 flex items-center justify-center gap-2 text-2xl" aria-hidden="true">
              <span>{it.template.emoji.hero}</span>
              <span>{it.template.emoji.object}</span>
            </div>
            <SchemaView
              item={it}
              placed={placed}
              unknownDisplay={unknownDisplay}
              unknownGlow={answerShown && phase === 'calc'}
              countingDots={phase === 'count' ? counting : null}
              hintRoles={hintRoles}
              interactive={phase === 'model'}
              onSlotTap={tapSlot}
              accent={ACCENT}
            />
          </div>
        </div>

        {/* Tuiles (modéliser) ou pavé (calculer) */}
        <div className="flex w-full max-w-md flex-col items-center gap-3 md:flex-1">
          {phase === 'model' && (
            <div className="flex items-center justify-center gap-3">
              {it.tiles.map((v, i) =>
                usedTiles.includes(i) ? (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="flex h-20 w-24 items-center justify-center rounded-card border-2 border-dashed border-ink-soft/25"
                  />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => tapTile(i)}
                    aria-pressed={selectedTile === i}
                    aria-label={`Tuile du nombre ${v}`}
                    className={`tap-target card flex h-20 w-24 flex-col items-center justify-center transition-transform active:scale-90 ${selectedTile === i ? 'animate-pulse-glow' : ''}`}
                    style={selectedTile === i ? { outline: `4px solid ${ACCENT}` } : undefined}
                  >
                    <span className="text-3xl leading-none font-extrabold text-ink">{v}</span>
                    <span aria-hidden="true" className="text-xl leading-tight">
                      {it.template.emoji.object}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
          {phase === 'calc' && (
            <NumPad value={typed} onChange={setTyped} onValidate={onValidate} maxLen={2} />
          )}
          {(phase === 'count' || phase === 'tell') && (
            <Mascot mood={phase === 'tell' ? 'cheer' : 'thinking'} size={110} />
          )}
        </div>
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && (phase === 'listen' ? renderListen(item) : renderBoard(item))}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouveau défi débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
      <ConfettiBurst burst={burst} />
    </GameShell>
  )
}

// ------------------------------------------------------------
// Petits composants locaux
// ------------------------------------------------------------

/** Carte « nombre entendu » de la phase ÉCOUTER (devient une tuile ensuite). */
function NumberCard({ value, emoji }: { value: number; emoji: string }) {
  return (
    <div className="animate-pop flex h-20 w-24 flex-col items-center justify-center rounded-card bg-sand/60">
      <span className="text-3xl leading-none font-extrabold text-ink">{value}</span>
      <span aria-hidden="true" className="text-xl leading-tight">{emoji}</span>
    </div>
  )
}

/** Bouton 🔊 local : rejoue l'histoire complète (séquence de clips). */
function ReplayBubble({ onTap, autoPlayIntro = false }: { onTap: () => void; autoPlayIntro?: boolean }) {
  const onTapRef = useRef(onTap)
  useEffect(() => {
    onTapRef.current = onTap
  })
  const fired = useRef(false)
  useEffect(() => {
    if (!autoPlayIntro || fired.current) return
    fired.current = true
    const t = window.setTimeout(() => onTapRef.current(), 450)
    return () => window.clearTimeout(t)
  }, [autoPlayIntro])
  return (
    <button
      type="button"
      onClick={() => {
        sfx('tap')
        onTap()
      }}
      aria-label="Écouter l’histoire"
      className="tap-target flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-card transition-transform active:scale-95"
    >
      <span aria-hidden="true">🔊</span>
    </button>
  )
}
