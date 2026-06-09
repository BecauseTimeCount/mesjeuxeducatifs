// ============================================================
// Le Train des Syllabes 🚂 — phonologie 100 % auditive.
// Le mot n'est JAMAIS affiché : l'enfant l'entend, assemble des
// wagons-syllabes derrière la locomotive, puis tire le sifflet.
// Le train relit la composition wagon par wagon… et part
// joyeusement si c'est bon, ou déraille comiquement sinon.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { say, sfx, stopSpeech } from '@/engine/audio'
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
  uiEntry,
} from '@/ui'
import corpusJson from './corpus.json'
import {
  DEFAULT_SAVE,
  ITEMS_PER_RUN,
  applyRunToSave,
  genItem,
  itemKey,
  starsFor,
  t3Kinds,
  validateBuild,
  validateScander,
  type Item,
  type SaveState,
  type Tier,
} from './logic'
import { Tuner } from '@/engine/adaptive'
import type { Syllable, Word } from './words'

// ------------------------------------------------------------
// Méta + corpus
// ------------------------------------------------------------

const META_MAYBE = GAMES_BY_ID.get('train-des-syllabes')
if (!META_MAYBE) throw new Error('train-des-syllabes absent du manifest')
const META: GameMeta = META_MAYBE

const ACCENT = META.accent

function toVoice(v: string | undefined): CorpusEntry['voice'] {
  return v === 'denise' || v === 'eloise' || v === 'henri' ? v : undefined
}

const CORPUS: ReadonlyMap<string, CorpusEntry> = new Map(
  corpusJson.entries.map((e): [string, CorpusEntry] => [
    e.id,
    { id: e.id, text: e.text, voice: toVoice('voice' in e ? e.voice : undefined) },
  ]),
)

function entry(id: string): CorpusEntry {
  return CORPUS.get(id) ?? { id, text: '' }
}

function sylEntry(s: Syllable): CorpusEntry {
  return { id: s.clipId, text: s.say }
}

function wordEntry(w: Word): CorpusEntry {
  return { id: w.clipId, text: w.word }
}

const SAVE_KEY = 'game:train-des-syllabes'

interface TierDef {
  tier: Tier
  name: string
  emoji: string
  consigneId: string
}

const TIERS: readonly TierDef[] = [
  { tier: 0, name: 'Le tambour', emoji: '🥁', consigneId: 'tds.consigne.t0' },
  { tier: 1, name: 'Le petit train', emoji: '🚃', consigneId: 'tds.consigne.t1' },
  { tier: 2, name: 'Le grand train', emoji: '🚞', consigneId: 'tds.consigne.t2' },
  { tier: 3, name: 'Le train magique', emoji: '✨', consigneId: 'tds.consigne.t3' },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// ------------------------------------------------------------
// Wagon — carte syllabe avec petites roues
// ------------------------------------------------------------

interface WagonProps {
  text: string
  onClick?: () => void
  highlighted?: boolean
  hinted?: boolean
  ghost?: boolean
  derailed?: boolean
  big?: boolean
}

function Wagon({ text, onClick, highlighted, hinted, ghost, derailed, big }: WagonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={onClick === undefined || ghost}
      className={[
        'tap-target relative flex flex-col items-center justify-center rounded-2xl border-4 bg-white font-extrabold text-ink shadow-card transition-transform duration-150',
        big ? 'min-h-[72px] px-4 text-3xl' : 'min-h-16 px-3 text-2xl',
        onClick !== undefined && !ghost ? 'active:scale-90' : '',
        highlighted ? 'animate-wiggle scale-110' : '',
        hinted ? 'animate-pulse-glow' : '',
        ghost ? 'opacity-25' : 'animate-pop',
        derailed ? 'rotate-6' : '',
      ].join(' ')}
      style={{
        borderColor: ACCENT,
        background: highlighted ? `${ACCENT}2e` : hinted ? '#fff7e0' : 'white',
      }}
    >
      <span>{text}</span>
      <span aria-hidden="true" className="absolute -bottom-2 flex w-full justify-around px-2">
        <span className="h-3 w-3 rounded-full bg-ink" />
        <span className="h-3 w-3 rounded-full bg-ink" />
      </span>
    </button>
  )
}

/** Wagon vide allumé par un coup de tambour (palier T0). */
function RhythmWagon({ lit }: { lit: boolean }) {
  return (
    <span
      className={`flex h-14 w-14 items-center justify-center rounded-2xl border-4 text-3xl ${lit ? 'animate-pop' : ''}`}
      style={{ borderColor: ACCENT, background: lit ? `${ACCENT}2e` : 'white' }}
      aria-hidden="true"
    >
      {lit ? '💡' : ''}
    </span>
  )
}

// ------------------------------------------------------------
// Écran d'accueil — sélection du palier
// ------------------------------------------------------------

interface HomeProps {
  save: SaveState
  tier: Tier
  onSelectTier: (t: Tier) => void
  onPlay: () => void
}

function HomeScreen({ save, tier, onSelectTier, onPlay }: HomeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 sm:gap-6">
      <div className="flex items-center gap-4 sm:gap-6">
        <Mascot mood="happy" size={80} />
        <span aria-hidden="true" className="animate-floaty text-7xl sm:text-8xl">
          🚂
        </span>
        <SpeakerButton entry={entry('tds.consigne.intro')} autoPlay />
      </div>

      <p className="max-w-md text-center text-lg font-bold text-ink-soft">
        Écoute le mot, accroche les wagons… et en route !
      </p>

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {TIERS.map((t) => {
          const locked = t.tier > save.unlockedTier
          const stars = save.bestStars[String(t.tier)] ?? 0
          const selected = t.tier === tier
          return (
            <button
              key={t.tier}
              type="button"
              onClick={() => {
                sfx('tap')
                if (locked) return
                onSelectTier(t.tier)
                void say(entry(t.consigneId))
              }}
              className={`card tap-target flex flex-col items-center gap-1 p-3 transition-transform active:scale-95 ${locked ? 'opacity-50 grayscale' : ''}`}
              style={selected ? { boxShadow: `0 0 0 4px ${ACCENT}, var(--shadow-card)` } : undefined}
              aria-label={locked ? `${t.name} (verrouillé)` : t.name}
            >
              <span aria-hidden="true" className="text-4xl">
                {locked ? '🔒' : t.emoji}
              </span>
              <span className="text-base font-extrabold text-ink">{t.name}</span>
              <span aria-hidden="true" className="text-sm">
                {[1, 2, 3].map((i) => (i <= stars ? '⭐' : '☆')).join('')}
              </span>
            </button>
          )
        })}
      </div>

      <BigButton variant="accent" accent={ACCENT} onClick={onPlay} className="px-10 py-4 text-2xl">
        🚂 Jouer !
      </BigButton>
    </div>
  )
}

// ------------------------------------------------------------
// Écran de jeu — une partie de 8 items
// ------------------------------------------------------------

interface PlayProps {
  tier: Tier
  onEnd: (firstTryCorrect: number) => void
  onProgress: (done: number) => void
  replayRef: RefObject<() => void>
}

type Phase = 'build' | 'reading' | 'celebrate' | 'retry'

function PlayScreen({ tier, onEnd, onProgress, replayRef }: PlayProps) {
  const usedRef = useRef<Set<string> | null>(null)
  usedRef.current ??= new Set<string>()
  const used = usedRef.current
  const tunerRef = useRef<Tuner | null>(null)
  tunerRef.current ??= new Tuner({ min: 0, max: 1 })
  const kindsRef = useRef<('pseudo' | 'suppression')[] | null>(null)
  kindsRef.current ??= t3Kinds()

  const [item, setItem] = useState<Item>(() => {
    const it = genItem(tier, 0, used, kindsRef.current?.[0])
    used.add(itemKey(it))
    return it
  })
  const [itemIndex, setItemIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('build')
  const [built, setBuilt] = useState<number[]>([])
  const [taps, setTaps] = useState(0)
  const [readingPos, setReadingPos] = useState(-1)
  const [feedback, setFeedback] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [departing, setDeparting] = useState(false)
  const [derailed, setDerailed] = useState(false)
  const [reveal, setReveal] = useState(false)

  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  const firstTryCountRef = useRef(0)
  const seqRef = useRef(0)
  const timersRef = useRef<number[]>([])

  const later = useCallback((fn: () => void, ms: number): void => {
    timersRef.current.push(window.setTimeout(fn, ms))
  }, [])

  // --------- séquences audio (annulables) ---------

  const playSeq = useCallback(async (parts: readonly CorpusEntry[]): Promise<boolean> => {
    const token = ++seqRef.current
    for (let i = 0; i < parts.length; i++) {
      if (seqRef.current !== token) return false
      await say(parts[i], { interrupt: i === 0 })
    }
    return seqRef.current === token
  }, [])

  const itemAudio = useCallback(
    (it: Item, withConsigne: boolean): CorpusEntry[] => {
      const parts: CorpusEntry[] = []
      if (withConsigne) parts.push(entry(TIERS[tier].consigneId))
      switch (it.kind) {
        case 'scander':
        case 'fusion':
          parts.push(entry('tds.jeu.ecoute'), wordEntry(it.word))
          break
        case 'pseudo':
          parts.push(
            entry('tds.t3.pseudo-intro'),
            ...it.answer.map(sylEntry),
            entry('tds.t3.pseudo-construis'),
          )
          break
        case 'suppression':
          parts.push(
            entry('tds.jeu.ecoute'),
            wordEntry(it.word),
            entry('tds.t3.suppr-enleve'),
            sylEntry(it.removed),
            entry('tds.t3.suppr-reste'),
          )
          break
      }
      return parts
    },
    [tier],
  )

  // Consigne + mot au démarrage de chaque item
  useEffect(() => {
    void playSeq(itemAudio(item, itemIndex === 0))
    // item change ⇒ nouvelle annonce ; itemIndex bouge en même temps que item
  }, [item, itemIndex, itemAudio, playSeq])

  // Bouton 🔊🔁 de la barre du GameShell
  useEffect(() => {
    replayRef.current = () => void playSeq(itemAudio(item, false))
  }, [item, itemAudio, playSeq, replayRef])

  // Nettoyage : timers + audio
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      seqRef.current += 1
      timers.forEach((t) => window.clearTimeout(t))
      stopSpeech()
    }
  }, [])

  const answer = item.kind === 'scander' ? item.word.syllables : item.answer
  const pool: readonly Syllable[] = item.kind === 'scander' ? [] : item.pool

  // --------- interactions ---------

  function tapWagon(i: number): void {
    if (phase !== 'build' || built.includes(i)) return
    void say(sylEntry(pool[i]))
    if (built.length >= answer.length) {
      sfx('tap')
      return
    }
    sfx('pop')
    setBuilt([...built, i])
  }

  function tapTrainWagon(pos: number): void {
    if (phase !== 'build') return
    sfx('slide')
    setBuilt(built.filter((_, p) => p !== pos))
  }

  function tapDrum(): void {
    if (phase !== 'build' || taps >= 6) return
    sfx('tap')
    setTaps(taps + 1)
  }

  // --------- résolution ---------

  function handleSuccess(): void {
    const firstTry = firstTryRef.current
    if (firstTry) firstTryCountRef.current += 1
    void recordAttempt(item.skillId, firstTry)
    tunerRef.current?.onResult(firstTry)
    setPhase('celebrate')
    setReveal(true)
    setDeparting(true)
    sfx('whoosh')
    later(() => setFeedback('success'), 650)
  }

  function handleFail(): void {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('retry')
    setDerailed(true)
    void say(entry('tds.fb.deraille'))
    later(() => setFeedback('retry'), 450)
  }

  async function runReading(): Promise<void> {
    if (phase !== 'build' || built.length !== answer.length) return
    setPhase('reading')
    const token = ++seqRef.current
    await say(entry('tds.jeu.en-route'))
    for (let pos = 0; pos < built.length; pos++) {
      if (seqRef.current !== token) return
      setReadingPos(pos)
      await say(sylEntry(pool[built[pos]]), { interrupt: false })
      await sleep(120)
    }
    setReadingPos(-1)
    if (seqRef.current !== token) return
    if (validateBuild(answer, built.map((i) => pool[i]))) handleSuccess()
    else handleFail()
  }

  function validateDrum(): void {
    if (phase !== 'build' || taps === 0 || item.kind !== 'scander') return
    setPhase('reading')
    if (validateScander(item.word, taps)) handleSuccess()
    else handleFail()
  }

  /** Indice T0 : Plume tape les syllabes (les wagons s'allument un à un). */
  async function demoScander(word: Word): Promise<void> {
    const token = ++seqRef.current
    setTaps(0)
    for (let i = 0; i < word.syllables.length; i++) {
      if (seqRef.current !== token) return
      sfx('tap')
      setTaps(i + 1)
      await say(sylEntry(word.syllables[i]), { interrupt: i === 0 })
      await sleep(250)
    }
    if (seqRef.current !== token) return
    await sleep(500)
    if (seqRef.current === token) setTaps(0)
  }

  function afterRetryOverlay(): void {
    setFeedback(null)
    setDerailed(false)
    setBuilt([])
    setTaps(0)
    const showHint = failsRef.current >= 2
    setHint(showHint)
    setPhase('build')

    if (item.kind === 'scander') {
      const word = item.word
      const parts = [entry('tds.fb.reecoute'), wordEntry(word)]
      if (showHint) parts.push(entry('tds.fb.indice-tambour'))
      void playSeq(parts).then((completed) => {
        if (completed && showHint) void demoScander(word)
      })
    } else {
      // « Mais moi, j'ai dit : » + la cible (mot entier, ou syllabes attendues)
      const target: CorpusEntry[] =
        item.kind === 'fusion' ? [wordEntry(item.word)] : item.answer.map(sylEntry)
      const parts = [entry('tds.fb.mais-dit'), ...target]
      if (showHint) parts.push(entry('tds.fb.indice'))
      void playSeq(parts)
    }
  }

  function nextItem(): void {
    setFeedback(null)
    const nextIdx = itemIndex + 1
    onProgress(nextIdx)
    if (nextIdx >= ITEMS_PER_RUN) {
      onEnd(firstTryCountRef.current)
      return
    }
    const it = genItem(tier, tunerRef.current?.level ?? 0, used, kindsRef.current?.[nextIdx])
    used.add(itemKey(it))
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setReveal(false)
    setDeparting(false)
    setDerailed(false)
    setBuilt([])
    setTaps(0)
    setReadingPos(-1)
    setItemIndex(nextIdx)
    setItem(it)
    setPhase('build')
  }

  // --------- rendu ---------

  const nextNeeded = answer[built.length]
  const revealEmoji = item.kind === 'pseudo' ? '🤪' : item.word.emoji
  const mascotMood = phase === 'celebrate' ? 'cheer' : phase === 'reading' ? 'thinking' : 'idle'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
      {/* ----- Zone cible : mascotte, réécoute, carte mystère ----- */}
      <div className="card flex items-center justify-center gap-4 p-3 sm:gap-6 sm:p-4">
        <Mascot mood={mascotMood} size={64} />
        <button
          type="button"
          onClick={() => {
            sfx('tap')
            void playSeq(itemAudio(item, false))
          }}
          aria-label="Réécouter le mot"
          className="tap-target flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-card transition-transform active:scale-95"
          style={{ boxShadow: `0 0 0 3px ${ACCENT}55, var(--shadow-card)` }}
        >
          <span aria-hidden="true">🔊</span>
        </button>
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-2xl text-5xl sm:h-24 sm:w-24 sm:text-6xl"
          style={{ background: `${ACCENT}14` }}
          aria-hidden="true"
        >
          {reveal ? <span className="animate-pop">{revealEmoji}</span> : <span>❓</span>}
        </div>
        {item.kind === 'suppression' && (
          <div className="flex flex-col items-center gap-1" aria-hidden="true">
            <span className="text-xl">➖</span>
            <span
              className="rounded-xl border-4 border-dashed px-3 py-1 text-2xl font-extrabold text-ink line-through"
              style={{ borderColor: '#e85d4a' }}
            >
              {item.removed.g}
            </span>
          </div>
        )}
      </div>

      {/* ----- La voie ferrée ----- */}
      <div className="card relative overflow-hidden px-3 pt-5 pb-6 sm:px-5">
        <div
          className={`flex items-end gap-2 transition-transform duration-[1200ms] ease-in ${departing ? '-translate-x-[130%]' : ''} ${derailed ? 'animate-shake-soft' : ''}`}
        >
          <span
            aria-hidden="true"
            className={`text-6xl leading-none sm:text-7xl ${phase === 'reading' ? 'animate-wiggle' : ''} ${derailed ? '-rotate-12' : ''}`}
          >
            🚂
          </span>

          {item.kind === 'scander'
            ? Array.from({ length: Math.max(taps, 1) }, (_, i) => (
                <RhythmWagon key={i} lit={i < taps} />
              ))
            : answer.map((_, pos) =>
                pos < built.length ? (
                  <Wagon
                    key={`b-${pos}-${built[pos]}`}
                    text={pool[built[pos]].g}
                    onClick={() => tapTrainWagon(pos)}
                    highlighted={pos === readingPos}
                    derailed={derailed && pos % 2 === 0}
                  />
                ) : (
                  <span
                    key={`s-${pos}`}
                    aria-hidden="true"
                    className="flex h-16 w-[72px] items-center justify-center rounded-2xl border-4 border-dashed text-2xl text-ink-soft/40"
                    style={{ borderColor: `${ACCENT}55` }}
                  >
                    ?
                  </span>
                ),
              )}
        </div>
        {/* rail */}
        <div
          aria-hidden="true"
          className="absolute right-0 bottom-3 left-0 h-1.5"
          style={{
            background: `repeating-linear-gradient(90deg, ${ACCENT}66 0 18px, transparent 18px 28px)`,
          }}
        />
      </div>

      {/* ----- Wagons proposés OU tambour ----- */}
      {item.kind === 'scander' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-2">
          <button
            type="button"
            onClick={tapDrum}
            aria-label="Tambour : tape une fois par syllabe"
            className="tap-target flex h-32 w-32 items-center justify-center rounded-full bg-white text-7xl shadow-card transition-transform active:scale-90 sm:h-36 sm:w-36"
            style={{ boxShadow: `0 0 0 5px ${ACCENT}44, var(--shadow-card)` }}
          >
            <span aria-hidden="true" key={taps} className={taps > 0 ? 'animate-pop' : ''}>
              🥁
            </span>
          </button>
          <div className="flex items-center gap-3">
            <BigButton
              variant="soft"
              onClick={() => {
                setTaps(0)
                sfx('slide')
              }}
              disabled={phase !== 'build' || taps === 0}
            >
              🧽 Efface
            </BigButton>
            <BigButton
              variant="accent"
              accent={ACCENT}
              onClick={validateDrum}
              disabled={phase !== 'build' || taps === 0}
            >
              C’est tout !
            </BigButton>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-3 py-2">
            {pool.map((s, i) => {
              const attached = built.includes(i)
              const hinted =
                hint && !attached && nextNeeded !== undefined && s.g === nextNeeded.g &&
                pool.findIndex((p, j) => p.g === nextNeeded.g && !built.includes(j)) === i
              return (
                <Wagon
                  key={`${itemIndex}-${i}`}
                  text={s.g}
                  big
                  onClick={() => tapWagon(i)}
                  ghost={attached}
                  hinted={hinted}
                />
              )
            })}
          </div>
          <div className="flex justify-center pb-1">
            <BigButton
              variant="accent"
              accent={ACCENT}
              onClick={() => void runReading()}
              disabled={phase !== 'build' || built.length !== answer.length}
              className="px-10 py-4 text-2xl"
            >
              🛎️ En route !
            </BigButton>
          </div>
        </>
      )}

      <FeedbackOverlay
        kind={feedback}
        message={feedback === 'retry' ? 'Écoute encore le mot…' : undefined}
        onDone={feedback === 'success' ? nextItem : afterRetryOverlay}
      />
    </div>
  )
}

// ------------------------------------------------------------
// Composant principal
// ------------------------------------------------------------

export default function TrainDesSyllabes() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<'home' | 'play' | 'end'>('home')
  const [tier, setTier] = useState<Tier>(0)
  const [save, setSave] = useState<SaveState>(DEFAULT_SAVE)
  const [result, setResult] = useState<LevelResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [runId, setRunId] = useState(0)
  const replayRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    let alive = true
    void pget<SaveState>(SAVE_KEY).then((s) => {
      if (alive && s) {
        setSave({
          ...DEFAULT_SAVE,
          ...s,
          bestStars: { ...DEFAULT_SAVE.bestStars, ...s.bestStars },
        })
      }
    })
    return () => {
      alive = false
    }
  }, [])

  function startRun(): void {
    setProgress(0)
    setRunId((r) => r + 1)
    setScreen('play')
  }

  function handleEnd(firstTryCorrect: number): void {
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    const prevUnlocked = save.unlockedTier
    const next = applyRunToSave(save, tier, stars)
    setSave(next)
    void pset(SAVE_KEY, next)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    setScreen('end')
    if (next.unlockedTier > prevUnlocked) {
      window.setTimeout(() => {
        sfx('levelup')
        void say(uiEntry('ui.nouveau-niveau'))
      }, 2400)
    }
  }

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={progress} /> : undefined}
      onReplayInstruction={screen === 'play' ? () => replayRef.current() : undefined}
    >
      {screen === 'home' && (
        <HomeScreen save={save} tier={tier} onSelectTier={setTier} onPlay={startRun} />
      )}
      {screen === 'play' && (
        <PlayScreen
          key={runId}
          tier={tier}
          onEnd={handleEnd}
          onProgress={setProgress}
          replayRef={replayRef}
        />
      )}
      {screen === 'end' && result && (
        <LevelEnd result={result} onReplay={startRun} onHome={() => navigate('/')} />
      )}
    </GameShell>
  )
}
