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
  ANIMALS_BY_ID,
  applyRun,
  FOODS_BY_ID,
  feedComplete,
  FRESH_PROGRESS,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  regimeOf,
  sortCorrect,
  starsFor,
  TIER_SKILLS,
  accepts,
} from './logic'
import type { CantineItem, CdfProgress, Regime, TierId } from './logic'

// ============================================================
// La Cantine de la Forêt — l'enfant sert à chaque animal ce qu'il
// aime (nourrir, T0/T1) puis range l'animal dans sa famille
// (trier, T2/T3). « Questionner le monde du vivant » : régimes
// alimentaires herbivore / carnivore / omnivore. Zéro QCM.
// ============================================================

const STORE_KEY = 'game:cantine-foret'

const META: GameMeta = GAMES_BY_ID.get('cantine-foret') ?? {
  id: 'cantine-foret',
  title: 'La Cantine de la Forêt',
  tagline: 'Sers le bon repas à chaque animal !',
  icon: '🍽️',
  island: 'monde',
  accent: '#2e9e5b',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🌿', name: 'Les herbivores', sub: 'Qui mangent des plantes' },
  { emoji: '🥩', name: 'Carnivores aussi', sub: 'À chacun son repas' },
  { emoji: '🏷️', name: 'Le grand tri', sub: '2 familles' },
  { emoji: '🐻', name: 'Tous au menu', sub: '3 familles' },
]

const REGIME_INFO: Readonly<Record<Regime, { label: string; emoji: string }>> = {
  herbivore: { label: 'Herbivore', emoji: '🥬' },
  carnivore: { label: 'Carnivore', emoji: '🥩' },
  omnivore: { label: 'Omnivore', emoji: '🍽️' },
}

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

// ---------- Petits helpers d'affichage ----------

function instructionText(it: CantineItem): string {
  const name = ANIMALS_BY_ID.get(it.animalId)?.name ?? ''
  if (it.kind === 'feed') return `${name} a faim ! Donne-lui ce qu'il aime.`
  return `Dans quelle famille ranger ${name.toLowerCase()} ?`
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function CantineForet() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<CdfProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<CantineItem | null>(null)
  const [served, setServed] = useState<string[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [mood, setMood] = useState<'idle' | 'happy' | 'shake'>('idle')
  const [animKey, setAnimKey] = useState(0)
  const [hint, setHint] = useState(false)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<CdfProgress>(STORE_KEY).then((stored) => {
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

  const speakConsigne = useCallback(async (it: CantineItem): Promise<void> => {
    const seq = ++seqRef.current
    await say(E(`cdf.a.${it.animalId}`))
    if (seqRef.current !== seq) return
    if (it.kind === 'feed') {
      await say(E('cdf.consigne.feed'), { interrupt: false })
      return
    }
    await say(E(it.zones.length === 3 ? 'cdf.consigne.sort3' : 'cdf.consigne.sort2'), {
      interrupt: false,
    })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item) void speakConsigne(item)
    else void say(E('cdf.intro'))
  }, [screen, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setServed([])
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
  const resolveSuccess = (it: CantineItem, successClip: string): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setMood('happy')
    setAnimKey((k) => k + 1)
    sfx('magic')
    void say(E(successClip))
    window.setTimeout(() => setOverlay('success'), 700)
  }

  /** Un essai raté : firstTry tombe, le compteur d'erreurs monte. */
  const registerFail = (reactionClip: string): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setMood('shake')
    setAnimKey((k) => k + 1)
    sfx('wrong')
    setOverlay('retry')
    void say(E(reactionClip))
  }

  // ---------- Nourrir (T0/T1) ----------

  const onTapFood = (foodId: string): void => {
    if (!item || item.kind !== 'feed' || phase !== 'idle') return
    if (served.includes(foodId)) return

    if (accepts(item.animalId, foodId)) {
      sfx('pop')
      const next = [...served, foodId]
      setServed(next)
      setMood('happy')
      setAnimKey((k) => k + 1)
      if (feedComplete(item, next)) resolveSuccess(item, 'cdf.miam')
      return
    }
    // Aliment de la mauvaise famille : refusé, jamais servi, l'erreur enseigne.
    registerFail('cdf.refus')
  }

  // ---------- Trier (T2/T3) ----------

  const onTapZone = (zone: Regime): void => {
    if (!item || item.kind !== 'sort' || phase !== 'idle') return
    if (sortCorrect(item, zone)) {
      resolveSuccess(item, 'cdf.bien-range')
      return
    }
    registerFail('cdf.pas-famille')
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on explique la famille de l'animal, puis indice si besoin. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setMood('idle')
    await say(E(`cdf.regime.${regimeOf(item.animalId)}`))
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      await say(E(item.kind === 'feed' ? 'cdf.indice.feed' : 'cdf.indice.sort'), {
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
    const next = generateItem(item.tier, tunerRef.current.level, item.animalId)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setMood('idle')
    setPhase('idle')
    setServed([])
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
            🍽️
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('cdf.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🦊🍽️🐰
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Sers à chaque animal ce qu'il aime !
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
                  void say(E(`cdf.niveau.${t}`))
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

  const renderAnimal = (it: CantineItem): ReactNode => {
    const animal = ANIMALS_BY_ID.get(it.animalId)
    const anim =
      mood === 'happy' ? 'animate-wiggle' : mood === 'shake' ? 'animate-wiggle' : 'animate-floaty'
    return (
      <div className="flex flex-col items-center gap-1">
        <span
          key={animKey}
          className={`text-7xl leading-none sm:text-8xl ${anim}`}
          role="img"
          aria-label={animal?.name}
        >
          {animal?.emoji}
        </span>
        {it.kind === 'feed' && served.length > 0 && (
          <div className="flex min-h-10 flex-wrap items-center justify-center gap-1 rounded-full bg-white/60 px-3 py-1">
            {served.map((id) => (
              <span key={id} className="animate-pop text-2xl" aria-hidden="true">
                {FOODS_BY_ID.get(id)?.emoji}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderFeed = (it: Extract<CantineItem, { kind: 'feed' }>): ReactNode => {
    const remaining = it.tray.filter((id) => !served.includes(id))
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <div className={`grid w-full gap-2.5 ${it.tray.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {remaining.map((id) => {
            const food = FOODS_BY_ID.get(id)
            const glow = hint && it.correctIds.includes(id)
            return (
              <button
                key={id}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapFood(id)}
                aria-label={food?.name}
                className={`tap-target card flex flex-col items-center justify-center gap-0.5 py-2 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''}`}
              >
                <span className="text-3xl leading-none" aria-hidden="true">
                  {food?.emoji}
                </span>
                <span className="text-xs font-semibold text-ink-soft">{food?.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderSort = (it: Extract<CantineItem, { kind: 'sort' }>): ReactNode => (
    <div
      className={`grid w-full max-w-md gap-3 ${it.zones.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
    >
      {it.zones.map((zone) => {
        const info = REGIME_INFO[zone]
        const glow = hint && zone === regimeOf(it.animalId)
        return (
          <button
            key={zone}
            type="button"
            disabled={phase !== 'idle'}
            onClick={() => onTapZone(zone)}
            aria-label={info.label}
            className={`tap-target card flex flex-col items-center justify-center gap-1 py-4 transition-transform active:scale-95 ${glow ? 'animate-pulse-glow' : ''}`}
          >
            <span className="text-4xl leading-none" aria-hidden="true">
              {info.emoji}
            </span>
            <span className="text-sm font-extrabold text-ink">{info.label}</span>
          </button>
        )
      })}
    </div>
  )

  const renderPlay = (it: CantineItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-3 pb-6">
      <p className="text-center text-lg font-extrabold text-ink">{instructionText(it)}</p>
      {renderAnimal(it)}
      {it.kind === 'feed' ? renderFeed(it) : renderSort(it)}
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
              🔓 Nouveau menu débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
