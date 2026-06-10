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
  ACTIONS,
  ANIMALS,
  actionClip,
  applyRun,
  chainLengthFor,
  COLOURS,
  DONT_MOVE,
  FRESH_PROGRESS,
  generateSimonRound,
  generateTapRound,
  isThemeExplored,
  ITEMS_PER_RUN,
  layoutSlots,
  lockReason,
  MAX_CHAIN,
  MAX_TAP_LEVEL,
  MIN_CHAIN,
  NUMBERS,
  recordListen,
  starsFor,
  stepOutcome,
  themeWords,
  TIER_SKILLS,
  wordClip,
} from './logic'
import type { EngProgress, Round, Slot, ThemeId, TierId, Word } from './logic'

// ============================================================
// English Island — compréhension orale de l'anglais.
// Imagier parlant (exploration libre), Balloon Beach (couleurs
// puis nombres), Animal Splash (animaux), Simon Says (consignes
// en chaîne, production de séquence). Voix anglaise : sonia.
// ============================================================

const STORE_KEY = 'game:english-island'

const META: GameMeta = GAMES_BY_ID.get('english-island') ?? {
  id: 'english-island',
  title: 'English Island',
  tagline: 'Colours, numbers, animals… in English!',
  icon: '🏝️',
  island: 'ailleurs',
  accent: '#1565c0',
  skills: ['en.cp.colours', 'en.cp.numbers', 'en.cp.animals', 'en.cp.consignes'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '📖', name: 'L’imagier parlant', sub: 'Écoute les mots' },
  { emoji: '🎈', name: 'Balloon Beach', sub: 'Les couleurs' },
  { emoji: '🔟', name: 'Balloon Beach', sub: 'Les nombres' },
  { emoji: '🐵', name: 'Animal Splash', sub: 'Les animaux' },
  { emoji: '🙋', name: 'Simon Says', sub: 'Les consignes' },
]

const THEME_INFO: ReadonlyArray<{ id: ThemeId; emoji: string; name: string }> = [
  { id: 'colours', emoji: '🌈', name: 'Colours' },
  { id: 'numbers', emoji: '🔢', name: 'Numbers' },
  { id: 'animals', emoji: '🐾', name: 'Animals' },
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

const COLOUR_BY_ID = new Map(COLOURS.map((c) => [c.id, c]))
const NUMBER_BY_ID = new Map(NUMBERS.map((n) => [n.id, n]))
const ANIMAL_BY_ID = new Map(ANIMALS.map((a) => [a.id, a]))
const ACTION_CARDS: readonly Word[] = [...ACTIONS, DONT_MOVE]

/** Gabarit anglais de la consigne d'un palier tap. */
const TAP_TEMPLATE: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'eng.pop',
  2: 'eng.popnum',
  3: 'eng.where',
}

// ---------- Keyframes locales du jeu ----------

function EiStyles() {
  return (
    <style>{`
@keyframes ei-float {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-12px) rotate(2deg); }
}
.ei-float { animation: ei-float var(--ei-dur, 3.5s) ease-in-out infinite; animation-delay: var(--ei-delay, 0s); }
@keyframes ei-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 201, 77, 0.9); }
  50% { box-shadow: 0 0 0 12px rgba(255, 201, 77, 0); }
}
.ei-pulse { animation: ei-pulse 1.1s ease-in-out infinite; border-radius: 9999px; }
@keyframes ei-wave {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(10px); }
}
.ei-wave { animation: ei-wave 4s ease-in-out infinite; }
`}</style>
  )
}

type Screen = 'menu' | 'imagier' | 'play' | 'end'
type Phase = 'aim' | 'listen' | 'input' | 'teach' | 'success'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function EnglishIsland() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<EngProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  // Imagier
  const [theme, setTheme] = useState<ThemeId>('colours')
  const [zoomedId, setZoomedId] = useState<string | null>(null)
  // Partie en cours
  const [round, setRound] = useState<Round | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('aim')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [wrongId, setWrongId] = useState<string | null>(null)
  const [foundId, setFoundId] = useState<string | null>(null)
  const [tapIndex, setTapIndex] = useState(0)
  const [litId, setLitId] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TAP_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const usedTargetsRef = useRef<string[]>([])
  const wrongTimerRef = useRef(0)

  // Chargement de la progression + préchargement des clips d'encadrement
  useEffect(() => {
    let alive = true
    void pget<EngProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      setProgress(stored ?? { ...FRESH_PROGRESS })
    })
    preloadClips([
      'eng.intro',
      'eng.bravo',
      'eng.indice',
      'eng.thatone',
      'eng.essaie',
      'eng.imagier.consigne',
      'eng.imagier.fini',
    ])
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(wrongTimerRef.current)
      stopSpeech()
    }
  }, [])

  const saveProgress = (p: EngProgress): void => {
    setProgress(p)
    void pset(STORE_KEY, p)
  }

  // ---------- Audio ----------

  /** Consigne anglaise d'un round : gabarit (sonia) puis le mot (sonia). */
  const speakRound = useCallback(async (r: Round): Promise<void> => {
    const seq = ++seqRef.current
    if (r.kind === 'tap') {
      await say(E(TAP_TEMPLATE[r.tier]))
      if (seqRef.current !== seq) return
      await say(E(wordClip(r.theme, r.targetId)), { interrupt: false })
      return
    }
    // Simon : la chaîne est énoncée pendant la phase d'écoute.
    setPhase('listen')
    try {
      if (r.chain.simonSays) {
        await say(E('eng.simon'))
        if (seqRef.current !== seq) return
      }
      for (let i = 0; i < r.chain.actions.length; i++) {
        await say(E(actionClip(r.chain.actions[i])), { interrupt: i > 0 || r.chain.simonSays ? false : true })
        if (seqRef.current !== seq) return
      }
    } finally {
      // Anti soft-lock : l'enfant peut toujours répondre, même si la
      // séquence audio a été interrompue ou doublée par une autre.
      setPhase((p) => (p === 'listen' ? 'input' : p))
    }
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Réécouter n'est possible que pendant la visée / saisie : pendant un
      // feedback ou l'enseignement, le bouton est un no-op (anti soft-lock).
      if (round && (phase === 'aim' || phase === 'input' || phase === 'listen')) {
        if (round.kind === 'simon') setTapIndex(0)
        void speakRound(round)
      }
      return
    }
    if (screen === 'imagier') {
      void say(E('eng.imagier.consigne'))
      return
    }
    void say(E('eng.intro'))
  }, [screen, round, phase, speakRound])

  // ---------- Imagier parlant ----------

  const openImagier = (th: ThemeId): void => {
    setTheme(th)
    setZoomedId(null)
    setScreen('imagier')
    preloadClips(themeWords(th).map((w) => wordClip(th, w.id)))
    void say(E(`eng.imagier.theme.${th}`))
  }

  const selectTheme = (th: ThemeId): void => {
    sfx('tap')
    setTheme(th)
    setZoomedId(null)
    preloadClips(themeWords(th).map((w) => wordClip(th, w.id)))
    void say(E(`eng.imagier.theme.${th}`))
  }

  const onTapImagierWord = (w: Word): void => {
    if (!progress) return
    sfx('tap')
    setZoomedId(w.id)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setZoomedId(null), 900)
    const wasExplored = isThemeExplored(progress, theme)
    const updated = recordListen(progress, theme, w.id)
    saveProgress(updated)
    const seq = ++seqRef.current
    void say(E(wordClip(theme, w.id))).then(() => {
      if (seqRef.current !== seq) return
      if (!wasExplored && isThemeExplored(updated, theme)) {
        sfx('fanfare')
        void say(E('eng.imagier.fini'), { interrupt: false })
      }
    })
  }

  // ---------- Déroulé d'une partie ----------

  const nextRound = (t: TierId, avoid: readonly string[]): Round => {
    if (t === 4) return generateSimonRound(chainLengthFor(tunerRef.current.level))
    const tapTier = t as 1 | 2 | 3
    return generateTapRound(tapTier, tunerRef.current.level, avoid)
  }

  const installRound = (r: Round): void => {
    if (r.kind === 'tap') {
      usedTargetsRef.current.push(r.targetId)
      setSlots(layoutSlots(r.optionIds.length))
      preloadClips([TAP_TEMPLATE[r.tier], ...r.optionIds.map((id) => wordClip(r.theme, id))])
      setPhase('aim')
    } else {
      preloadClips(['eng.simon', 'eng.dontmove', ...r.chain.actions.map(actionClip)])
      setPhase('listen')
    }
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setWrongId(null)
    setFoundId(null)
    setTapIndex(0)
    setLitId(null)
    setRound(r)
    void speakRound(r)
  }

  const startRun = (t: TierId): void => {
    if (t === 0) return
    tunerRef.current =
      t === 4
        ? new Tuner({ min: MIN_CHAIN, max: MAX_CHAIN, start: MIN_CHAIN })
        : new Tuner({ min: 0, max: MAX_TAP_LEVEL })
    usedTargetsRef.current = []
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    installRound(nextRound(t, []))
  }

  const finishRun = (): void => {
    if (tier === 0) return
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, tier as 1 | 2 | 3 | 4, stars)
    const unlockedNow = updated.unlockedTier > base.unlockedTier
    if (unlockedNow) sfx('levelup')
    setNewUnlock(unlockedNow)
    saveProgress(updated)
    setScreen('end')
  }

  const advance = (): void => {
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    installRound(nextRound(tier, usedTargetsRef.current))
  }

  /** Résolution d'un item réussi : maîtrise + Tuner, UNE seule fois. */
  const resolveItem = (): void => {
    seqRef.current += 1
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setBurst((b) => b + 1)
    void say(E('eng.bravo')).then(() => setOverlay('success'))
  }

  // ---------- Modes tap : ballons & animaux ----------

  const onTapOption = (id: string): void => {
    if (!round || round.kind !== 'tap' || phase !== 'aim') return
    if (id === round.targetId) {
      setFoundId(id)
      sfx(round.tier === 3 ? 'magic' : 'pop')
      resolveItem()
      return
    }
    // L'erreur enseigne : le ballon couine et la voix le NOMME en anglais.
    firstTryRef.current = false
    failsRef.current += 1
    sfx('wrong')
    setWrongId(id)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    const seq = ++seqRef.current
    void say(E('eng.thatone'))
      .then(() => {
        if (seqRef.current !== seq) return
        return say(E(wordClip(round.theme, id)), { interrupt: false })
      })
      .then(() => {
        if (seqRef.current !== seq) return
        if (failsRef.current >= 2 && !hint) {
          setHint(true)
          void say(E('eng.indice'), { interrupt: false })
        }
      })
  }

  // ---------- Simon Says ----------

  /** L'erreur enseigne : la chaîne se rejoue, les cartes s'illuminent une à une. */
  const runSimonTeach = async (trapMistake: boolean): Promise<void> => {
    if (!round || round.kind !== 'simon') return
    const seq = ++seqRef.current
    setPhase('teach')
    setTapIndex(0)
    try {
      await say(E(trapMistake ? 'eng.simon.piege' : 'eng.reecoute'))
      if (seqRef.current !== seq) return
      if (round.chain.simonSays) {
        await say(E('eng.simon'), { interrupt: false })
        if (seqRef.current !== seq) return
      }
      for (const id of round.expected) {
        setLitId(id)
        await say(E(actionClip(id)), { interrupt: false })
        if (seqRef.current !== seq) return
        await wait(250)
        if (seqRef.current !== seq) return
      }
    } finally {
      // Restauration INCONDITIONNELLE (anti soft-lock).
      setLitId(null)
      setPhase('input')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      void say(E('eng.indice'), { interrupt: false })
    }
  }

  const onTapAction = (id: string): void => {
    if (!round || round.kind !== 'simon' || phase !== 'input') return
    const outcome = stepOutcome(round.expected, tapIndex, id)
    if (outcome === 'progress') {
      sfx('coin')
      setTapIndex((i) => i + 1)
      return
    }
    if (outcome === 'complete') {
      setTapIndex(round.expected.length)
      setFoundId(id)
      sfx('magic')
      resolveItem()
      return
    }
    firstTryRef.current = false
    failsRef.current += 1
    sfx('wrong')
    setWrongId(id)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    void runSimonTeach(!round.chain.simonSays)
  }

  const onOverlayDone = (): void => {
    setOverlay(null)
    advance()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🏝️
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('eng.intro')} autoPlay />
        </div>
        <div
          className="relative flex h-24 w-full max-w-sm items-center justify-center overflow-hidden rounded-card shadow-card"
          style={{ background: 'linear-gradient(180deg, #90caf9 0%, #b3e5fc 55%, #ffe9a8 100%)' }}
          aria-hidden="true"
        >
          <span className="absolute top-2 left-3 text-base">🇬🇧</span>
          <span className="ei-wave absolute bottom-1 left-4 text-2xl">🌊</span>
          <span className="ei-wave absolute right-6 bottom-1 text-2xl" style={{ animationDelay: '1.2s' }}>🌊</span>
          <span className="text-4xl">🏝️</span>
          <span className="ei-float ml-2 text-3xl" style={{ ['--ei-dur' as never]: '3s' }}>🎈</span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute l’anglais, tape la bonne image !
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          {TIER_INFO.map((info, i) => {
            const t = i as TierId
            const reason = lockReason(progress, t)
            const locked = reason !== null
            const stars = progress.bestStars[t] ?? 0
            const active = tier === t && !locked
            const exploredCount = THEME_INFO.filter((th) => isThemeExplored(progress, th.id)).length
            return (
              <button
                key={`${info.name}-${info.sub}`}
                type="button"
                aria-pressed={active}
                aria-label={locked ? `${info.name}, ${info.sub} (verrouillé)` : `${info.name}, ${info.sub}`}
                onClick={() => {
                  if (locked) {
                    sfx('slide')
                    void say(E(reason === 'explore' ? 'eng.verrou.imagier' : 'eng.verrou.etoiles'))
                    return
                  }
                  sfx('tap')
                  setTier(t)
                  void say(E(`eng.mode.${t}`))
                }}
                className={`tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95 ${locked ? 'opacity-50' : ''} ${t === 0 ? 'col-span-2' : ''}`}
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {locked ? '🔒' : info.emoji}
                </span>
                <span className="text-base leading-tight font-extrabold text-ink">{info.name}</span>
                <span className="text-xs font-semibold text-ink-soft">{info.sub}</span>
                {t === 0 ? (
                  <span className="text-sm" aria-label={`${exploredCount} thème${exploredCount > 1 ? 's' : ''} sur 3 exploré`}>
                    {THEME_INFO.map((th) => (
                      <span key={th.id} className={isThemeExplored(progress, th.id) ? '' : 'opacity-30'}>
                        {th.emoji}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-sm" aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}>
                    {'⭐'.repeat(stars)}
                    <span className="opacity-30">{'☆'.repeat(3 - stars)}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-2xl"
          onClick={() => {
            if (tier === 0) openImagier('colours')
            else startRun(tier)
          }}
        >
          {tier === 0 ? 'Explorer ! 📖' : 'Jouer !'}
        </BigButton>
      </div>
    )
  }

  const renderImagier = (): ReactNode => {
    if (!progress) return null
    const words = themeWords(theme)
    const listened = new Set(progress.listened[theme] ?? [])
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 p-4">
        <div className="flex w-full items-center justify-center gap-2">
          {THEME_INFO.map((th) => (
            <button
              key={th.id}
              type="button"
              aria-pressed={theme === th.id}
              onClick={() => selectTheme(th.id)}
              className="tap-target card flex items-center gap-1.5 px-4 py-2 text-base font-extrabold text-ink transition-transform active:scale-95"
              style={theme === th.id ? { outline: `4px solid ${ACCENT}` } : undefined}
            >
              <span aria-hidden="true">{th.emoji}</span>
              {th.name}
              {isThemeExplored(progress, th.id) && <span aria-label="thème exploré">✅</span>}
            </button>
          ))}
        </div>
        <p className="text-center text-base font-extrabold text-ink-soft">
          {listened.size} / {words.length} écoutés —{' '}
          {isThemeExplored(progress, theme) ? 'jeu débloqué ! 🎉' : 'écoute tout pour débloquer le jeu !'}
        </p>
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {words.map((w) => {
            const zoomed = zoomedId === w.id
            return (
              <button
                key={w.id}
                type="button"
                aria-label={`Écouter ${w.word}`}
                onClick={() => onTapImagierWord(w)}
                className={`tap-target card relative flex flex-col items-center gap-1 p-3 transition-transform active:scale-95 ${zoomed ? 'animate-pop z-10 scale-110' : ''}`}
                style={zoomed ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                {listened.has(w.id) && (
                  <span className="absolute top-1 right-1 text-sm" aria-label="déjà écouté">
                    ✅
                  </span>
                )}
                <span aria-hidden="true" className={`${zoomed ? 'text-6xl' : 'text-5xl'}`}>
                  {w.emoji}
                </span>
                <span className="text-lg font-extrabold" style={{ color: ACCENT }}>
                  {w.word}
                </span>
              </button>
            )
          })}
        </div>
        <BigButton variant="soft" className="w-full max-w-xs" onClick={() => setScreen('menu')}>
          ← Retour à la plage
        </BigButton>
      </div>
    )
  }

  const renderBalloonScene = (r: Round): ReactNode => {
    if (r.kind !== 'tap') return null
    const isNumbers = r.tier === 2
    return (
      <div
        className="game-surface relative h-[340px] w-full overflow-hidden rounded-card shadow-card sm:h-[380px]"
        style={{ background: 'linear-gradient(180deg, #90caf9 0%, #b3e5fc 60%, #ffe9a8 100%)' }}
      >
        <span aria-hidden="true" className="absolute right-2 bottom-1 text-3xl">🏝️</span>
        <span aria-hidden="true" className="ei-wave absolute bottom-0 left-3 text-2xl">🌊</span>
        <span aria-hidden="true" className="ei-wave absolute bottom-0 left-1/2 text-2xl" style={{ animationDelay: '1.4s' }}>🌊</span>
        {r.optionIds.map((id, i) => {
          const slot = slots[i] ?? { left: 10 + i * 14, top: 20, delay: 0, dur: 3.5 }
          const colour = COLOUR_BY_ID.get(id)
          const num = NUMBER_BY_ID.get(id)
          const popped = foundId === id
          const isWrong = wrongId === id
          const pulse = hint && phase === 'aim' && id === r.targetId
          const label = isNumbers ? `Ballon numéro ${num?.value ?? ''}` : `Ballon de couleur ${id}`
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              disabled={phase !== 'aim'}
              onClick={() => onTapOption(id)}
              className={`ei-float absolute flex flex-col items-center ${isWrong ? 'animate-shake-soft' : ''}`}
              style={{
                left: `${slot.left}%`,
                top: `${slot.top}%`,
                ['--ei-dur' as never]: `${slot.dur}s`,
                ['--ei-delay' as never]: `${slot.delay}s`,
              }}
            >
              {popped ? (
                <span className="animate-pop text-6xl" aria-hidden="true">💥</span>
              ) : (
                <span className={`flex flex-col items-center ${pulse ? 'ei-pulse' : ''}`}>
                  <span
                    aria-hidden="true"
                    className="flex h-20 w-16 items-center justify-center rounded-[50%] text-3xl font-extrabold text-white shadow-card"
                    style={{
                      background: isNumbers
                        ? 'radial-gradient(circle at 35% 30%, #64b5f6, #1565c0)'
                        : `radial-gradient(circle at 35% 30%, ${colour?.hex}cc, ${colour?.hex})`,
                    }}
                  >
                    {isNumbers ? num?.value : ''}
                  </span>
                  <span aria-hidden="true" className="h-7 w-0.5 bg-white/80" />
                  <span aria-hidden="true" className="-mt-1 text-xs">🪢</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  const renderJungleScene = (r: Round): ReactNode => {
    if (r.kind !== 'tap') return null
    return (
      <div
        className="game-surface relative h-[340px] w-full overflow-hidden rounded-card shadow-card sm:h-[380px]"
        style={{ background: 'linear-gradient(180deg, #a5d6a7 0%, #66bb6a 55%, #2e7d32 100%)' }}
      >
        <span aria-hidden="true" className="absolute top-1 left-2 text-3xl">🌴</span>
        <span aria-hidden="true" className="absolute top-2 right-3 text-3xl">🌴</span>
        <span aria-hidden="true" className="absolute bottom-1 left-1/3 text-2xl">🌺</span>
        {r.optionIds.map((id, i) => {
          const slot = slots[i] ?? { left: 10 + i * 14, top: 20, delay: 0, dur: 3.5 }
          const animal = ANIMAL_BY_ID.get(id)
          const found = foundId === id
          const isWrong = wrongId === id
          const pulse = hint && phase === 'aim' && id === r.targetId
          return (
            <button
              key={id}
              type="button"
              aria-label={`Animal ${animal?.word ?? id}`}
              disabled={phase !== 'aim'}
              onClick={() => onTapOption(id)}
              className={`absolute flex flex-col items-center ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-bounce-in' : ''}`}
              style={{ left: `${slot.left}%`, top: `${slot.top}%` }}
            >
              <span className={`flex h-16 w-16 items-center justify-center rounded-full bg-white/85 shadow-card ${pulse ? 'ei-pulse' : ''}`}>
                <span aria-hidden="true" className={found ? 'text-5xl' : 'text-4xl'}>
                  {animal?.emoji}
                </span>
              </span>
              <span aria-hidden="true" className="-mt-2 text-xl">🌿</span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderSimonScene = (r: Round): ReactNode => {
    if (r.kind !== 'simon') return null
    const chainLen = r.expected.length
    return (
      <div className="flex w-full flex-col items-center gap-4">
        {/* Avancement dans la chaîne : production de séquence, pas de QCM */}
        <div className="flex items-center gap-2" aria-label={`${tapIndex} action${tapIndex > 1 ? 's' : ''} sur ${chainLen}`}>
          {Array.from({ length: chainLen }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="h-4 w-4 rounded-full"
              style={{ background: i < tapIndex ? ACCENT : 'rgba(0, 0, 0, 0.15)' }}
            />
          ))}
          {phase === 'listen' && <span className="text-lg" aria-hidden="true">👂</span>}
        </div>
        <div className="grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
          {ACTION_CARDS.map((card) => {
            const isDontMove = card.id === DONT_MOVE.id
            const lit = litId === card.id
            const isWrong = wrongId === card.id
            const pulse = hint && phase === 'input' && r.expected[tapIndex] === card.id
            return (
              <button
                key={card.id}
                type="button"
                aria-label={card.word}
                disabled={phase !== 'input'}
                onClick={() => onTapAction(card.id)}
                className={`tap-target card flex flex-col items-center gap-1 p-3 transition-transform active:scale-95 ${isWrong ? 'animate-shake-soft' : ''} ${lit ? 'animate-pop' : ''} ${phase === 'listen' || phase === 'teach' ? 'opacity-80' : ''} ${isDontMove ? 'col-span-2 sm:col-span-4' : ''}`}
                style={{
                  outline: lit ? '5px solid var(--color-sun)' : pulse ? `4px solid ${ACCENT}` : undefined,
                  ...(isDontMove ? { background: '#ffebee' } : undefined),
                }}
              >
                <span aria-hidden="true" className="text-4xl">{card.emoji}</span>
                <span className="text-base font-extrabold text-ink">{card.word}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderPlay = (r: Round): ReactNode => {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-3 pb-6">
        <div className="flex items-center justify-center gap-3">
          <span aria-hidden="true" className="text-base">🇬🇧</span>
          <p className="text-center text-lg font-extrabold text-ink sm:text-xl">
            {r.kind === 'simon'
              ? phase === 'listen'
                ? 'Écoute bien…'
                : 'Tape les cartes dans l’ordre !'
              : 'Écoute, puis tape la bonne image !'}
          </p>
          <Mascot mood={phase === 'success' ? 'cheer' : 'idle'} size={48} />
        </div>
        {r.kind === 'simon' ? renderSimonScene(r) : r.tier === 3 ? renderJungleScene(r) : renderBalloonScene(r)}
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      <EiStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'imagier' && renderImagier()}
      {screen === 'play' && round && renderPlay(round)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Un nouveau jeu de l’île est débloqué !
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
