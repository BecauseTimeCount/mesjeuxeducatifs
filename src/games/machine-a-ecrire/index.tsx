import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  uiEntry,
} from '@/ui'
import corpus from './corpus.json'
import {
  KEYBOARDS,
  RUN_LENGTH,
  TIER_INFO,
  TIER_SKILLS,
  correctPrefixLen,
  generateRun,
  isDigraphKey,
  isPrefix,
  isVowelKey,
  keyboardRows,
  keyClipId,
  nextExpected,
  pushReview,
  starsFor,
  takeReview,
  targetClipId,
  validate,
  type MaeRun,
  type MaeTarget,
  type MaeTier,
} from './logic'

// ============================================================
// La Machine à Écrire Magique ⌨️✨ — LE jeu d'encodage.
// L'enfant ENTEND (voyelle, syllabe, mot) et PRODUIT l'écriture
// sur un clavier de graphèmes. Zéro choix multiple.
// ============================================================

const META: GameMeta = GAMES_BY_ID.get('machine-a-ecrire') ?? {
  id: 'machine-a-ecrire',
  title: 'La Machine à Écrire Magique',
  tagline: 'Écoute le son, écris-le avec les touches !',
  icon: '⌨️',
  island: 'sons',
  accent: '#ad1457',
  skills: [],
  status: 'v2',
}

const ACCENT = META.accent
const TIERS: readonly MaeTier[] = [0, 1, 2, 3]

// ---------- Accès typé au corpus du jeu ----------

function toVoice(v: string | undefined): CorpusEntry['voice'] {
  switch (v) {
    case 'denise':
    case 'eloise':
    case 'henri':
      return v
    default:
      return undefined
  }
}

const ENTRIES: ReadonlyMap<string, CorpusEntry> = new Map(
  corpus.entries.map((e): [string, CorpusEntry] => [
    e.id,
    { id: e.id, text: e.text, voice: toVoice(e.voice) },
  ]),
)

function C(id: string): CorpusEntry {
  return ENTRIES.get(id) ?? { id, text: '' }
}

function cibleEntry(t: MaeTarget): CorpusEntry {
  return C(targetClipId(t))
}

function keyEntry(g: string): CorpusEntry {
  return C(keyClipId(g))
}

// ---------- Persistance ----------

interface MaeSave {
  bestStars: Record<string, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
  /** File de répétition espacée : mots ratés, par palier */
  reviewQueue: Record<string, string[]>
}

const SAVE_KEY = 'game:machine-a-ecrire'
const DEFAULT_SAVE: MaeSave = { bestStars: {}, unlockedTier: 0, runs: 0, reviewQueue: {} }

type Phase = 'home' | 'play' | 'end'

// ============================================================
// Composant principal
// ============================================================

export default function MachineAEcrire() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('home')
  const [save, setSave] = useState<MaeSave>(DEFAULT_SAVE)
  const saveRef = useRef<MaeSave>(DEFAULT_SAVE)
  const [tier, setTier] = useState<MaeTier>(0)
  const [run, setRun] = useState<MaeRun>({ items: [], reviewCount: 0 })
  const [runId, setRunId] = useState(0)
  const [result, setResult] = useState<LevelResult | null>(null)
  const [done, setDone] = useState(0)
  const replayRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    void pget<MaeSave>(SAVE_KEY).then((s) => {
      if (!s) return
      const merged: MaeSave = { ...DEFAULT_SAVE, ...s }
      saveRef.current = merged
      setSave(merged)
    })
  }, [])

  const commitSave = useCallback((next: MaeSave) => {
    saveRef.current = next
    setSave(next)
    void pset(SAVE_KEY, next)
  }, [])

  const selectTier = useCallback(
    (t: MaeTier) => {
      sfx('tap')
      if (t > saveRef.current.unlockedTier) {
        void say(C('mae.consigne.verrouille'))
        return
      }
      setTier(t)
      void say(C(`mae.palier.t${t}`))
    },
    [],
  )

  const startRun = useCallback(
    (t: MaeTier) => {
      const s = saveRef.current
      const queue = s.reviewQueue[String(t)] ?? []
      const { now, rest } = takeReview(queue)
      const generated = generateRun(t, now)
      commitSave({ ...s, reviewQueue: { ...s.reviewQueue, [String(t)]: rest } })
      preloadClips([
        ...generated.items.map((i) => targetClipId(i)),
        ...KEYBOARDS[t].map((g) => keyClipId(g)),
      ])
      setTier(t)
      setRun(generated)
      setDone(0)
      setResult(null)
      setRunId((id) => id + 1)
      setPhase('play')
    },
    [commitSave],
  )

  const handleFailWord = useCallback(
    (word: string) => {
      const s = saveRef.current
      const key = String(tier)
      commitSave({
        ...s,
        reviewQueue: { ...s.reviewQueue, [key]: pushReview(s.reviewQueue[key] ?? [], word) },
      })
    },
    [commitSave, tier],
  )

  const handleEnd = useCallback(
    (firstTryCorrect: number) => {
      const total = run.items.length
      const stars = starsFor(firstTryCorrect, total)
      const s = saveRef.current
      const key = String(tier)
      const best = s.bestStars[key] ?? 0
      const next: MaeSave = {
        ...s,
        runs: s.runs + 1,
        bestStars: { ...s.bestStars, [key]: stars > best ? stars : best },
      }
      const unlocks = stars >= 2 && tier < 3 && s.unlockedTier === tier
      if (unlocks) next.unlockedTier = tier + 1
      commitSave(next)
      setResult({ gameId: META.id, stars, firstTryCorrect, total })
      setPhase('end')
      if (unlocks) {
        window.setTimeout(() => {
          void say(uiEntry('ui.nouveau-niveau'))
        }, 2600)
      }
    },
    [commitSave, run.items.length, tier],
  )

  const registerReplay = useCallback((fn: () => void) => {
    replayRef.current = fn
  }, [])

  return (
    <GameShell
      meta={META}
      hud={phase === 'play' ? <ProgressDots total={RUN_LENGTH} done={done} /> : undefined}
      onReplayInstruction={phase === 'play' ? () => replayRef.current?.() : undefined}
    >
      {phase === 'home' && (
        <HomeScreen save={save} tier={tier} onSelectTier={selectTier} onPlay={() => startRun(tier)} />
      )}

      {phase === 'play' && (
        <PlayScreen
          key={runId}
          tier={tier}
          items={run.items}
          reviewCount={run.reviewCount}
          onProgress={setDone}
          registerReplay={registerReplay}
          onFailWord={handleFailWord}
          onEnd={handleEnd}
        />
      )}

      {phase === 'end' && result && (
        <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => void navigate('/')} />
      )}
    </GameShell>
  )
}

// ============================================================
// Écran d'accueil — sélection du palier
// ============================================================

interface HomeScreenProps {
  save: MaeSave
  tier: MaeTier
  onSelectTier: (t: MaeTier) => void
  onPlay: () => void
}

function HomeScreen({ save, tier, onSelectTier, onPlay }: HomeScreenProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-4">
      <div className="flex items-center gap-4">
        <Mascot mood="happy" size={88} />
        <span aria-hidden="true" className="animate-floaty text-7xl">
          ⌨️
        </span>
        <SpeakerButton entry={C('mae.consigne.intro')} autoPlay />
      </div>

      <p className="max-w-sm text-center text-xl font-extrabold text-ink">
        Écoute le son… et tape-le sur la machine magique !
      </p>

      <div className="grid w-full max-w-lg grid-cols-2 gap-3">
        {TIERS.map((t) => {
          const locked = t > save.unlockedTier
          const stars = save.bestStars[String(t)] ?? 0
          const selected = t === tier && !locked
          return (
            <button
              key={t}
              type="button"
              onClick={() => onSelectTier(t)}
              aria-pressed={selected}
              className={`tap-target card flex flex-col items-center gap-1 px-3 py-3 transition-transform active:scale-95 ${
                locked ? 'opacity-55' : ''
              }`}
              style={selected ? { outline: `4px solid ${ACCENT}`, outlineOffset: '-2px' } : undefined}
            >
              <span aria-hidden="true" className="text-3xl">
                {locked ? '🔒' : TIER_INFO[t].emoji}
              </span>
              <span className="text-base font-extrabold text-ink">{TIER_INFO[t].name}</span>
              <span className="text-sm font-bold text-ink-soft">{TIER_INFO[t].sample}</span>
              <span className="text-sm" role="img" aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}>
                {'⭐'.repeat(stars)}
                {'☆'.repeat(3 - stars)}
              </span>
            </button>
          )
        })}
      </div>

      <BigButton variant="accent" accent={ACCENT} onClick={onPlay} className="px-12 text-2xl">
        ▶️ Jouer !
      </BigButton>
    </div>
  )
}

// ============================================================
// Écran de jeu — la machine, le papier, le clavier
// ============================================================

interface PlayScreenProps {
  tier: MaeTier
  items: MaeTarget[]
  reviewCount: number
  onProgress: (done: number) => void
  registerReplay: (fn: () => void) => void
  onFailWord: (word: string) => void
  onEnd: (firstTryCorrect: number) => void
}

function PlayScreen({
  tier,
  items,
  reviewCount,
  onProgress,
  registerReplay,
  onFailWord,
  onEnd,
}: PlayScreenProps) {
  const [idx, setIdx] = useState(0)
  const [typed, setTyped] = useState<readonly string[]>([])
  /** Graphèmes verts conservés après une erreur (le ⌫ ne les efface pas) */
  const [locked, setLocked] = useState(0)
  /** Échecs consécutifs d'impression sur l'item courant (≥ 2 → indice) */
  const [fails, setFails] = useState(0)
  const [feedback, setFeedback] = useState<'success' | 'retry' | null>(null)
  const [stamp, setStamp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)
  const firstTryRef = useRef(true)
  const firstTryCorrectRef = useRef(0)
  const aliveRef = useRef(true)

  const item = items[idx]

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    onProgress(idx)
  }, [idx, onProgress])

  useEffect(() => {
    if (!item) return
    registerReplay(() => {
      void say(cibleEntry(item))
    })
  }, [item, registerReplay])

  // Consigne (1er item) ou « Écoute bien ! », puis le stimulus.
  useEffect(() => {
    if (!item) return
    let cancelled = false
    const introduce = async (): Promise<void> => {
      if (idx === 0) {
        if (reviewCount > 0) {
          await say(C('mae.reaction.revision'))
          if (cancelled) return
          await say(C(`mae.consigne.t${tier}`), { interrupt: false })
        } else {
          await say(C(`mae.consigne.t${tier}`))
        }
      } else {
        await say(uiEntry('ui.ecoute-bien'))
      }
      if (cancelled) return
      await say(cibleEntry(item), { interrupt: false })
    }
    void introduce()
    return () => {
      cancelled = true
    }
  }, [idx, item, tier, reviewCount])

  if (!item) return null

  const pressKey = (g: string): void => {
    if (busy || feedback !== null) return
    if (typed.length >= item.graphemes.length) {
      sfx('pop')
      return
    }
    sfx('tap')
    setTyped((prev) => [...prev, g])
    void say(keyEntry(g))
  }

  const pressBackspace = (): void => {
    if (busy || feedback !== null) return
    if (typed.length <= locked) {
      sfx('pop')
      return
    }
    sfx('slide')
    setTyped((prev) => prev.slice(0, -1))
  }

  const print = async (): Promise<void> => {
    if (busy || feedback !== null || typed.length === 0) return
    setBusy(true)

    if (validate(typed, item)) {
      // Résolution de l'item : maîtrise enregistrée UNE seule fois.
      for (const skill of TIER_SKILLS[tier]) {
        void recordAttempt(skill, firstTryRef.current)
      }
      if (firstTryRef.current) firstTryCorrectRef.current += 1
      else onFailWord(item.word)
      sfx('levelup')
      setStamp(true)
      if (tier === 3) {
        // Au palier mots : la machine relit le mot complet imprimé.
        await say(cibleEntry(item))
      }
      if (!aliveRef.current) return
      setFeedback('success')
      return
    }

    // ----- Erreur : feedback élaboratif, l'enfant ENTEND sa production -----
    firstTryRef.current = false
    setShake(true)
    setFeedback('retry')
    const prefix = correctPrefixLen(typed, item)
    await say(C('mae.reaction.tu-as-ecrit'))
    for (const g of typed) {
      if (!aliveRef.current) return
      await say(keyEntry(g), { interrupt: false })
    }
    if (!aliveRef.current) return
    await say(C('mae.reaction.moi-jai-dit'), { interrupt: false })
    await say(cibleEntry(item), { interrupt: false })
    if (!aliveRef.current) return
    const nextFails = fails + 1
    if (nextFails === 2) {
      await say(C('mae.reaction.indice'), { interrupt: false })
      if (!aliveRef.current) return
    }
    setTyped(typed.slice(0, prefix))
    setLocked(prefix)
    setFails(nextFails)
    setShake(false)
    setBusy(false)
  }

  const advance = (): void => {
    setFeedback(null)
    setStamp(false)
    if (idx + 1 >= items.length) {
      onEnd(firstTryCorrectRef.current)
      return
    }
    firstTryRef.current = true
    setIdx(idx + 1)
    setTyped([])
    setLocked(0)
    setFails(0)
    setBusy(false)
  }

  // Indice automatique après 2 échecs : la prochaine touche attendue pulse.
  const hintActive = fails >= 2 && !busy && feedback === null
  const prefixOk = isPrefix(typed, item)
  const expected = nextExpected(typed, item)
  const hintKey = hintActive && prefixOk ? expected : null
  const hintBackspace = hintActive && !prefixOk
  const hintPrint = hintActive && prefixOk && expected === null && typed.length > 0

  const isReview = idx < reviewCount
  const rows = keyboardRows(tier)

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-3 pb-5 lg:flex-row lg:gap-12">
      {/* ---------- La machine ---------- */}
      <div className="w-full max-w-md lg:max-w-sm">
        {/* La feuille qui dépasse du rouleau */}
        <div className="relative z-0 mx-auto w-[88%] rounded-t-2xl bg-white px-3 pt-4 pb-8 shadow-card">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {item.graphemes.map((_g, i) => {
              const value = i < typed.length ? typed[i] : null
              const state: 'locked' | 'typed' | 'empty' =
                i < locked ? 'locked' : value !== null ? 'typed' : 'empty'
              return <PaperCell key={`${i}-${value ?? '·'}`} value={value} state={state} />
            })}
          </div>
          {stamp && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span aria-hidden="true" className="animate-bounce-in text-7xl drop-shadow-lg">
                {item.emoji ?? '🎉'}
              </span>
              <span aria-hidden="true" className="animate-pop absolute top-1 right-2 text-3xl">
                🎉
              </span>
            </div>
          )}
        </div>

        {/* Le corps de la machine : rouleau, marque, haut-parleur, indice */}
        <div
          className={`card relative z-10 -mt-4 flex flex-col gap-3 px-4 pt-3 pb-4 ${
            shake ? 'animate-shake-soft' : ''
          }`}
          style={{ borderTop: `6px solid ${ACCENT}` }}
        >
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: ACCENT }} />
            <div className="h-3 flex-1 rounded-full bg-ink/15" />
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: ACCENT }} />
          </div>

          <div className="flex items-center justify-center gap-3">
            <span aria-hidden="true" className="text-3xl">
              ⌨️✨
            </span>
            <SpeakerButton entry={cibleEntry(item)} size="lg" />
            {tier === 3 && item.emoji && (
              <span
                className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl text-5xl"
                style={{ background: `${ACCENT}14` }}
                role="img"
                aria-label="Indice en image"
              >
                {item.emoji}
              </span>
            )}
            {isReview && (
              <span
                className="rounded-full px-3 py-1.5 text-sm font-extrabold text-white"
                style={{ background: ACCENT }}
              >
                🔁 On révise !
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Le clavier de graphèmes ---------- */}
      <div className="flex w-full max-w-xl flex-col items-center gap-2.5">
        {rows.map((row, r) => (
          <div key={r} className="flex flex-wrap justify-center gap-2">
            {row.map((g) => (
              <KeyButton key={g} g={g} hint={hintKey === g} onPress={pressKey} />
            ))}
          </div>
        ))}

        <div className="mt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={pressBackspace}
            aria-label="Effacer la dernière touche"
            className={`tap-target flex h-16 w-20 items-center justify-center rounded-2xl border-b-4 border-ink/20 bg-white text-3xl text-ink shadow-card transition-transform duration-75 active:scale-90 ${
              hintBackspace ? 'animate-pulse-glow' : ''
            }`}
          >
            ⌫
          </button>
          <BigButton
            variant="accent"
            accent={ACCENT}
            disabled={typed.length === 0 || busy || feedback !== null}
            onClick={() => void print()}
            className={`px-8 text-2xl ${hintPrint ? 'animate-pulse-glow' : ''}`}
          >
            🖨️ Imprimer !
          </BigButton>
        </div>
      </div>

      <FeedbackOverlay
        kind={feedback}
        onDone={() => {
          if (feedback === 'success') advance()
          else setFeedback(null)
        }}
      />
    </div>
  )
}

// ---------- Une case de la feuille ----------

const CELL_CLASSES: Record<'locked' | 'typed' | 'empty', string> = {
  locked: 'border-b-4 border-leaf bg-leaf/10 text-leaf-deep',
  typed: 'border-b-4 border-ink/20 bg-paper text-ink',
  empty: 'border-2 border-dashed border-ink-soft/30 bg-white',
}

function PaperCell({ value, state }: { value: string | null; state: 'locked' | 'typed' | 'empty' }) {
  return (
    <span
      className={`flex h-14 min-w-10 items-center justify-center rounded-lg px-1 text-3xl font-extrabold sm:h-16 sm:min-w-12 sm:text-4xl ${
        CELL_CLASSES[state]
      } ${value !== null ? 'animate-pop' : ''}`}
    >
      {value ?? ' '}
    </span>
  )
}

// ---------- Une touche du clavier ----------

interface KeyButtonProps {
  g: string
  hint: boolean
  onPress: (g: string) => void
}

function KeyButton({ g, hint, onPress }: KeyButtonProps) {
  const digraph = isDigraphKey(g)
  const vowel = isVowelKey(g)
  return (
    <button
      type="button"
      onClick={() => onPress(g)}
      aria-label={`Touche ${g}`}
      className={`tap-target flex h-16 items-center justify-center rounded-2xl border-b-4 text-3xl font-extrabold text-ink shadow-card transition-transform duration-75 active:translate-y-0.5 active:scale-90 ${
        digraph ? 'min-w-[88px] px-3' : 'w-16'
      } ${hint ? 'animate-pulse-glow' : ''}`}
      style={{
        background: vowel ? `${ACCENT}16` : digraph ? '#ffc94d2e' : 'white',
        borderBottomColor: vowel ? `${ACCENT}66` : digraph ? '#f0a81866' : 'rgba(30, 58, 76, 0.18)',
      }}
    >
      {g}
    </button>
  )
}
