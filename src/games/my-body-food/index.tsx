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
  bodyClip,
  BODY_BY_ID,
  correctColumn,
  FOODS_BY_ID,
  foodClip,
  FRESH_PROGRESS,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  sortCorrect,
  starsFor,
  tapCorrect,
  tasteClip,
  TIER_SKILLS,
} from './logic'
import type { MbfItem, MbfProgress, SortColumn, TapItem, TierId } from './logic'

// ============================================================
// My Body & Food — compréhension orale de l'anglais (Pre-A1).
// T0/T1 : le corps (« Head, Shoulders, Knees and Toes »), on
// entend le mot anglais → on tape la bonne carte. T2 : les
// aliments, même mécanique. T3 : les goûts, un personnage dit
// « I like / I don't like [food] » → on range l'aliment dans le
// bon panier. Voix anglaise : sonia ; consignes FR : denise/eloise.
// Zéro QCM : l'enfant TROUVE la carte / RANGE l'aliment.
// ============================================================

const STORE_KEY = 'game:my-body-food'

const META: GameMeta = GAMES_BY_ID.get('my-body-food') ?? {
  id: 'my-body-food',
  title: 'My Body & Food',
  tagline: 'Head, shoulders… and yummy food, in English!',
  icon: '🍎',
  island: 'ailleurs',
  accent: '#e53935',
  skills: ['en.cp.body', 'en.cp.food', 'en.cp.tastes'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🧒', name: 'My Body', sub: 'Head, shoulders…' },
  { emoji: '👀', name: 'My Body', sub: 'Encore le corps' },
  { emoji: '🍎', name: 'Yummy Food', sub: 'Les aliments' },
  { emoji: '😋', name: 'I like…', sub: "J'aime ou pas" },
]

const CONSIGNE_CLIP: Readonly<Record<TierId, string>> = {
  0: 'mbf.consigne.body',
  1: 'mbf.consigne.body',
  2: 'mbf.consigne.food',
  3: 'mbf.consigne.tastes',
}

const COLUMN_INFO: Readonly<Record<SortColumn, { emoji: string; label: string }>> = {
  like: { emoji: '😋', label: 'I like' },
  dislike: { emoji: '😖', label: "I don't like" },
}

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

// ---------- Helpers d'affichage des cartes ----------

function cardEmoji(category: 'body' | 'food', id: string): string {
  return category === 'food' ? (FOODS_BY_ID.get(id)?.emoji ?? '') : (BODY_BY_ID.get(id)?.emoji ?? '')
}

function cardWord(category: 'body' | 'food', id: string): string {
  return category === 'food' ? (FOODS_BY_ID.get(id)?.word ?? '') : (BODY_BY_ID.get(id)?.word ?? '')
}

/** Clip anglais (sonia) du mot d'une carte tap. */
function cardClip(category: 'body' | 'food', id: string): string {
  return category === 'food' ? foodClip(id) : bodyClip(id)
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function MyBodyFood() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<MbfProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<MbfItem | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [wrongId, setWrongId] = useState<string | null>(null)
  const [foundId, setFoundId] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const wrongTimerRef = useRef(0)

  // Chargement de la progression + préchargement des clips d'encadrement
  useEffect(() => {
    let alive = true
    void pget<MbfProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips([
      'mbf.intro',
      'mbf.consigne.body',
      'mbf.consigne.food',
      'mbf.consigne.tastes',
      'mbf.bravo',
      'mbf.bien-range',
      'mbf.thatone',
      'mbf.pas-panier',
      'mbf.indice.tap',
      'mbf.indice.sort',
    ])
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(wrongTimerRef.current)
      stopSpeech()
    }
  }, [])

  const saveProgress = (p: MbfProgress): void => {
    setProgress(p)
    void pset(STORE_KEY, p)
  }

  // ---------- Audio ----------

  /** Consigne d'un item : consigne FR (denise) puis le mot/la phrase anglais (sonia). */
  const speakItem = useCallback(async (it: MbfItem): Promise<void> => {
    const seq = ++seqRef.current
    await say(E(CONSIGNE_CLIP[it.tier]))
    if (seqRef.current !== seq) return
    if (it.kind === 'tap') {
      await say(E(cardClip(it.category, it.targetId)), { interrupt: false })
      return
    }
    await say(E(tasteClip(it.foodId, it.like)), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item && phase === 'idle') {
      void speakItem(item)
      return
    }
    if (screen === 'menu') void say(E('mbf.intro'))
  }, [screen, item, phase, speakItem])

  // ---------- Déroulé d'une partie ----------

  const installItem = (it: MbfItem): void => {
    preloadClips(
      it.kind === 'tap'
        ? [CONSIGNE_CLIP[it.tier], ...it.optionIds.map((id) => cardClip(it.category, id))]
        : [CONSIGNE_CLIP[it.tier], tasteClip(it.foodId, it.like)],
    )
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setWrongId(null)
    setFoundId(null)
    setPhase('idle')
    setItem(it)
    void speakItem(it)
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

  const finishRun = (t: TierId): void => {
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, t, stars)
    const unlockedNow = updated.unlockedTier > base.unlockedTier
    if (unlockedNow) sfx('levelup')
    setNewUnlock(unlockedNow)
    saveProgress(updated)
    setScreen('end')
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun(item.tier)
      return
    }
    const avoid = item.kind === 'tap' ? item.targetId : item.foodId
    installItem(generateItem(item.tier, tunerRef.current.level, avoid))
  }

  /** Résolution d'un item réussi : maîtrise + Tuner, UNE seule fois. */
  const resolveItem = (): void => {
    if (!item) return
    seqRef.current += 1
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[item.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setBurst((b) => b + 1)
    void say(E(item.kind === 'sort' ? 'mbf.bien-range' : 'mbf.bravo')).then(() =>
      setOverlay('success'),
    )
  }

  // ---------- Tap (T0/T1/T2) ----------

  const onTapCard = (id: string): void => {
    if (!item || item.kind !== 'tap' || phase !== 'idle') return
    if (tapCorrect(item, id)) {
      setFoundId(id)
      sfx(item.category === 'food' ? 'magic' : 'pop')
      resolveItem()
      return
    }
    // L'erreur enseigne : la carte couine et la voix la NOMME en anglais.
    firstTryRef.current = false
    failsRef.current += 1
    sfx('wrong')
    setWrongId(id)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    const seq = ++seqRef.current
    void say(E('mbf.thatone'))
      .then(() => {
        if (seqRef.current !== seq) return
        return say(E(cardClip(item.category, id)), { interrupt: false })
      })
      .then(() => {
        if (seqRef.current !== seq) return
        if (failsRef.current >= 2 && !hint) {
          setHint(true)
          void say(E('mbf.indice.tap'), { interrupt: false })
        }
      })
  }

  // ---------- Tri (T3) ----------

  /** L'erreur enseigne : on rejoue la phrase entendue, puis indice si besoin. */
  const runSortTeach = async (): Promise<void> => {
    if (!item || item.kind !== 'sort') return
    const seq = ++seqRef.current
    setPhase('idle')
    await say(E('mbf.pas-panier'))
    if (seqRef.current !== seq) return
    await say(E(tasteClip(item.foodId, item.like)), { interrupt: false })
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      void say(E('mbf.indice.sort'), { interrupt: false })
    }
  }

  const onTapColumn = (column: SortColumn): void => {
    if (!item || item.kind !== 'sort' || phase !== 'idle') return
    if (sortCorrect(item, column)) {
      setFoundId(column)
      sfx('magic')
      resolveItem()
      return
    }
    firstTryRef.current = false
    failsRef.current += 1
    sfx('wrong')
    setWrongId(column)
    setPhase('error')
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    setOverlay('retry')
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') advance()
    else if (kind === 'retry') void runSortTeach()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🍎
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('mbf.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🧒🍎🇬🇧
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute l’anglais, trouve la bonne image !
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          {TIER_INFO.map((info, i) => {
            const t = i as TierId
            const locked = t > progress.unlockedTier
            const stars = progress.bestStars[t] ?? 0
            const active = tier === t && !locked
            return (
              <button
                key={`${info.name}-${info.sub}`}
                type="button"
                aria-pressed={active}
                aria-label={locked ? `${info.name}, ${info.sub} (verrouillé)` : `${info.name}, ${info.sub}`}
                onClick={() => {
                  if (locked) {
                    sfx('slide')
                    return
                  }
                  sfx('tap')
                  setTier(t)
                  void say(E(`mbf.niveau.${t}`))
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

  const renderTap = (it: TapItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-5 px-3 pb-6">
      <div className="flex items-center justify-center gap-3">
        <span aria-hidden="true" className="text-base">
          🇬🇧
        </span>
        <p className="text-center text-lg font-extrabold text-ink sm:text-xl">
          Écoute, puis tape la bonne image !
        </p>
        <Mascot mood={phase === 'success' ? 'cheer' : 'idle'} size={48} />
      </div>
      <div
        className={`game-surface grid w-full max-w-xl gap-3 rounded-card p-4 shadow-card ${it.optionIds.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}
        style={{ background: 'linear-gradient(180deg, #ffe9ec 0%, #fff6f0 100%)' }}
      >
        {it.optionIds.map((id) => {
          const found = foundId === id
          const isWrong = wrongId === id
          const glow = hint && phase === 'idle' && id === it.targetId
          return (
            <button
              key={id}
              type="button"
              aria-label={`${cardWord(it.category, id)} (${it.category === 'food' ? 'aliment' : 'partie du corps'})`}
              disabled={phase !== 'idle'}
              onClick={() => onTapCard(id)}
              className={`tap-target card flex flex-col items-center justify-center gap-1 p-3 transition-transform active:scale-90 ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-bounce-in' : ''} ${glow ? 'animate-pulse-glow' : ''}`}
            >
              <span aria-hidden="true" className={found ? 'text-6xl' : 'text-5xl'}>
                {cardEmoji(it.category, id)}
              </span>
              <span className="text-base font-extrabold" style={{ color: ACCENT }}>
                {cardWord(it.category, id)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderSort = (it: Extract<MbfItem, { kind: 'sort' }>): ReactNode => {
    const food = FOODS_BY_ID.get(it.foodId)
    const right = correctColumn(it)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-5 px-3 pb-6">
        <div className="flex items-center justify-center gap-3">
          <span aria-hidden="true" className="text-base">
            🇬🇧
          </span>
          <p className="text-center text-lg font-extrabold text-ink sm:text-xl">
            Écoute la phrase, puis range l’aliment !
          </p>
          <Mascot mood={phase === 'success' ? 'cheer' : 'idle'} size={48} />
        </div>
        {/* L'aliment énoncé (zéro QCM : c'est lui qu'on range) */}
        <div className="flex flex-col items-center gap-1">
          <span
            className={`text-7xl leading-none sm:text-8xl ${foundId ? 'animate-bounce-in' : 'animate-floaty'}`}
            role="img"
            aria-label={food?.word}
          >
            {food?.emoji}
          </span>
          <span className="text-lg font-extrabold" style={{ color: ACCENT }}>
            {food?.word}
          </span>
        </div>
        <div className="grid w-full max-w-md grid-cols-2 gap-3">
          {(['like', 'dislike'] as SortColumn[]).map((column) => {
            const info = COLUMN_INFO[column]
            const glow = hint && column === right
            const isWrong = wrongId === column
            const chosen = foundId === column
            return (
              <button
                key={column}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapColumn(column)}
                aria-label={info.label}
                className={`tap-target card flex flex-col items-center justify-center gap-1 py-6 transition-transform active:scale-95 ${isWrong ? 'animate-shake-soft' : ''} ${chosen ? 'animate-pop' : ''} ${glow ? 'animate-pulse-glow' : ''}`}
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

  const renderPlay = (it: MbfItem): ReactNode =>
    it.kind === 'tap' ? renderTap(it) : renderSort(it)

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
              🔓 Un nouveau niveau est débloqué !
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
