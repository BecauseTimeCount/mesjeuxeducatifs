import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { numberEntry } from '@/content/numbers'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx, stopSpeech } from '@/engine/audio'
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
  FRESH_PROGRESS,
  generateItem,
  guessFromPosition,
  hintZone,
  isHit,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  snapFor,
  starsFor,
  teachingMarks,
  tickValues,
  TIER_SKILLS,
  toleranceFor,
} from './logic'
import type { RluItem, RluProgress, TierId } from './logic'

// ============================================================
// La Rivière aux Lucioles — estimation sur la droite numérique.
// La rivière EST la droite : l'enfant tape l'endroit où poser
// la luciole, ajuste librement, puis confirme. Zéro QCM.
// ============================================================

const STORE_KEY = 'game:riviere-aux-lucioles'

const META: GameMeta = GAMES_BY_ID.get('riviere-aux-lucioles') ?? {
  id: 'riviere-aux-lucioles',
  title: 'La Rivière aux Lucioles',
  tagline: 'Pose la luciole au bon endroit !',
  icon: '✨',
  island: 'nombres',
  accent: '#00acc1',
  skills: ['ma.gs.droite10', 'ma.cp.num.droite'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🌿', name: 'Le ruisseau', sub: 'De 0 à 10' },
  { emoji: '🌾', name: 'La rivière', sub: 'De 0 à 20' },
  { emoji: '🌊', name: 'Le grand fleuve', sub: 'De 0 à 100' },
  { emoji: '🌌', name: 'La grande estimation', sub: 'Presque sans repères' },
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

function RluStyles() {
  return (
    <style>{`
@keyframes rlu-blink {
  0%, 100% { filter: drop-shadow(0 0 3px rgba(255, 230, 130, 0.9)); transform: scale(1); }
  50% { filter: drop-shadow(0 0 14px rgba(255, 230, 130, 1)); transform: scale(1.12); }
}
.rlu-blink { animation: rlu-blink 1.1s ease-in-out infinite; }
@keyframes rlu-twinkle {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.9; }
}
.rlu-twinkle { animation: rlu-twinkle 2.6s ease-in-out infinite; }
@keyframes rlu-halo {
  0%, 100% { background: rgba(255, 201, 77, 0.16); box-shadow: 0 0 0 0 rgba(255, 201, 77, 0.2); }
  50% { background: rgba(255, 201, 77, 0.4); box-shadow: 0 0 18px 4px rgba(255, 201, 77, 0.45); }
}
.rlu-halo { animation: rlu-halo 1.5s ease-in-out infinite; }
@keyframes rlu-beam {
  0% { opacity: 0; transform: scaleY(0.3); }
  100% { opacity: 1; transform: scaleY(1); }
}
.rlu-beam { animation: rlu-beam 0.35s ease-out both; transform-origin: 50% 0%; }
`}</style>
  )
}

// ---------- Petits éléments de scène ----------

/** La lanterne porte-nombre de la luciole : double codage écrit + audio. */
function FireflyLantern({ value }: { value: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center" role="img" aria-label={`La luciole porte le nombre ${value}`}>
      <span aria-hidden="true" className="rlu-blink text-2xl leading-none">✨</span>
      <div
        className="mt-0.5 flex h-16 min-w-16 items-center justify-center rounded-2xl px-3 text-4xl font-extrabold text-ink shadow-card"
        style={{ background: 'var(--color-sun)', border: '4px solid var(--color-sun-deep)' }}
      >
        {value}
      </div>
    </div>
  )
}

const SCENE_STARS: ReadonlyArray<{ top: string; left: string; delay: number }> = [
  { top: '8%', left: '12%', delay: 0 },
  { top: '14%', left: '38%', delay: 0.8 },
  { top: '6%', left: '62%', delay: 1.5 },
  { top: '16%', left: '85%', delay: 0.4 },
  { top: '30%', left: '74%', delay: 2 },
  { top: '26%', left: '24%', delay: 1.1 },
]

type Screen = 'menu' | 'play' | 'end'
type Phase = 'aim' | 'success' | 'error' | 'teach'

interface Placed {
  /** position visuelle sur la rivière, 0..1 (aimantée à T0/T1) */
  fraction: number
  /** valeur entière retenue pour la validation */
  value: number
}

interface TeachState {
  guessFraction: number
}

const TRAIL_SPARKS = 6

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function RiviereAuxLucioles() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<RluProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<RluItem | null>(null)
  const [tolerance, setTolerance] = useState(0)
  const [placed, setPlaced] = useState<Placed | null>(null)
  const [lanterns, setLanterns] = useState<number[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('aim')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [teach, setTeach] = useState<TeachState | null>(null)
  const [revealTarget, setRevealTarget] = useState(false)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const usedTargetsRef = useRef<number[]>([])
  const trackRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  /** le conseil « appuie sur c'est là » n'est donné qu'une fois */
  const confirmHintRef = useRef(false)
  /** promesse de la consigne en cours : le conseil s'enchaîne APRÈS elle */
  const consignePromiseRef = useRef<Promise<void>>(Promise.resolve())

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<RluProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    // Les nombres sont préchargés item par item : tout précharger d'un coup
    // déborderait le cache LRU Howler (~30 entrées) et évincerait les clips rlu.*.
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: RluItem): Promise<void> => {
    const seq = ++seqRef.current
    await say(E('rlu.consigne.pose'))
    if (seqRef.current !== seq) return
    await say(numberEntry(it.target), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Verrou anti soft-lock : réécouter n'est possible qu'en phase de visée.
      // Pendant un feedback ou l'enseignement, le bouton est un no-op — il ne
      // doit jamais pouvoir invalider la séquence audio en cours.
      if (item && phase === 'aim') consignePromiseRef.current = speakConsigne(item)
      return
    }
    void say(E('rlu.intro'))
  }, [screen, item, phase, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    usedTargetsRef.current = []
    const first = generateItem(t, [])
    usedTargetsRef.current.push(first.target)
    preloadClips([`nombre.${first.target}`])
    setTier(t)
    setItem(first)
    setTolerance(toleranceFor(t, 0))
    setPlaced(null)
    setLanterns([])
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('aim')
    setOverlay(null)
    setHint(false)
    setTeach(null)
    setRevealTarget(false)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    consignePromiseRef.current = speakConsigne(first)
  }

  // ---------- Poser / ajuster la luciole ----------

  const placeAt = (clientX: number): void => {
    const el = trackRef.current
    if (!el || !item) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    const value = guessFromPosition(x, rect.width, item.tier)
    const fraction = snapFor(item.tier) !== null ? value / item.max : x / rect.width
    setPlaced({ fraction, value })
  }

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!item || phase !== 'aim') return
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    sfx('pop')
    placeAt(e.clientX)
    if (!confirmHintRef.current) {
      confirmHintRef.current = true
      // Le conseil attend la FIN de la consigne (jamais deux voix en même
      // temps) et s'abandonne si une autre séquence a démarré entre-temps.
      const seq = seqRef.current
      void consignePromiseRef.current.then(() => {
        if (seqRef.current !== seq) return
        void say(E('rlu.confirme'), { interrupt: false })
      })
    }
  }

  const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    // Bonus : glisser pour ajuster (le tap reste l'interaction principale)
    if (draggingRef.current && phase === 'aim') placeAt(e.clientX)
  }

  const stopDragging = (): void => {
    draggingRef.current = false
  }

  // ---------- Confirmation : « C'est là ! » ----------

  const onConfirm = (): void => {
    if (!item || !placed || phase !== 'aim') return
    // Invalide la consigne en cours : le verdict ne doit jamais être chevauché.
    seqRef.current += 1

    if (isHit(item.target, placed.value, tolerance)) {
      // Résolution de l'item : maîtrise + Tuner, UNE seule fois.
      const wasFirst = firstTryRef.current
      void recordAttempt(TIER_SKILLS[item.tier], wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      setRevealTarget(true)
      setLanterns((ls) => [...ls, item.target])
      sfx('magic')
      // L'overlay attend la fin du clip (plus de troncature) et arrive
      // INCONDITIONNELLEMENT : say() résout toujours, même interrompu.
      void say(E('rlu.bien-vise')).then(() => setOverlay('success'))
      return
    }

    // Trop loin : la luciole frissonne, puis l'enseignement montre la vérité.
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    void say(E('rlu.trop-loin')).then(() => setOverlay('retry'))
  }

  /** Feedback élaboratif : la vraie position s'allume, traînée de lucioles,
   *  nombres-clés révélés, puis nouvel essai sur le MÊME nombre. */
  const runTeaching = async (): Promise<void> => {
    if (!item || !placed) return
    const seq = ++seqRef.current
    setPhase('teach')
    setTeach({ guessFraction: placed.fraction })
    setRevealTarget(true)
    sfx('magic')
    try {
      await say(E('rlu.regarde'))
      if (seqRef.current !== seq) return
      if (item.tier === 3) {
        await say(E('rlu.milieu'), { interrupt: false })
        if (seqRef.current !== seq) return
      }
      await say(numberEntry(item.target), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('rlu.est-ici'), { interrupt: false })
      if (seqRef.current !== seq) return
      await wait(700)
    } finally {
      // Restauration INCONDITIONNELLE (anti soft-lock) : le jeton seq
      // n'annule que la suite audio, jamais le retour en phase de visée.
      setTeach(null)
      setRevealTarget(false)
      setPlaced(null)
      setPhase('aim')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      void say(E('rlu.indice'), { interrupt: false })
    }
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    const next = generateItem(item.tier, usedTargetsRef.current)
    usedTargetsRef.current.push(next.target)
    preloadClips([`nombre.${next.target}`])
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setTeach(null)
    setRevealTarget(false)
    setPlaced(null)
    setTolerance(toleranceFor(item.tier, tunerRef.current.level))
    setPhase('aim')
    setItem(next)
    consignePromiseRef.current = speakConsigne(next)
  }

  const finishRun = (): void => {
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
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') advance()
    else if (kind === 'retry') void runTeaching()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            ✨
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('rlu.intro')} autoPlay />
        </div>
        <div
          className="relative flex h-24 w-full max-w-sm items-center justify-center overflow-hidden rounded-card shadow-card"
          style={{ background: 'linear-gradient(180deg, #141d3f 0%, #1d2c5e 60%, #14454f 100%)' }}
          aria-hidden="true"
        >
          <span className="rlu-twinkle absolute top-2 left-6 text-sm">⭐</span>
          <span className="rlu-twinkle absolute top-4 right-10 text-xs" style={{ animationDelay: '1s' }}>⭐</span>
          <span className="absolute bottom-1 left-2 text-2xl">🌾</span>
          <span className="absolute bottom-1 right-2 text-2xl">🌾</span>
          <span className="rlu-blink text-4xl">✨</span>
          <span className="ml-3 text-3xl">🏮</span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Pose la luciole au bon endroit de la rivière !
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
                  void say(E(`rlu.niveau.${t}`))
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

  const renderRiver = (it: RluItem): ReactNode => {
    const pct = (v: number): string => `${(v / it.max) * 100}%`
    const targetFraction = it.target / it.max
    const ticks = tickValues(it.tier)
    const marks = teachingMarks(it.tier)
    const [haloLo, haloHi] = hintZone(it.target, tolerance, it.max)
    const snap = snapFor(it.tier)

    return (
      <div
        className="relative w-full overflow-hidden rounded-card px-8 pt-2 pb-1 shadow-card sm:px-10"
        style={{ background: 'linear-gradient(180deg, #141d3f 0%, #1d2c5e 55%, #14454f 100%)' }}
      >
        {/* Ciel étoilé + roseaux */}
        {SCENE_STARS.map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="rlu-twinkle absolute text-xs sm:text-sm"
            style={{ top: s.top, left: s.left, animationDelay: `${s.delay}s` }}
          >
            ⭐
          </span>
        ))}
        <span aria-hidden="true" className="absolute bottom-0 left-1 text-2xl sm:text-3xl">🌾</span>
        <span aria-hidden="true" className="absolute right-1 bottom-0 text-2xl sm:text-3xl">🌾</span>

        <div className="relative mx-1">
          {/* La berge : les lanternes s'accumulent, la rivière s'illumine */}
          <div className="relative h-9 w-full" aria-hidden="true">
            {lanterns.map((v, i) => (
              <span
                key={`${v}-${i}`}
                className="animate-bounce-in absolute bottom-0 -translate-x-1/2 text-2xl"
                style={{ left: pct(v) }}
              >
                🏮
              </span>
            ))}
          </div>

          {/* La rivière = la droite numérique (toute la bande est tappable) */}
          <div
            ref={trackRef}
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            role="application"
            aria-label={`La rivière des nombres, de zéro à ${it.max}. Tape un endroit pour poser la luciole.`}
            className="relative h-28 w-full touch-none rounded-2xl"
            style={{
              background:
                'linear-gradient(180deg, rgba(0, 172, 193, 0.5) 0%, rgba(16, 84, 100, 0.85) 100%)',
              boxShadow: 'inset 0 3px 10px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* Indice après 2 échecs : la zone correcte ondule */}
            {hint && phase === 'aim' && (
              <div
                aria-hidden="true"
                className="rlu-halo absolute inset-y-1 rounded-xl"
                style={{ left: pct(haloLo), width: `${((haloHi - haloLo) / it.max) * 100}%` }}
              />
            )}

            {/* Graduations-galets */}
            {ticks.map((t) => (
              <span
                key={t.value}
                aria-hidden="true"
                className="absolute bottom-1.5 -translate-x-1/2 rounded-full"
                style={{
                  left: pct(t.value),
                  width: t.labeled ? 8 : 5,
                  height: t.labeled ? 16 : 10,
                  background: t.labeled ? 'rgba(231, 224, 200, 0.95)' : 'rgba(231, 224, 200, 0.55)',
                }}
              />
            ))}

            {/* Enseignement : les graduations intermédiaires s'allument */}
            {teach &&
              marks.map((v) => (
                <span
                  key={`m-${v}`}
                  aria-hidden="true"
                  className="animate-pop absolute bottom-1.5 -translate-x-1/2 rounded-full"
                  style={{
                    left: pct(v),
                    width: 8,
                    height: 20,
                    background: 'var(--color-sun)',
                  }}
                />
              ))}

            {/* Rochers 0 et max */}
            <span aria-hidden="true" className="absolute bottom-1 left-0 -translate-x-1/2 text-2xl">🪨</span>
            <span aria-hidden="true" className="absolute right-0 bottom-1 translate-x-1/2 text-2xl">🪨</span>

            {/* La vraie position s'allume (réussite ou enseignement) */}
            {revealTarget && (
              <div
                className="absolute inset-y-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: pct(it.target) }}
              >
                <span
                  className="animate-pop z-10 rounded-full px-2 py-0.5 text-lg font-extrabold text-ink"
                  style={{ background: 'var(--color-sun)' }}
                >
                  {it.target}
                </span>
                <span
                  aria-hidden="true"
                  className="rlu-beam w-1.5 flex-1 rounded-full"
                  style={{ background: 'rgba(255, 201, 77, 0.85)' }}
                />
              </div>
            )}

            {/* Traînée de lucioles : de l'essai vers la vérité */}
            {teach &&
              Array.from({ length: TRAIL_SPARKS }, (_, i) => {
                const f =
                  teach.guessFraction +
                  ((targetFraction - teach.guessFraction) * (i + 1)) / (TRAIL_SPARKS + 1)
                return (
                  <span
                    key={`spark-${i}`}
                    aria-hidden="true"
                    className="animate-pop absolute top-1/3 -translate-x-1/2 text-sm"
                    style={{ left: `${f * 100}%`, animationDelay: `${i * 0.12}s` }}
                  >
                    ✨
                  </span>
                )
              })}

            {/* La luciole posée, qui clignote */}
            {placed && (
              <div
                className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${phase === 'error' ? 'animate-shake-soft' : ''}`}
                style={{ left: `${placed.fraction * 100}%`, top: '42%', transition: 'left 0.25s ease-out' }}
                role="img"
                aria-label={
                  snap !== null ? `Luciole posée sur ${placed.value}` : 'Luciole posée sur la rivière'
                }
              >
                <span aria-hidden="true" className="rlu-blink text-3xl leading-none">✨</span>
                {snap !== null && (
                  <span
                    className="mt-0.5 rounded-full bg-white px-2 text-base leading-snug font-extrabold text-ink"
                    aria-hidden="true"
                  >
                    {placed.value}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Étiquettes des nombres-repères */}
          <div className="relative h-7 w-full">
            {(teach ? marks.map((v) => ({ value: v, labeled: true })) : ticks.filter((t) => t.labeled)).map(
              (t) => (
                <span
                  key={`lbl-${t.value}`}
                  className={`absolute top-0.5 -translate-x-1/2 text-xs font-extrabold sm:text-sm ${teach ? 'animate-pop' : ''}`}
                  style={{ left: pct(t.value), color: teach ? 'var(--color-sun)' : 'rgba(255, 255, 255, 0.9)' }}
                >
                  {t.value}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderPlay = (it: RluItem): ReactNode => {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-3 pb-6">
        {/* Consigne + lanterne porte-nombre (double codage écrit + audio) */}
        <div className="flex items-center justify-center gap-4">
          <FireflyLantern value={it.target} />
          <p className="max-w-56 text-center text-lg font-extrabold text-ink sm:max-w-none sm:text-xl">
            Pose la luciole vers <span style={{ color: ACCENT }}>{it.target}</span> !
          </p>
        </div>

        {renderRiver(it)}

        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-2xl"
          disabled={!placed || phase !== 'aim'}
          onClick={onConfirm}
        >
          C’est là ! 🏮
        </BigButton>
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      <RluStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouvelle rivière débloquée !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
