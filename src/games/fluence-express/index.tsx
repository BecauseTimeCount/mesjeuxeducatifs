import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
  applyDuo,
  applyRun,
  buildDuoText,
  buildSentenceItem,
  buildWordItem,
  computeMclm,
  computeWpm,
  countWords,
  DUO_SKILL,
  DUO_SUCCESS_MCLM,
  FRESH_PROGRESS,
  itemsPerRun,
  MAX_TUNER_LEVEL,
  MCLM_GAUGE_MAX,
  MCLM_MARKS,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
} from './logic'
import type { DuoText, FlxProgress, SceneSpec, SentenceItem, TierId, WordItem } from './logic'
import type { WordEntry } from './words'

// ============================================================
// Fluence Express — décodage chronométré DOUX (fin CP / CE1).
// RÈGLE D'OR : le mot/la phrase n'est JAMAIS prononcé avant la
// réponse. La vitesse du train est la récompense — aucun chrono
// visible côté enfant. Le mode duo (MCLM) est réservé au parent.
// ============================================================

const STORE_KEY = 'game:fluence-express'

const META: GameMeta = GAMES_BY_ID.get('fluence-express') ?? {
  id: 'fluence-express',
  title: 'Fluence Express',
  tagline: 'Lis vite et bien, le train accélère !',
  icon: '🚄',
  island: 'sons',
  accent: '#c62828',
  skills: ['fr.cp.fluence', 'fr.ce1.fluence'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🚂', name: 'Le Train des mots', sub: 'Mots faciles' },
  { emoji: '🚄', name: 'Le Grand Express', sub: 'Mots plus longs' },
  { emoji: '🚉', name: 'Phrases express', sub: 'Lis toute la phrase' },
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

/** Entrée DYNAMIQUE : jamais dans le manifest → fallback Web Speech.
 *  Accepté UNIQUEMENT pour la relecture d'enseignement (mot/syllabes/phrase). */
function dyn(id: string, text: string): CorpusEntry {
  return { id: `flx.dyn.${id}`, text }
}

// ---------- Keyframes locales du jeu ----------

function FlxStyles() {
  return (
    <style>{`
@keyframes flx-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.flx-scroll { animation: flx-scroll var(--flx-speed, 9s) linear infinite; }
@keyframes flx-chug {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.flx-chug { animation: flx-chug 0.6s ease-in-out infinite; }
@keyframes flx-smoke {
  0% { opacity: 0.9; transform: translate(0, 0) scale(0.6); }
  100% { opacity: 0; transform: translate(-26px, -34px) scale(1.4); }
}
.flx-smoke { animation: flx-smoke 1.4s ease-out infinite; }
@keyframes flx-arrive {
  from { transform: translateX(-120%); }
  to { transform: translateX(0); }
}
.flx-arrive { animation: flx-arrive 1.6s ease-out both; }
`}</style>
  )
}

// ---------- Paysage en parallaxe (la vitesse EST la récompense) ----------

const CLOUDS = '☁️ ☁️ 🌤️ ☁️ 🕊️ ☁️'
const HILLS = '🌲 🌳 🏡 🌻 🌳 🐑 🌲 🌼 🌳 🏠 🌲 🐄'

function Landscape({ streak, paused }: { streak: number; paused: boolean }) {
  // Plus l'enfant enchaîne, plus le paysage défile vite (plafonné, jamais anxiogène)
  const speed = Math.max(2.5, 9 - streak * 1.3)
  const playState = paused ? 'paused' : 'running'
  return (
    <div
      aria-hidden="true"
      className="relative h-20 w-full overflow-hidden rounded-t-card"
      style={{ background: 'linear-gradient(180deg, #bfe3f7 0%, #e3f3d9 100%)' }}
    >
      <div
        className="flx-scroll absolute top-1 flex w-[200%] justify-around text-xl whitespace-nowrap"
        style={{ '--flx-speed': `${speed * 2.4}s`, animationPlayState: playState } as CSSProperties}
      >
        <span>{CLOUDS}</span>
        <span>{CLOUDS}</span>
      </div>
      <div
        className="flx-scroll absolute bottom-0 flex w-[200%] justify-around text-2xl whitespace-nowrap"
        style={{ '--flx-speed': `${speed}s`, animationPlayState: playState } as CSSProperties}
      >
        <span>{HILLS}</span>
        <span>{HILLS}</span>
      </div>
    </div>
  )
}

/** Barre de voie : le train avance d'un cran par bonne réponse, vers la gare. */
function TrackProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 88 : 0
  return (
    <div aria-hidden="true" className="relative h-10 w-full rounded-b-card bg-ink/10">
      <div className="absolute inset-x-2 top-1/2 border-t-4 border-dashed border-ink/30" />
      <span className="absolute top-1/2 right-1 -translate-y-1/2 text-2xl">🚉</span>
      <span
        className="absolute top-1/2 -translate-y-1/2 text-2xl transition-all duration-700 ease-out"
        style={{ left: `${4 + pct}%` }}
      >
        🚂
      </span>
    </div>
  )
}

// ---------- Jauge MCLM (côté parent uniquement) ----------

function MclmGauge({ mclm }: { mclm: number }) {
  const pos = Math.min(mclm, MCLM_GAUGE_MAX) / MCLM_GAUGE_MAX
  return (
    <div className="w-full">
      <p className="text-center text-4xl font-extrabold" style={{ color: ACCENT }}>
        {mclm} <span className="text-lg font-bold text-ink-soft">mots corrects / minute</span>
      </p>
      <div className="relative mt-8 h-6 w-full rounded-full bg-ink/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${pos * 100}%`,
            background: `linear-gradient(90deg, ${ACCENT}88, ${ACCENT})`,
          }}
        />
        {MCLM_MARKS.map((m) => (
          <div
            key={m.value}
            className="absolute -top-7 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${(m.value / MCLM_GAUGE_MAX) * 100}%` }}
          >
            <span className="text-xs font-bold whitespace-nowrap text-ink-soft">{m.label}</span>
            <span className="text-xs font-extrabold text-ink">{m.value}</span>
            <div className="h-9 w-0.5 bg-ink/40" />
          </div>
        ))}
        <span
          className="absolute -bottom-6 -translate-x-1/2 text-xl transition-all duration-1000 ease-out"
          style={{ left: `${pos * 100}%` }}
          aria-hidden="true"
        >
          🚂
        </span>
      </div>
      <div className="h-8" />
    </div>
  )
}

// ---------- Types d'écran ----------

type Screen =
  | 'menu'
  | 'play'
  | 'end'
  | 'duo-gate'
  | 'duo-read'
  | 'duo-errors'
  | 'duo-parent'
  | 'duo-child'

type Phase = 'aim' | 'locked' | 'teach'

type PlayItem = { kind: 'word'; item: WordItem } | { kind: 'sentence'; item: SentenceItem }

const ERROR_CHOICES = [0, 1, 2, 3, 4, 5] as const

export default function FluenceExpress() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<FlxProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [playItem, setPlayItem] = useState<PlayItem | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('aim')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [teachIndex, setTeachIndex] = useState<number | null>(null)
  const [wrongIndex, setWrongIndex] = useState<number | null>(null)
  const [streak, setStreak] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  // Mode duo
  const [duoText, setDuoText] = useState<DuoText | null>(null)
  const [duoStartTs, setDuoStartTs] = useState<number | null>(null)
  const [duoElapsed, setDuoElapsed] = useState(0)
  const [duoMclm, setDuoMclm] = useState(0)
  const [duoBurst, setDuoBurst] = useState(0)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const usedWordsRef = useRef<string[]>([])
  const usedSentencesRef = useRef<string[]>([])
  /** chrono interne INVISIBLE : temps de lecture cumulé des premiers essais */
  const itemShownAtRef = useRef(0)
  const readMsRef = useRef(0)
  const wordsReadRef = useRef(0)
  const lastDuoTemplateRef = useRef<number | null>(null)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<FlxProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, TIER_COUNT - 1) as TierId)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  const persist = useCallback((updated: FlxProgress): void => {
    setProgress(updated)
    void pset(STORE_KEY, updated)
  }, [])

  // ---------- Audio ----------

  const speakRunIntro = useCallback(async (t: TierId): Promise<void> => {
    const seq = ++seqRef.current
    await say(E('flx.depart'))
    if (seqRef.current !== seq) return
    await say(E(t === 2 ? 'flx.consigne.phrases' : 'flx.consigne.mots'), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    switch (screen) {
      case 'play':
        // RÈGLE D'OR : on ne re-dit JAMAIS le mot/la phrase, seulement la consigne.
        if (phase === 'aim') {
          void say(E(tier === 2 ? 'flx.consigne.phrases' : 'flx.consigne.mots'))
        }
        return
      case 'duo-gate':
        void say(E('flx.duo.passe'))
        return
      case 'duo-read':
      case 'duo-errors':
      case 'duo-parent':
        void say(E('flx.duo.parent'))
        return
      case 'duo-child':
        void say(E('flx.duo.bravo'))
        return
      default:
        void say(E('flx.intro'))
    }
  }, [screen, phase, tier])

  // ---------- Déroulé d'une partie solo ----------

  const makeItem = useCallback((t: TierId): PlayItem => {
    if (t === 2) {
      const item = buildSentenceItem(usedSentencesRef.current)
      usedSentencesRef.current.push(item.text)
      return { kind: 'sentence', item }
    }
    const item = buildWordItem(t, tunerRef.current.level, usedWordsRef.current)
    usedWordsRef.current.push(item.target.word)
    return { kind: 'word', item }
  }, [])

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    usedWordsRef.current = []
    usedSentencesRef.current = []
    readMsRef.current = 0
    wordsReadRef.current = 0
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('aim')
    setOverlay(null)
    setHint(false)
    setTeachIndex(null)
    setWrongIndex(null)
    setStreak(0)
    setResult(null)
    setNewUnlock(false)
    setPlayItem(makeItem(t))
    itemShownAtRef.current = performance.now()
    setScreen('play')
    void speakRunIntro(t)
  }

  /** Résolution correcte d'un item : maîtrise + Tuner + chrono, UNE fois. */
  const resolveCorrect = (wordCount: number, lastClipId: string): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) {
      setFirstTryCorrect((c) => c + 1)
      readMsRef.current += performance.now() - itemShownAtRef.current
      wordsReadRef.current += wordCount
      const nextStreak = streak + 1
      setStreak(nextStreak)
      if (nextStreak === 3) {
        sfx('whoosh')
        void say(E('flx.accelere'), { interrupt: false })
      }
    }
    setPhase('locked')
    setWrongIndex(null)
    sfx('coin')
    const isLast = resolved + 1 >= itemsPerRun(tier)
    // L'overlay attend la fin du clip : say() résout toujours, même interrompu.
    void say(E(isLast ? 'flx.terminus' : lastClipId)).then(() => setOverlay('success'))
  }

  const resolveWrong = (idx: number): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setStreak(0)
    setWrongIndex(idx)
    setPhase('locked')
    setOverlay('retry')
  }

  const onWagonTap = (idx: number): void => {
    if (phase !== 'aim' || !playItem || playItem.kind !== 'word') return
    seqRef.current += 1
    sfx('tap')
    if (idx === playItem.item.answerIndex) resolveCorrect(1, 'flx.bien-lu')
    else resolveWrong(idx)
  }

  const onSceneTap = (idx: number): void => {
    if (phase !== 'aim' || !playItem || playItem.kind !== 'sentence') return
    seqRef.current += 1
    sfx('tap')
    if (idx === playItem.item.answerIndex) {
      resolveCorrect(countWords(playItem.item.text), 'flx.bien-lu')
    } else resolveWrong(idx)
  }

  /** L'erreur enseigne (mots) : le mot est relu À VOIX HAUTE découpé en
   *  syllabes surlignées une à une, puis nouvel essai sur le MÊME mot. */
  const runWordTeaching = async (w: WordEntry): Promise<void> => {
    const seq = ++seqRef.current
    setPhase('teach')
    try {
      await say(E('flx.presque'))
      if (seqRef.current !== seq) return
      for (let i = 0; i < w.syllables.length; i++) {
        setTeachIndex(i)
        sfx('pop')
        await say(dyn(`syllabe.${i}`, w.syllables[i]), { interrupt: false })
        if (seqRef.current !== seq) return
      }
      setTeachIndex(null)
      await say(dyn('mot', `${w.word} !`), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('flx.reessaie'), { interrupt: false })
    } finally {
      // Restauration INCONDITIONNELLE (anti soft-lock) : le jeton seq
      // n'annule que la suite audio, jamais le retour en phase de visée.
      setTeachIndex(null)
      setWrongIndex(null)
      setPhase('aim')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      void say(E('flx.indice'), { interrupt: false })
    }
  }

  /** L'erreur enseigne (phrases) : relecture à voix haute, puis nouvel essai. */
  const runSentenceTeaching = async (item: SentenceItem): Promise<void> => {
    const seq = ++seqRef.current
    setPhase('teach')
    try {
      await say(E('flx.phrase.regarde'))
      if (seqRef.current !== seq) return
      await say(dyn('phrase', item.text), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('flx.phrase.reessaie'), { interrupt: false })
    } finally {
      setWrongIndex(null)
      setPhase('aim')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) setHint(true)
  }

  const advance = (): void => {
    if (!playItem) return
    const done = resolved + 1
    setResolved(done)
    if (done >= itemsPerRun(tier)) {
      finishRun()
      return
    }
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setTeachIndex(null)
    setWrongIndex(null)
    setPhase('aim')
    setPlayItem(makeItem(tier))
    itemShownAtRef.current = performance.now()
  }

  const finishRun = (): void => {
    const total = itemsPerRun(tier)
    const stars = starsFor(firstTryCorrect, total)
    setResult({ gameId: META.id, stars, firstTryCorrect, total })
    const base = progress ?? { ...FRESH_PROGRESS }
    const wpm = computeWpm(wordsReadRef.current, readMsRef.current)
    const updated = applyRun(base, tier, stars, { ts: Date.now(), wpm, mode: 'solo' })
    const unlockedNow = updated.unlockedTier > base.unlockedTier
    if (unlockedNow) sfx('levelup')
    setNewUnlock(unlockedNow)
    persist(updated)
    setScreen('end')
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') {
      advance()
      return
    }
    if (kind === 'retry' && playItem) {
      if (playItem.kind === 'word') void runWordTeaching(playItem.item.target)
      else void runSentenceTeaching(playItem.item)
    }
  }

  // ---------- Mode duo ----------

  const openDuoGate = (): void => {
    seqRef.current += 1
    setScreen('duo-gate')
    void say(E('flx.duo.passe'))
  }

  const startDuoReading = (): void => {
    seqRef.current += 1
    const avoid = lastDuoTemplateRef.current === null ? [] : [lastDuoTemplateRef.current]
    const txt = buildDuoText(avoid)
    lastDuoTemplateRef.current = txt.templateIndex
    setDuoText(txt)
    setDuoStartTs(null)
    setScreen('duo-read')
    void say(E('flx.duo.parent'))
  }

  const onDuoStartStop = (): void => {
    if (duoStartTs === null) {
      // Silence pendant la lecture à voix haute de l'enfant
      stopSpeech()
      seqRef.current += 1
      sfx('whoosh')
      setDuoStartTs(performance.now())
      return
    }
    sfx('tap')
    setDuoElapsed(performance.now() - duoStartTs)
    setScreen('duo-errors')
  }

  const onDuoErrors = (errors: number): void => {
    if (!duoText) return
    sfx('tap')
    const mclm = computeMclm(duoText.wordCount, errors, duoElapsed)
    setDuoMclm(mclm)
    // Une tentative de maîtrise par lecture duo
    void recordAttempt(DUO_SKILL, mclm >= DUO_SUCCESS_MCLM)
    const base = progress ?? { ...FRESH_PROGRESS }
    persist(applyDuo(base, { ts: Date.now(), wpm: mclm, mode: 'duo' }))
    setScreen('duo-parent')
  }

  const showChildCelebration = (): void => {
    setScreen('duo-child')
    setDuoBurst((b) => b + 1)
    sfx('fanfare')
    const seq = ++seqRef.current
    void say(E('flx.gare')).then(() => {
      if (seqRef.current !== seq) return
      void say(E('flx.duo.bravo'), { interrupt: false })
    })
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🚄
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('flx.intro')} autoPlay />
        </div>
        <div
          className="relative flex h-24 w-full max-w-sm items-end justify-center overflow-hidden rounded-card shadow-card"
          style={{ background: 'linear-gradient(180deg, #bfe3f7 0%, #e3f3d9 100%)' }}
          aria-hidden="true"
        >
          <span className="absolute top-2 left-4 text-xl">☁️</span>
          <span className="absolute top-3 right-6 text-xl">☁️</span>
          <span className="flx-chug pb-2 text-5xl">🚂</span>
          <span className="pb-2 text-4xl">🚃🚃</span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Lis dans ta tête, tape la bonne image : le train accélère !
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          {TIER_INFO.map((info, i) => {
            const t = i as TierId
            const locked = t > progress.unlockedTier
            const stars = Math.min(progress.bestStars[t] ?? 0, 3)
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
                  void say(E(`flx.niveau.${t}`))
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
          <button
            type="button"
            aria-label="Lecture en duo, avec un adulte"
            onClick={() => {
              sfx('tap')
              openDuoGate()
            }}
            className="tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95"
          >
            <span aria-hidden="true" className="text-3xl">
              👨‍👩‍👧
            </span>
            <span className="text-base leading-tight font-extrabold text-ink">Lecture en duo</span>
            <span className="text-xs font-semibold text-ink-soft">Avec un adulte</span>
            <span className="text-sm" aria-hidden="true">
              📖
            </span>
          </button>
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

  const renderWordPlay = (item: WordItem): ReactNode => {
    const syllables = item.target.syllables
    return (
      <>
        {/* La locomotive porte le mot — JAMAIS prononcé avant la réponse */}
        <div
          className="relative w-full rounded-card px-4 py-4 text-center shadow-card"
          style={{ background: ACCENT }}
        >
          <span aria-hidden="true" className="flx-smoke absolute -top-2 left-5 text-2xl">
            💨
          </span>
          <span aria-hidden="true" className="absolute top-2 left-3 text-3xl">
            🚂
          </span>
          <div
            className={`text-5xl font-extrabold tracking-wide text-white sm:text-6xl ${phase === 'teach' ? '' : 'flx-chug'}`}
            role="img"
            aria-label="Le mot à lire dans ta tête"
          >
            {syllables.map((s, i) => {
              const lit = teachIndex === i || (hint && phase === 'aim' && i === 0)
              return (
                <span
                  key={i}
                  className={lit ? 'animate-pop rounded-xl px-1' : 'px-0.5'}
                  style={lit ? { background: 'var(--color-sun)', color: 'var(--color-ink)' } : undefined}
                >
                  {s}
                </span>
              )
            })}
          </div>
        </div>

        {/* Les wagons-images : l'enfant tape celui qui correspond au mot lu */}
        <div className="grid w-full grid-cols-2 gap-3">
          {item.choices.map((c, i) => (
            <button
              key={c.word}
              type="button"
              aria-label={`Wagon ${i + 1}`}
              disabled={phase !== 'aim'}
              onClick={() => onWagonTap(i)}
              className={`tap-target card flex min-h-32 items-center justify-center border-b-8 transition-transform active:scale-95 ${
                wrongIndex === i ? 'animate-shake-soft' : ''
              }`}
              style={{ borderColor: ACCENT }}
            >
              <span aria-hidden="true" className="text-[80px] leading-none">
                {c.emoji}
              </span>
            </button>
          ))}
        </div>
      </>
    )
  }

  const renderScene = (scene: SceneSpec): ReactNode => (
    <span className="relative flex h-28 w-full items-center justify-center">
      <span aria-hidden="true" className="absolute top-0 right-1 text-3xl">
        {scene.place}
      </span>
      <span aria-hidden="true" className="text-6xl">
        {scene.subject}
      </span>
      <span aria-hidden="true" className="absolute bottom-0 left-1 text-3xl">
        {scene.action}
      </span>
    </span>
  )

  const renderSentencePlay = (item: SentenceItem): ReactNode => {
    return (
      <>
        {/* La phrase — JAMAIS prononcée avant la réponse */}
        <div
          className="w-full rounded-card px-4 py-5 text-center shadow-card"
          style={{ background: ACCENT }}
        >
          <p className="text-3xl leading-snug font-extrabold text-white sm:text-4xl">
            {item.subjectText}{' '}
            <span>{item.actionText}</span>{' '}
            <span
              className={hint && phase === 'aim' ? 'animate-pop rounded-xl px-1' : undefined}
              style={
                hint && phase === 'aim'
                  ? { background: 'var(--color-sun)', color: 'var(--color-ink)' }
                  : undefined
              }
            >
              {item.placeText}
            </span>
            .
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-3">
          {item.scenes.map((scene, i) => (
            <button
              key={`${scene.subject}${scene.action}${scene.place}`}
              type="button"
              aria-label={`Image ${i + 1}`}
              disabled={phase !== 'aim'}
              onClick={() => onSceneTap(i)}
              className={`tap-target card border-b-8 p-2 transition-transform active:scale-95 ${
                wrongIndex === i ? 'animate-shake-soft' : ''
              }`}
              style={{ borderColor: ACCENT }}
            >
              {renderScene(scene)}
            </button>
          ))}
        </div>
      </>
    )
  }

  const renderPlay = (current: PlayItem): ReactNode => {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-3 pb-6">
        <div className="w-full">
          <Landscape streak={streak} paused={phase !== 'aim'} />
          <TrackProgress done={resolved} total={itemsPerRun(tier)} />
        </div>
        {current.kind === 'word' ? renderWordPlay(current.item) : renderSentencePlay(current.item)}
      </div>
    )
  }

  const renderDuoGate = (): ReactNode => (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
      <Mascot mood="thinking" size={90} />
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="text-5xl">
          🧑‍🦱👧
        </span>
        <SpeakerButton entry={E('flx.duo.passe')} />
      </div>
      <p className="text-2xl font-extrabold text-ink">Passe la tablette à un adulte !</p>
      <p className="text-base font-semibold text-ink-soft">
        La lecture en duo se fait à voix haute, avec un grand qui t’écoute.
      </p>
      <BigButton variant="accent" accent={ACCENT} className="w-full text-xl" onClick={startDuoReading}>
        Je suis un adulte — continuer
      </BigButton>
      <BigButton variant="soft" className="w-full" onClick={() => setScreen('menu')}>
        ← Retour
      </BigButton>
    </div>
  )

  const renderDuoRead = (txt: DuoText): ReactNode => (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 p-4">
      {duoStartTs === null ? (
        <div className="card flex w-full items-center gap-3 p-3">
          <SpeakerButton entry={E('flx.duo.parent')} />
          <p className="text-sm font-semibold text-ink-soft">
            Adulte : appuyez sur « Départ », laissez l’enfant lire le texte à voix haute, puis
            appuyez sur « Fini ! ».
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="flx-chug text-3xl">🚂</span>
          <span className="text-base font-extrabold" style={{ color: ACCENT }}>
            Lecture en cours… à voix haute !
          </span>
        </div>
      )}
      <div className="card w-full p-5">
        <p className="text-2xl leading-relaxed font-bold text-ink sm:text-3xl">{txt.text}</p>
      </div>
      <BigButton
        variant="accent"
        accent={duoStartTs === null ? '#2e7d32' : ACCENT}
        className="w-full max-w-xs text-2xl"
        onClick={onDuoStartStop}
      >
        {duoStartTs === null ? 'Départ 🚩' : 'Fini ! 🏁'}
      </BigButton>
    </div>
  )

  const renderDuoErrors = (): ReactNode => (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 p-4 text-center">
      <p className="text-xl font-extrabold text-ink">
        Adulte : combien de mots ont posé problème ?
      </p>
      <div className="grid w-full grid-cols-3 gap-3">
        {ERROR_CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onDuoErrors(n)}
            className="tap-target card flex min-h-20 items-center justify-center text-3xl font-extrabold text-ink transition-transform active:scale-95"
          >
            {n === 5 ? '5+' : n}
          </button>
        ))}
      </div>
    </div>
  )

  const renderDuoParent = (): ReactNode => (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-4">
      <p className="text-lg font-extrabold text-ink">Résultat (côté adulte)</p>
      <div className="card w-full p-5">
        <MclmGauge mclm={duoMclm} />
        <p className="mt-2 text-center text-xs font-semibold text-ink-soft">
          Repères des programmes : 30 à 50 mots/min en fin de CP, environ 70 en fin de CE1. Ce
          chiffre reste entre adultes — l’enfant, lui, voit le train arriver en gare.
        </p>
      </div>
      <BigButton
        variant="accent"
        accent={ACCENT}
        className="w-full text-xl"
        onClick={showChildCelebration}
      >
        Montrer la gare au champion 🎉
      </BigButton>
    </div>
  )

  const renderDuoChild = (): ReactNode => (
    <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4 text-center">
      <ConfettiBurst burst={duoBurst} />
      <div
        className="relative h-28 w-full overflow-hidden rounded-card shadow-card"
        style={{ background: 'linear-gradient(180deg, #bfe3f7 0%, #e3f3d9 100%)' }}
        aria-hidden="true"
      >
        <span className="absolute top-1 right-2 text-4xl">🚉</span>
        <span className="absolute top-2 left-3 text-xl">☁️</span>
        <div className="flx-arrive absolute bottom-2 left-6 text-5xl">🚂🚃🚃</div>
      </div>
      <Mascot mood="cheer" size={110} />
      <p className="text-2xl font-extrabold text-ink">
        Quelle belle lecture ! Le train est arrivé en gare ! 🎉
      </p>
      <div className="flex w-full flex-col gap-3">
        <BigButton variant="accent" accent={ACCENT} className="w-full" onClick={startDuoReading}>
          Encore une histoire ! 📖
        </BigButton>
        <BigButton variant="soft" className="w-full" onClick={() => setScreen('menu')}>
          Retour au menu
        </BigButton>
      </div>
    </div>
  )

  return (
    <GameShell
      meta={META}
      hud={
        screen === 'play' ? (
          <ProgressDots total={itemsPerRun(tier)} done={resolved} />
        ) : undefined
      }
      onReplayInstruction={replayInstruction}
    >
      <FlxStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && playItem && renderPlay(playItem)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouveau voyage débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      {screen === 'duo-gate' && renderDuoGate()}
      {screen === 'duo-read' && duoText && renderDuoRead(duoText)}
      {screen === 'duo-errors' && renderDuoErrors()}
      {screen === 'duo-parent' && renderDuoParent()}
      {screen === 'duo-child' && renderDuoChild()}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
