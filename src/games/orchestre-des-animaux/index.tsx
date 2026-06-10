import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx, stopSpeech } from '@/engine/audio'
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
  ProgressDots,
  SpeakerButton,
} from '@/ui'
import corpus from './corpus.json'
import {
  ANIMAL_COUNT,
  ANIMALS,
  applyRun,
  addCompo,
  COMPOSE_SKILL,
  COMPOSE_TEMPOS,
  deserializeGrid,
  emptyGrid,
  FRESH_PROGRESS,
  generateSequence,
  GRID_STEPS,
  isComposeValid,
  lengthFor,
  MAX_COMPOS,
  MAX_TUNER_LEVEL,
  nextCompoName,
  padsForTier,
  REPRODUCE_SKILL,
  SEQUENCES_PER_RUN,
  serializeGrid,
  starsFor,
  TEACH_TEMPO_FACTOR,
  tempoForTier,
  toggleCell,
  verdict,
} from './logic'
import type { Grid, OdaProgress, SavedCompo, TierId } from './logic'
import { playAnimal } from './sound'

// ============================================================
// L'Orchestre des Animaux — concert nocturne. Deux modes :
// « Écoute et rejoue » (Simon sonore, l'enfant REJOUE la séquence
// sur les pads-musiciens) et « La baguette magique » (séquenceur
// 8 pas × 6 animaux : l'enfant COMPOSE une vraie boucle musicale).
// ============================================================

const STORE_KEY = 'game:orchestre-des-animaux'
const COMPOS_KEY = 'game:orchestre-des-animaux:compos'

const META: GameMeta = GAMES_BY_ID.get('orchestre-des-animaux') ?? {
  id: 'orchestre-des-animaux',
  title: 'L’Orchestre des Animaux',
  tagline: 'Écoute, rejoue, compose ta musique !',
  icon: '🎵',
  island: 'ailleurs',
  accent: '#4a148c',
  skills: [REPRODUCE_SKILL, COMPOSE_SKILL],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🐸', name: 'Le petit trio', sub: '3 musiciens' },
  { emoji: '🐱', name: 'Le quatuor', sub: '4 musiciens' },
  { emoji: '🐘', name: 'Le grand orchestre', sub: '6 musiciens' },
  { emoji: '⚡', name: 'Le tempo rapide', sub: 'À toute vitesse !' },
]

/** Couleur d'accent par rangée d'animal (séquenceur) — jamais seule porteuse d'info. */
const ROW_COLORS: readonly string[] = [
  '#66bb6a', // grenouille
  '#4fc3f7', // oiseau
  '#90a4ae', // éléphant
  '#ffb74d', // chat
  '#e57373', // singe
  '#fff176', // canard
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

// ---------- Keyframes locales du jeu ----------

function OdaStyles() {
  return (
    <style>{`
@keyframes oda-twinkle {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.9; }
}
.oda-twinkle { animation: oda-twinkle 2.4s ease-in-out infinite; }
@keyframes oda-spot {
  0%, 100% { opacity: 0.12; transform: rotate(-14deg) scaleY(1); }
  50% { opacity: 0.3; transform: rotate(-8deg) scaleY(1.06); }
}
.oda-spot { animation: oda-spot 5s ease-in-out infinite; transform-origin: 50% 0%; }
@keyframes oda-bounce {
  0% { transform: scale(1) translateY(0); }
  35% { transform: scale(1.16) translateY(-10px); }
  100% { transform: scale(1) translateY(0); }
}
.oda-bounce { animation: oda-bounce 0.45s ease-out; }
@keyframes oda-head {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 0.95; }
}
.oda-head { animation: oda-head 0.5s ease-in-out infinite; }
`}</style>
  )
}

const SCENE_STARS: ReadonlyArray<{ top: string; left: string; delay: number }> = [
  { top: '6%', left: '14%', delay: 0 },
  { top: '12%', left: '34%', delay: 0.9 },
  { top: '5%', left: '58%', delay: 1.6 },
  { top: '13%', left: '82%', delay: 0.5 },
  { top: '22%', left: '68%', delay: 2.1 },
  { top: '20%', left: '8%', delay: 1.2 },
]

/** Habillage de scène : nuit, rideaux, étoiles, projecteurs. */
function ConcertScene({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-card px-3 pt-6 pb-4 shadow-card sm:px-6"
      style={{ background: 'linear-gradient(180deg, #160a2b 0%, #2a1450 55%, #3b1d63 100%)' }}
    >
      {/* Rideaux */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-4 rounded-r-2xl sm:w-7"
        style={{ background: 'linear-gradient(90deg, #7b1431 0%, #a31d42 60%, rgba(163, 29, 66, 0) 100%)' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-4 rounded-l-2xl sm:w-7"
        style={{ background: 'linear-gradient(270deg, #7b1431 0%, #a31d42 60%, rgba(163, 29, 66, 0) 100%)' }}
      />
      {/* Projecteurs */}
      <div
        aria-hidden="true"
        className="oda-spot pointer-events-none absolute -top-2 left-[18%] h-40 w-16"
        style={{ background: 'linear-gradient(180deg, rgba(255, 240, 170, 0.5), rgba(255, 240, 170, 0))' }}
      />
      <div
        aria-hidden="true"
        className="oda-spot pointer-events-none absolute -top-2 right-[18%] h-40 w-16"
        style={{
          background: 'linear-gradient(180deg, rgba(190, 225, 255, 0.45), rgba(190, 225, 255, 0))',
          animationDelay: '2.2s',
        }}
      />
      {/* Étoiles */}
      {SCENE_STARS.map((s, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="oda-twinkle absolute text-xs sm:text-sm"
          style={{ top: s.top, left: s.left, animationDelay: `${s.delay}s` }}
        >
          ⭐
        </span>
      ))}
      <div className="relative">{children}</div>
    </div>
  )
}

type Screen = 'menu' | 'play' | 'end' | 'compose'
type Phase = 'listen' | 'input' | 'success' | 'error' | 'teach'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function OrchestreDesAnimaux() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<OdaProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [sequence, setSequence] = useState<number[]>([])
  const [inputs, setInputs] = useState<number[]>([])
  const [phase, setPhase] = useState<Phase>('listen')
  const [litPad, setLitPad] = useState<number | null>(null)
  const [pressedPad, setPressedPad] = useState<number | null>(null)
  /** Indice après 2 échecs : numéros d'ordre accumulés pad par pad pendant la réécoute */
  const [teachMarks, setTeachMarks] = useState<number[][] | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  // ---- Séquenceur (baguette magique) ----
  const [grid, setGrid] = useState<Grid>(() => emptyGrid())
  const [compos, setCompos] = useState<SavedCompo[]>([])
  const [playing, setPlaying] = useState(false)
  const [playStep, setPlayStep] = useState(-1)
  const [fastTempo, setFastTempo] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [burst, setBurst] = useState(0)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio/lecture : tout changement annule la lecture en cours */
  const seqRef = useRef(0)
  /** jeton de la boucle du séquenceur, indépendant du Simon */
  const loopRef = useRef(0)
  const gridRef = useRef(grid)
  const fastRef = useRef(false)
  /** recordAttempt composer : UNE seule fois par session de composition */
  const composeRecordedRef = useRef(false)
  /** pas joués depuis la dernière édition (il faut écouter UNE mesure entière) */
  const stepsSinceEditRef = useRef(0)
  const pressTimerRef = useRef<number | null>(null)

  gridRef.current = grid
  fastRef.current = fastTempo

  // Chargement progression + galerie + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<OdaProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    void pget<SavedCompo[]>(COMPOS_KEY).then((stored) => {
      if (alive && Array.isArray(stored)) setCompos(stored)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      loopRef.current += 1
      if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current)
      stopSpeech()
    }
  }, [])

  // ---------- L'orchestre joue (ordonnanceur à jeton) ----------

  /**
   * Joue la séquence : chaque pad s'illumine et sonne en rythme.
   * `slow` : réécoute enseignante ralentie. `marks` : les numéros
   * d'ordre s'accumulent sur les pads (indice après 2 échecs).
   * Toute navigation/replay incrémente seqRef et annule la lecture.
   */
  const playSequence = useCallback(
    async (seq: readonly number[], t: TierId, opts: { slow?: boolean; marks?: boolean }) => {
      const token = ++seqRef.current
      const tempo = tempoForTier(t) * (opts.slow ? TEACH_TEMPO_FACTOR : 1)
      setLitPad(null)
      setInputs([])
      if (opts.marks) setTeachMarks(Array.from({ length: ANIMAL_COUNT }, () => []))
      await say(E(opts.slow ? 'oda.regarde-lent' : 'oda.ecoute-bien'))
      if (seqRef.current !== token) return
      await wait(350)
      for (let i = 0; i < seq.length; i++) {
        if (seqRef.current !== token) return
        const pad = seq[i]
        setLitPad(pad)
        playAnimal(ANIMALS[pad].id)
        if (opts.marks) {
          setTeachMarks((prev) =>
            prev ? prev.map((list, p) => (p === pad ? [...list, i + 1] : list)) : prev,
          )
        }
        await wait(tempo * 0.6)
        if (seqRef.current !== token) return
        setLitPad(null)
        await wait(tempo * 0.4)
      }
      if (seqRef.current !== token) return
      setPhase('input')
      void say(E('oda.a-toi'), { interrupt: false })
    },
    [],
  )

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Réécouter n'est possible qu'avant le premier tap : jamais pendant
      // la saisie (score honnête) ni pendant un feedback/enseignement.
      if (phase === 'input' && inputs.length === 0) {
        setPhase('listen')
        void playSequence(sequence, tier, { slow: false, marks: teachMarks !== null })
      }
      return
    }
    if (screen === 'compose') {
      void say(E('oda.compose.consigne'))
      return
    }
    void say(E('oda.intro'))
  }, [screen, phase, inputs.length, sequence, tier, teachMarks, playSequence])

  // ---------- Mode « Écoute et rejoue » ----------

  const startRun = (t: TierId): void => {
    stopLoop()
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateSequence(lengthFor(0), padsForTier(t))
    setTier(t)
    setSequence(first)
    setInputs([])
    setTeachMarks(null)
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('listen')
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void playSequence(first, t, { slow: false })
  }

  const flashPad = (p: number): void => {
    setPressedPad(p)
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current)
    pressTimerRef.current = window.setTimeout(() => setPressedPad(null), 240)
  }

  const onPadTap = (p: number): void => {
    if (phase !== 'input') return
    playAnimal(ANIMALS[p].id)
    flashPad(p)
    const next = [...inputs, p]
    const v = verdict(sequence, next)
    if (v === 'mistake') {
      // L'erreur enseigne : on rejouera le MÊME motif, ralenti.
      firstTryRef.current = false
      failsRef.current += 1
      seqRef.current += 1
      setPhase('error')
      void say(E('oda.presque')).then(() => setOverlay('retry'))
      return
    }
    setInputs(next)
    if (v === 'complete') {
      // Résolution de la séquence : maîtrise + Tuner, UNE seule fois.
      seqRef.current += 1
      const wasFirst = firstTryRef.current
      void recordAttempt(REPRODUCE_SKILL, wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      sfx('magic')
      void say(E('oda.bien-joue')).then(() => setOverlay('success'))
    }
  }

  /** Réécoute enseignante : même motif, ralenti ; numéros d'ordre dès 2 échecs. */
  const runTeaching = async (): Promise<void> => {
    const showMarks = failsRef.current >= 2
    setPhase('teach')
    if (showMarks) void say(E('oda.indice'), { interrupt: false })
    await playSequence(sequence, tier, { slow: true, marks: showMarks })
  }

  const advance = (): void => {
    const done = resolved + 1
    setResolved(done)
    if (done >= SEQUENCES_PER_RUN) {
      finishRun()
      return
    }
    firstTryRef.current = true
    failsRef.current = 0
    setTeachMarks(null)
    const next = generateSequence(lengthFor(tunerRef.current.level), padsForTier(tier))
    setSequence(next)
    setPhase('listen')
    void playSequence(next, tier, { slow: false })
  }

  const finishRun = (): void => {
    const stars = starsFor(firstTryCorrect, SEQUENCES_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: SEQUENCES_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, tier, stars)
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
    else if (kind === 'retry') void runTeaching()
  }

  // ---------- Mode « La baguette magique » (séquenceur) ----------

  const stopLoop = (): void => {
    loopRef.current += 1
    setPlaying(false)
    setPlayStep(-1)
  }

  const startLoop = (): void => {
    const token = ++loopRef.current
    setPlaying(true)
    const run = async (): Promise<void> => {
      let step = 0
      while (loopRef.current === token) {
        setPlayStep(step)
        const g = gridRef.current
        for (let a = 0; a < ANIMAL_COUNT; a++) {
          if (g[a][step]) playAnimal(ANIMALS[a].id)
        }
        await wait(COMPOSE_TEMPOS[fastRef.current ? 1 : 0])
        if (loopRef.current !== token) break
        stepsSinceEditRef.current += 1
        // Loi n°5 : la création n'est jamais jugée. Composer ≥ 2 animaux
        // et écouter une mesure ENTIÈRE valide la compétence, UNE fois.
        if (
          !composeRecordedRef.current &&
          stepsSinceEditRef.current >= GRID_STEPS &&
          isComposeValid(gridRef.current)
        ) {
          composeRecordedRef.current = true
          void recordAttempt(COMPOSE_SKILL, true)
          setBurst((b) => b + 1)
          sfx('fanfare')
          void say(E('oda.compose.bravo'), { interrupt: false })
        }
        step = (step + 1) % GRID_STEPS
      }
    }
    void run()
  }

  const startCompose = (): void => {
    seqRef.current += 1
    stopSpeech()
    composeRecordedRef.current = false
    stepsSinceEditRef.current = 0
    setGrid(emptyGrid())
    setGalleryOpen(false)
    setScreen('compose')
    void say(E('oda.compose.consigne'))
  }

  const onCellTap = (a: number, s: number): void => {
    const turningOn = !grid[a][s]
    setGrid(toggleCell(grid, a, s))
    stepsSinceEditRef.current = 0
    if (turningOn) {
      playAnimal(ANIMALS[a].id)
    } else {
      sfx('pop')
    }
  }

  const onRowLabelTap = (a: number): void => {
    playAnimal(ANIMALS[a].id)
    void say(E(`oda.animal.${ANIMALS[a].id}`), { interrupt: false })
  }

  const onClearGrid = (): void => {
    setGrid(emptyGrid())
    stepsSinceEditRef.current = 0
    sfx('slide')
    void say(E('oda.compose.efface'))
  }

  const onSaveCompo = (): void => {
    if (!isComposeValid(grid) || compos.length >= MAX_COMPOS) return
    const compo: SavedCompo = {
      name: nextCompoName(compos),
      grid: serializeGrid(grid),
      createdAt: Date.now(),
    }
    const list = addCompo(compos, compo)
    setCompos(list)
    void pset(COMPOS_KEY, list)
    sfx('coin')
    void say(E('oda.compose.sauvee'))
  }

  const onLoadCompo = (c: SavedCompo): void => {
    const loaded = deserializeGrid(c.grid)
    if (!loaded) return
    stopLoop()
    setGrid(loaded)
    stepsSinceEditRef.current = 0
    setGalleryOpen(false)
    sfx('pop')
  }

  const exitCompose = (): void => {
    stopLoop()
    seqRef.current += 1
    stopSpeech()
    setScreen('menu')
  }

  // ---------- Rendus ----------

  const renderPad = (p: number, size: 'lg' | 'md'): ReactNode => {
    const animal = ANIMALS[p]
    const lit = litPad === p || pressedPad === p
    const marks = teachMarks?.[p] ?? []
    const dim = size === 'lg' ? 'h-24 w-24 text-5xl' : 'h-20 w-20 text-4xl'
    return (
      <button
        key={animal.id}
        type="button"
        aria-label={animal.label}
        disabled={phase !== 'input'}
        onClick={() => onPadTap(p)}
        className={`tap-target relative flex ${dim} flex-col items-center justify-center rounded-3xl transition-transform active:scale-95 ${lit ? 'oda-bounce' : ''}`}
        style={{
          background: lit ? 'rgba(255, 213, 79, 0.95)' : 'rgba(255, 255, 255, 0.12)',
          border: lit ? '4px solid #ffd54f' : '4px solid rgba(255, 255, 255, 0.25)',
          boxShadow: lit ? '0 0 24px 6px rgba(255, 213, 79, 0.55)' : undefined,
        }}
      >
        <span aria-hidden="true">{animal.emoji}</span>
        {marks.length > 0 && (
          <span
            className="animate-pop absolute -top-2 -right-2 rounded-full px-2 py-0.5 text-sm font-extrabold text-ink"
            style={{ background: 'var(--color-sun)' }}
            aria-label={`Ordre : ${marks.join(', ')}`}
          >
            {marks.join('·')}
          </span>
        )}
      </button>
    )
  }

  /** Les pads en demi-cercle d'orchestre : rangée du fond surélevée. */
  const renderOrchestra = (): ReactNode => {
    const count = padsForTier(tier)
    const pads = Array.from({ length: count }, (_, i) => i)
    const rows: number[][] = count <= 4 ? [pads] : [pads.slice(0, 3), pads.slice(3)]
    return (
      <div className="flex flex-col items-center gap-3">
        {rows.map((row, r) => (
          <div key={r} className="flex items-end justify-center gap-3">
            {row.map((p, i) => {
              const mid = (row.length - 1) / 2
              const arc = Math.round(((i - mid) / Math.max(mid, 1)) ** 2 * 12)
              return (
                <div key={p} style={{ transform: `translateY(${rows.length > 1 && r === 0 ? arc - 8 : arc}px)` }}>
                  {renderPad(p, count <= 4 ? 'lg' : 'md')}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🎵
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('oda.intro')} autoPlay />
        </div>
        <ConcertScene>
          <div className="flex items-end justify-center gap-2 text-3xl" aria-hidden="true">
            {ANIMALS.map((a) => (
              <span key={a.id} className="animate-floaty" style={{ animationDelay: `${ANIMALS.indexOf(a) * 0.3}s` }}>
                {a.emoji}
              </span>
            ))}
          </div>
        </ConcertScene>
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute l’orchestre et rejoue sa musique !
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
                  void say(E(`oda.niveau.${t}`))
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
          Jouer ! 🎶
        </BigButton>
        <button
          type="button"
          onClick={startCompose}
          className="tap-target card flex w-full max-w-xs items-center justify-center gap-3 p-3 transition-transform active:scale-95"
          style={{ border: `3px dashed ${ACCENT}` }}
        >
          <span aria-hidden="true" className="text-3xl">🪄</span>
          <span className="text-lg font-extrabold" style={{ color: ACCENT }}>
            La baguette magique
          </span>
        </button>
      </div>
    )
  }

  const renderPlay = (): ReactNode => {
    const statusText =
      phase === 'input'
        ? 'À toi ! Tape les musiciens dans l’ordre.'
        : phase === 'teach'
          ? 'Regarde bien, tout doucement…'
          : 'Écoute bien l’orchestre…'
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-3 pb-6">
        <p aria-live="polite" className="text-center text-lg font-extrabold text-ink sm:text-xl">
          {statusText}
        </p>
        <ConcertScene>
          {renderOrchestra()}
          {/* Compteur de notes rejouées (jamais d'info par la couleur seule) */}
          <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
            {sequence.map((_, i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-full"
                style={{
                  background: i < inputs.length ? 'var(--color-sun)' : 'rgba(255, 255, 255, 0.3)',
                }}
              />
            ))}
          </div>
        </ConcertScene>
      </div>
    )
  }

  const renderCompose = (): ReactNode => {
    const valid = isComposeValid(grid)
    const galleryFull = compos.length >= MAX_COMPOS
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 px-2 pt-3 pb-6">
        <div className="flex w-full items-center justify-between px-2">
          <button
            type="button"
            onClick={exitCompose}
            className="tap-target card flex items-center gap-2 px-4 py-2 text-base font-extrabold text-ink active:scale-95"
          >
            ← Orchestre
          </button>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-2xl">🪄</span>
            <SpeakerButton entry={E('oda.compose.consigne')} />
          </div>
        </div>

        <ConcertScene>
          <div className="overflow-x-auto pb-1">
            <div className="mx-auto flex w-fit flex-col gap-1.5">
              {ANIMALS.map((animal, a) => (
                <div key={animal.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`${animal.label} : écouter son instrument`}
                    onClick={() => onRowLabelTap(a)}
                    className="tap-target flex h-9 w-10 items-center justify-center rounded-xl text-2xl transition-transform active:scale-90 sm:h-12 sm:w-12"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    <span aria-hidden="true">{animal.emoji}</span>
                  </button>
                  {Array.from({ length: GRID_STEPS }, (_, s) => {
                    const on = grid[a][s]
                    const isHead = playStep === s
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${animal.label}, temps ${s + 1}`}
                        onClick={() => onCellTap(a, s)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition-transform active:scale-90 sm:h-12 sm:w-12 sm:text-xl ${isHead && on ? 'oda-bounce' : ''}`}
                        style={{
                          background: on ? ROW_COLORS[a] : 'rgba(255, 255, 255, 0.12)',
                          border: isHead
                            ? '3px solid #ffd54f'
                            : on
                              ? '3px solid rgba(255, 255, 255, 0.7)'
                              : '3px solid rgba(255, 255, 255, 0.2)',
                          boxShadow: isHead && on ? '0 0 14px 3px rgba(255, 213, 79, 0.6)' : undefined,
                        }}
                      >
                        <span aria-hidden="true">{on ? animal.emoji : ''}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              {/* La tête de lecture balaie les 8 pas */}
              <div className="ml-[46px] flex gap-1.5 sm:ml-[54px]" aria-hidden="true">
                {Array.from({ length: GRID_STEPS }, (_, s) => (
                  <span
                    key={s}
                    className={`flex h-4 w-9 items-start justify-center sm:w-12 ${playStep === s ? 'oda-head' : ''}`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: playStep === s ? '#ffd54f' : 'rgba(255, 255, 255, 0.25)',
                      }}
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </ConcertScene>

        <div className="flex w-full max-w-md items-center justify-center gap-2">
          <BigButton
            variant="accent"
            accent={ACCENT}
            className="flex-1 text-xl"
            onClick={() => (playing ? stopLoop() : startLoop())}
          >
            {playing ? '⏸ Pause' : '▶️ Joue !'}
          </BigButton>
          <button
            type="button"
            aria-label={fastTempo ? 'Tempo rapide (activé)' : 'Tempo doux (activé)'}
            onClick={() => {
              sfx('tap')
              setFastTempo((f) => !f)
            }}
            className="tap-target card flex h-16 w-16 items-center justify-center text-3xl active:scale-95"
          >
            <span aria-hidden="true">{fastTempo ? '🐇' : '🐢'}</span>
          </button>
        </div>

        <div className="flex w-full max-w-md items-center justify-center gap-2">
          <button
            type="button"
            onClick={onClearGrid}
            className="tap-target card flex-1 px-3 py-3 text-base font-extrabold text-ink active:scale-95"
          >
            🧹 Effacer
          </button>
          <button
            type="button"
            disabled={!valid || galleryFull}
            onClick={onSaveCompo}
            className={`tap-target card flex-1 px-3 py-3 text-base font-extrabold text-ink active:scale-95 ${!valid || galleryFull ? 'opacity-40' : ''}`}
          >
            💾 Garder
          </button>
          <button
            type="button"
            onClick={() => {
              sfx('tap')
              setGalleryOpen((o) => !o)
              if (!galleryOpen && compos.length > 0) void say(E('oda.galerie'))
            }}
            className="tap-target card flex-1 px-3 py-3 text-base font-extrabold text-ink active:scale-95"
          >
            🎼 Galerie{compos.length > 0 ? ` (${compos.length})` : ''}
          </button>
        </div>

        {galleryOpen && (
          <div className="card w-full max-w-md p-3">
            {compos.length === 0 ? (
              <p className="text-center text-base font-semibold text-ink-soft">
                Garde une musique pour la retrouver ici !
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {compos.map((c) => (
                  <button
                    key={`${c.name}-${c.createdAt}`}
                    type="button"
                    onClick={() => onLoadCompo(c)}
                    className="tap-target flex items-center justify-between rounded-xl px-4 py-2.5 text-left text-base font-extrabold text-ink active:scale-95"
                    style={{ background: 'var(--color-paper, #f6f1e3)', border: `2px solid ${ACCENT}33` }}
                  >
                    <span>🎵 {c.name}</span>
                    <span aria-hidden="true">▶️</span>
                  </button>
                ))}
                {galleryFull && (
                  <p className="text-center text-xs font-semibold text-ink-soft">
                    La galerie est pleine (10 musiques) !
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <ConfettiBurst burst={burst} />
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={SEQUENCES_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      <OdaStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && renderPlay()}
      {screen === 'compose' && renderCompose()}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouvelle scène débloquée !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
