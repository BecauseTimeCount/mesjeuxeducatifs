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
  compareCorrect,
  FRESH_PROGRESS,
  generateItem,
  itemKey,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  measureCorrect,
  OBJECTS_BY_ID,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { CompareItem, MeasureItem, MetreItem, MmgProgress, TierId } from './logic'

// ============================================================
// Le Mètre Magique — l'enfant compare des longueurs (T0/T1 :
// tape le plus long / le plus court parmi des objets-barres)
// puis mesure par report d'unité (T2/T3 : compte les cubes
// alignés et tape le bon nombre). Grandeurs et mesures. Zéro QCM :
// distracteurs intelligents (±1/±2), l'erreur compte au 1er essai.
// ============================================================

const STORE_KEY = 'game:metre-magique'

const META: GameMeta = GAMES_BY_ID.get('metre-magique') ?? {
  id: 'metre-magique',
  title: 'Le Mètre Magique',
  tagline: 'Plus long, plus court… mesure tout !',
  icon: '📏',
  island: 'nombres',
  accent: '#0097a7',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '📏', name: 'Plus long, plus court', sub: '2 objets' },
  { emoji: '📐', name: 'Le grand rangement', sub: '3 objets' },
  { emoji: '🟦', name: 'Compte les cubes', sub: 'Jusqu’à 5' },
  { emoji: '🧱', name: 'Le grand mètre', sub: 'Jusqu’à 9' },
]

/** Largeur d'une unité-cube en pixels (les barres = longueur × unité). */
const UNIT_PX = 30

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

function instructionText(it: MetreItem): string {
  if (it.kind === 'compare') {
    return it.extreme === 'long' ? "Touche l'objet le PLUS LONG !" : "Touche l'objet le PLUS COURT !"
  }
  const name = OBJECTS_BY_ID.get(it.objectId)?.name ?? "l'objet"
  return `Combien de cubes mesure ${name} ?`
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function MetreMagique() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<MmgProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<MetreItem | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [foundId, setFoundId] = useState<string | null>(null)
  const [wrongId, setWrongId] = useState<string | null>(null)
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
    void pget<MmgProgress>(STORE_KEY).then((stored) => {
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

  const speakConsigne = useCallback(async (it: MetreItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.kind === 'compare') {
      await say(E(it.extreme === 'long' ? 'met.consigne.long' : 'met.consigne.court'))
      return
    }
    await say(E(`met.o.${it.objectId}`))
    if (seqRef.current !== seq) return
    await say(E('met.consigne.mesure'), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item && phase === 'idle') void speakConsigne(item)
    else if (screen !== 'play') void say(E('met.intro'))
  }, [screen, item, phase, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setFoundId(null)
    setWrongId(null)
    setHint(false)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first)
  }

  /** Résolution réussie d'un item : maîtrise + Tuner, UNE seule fois. */
  const resolveSuccess = (it: MetreItem, successClip: string): void => {
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
  const registerFail = (wrongVisualId: string, reactionClip: string): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setAnimKey((k) => k + 1)
    sfx('wrong')
    setWrongId(wrongVisualId)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    setOverlay('retry')
    void say(E(reactionClip))
  }

  // ---------- Comparer (T0/T1) ----------

  const onTapObject = (objectId: string): void => {
    if (!item || item.kind !== 'compare' || phase !== 'idle') return
    if (compareCorrect(item, objectId)) {
      setFoundId(objectId)
      sfx('pop')
      resolveSuccess(item, item.extreme === 'long' ? 'met.bravo.long' : 'met.bravo.court')
      return
    }
    registerFail(objectId, item.extreme === 'long' ? 'met.reaction.long' : 'met.reaction.court')
  }

  // ---------- Mesurer (T2/T3) ----------

  const onTapNumber = (n: number): void => {
    if (!item || item.kind !== 'measure' || phase !== 'idle') return
    if (measureCorrect(item, n)) {
      setFoundId(String(n))
      sfx('coin')
      resolveSuccess(item, 'met.bravo.mesure')
      return
    }
    registerFail(String(n), 'met.reaction.mesure')
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on redonne un essai dans le même contexte ; indice si besoin. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      await say(E(item.kind === 'compare' ? 'met.indice.compare' : 'met.indice.mesure'), {
        interrupt: false,
      })
      if (seqRef.current !== seq) return
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
    const next = generateItem(item.tier, tunerRef.current.level, itemKey(item))
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setPhase('idle')
    setFoundId(null)
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
            📏
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('met.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🐍📏🥖
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Plus long, plus court… mesure tout !
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
                  void say(E(`met.niveau.${t}`))
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

  /** Une barre-objet : largeur = longueur × unité, tête emoji au bout. */
  const renderCompare = (it: CompareItem): ReactNode => (
    <div className="flex w-full max-w-xl flex-col items-stretch gap-3">
      {it.objects.map((o) => {
        const obj = OBJECTS_BY_ID.get(o.id)
        const found = foundId === o.id
        const isWrong = wrongId === o.id
        const glow = hint && o.id === it.targetId
        return (
          <button
            key={o.id}
            type="button"
            disabled={phase !== 'idle'}
            onClick={() => onTapObject(o.id)}
            aria-label={`${obj?.name}, ${o.length} cubes de long`}
            className={`tap-target card flex items-center gap-2 overflow-hidden p-2 transition-transform active:scale-95 ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-pop' : ''} ${glow ? 'animate-pulse-glow' : ''}`}
            style={glow ? { outline: `4px solid ${ACCENT}` } : undefined}
          >
            <span aria-hidden="true" className="shrink-0 text-3xl">
              {obj?.emoji}
            </span>
            <span
              aria-hidden="true"
              className="h-7 rounded-full"
              style={{ width: `${o.length * UNIT_PX}px`, background: ACCENT, maxWidth: '100%' }}
            />
          </button>
        )
      })}
    </div>
  )

  /** Un objet posé le long d'une règle de cubes alignés + cartes-nombres. */
  const renderMeasure = (it: MeasureItem): ReactNode => {
    const obj = OBJECTS_BY_ID.get(it.objectId)
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-5">
        {/* La règle : l'objet posé au-dessus de N cubes réellement alignés */}
        <div className="card flex w-full flex-col items-center gap-2 p-3">
          <div
            key={animKey}
            className="flex items-center gap-1 animate-floaty"
            aria-label={`${obj?.name}, posé sur la règle`}
          >
            <span aria-hidden="true" className="text-4xl">
              {obj?.emoji}
            </span>
            <span
              aria-hidden="true"
              className="h-5 rounded-full"
              style={{ width: `${it.cubes * UNIT_PX}px`, background: ACCENT, maxWidth: '100%' }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1" aria-hidden="true">
            {Array.from({ length: it.cubes }, (_, i) => (
              <span
                key={i}
                className="flex items-center justify-center text-2xl"
                style={{ width: `${UNIT_PX}px` }}
              >
                🟦
              </span>
            ))}
          </div>
        </div>
        {/* Cartes-nombres : la cible + distracteurs ±1/±2 */}
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {it.choices.map((n) => {
            const found = foundId === String(n)
            const isWrong = wrongId === String(n)
            const glow = hint && n === it.cubes
            return (
              <button
                key={n}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapNumber(n)}
                aria-label={`${n} cubes`}
                className={`tap-target card flex items-center justify-center py-4 text-3xl font-extrabold text-ink transition-transform active:scale-95 ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-pop' : ''} ${glow ? 'animate-pulse-glow' : ''}`}
                style={glow ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderPlay = (it: MetreItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-5 px-3 pb-6">
      <div className="flex items-center justify-center gap-3">
        <p className="text-center text-lg font-extrabold text-ink sm:text-xl">
          {instructionText(it)}
        </p>
        <Mascot mood={phase === 'success' ? 'cheer' : 'idle'} size={48} />
      </div>
      {it.kind === 'compare' ? renderCompare(it) : renderMeasure(it)}
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
              🔓 Nouveau niveau débloqué !
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
