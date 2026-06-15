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
  feedComplete,
  FRESH_PROGRESS,
  generateItem,
  isNeed,
  itemSignature,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  NEEDS_BY_ID,
  STAGES_BY_ID,
  starsFor,
  stepOutcome,
  TIER_SKILLS,
} from './logic'
import type { PgrProgress, SeedItem, StageId, TierId } from './logic'

// ============================================================
// La Petite Graine — l'enfant donne à la plante ce dont elle a
// besoin (nourrir, T0/T1) puis remet les étapes du cycle de vie
// dans l'ordre (ordonner, T2/T3). « Questionner le monde du
// vivant » : besoins d'un végétal et cycle de vie. Zéro QCM.
// ============================================================

const STORE_KEY = 'game:petite-graine'

const META: GameMeta = GAMES_BY_ID.get('petite-graine') ?? {
  id: 'petite-graine',
  title: 'La Petite Graine',
  tagline: 'Donne-lui ce qu’il faut et fais pousser la plante !',
  icon: '🌱',
  island: 'monde',
  accent: '#7cb342',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '💧', name: 'La petite graine', sub: 'Un besoin à donner' },
  { emoji: '🌿', name: 'Elle grandit', sub: 'Plusieurs besoins' },
  { emoji: '🌸', name: 'Dans l’ordre', sub: 'Jusqu’à la fleur' },
  { emoji: '🍅', name: 'Le cycle entier', sub: 'Jusqu’au fruit' },
]

// ---------- Corpus local typé ----------

function toVoice(v: string): CorpusEntry['voice'] {
  return v === 'denise' || v === 'eloise' || v === 'henri' || v === 'sonia' ? v : undefined
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

// ---------- Plante : sa hauteur reflète l'avancement ----------

/** Émoji de la plante selon le nombre de besoins déjà donnés (T0/T1). */
function plantEmoji(grown: number): string {
  if (grown <= 0) return '🌱'
  if (grown === 1) return '🌿'
  return '🌷'
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'teach' | 'success'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function PetiteGraine() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<PgrProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<SeedItem | null>(null)
  // Nourrir : besoins déjà donnés. Ordonner : étapes déjà posées.
  const [given, setGiven] = useState<string[]>([])
  const [orderIndex, setOrderIndex] = useState(0)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [wrongId, setWrongId] = useState<string | null>(null)
  const [litId, setLitId] = useState<string | null>(null)
  const [animKey, setAnimKey] = useState(0)
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
    void pget<PgrProgress>(STORE_KEY).then((stored) => {
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

  const speakConsigne = useCallback((it: SeedItem): void => {
    void say(E(it.kind === 'feed' ? 'pgr.consigne.feed' : 'pgr.consigne.order'))
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item) speakConsigne(item)
    else void say(E('pgr.intro'))
  }, [screen, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const installItem = (it: SeedItem): void => {
    firstTryRef.current = true
    failsRef.current = 0
    setItem(it)
    setGiven([])
    setOrderIndex(0)
    setHint(false)
    setWrongId(null)
    setLitId(null)
    setPhase('idle')
    setAnimKey((k) => k + 1)
    speakConsigne(it)
  }

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    installItem(generateItem(t, 0))
  }

  /** Résolution réussie d'un item : maîtrise + Tuner, UNE seule fois. */
  const resolveSuccess = (it: SeedItem, successClip: string): void => {
    seqRef.current += 1
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setAnimKey((k) => k + 1)
    setBurst((b) => b + 1)
    sfx('magic')
    void say(E(successClip)).then(() => setOverlay('success'))
  }

  /** Un essai raté : firstTry tombe, le compteur d'erreurs monte. */
  const registerFail = (): void => {
    firstTryRef.current = false
    failsRef.current += 1
    sfx('wrong')
  }

  // ---------- Nourrir (T0/T1) ----------

  const onTapCard = (cardId: string): void => {
    if (!item || item.kind !== 'feed' || phase !== 'idle') return
    if (given.includes(cardId)) return

    if (isNeed(cardId)) {
      sfx('pop')
      const next = [...given, cardId]
      setGiven(next)
      setAnimKey((k) => k + 1)
      if (feedComplete(item, next)) resolveSuccess(item, 'pgr.pousse')
      return
    }
    // Carte-piège : refusée, jamais donnée, l'erreur enseigne.
    registerFail()
    setWrongId(cardId)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    setOverlay('retry')
    void say(E('pgr.refus'))
  }

  // ---------- Ordonner le cycle (T2/T3) ----------

  const onTapStage = (stageId: StageId): void => {
    if (!item || item.kind !== 'order' || phase !== 'idle') return
    const outcome = stepOutcome(item.expected, orderIndex, stageId)
    if (outcome === 'progress') {
      sfx('coin')
      setOrderIndex((i) => i + 1)
      setAnimKey((k) => k + 1)
      return
    }
    if (outcome === 'complete') {
      setOrderIndex(item.expected.length)
      resolveSuccess(item, 'pgr.ordre-bon')
      return
    }
    // Mauvaise étape : on ré-illumine la séquence depuis le début.
    registerFail()
    setWrongId(stageId)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    setOverlay('retry')
    void say(E('pgr.ordre-faux'))
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on explique la notion ; pour l'ordre, on rejoue la séquence. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('teach')
    await say(E(item.kind === 'feed' ? 'pgr.besoins' : 'pgr.cycle'))
    if (seqRef.current !== seq) return

    if (item.kind === 'order') {
      // L'ordre se rejoue : les étapes s'illuminent une à une, du début.
      setOrderIndex(0)
      for (const id of item.expected) {
        setLitId(id)
        await say(E(`pgr.etape.${id}`), { interrupt: false })
        if (seqRef.current !== seq) {
          setLitId(null)
          return
        }
        await wait(250)
        if (seqRef.current !== seq) {
          setLitId(null)
          return
        }
      }
      setLitId(null)
    }

    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      await say(E(item.kind === 'feed' ? 'pgr.indice.feed' : 'pgr.indice.order'), {
        interrupt: false,
      })
    }
    setPhase('idle')
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun(item.tier)
      return
    }
    installItem(generateItem(item.tier, tunerRef.current.level, itemSignature(item)))
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
            🌱
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('pgr.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🌱☀️💧
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Aide la petite graine à devenir une belle plante !
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
                  void say(E(`pgr.niveau.${t}`))
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

  // Le pot et la plante qui grandit (T0/T1).
  const renderPlant = (): ReactNode => (
    <div className="flex flex-col items-center gap-1">
      <span
        key={animKey}
        className="animate-bounce-in text-7xl leading-none sm:text-8xl"
        role="img"
        aria-label="La plante"
      >
        {plantEmoji(given.length)}
      </span>
      <span aria-hidden="true" className="text-4xl">
        🪴
      </span>
      {given.length > 0 && (
        <div className="flex min-h-10 flex-wrap items-center justify-center gap-1 rounded-full bg-white/60 px-3 py-1">
          {given.map((id) => (
            <span key={id} className="animate-pop text-2xl" aria-hidden="true">
              {NEEDS_BY_ID.get(id)?.emoji}
            </span>
          ))}
        </div>
      )}
    </div>
  )

  const renderFeed = (it: Extract<SeedItem, { kind: 'feed' }>): ReactNode => {
    const remaining = it.tray.filter((id) => !given.includes(id))
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <div className={`grid w-full gap-2.5 ${it.tray.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {remaining.map((id) => {
            const card = NEEDS_BY_ID.get(id)
            const glow = hint && it.correctIds.includes(id)
            const isWrong = wrongId === id
            return (
              <button
                key={id}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapCard(id)}
                aria-label={card?.name}
                className={`tap-target card flex flex-col items-center justify-center gap-0.5 py-2 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''} ${isWrong ? 'animate-shake-soft' : ''}`}
              >
                <span className="text-3xl leading-none" aria-hidden="true">
                  {card?.emoji}
                </span>
                <span className="text-xs font-semibold text-ink-soft">{card?.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderOrder = (it: Extract<SeedItem, { kind: 'order' }>): ReactNode => {
    const placed = it.expected.slice(0, orderIndex)
    return (
      <div className="flex w-full max-w-2xl flex-col items-center gap-4">
        {/* Frise de l'ordre déjà construit : production de séquence, pas de QCM */}
        <div
          className="flex min-h-14 flex-wrap items-center justify-center gap-1.5 rounded-card bg-white/60 px-3 py-2"
          aria-label={`${orderIndex} étape${orderIndex > 1 ? 's' : ''} sur ${it.expected.length}`}
        >
          {it.expected.map((id, i) => {
            const done = i < orderIndex
            return (
              <span key={id} className="flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden="true" className="text-lg text-ink-soft">
                    ➜
                  </span>
                )}
                <span
                  className={`text-3xl leading-none ${done ? 'animate-pop' : 'opacity-20'}`}
                  aria-hidden="true"
                >
                  {done ? STAGES_BY_ID.get(id)?.emoji : '❔'}
                </span>
              </span>
            )
          })}
        </div>
        <div
          className={`grid w-full gap-3 ${it.cards.length > 4 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}
        >
          {it.cards.map((id) => {
            const card = STAGES_BY_ID.get(id)
            const used = placed.includes(id)
            const lit = litId === id
            const isWrong = wrongId === id
            const next = hint && phase === 'idle' && it.expected[orderIndex] === id
            return (
              <button
                key={id}
                type="button"
                disabled={phase !== 'idle' || used}
                onClick={() => onTapStage(id)}
                aria-label={card?.name}
                aria-pressed={used}
                className={`tap-target card flex flex-col items-center justify-center gap-1 py-3 transition-transform active:scale-95 ${used ? 'opacity-30' : ''} ${next ? 'animate-pulse-glow' : ''} ${isWrong ? 'animate-shake-soft' : ''}`}
                style={lit ? { outline: '5px solid var(--color-sun)' } : undefined}
              >
                <span className="text-4xl leading-none" aria-hidden="true">
                  {card?.emoji}
                </span>
                <span className="text-sm font-extrabold text-ink">{card?.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderPlay = (it: SeedItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-3 pb-6">
      <p className="text-center text-lg font-extrabold text-ink">
        {it.kind === 'feed'
          ? 'Donne à la plante ce dont elle a besoin !'
          : 'Range les étapes dans l’ordre !'}
      </p>
      {it.kind === 'feed' ? renderPlant() : null}
      {it.kind === 'feed' ? renderFeed(it) : renderOrder(it)}
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
              🔓 Une nouvelle étape du jardin est débloquée !
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
