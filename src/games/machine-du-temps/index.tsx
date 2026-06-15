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
  applyRun,
  avoidKey,
  ERA_INFO,
  eraOf,
  FRESH_PROGRESS,
  GENERATIONS_BY_ID,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  OBJECTS_BY_ID,
  sortCorrect,
  starsFor,
  stepOutcome,
  TIER_SKILLS,
} from './logic'
import type { Era, MdtProgress, OrderItem, SortItem, TierId, TimeItem } from './logic'

// ============================================================
// La Machine à Remonter le Temps — l'enfant range les objets dans
// le temps (autrefois / aujourd'hui, T0/T1) puis ordonne les
// générations du plus jeune au plus âgé (T2/T3). « Se situer dans
// le temps » (Questionner le monde, CP). Zéro QCM, l'erreur
// enseigne, jamais le mot « faux ».
// ============================================================

const STORE_KEY = 'game:machine-du-temps'

const META: GameMeta = GAMES_BY_ID.get('machine-du-temps') ?? {
  id: 'machine-du-temps',
  title: 'La Machine à Remonter le Temps',
  tagline: 'Autrefois ou aujourd’hui ? Range le temps !',
  icon: '⏳',
  island: 'monde',
  accent: '#a98467',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🕰️', name: 'Autrefois ou aujourd’hui', sub: 'Les objets faciles' },
  { emoji: '✨', name: 'Encore le temps', sub: 'Tous les objets' },
  { emoji: '👶', name: 'Les générations', sub: 'Range-en 3' },
  { emoji: '👴', name: 'Toute la famille', sub: 'Range-en 4' },
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

// ---------- Helpers d'affichage ----------

function consigneText(it: TimeItem): string {
  if (it.kind === 'sort') {
    const name = OBJECTS_BY_ID.get(it.objectId)?.name ?? ''
    return `${name} : autrefois, ou aujourd'hui ?`
  }
  return 'Range-les du plus jeune au plus âgé !'
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function MachineDuTemps() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<MdtProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<TimeItem | null>(null)
  /** Index courant dans la séquence à ordonner (mode order). */
  const [orderIndex, setOrderIndex] = useState(0)
  /** Tuile qui vient d'être correctement posée (animation). */
  const [wrongId, setWrongId] = useState<string | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [mood, setMood] = useState<'idle' | 'happy' | 'shake'>('idle')
  const [animKey, setAnimKey] = useState(0)
  const [hint, setHint] = useState(false)
  const [burst, setBurst] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const wrongTimerRef = useRef(0)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<MdtProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(wrongTimerRef.current)
      stopSpeech()
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: TimeItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.kind === 'sort') {
      await say(E(`mdt.o.${it.objectId}`))
      if (seqRef.current !== seq) return
      await say(E('mdt.consigne.sort'), { interrupt: false })
      return
    }
    await say(E('mdt.consigne.order'))
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item) void speakConsigne(item)
    else void say(E('mdt.intro'))
  }, [screen, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setOrderIndex(0)
    setWrongId(null)
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setMood('idle')
    setHint(false)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first)
  }

  /** Résolution réussie d'un item : maîtrise + Tuner, UNE seule fois. */
  const resolveSuccess = (it: TimeItem, successClip: string): void => {
    seqRef.current += 1
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setMood('happy')
    setAnimKey((k) => k + 1)
    sfx('magic')
    setBurst((b) => b + 1)
    void say(E(successClip))
    window.setTimeout(() => setOverlay('success'), 700)
  }

  /** Un essai raté : firstTry tombe, le compteur d'erreurs monte. */
  const registerFail = (reactionClip: string, badId?: string): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setMood('shake')
    setAnimKey((k) => k + 1)
    sfx('wrong')
    if (badId !== undefined) {
      setWrongId(badId)
      window.clearTimeout(wrongTimerRef.current)
      wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    }
    setOverlay('retry')
    void say(E(reactionClip))
  }

  // ---------- Trier dans le temps (T0/T1) ----------

  const onTapEra = (it: SortItem, era: Era): void => {
    if (phase !== 'idle') return
    sfx('tap')
    if (sortCorrect(it, era)) {
      resolveSuccess(it, 'mdt.bravo.sort')
      return
    }
    registerFail('mdt.refus.sort')
  }

  // ---------- Ordonner les générations (T2/T3) ----------

  const onTapGeneration = (it: OrderItem, genId: string): void => {
    if (phase !== 'idle') return
    if (orderIndex >= it.expected.length) return
    const outcome = stepOutcome(it.expected, orderIndex, genId)
    if (outcome === 'progress') {
      sfx('coin')
      setOrderIndex((i) => i + 1)
      return
    }
    if (outcome === 'complete') {
      setOrderIndex(it.expected.length)
      resolveSuccess(it, 'mdt.bravo.order')
      return
    }
    // Mauvais ordre : l'erreur enseigne, on reprend la séquence depuis le début.
    setOrderIndex(0)
    registerFail('mdt.refus.order', genId)
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on explique l'époque/le bon départ, puis indice après 2 échecs. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setMood('idle')
    if (item.kind === 'sort') {
      await say(E(eraOf(item.objectId) === 'autrefois' ? 'mdt.explique.autrefois' : 'mdt.explique.aujourdhui'))
    } else {
      const youngest = GENERATIONS_BY_ID.get(item.expected[0])?.name ?? ''
      await say({ id: 'mdt.explique.order', text: `Le plus jeune, c'est ${youngest}. On commence toujours par lui.` })
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      await say(E(item.kind === 'sort' ? 'mdt.indice.sort' : 'mdt.indice.order'), {
        interrupt: false,
      })
    }
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun(item.tier)
      return
    }
    const next = generateItem(item.tier, tunerRef.current.level, avoidKey(item))
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setMood('idle')
    setPhase('idle')
    setOrderIndex(0)
    setWrongId(null)
    setItem(next)
    void speakConsigne(next)
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
    else if (kind === 'retry') void runTeaching()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            ⏳
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('mdt.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🕰️⏳✨
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Range chaque chose à sa place dans le temps !
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
                  void say(E(`mdt.niveau.${t}`))
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

  // — Trier l'objet (T0/T1) : l'objet flotte, deux coffres en dessous —
  const renderSort = (it: SortItem): ReactNode => {
    const object = OBJECTS_BY_ID.get(it.objectId)
    const anim = mood === 'happy' || mood === 'shake' ? 'animate-wiggle' : 'animate-floaty'
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-5">
        <span
          key={animKey}
          className={`text-8xl leading-none ${anim}`}
          role="img"
          aria-label={object?.name}
        >
          {object?.emoji}
        </span>
        <div className="grid w-full grid-cols-2 gap-3">
          {it.eras.map((era) => {
            const info = ERA_INFO[era]
            const glow = hint && era === eraOf(it.objectId)
            return (
              <button
                key={era}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapEra(it, era)}
                aria-label={info.label}
                className={`tap-target card flex flex-col items-center justify-center gap-1 py-5 transition-transform active:scale-95 ${glow ? 'animate-pulse-glow' : ''}`}
                style={glow ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span className="text-5xl leading-none" aria-hidden="true">
                  {info.emoji}
                </span>
                <span className="text-base font-extrabold text-ink">{info.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // — Ordonner les générations (T2/T3) : tap successif, du plus jeune au plus âgé —
  const renderOrder = (it: OrderItem): ReactNode => {
    const placed = it.expected.slice(0, orderIndex)
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-5">
        {/* Le ruban du temps : les générations posées, dans l'ordre */}
        <div
          className="flex min-h-20 w-full flex-wrap items-center justify-center gap-2 rounded-2xl bg-white/60 px-3 py-3"
          aria-label="Le ruban du temps"
        >
          <span aria-hidden="true" className="text-2xl">
            👶
          </span>
          {placed.length === 0 ? (
            <span className="text-sm font-semibold text-ink-soft">
              Commence par le plus jeune…
            </span>
          ) : (
            placed.map((id, i) => {
              const g = GENERATIONS_BY_ID.get(id)
              return (
                <span
                  key={id}
                  className="animate-bounce-in flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold text-ink"
                >
                  <span className="text-ink-soft">{i + 1}.</span>
                  <span aria-hidden="true" className="text-2xl">
                    {g?.emoji}
                  </span>
                  {g?.name}
                </span>
              )
            })
          )}
          <span aria-hidden="true" className="text-2xl">
            👴
          </span>
        </div>
        {/* Les générations à poser */}
        <div
          className={`grid w-full gap-3 ${it.expected.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}
        >
          {it.tiles.map((id) => {
            const g = GENERATIONS_BY_ID.get(id)
            const done = placed.includes(id)
            const isWrong = wrongId === id
            const glow = hint && phase === 'idle' && it.expected[orderIndex] === id
            return (
              <button
                key={id}
                type="button"
                disabled={phase !== 'idle' || done}
                onClick={() => onTapGeneration(it, id)}
                aria-label={g?.name}
                className={`tap-target card flex flex-col items-center justify-center gap-1 py-4 transition-transform active:scale-90 ${isWrong ? 'animate-shake-soft' : ''} ${glow ? 'animate-pulse-glow' : ''} ${done ? 'opacity-40' : ''}`}
                style={glow ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span className="text-5xl leading-none" aria-hidden="true">
                  {g?.emoji}
                </span>
                <span className="text-sm font-extrabold text-ink">{g?.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderPlay = (it: TimeItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-5 px-3 pb-6">
      <p className="text-center text-lg font-extrabold text-ink">{consigneText(it)}</p>
      {it.kind === 'sort' ? renderSort(it) : renderOrder(it)}
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
              🔓 Nouveau voyage dans le temps débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <ConfettiBurst burst={burst} />
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
