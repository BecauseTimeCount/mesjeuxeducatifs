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
  findCorrect,
  FRESH_PROGRESS,
  generateItem,
  GLOBE_ELEMENTS_BY_ID,
  isFindTier,
  ITEMS_PER_RUN,
  kindOf,
  LANDSCAPES_BY_ID,
  MAX_TUNER_LEVEL,
  sortCorrect,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { GlobeKind, TdmItem, TdmProgress, TierId } from './logic'

// ============================================================
// Le Tour du Monde — l'enfant TROUVE le bon paysage parmi des
// distracteurs (T0/T1), puis RANGE chaque élément du globe dans
// « Terre » ou « Eau » (tri 2 bacs, T2/T3). « Se situer dans
// l'espace » : reconnaître des paysages, distinguer terres et
// océans. Zéro QCM (la cible se trouve dans une scène, l'erreur
// coûte et enseigne).
// ============================================================

const STORE_KEY = 'game:tour-du-monde'

const META: GameMeta = GAMES_BY_ID.get('tour-du-monde') ?? {
  id: 'tour-du-monde',
  title: 'Le Tour du Monde',
  tagline: 'Reconnais les paysages et explore la Terre !',
  icon: '🌍',
  island: 'monde',
  accent: '#2196f3',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🏞️', name: 'Les paysages', sub: 'Trouve parmi 4' },
  { emoji: '🗺️', name: 'Encore plus !', sub: 'Trouve parmi 6' },
  { emoji: '🌍', name: 'Terre ou eau', sub: 'Le grand tri' },
  { emoji: '🌊', name: 'La Terre de loin', sub: 'Terres et océans' },
]

const ZONE_INFO: Readonly<Record<GlobeKind, { label: string; emoji: string }>> = {
  terre: { label: 'Terre', emoji: '🟩' },
  eau: { label: 'Eau', emoji: '🟦' },
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

function targetName(it: TdmItem): string {
  if (it.kind === 'find') return LANDSCAPES_BY_ID.get(it.targetId)?.name ?? ''
  return GLOBE_ELEMENTS_BY_ID.get(it.elementId)?.name ?? ''
}

function instructionText(it: TdmItem): string {
  const name = targetName(it)
  if (it.kind === 'find') return `Trouve ${name} !`
  return `Où ranger ${name} : sur la terre, ou dans l'eau ?`
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function TourDuMonde() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<TdmProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<TdmItem | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [mood, setMood] = useState<'idle' | 'happy' | 'shake'>('idle')
  const [animKey, setAnimKey] = useState(0)
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

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<TdmProgress>(STORE_KEY).then((stored) => {
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

  const speakConsigne = useCallback(async (it: TdmItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.kind === 'find') {
      await say(E('tdm.consigne.find.prefix'))
      if (seqRef.current !== seq) return
      await say(E(`tdm.l.${it.targetId}`), { interrupt: false })
      return
    }
    await say(E(`tdm.e.${it.elementId}`))
    if (seqRef.current !== seq) return
    await say(E('tdm.consigne.sort'), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item && phase === 'idle') void speakConsigne(item)
    else if (screen !== 'play') void say(E('tdm.intro'))
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
    setMood('idle')
    setHint(false)
    setWrongId(null)
    setFoundId(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first)
  }

  /** Résolution réussie d'un item : maîtrise + Tuner, UNE seule fois. */
  const resolveSuccess = (it: TdmItem, successClip: string): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setMood('happy')
    setAnimKey((k) => k + 1)
    setBurst((b) => b + 1)
    sfx('magic')
    void say(E(successClip))
    window.setTimeout(() => setOverlay('success'), 650)
  }

  /** Un essai raté : firstTry tombe, le compteur d'erreurs monte. */
  const registerFail = (): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setMood('shake')
    setAnimKey((k) => k + 1)
    sfx('wrong')
  }

  // ---------- Trouver le paysage (T0/T1) ----------

  const onTapLandscape = (landscapeId: string): void => {
    if (!item || item.kind !== 'find' || phase !== 'idle') return
    if (findCorrect(item, landscapeId)) {
      setFoundId(landscapeId)
      sfx('pop')
      resolveSuccess(item, 'tdm.bravo')
      return
    }
    // L'erreur enseigne : la carte tremble et la voix NOMME le paysage tapé.
    registerFail()
    setWrongId(landscapeId)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    const seq = ++seqRef.current
    void say(E('tdm.thatone'))
      .then(() => {
        if (seqRef.current !== seq) return
        return say(E(`tdm.l.${landscapeId}`), { interrupt: false })
      })
      .then(() => {
        if (seqRef.current !== seq) return
        setOverlay('retry')
      })
  }

  // ---------- Ranger Terre / Eau (T2/T3) ----------

  const onTapZone = (zone: GlobeKind): void => {
    if (!item || item.kind !== 'sort' || phase !== 'idle') return
    if (sortCorrect(item, zone)) {
      resolveSuccess(item, 'tdm.bien-range')
      return
    }
    registerFail()
    setOverlay('retry')
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on explique, puis indice automatique après 2 échecs. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setMood('idle')
    if (item.kind === 'sort') {
      await say(E(`tdm.cat.${kindOf(item.elementId)}`))
    } else {
      await say(E('tdm.essaie'))
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      await say(E(item.kind === 'find' ? 'tdm.indice.find' : 'tdm.indice.sort'), {
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
    const avoid = item.kind === 'find' ? item.targetId : item.elementId
    const next = generateItem(item.tier, tunerRef.current.level, avoid)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setMood('idle')
    setPhase('idle')
    setWrongId(null)
    setFoundId(null)
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
            🌍
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('tdm.intro')} autoPlay />
        </div>
        <div className="animate-floaty text-6xl" aria-hidden="true">
          🌍
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Trouve les paysages et explore la Terre !
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
                  void say(E(`tdm.niveau.${t}`))
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

  const renderFind = (it: Extract<TdmItem, { kind: 'find' }>): ReactNode => (
    <div
      className={`grid w-full max-w-2xl gap-3 ${it.choices.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}
    >
      {it.choices.map((id) => {
        const landscape = LANDSCAPES_BY_ID.get(id)
        const found = foundId === id
        const isWrong = wrongId === id
        const pulse = hint && phase !== 'success' && id === it.targetId
        return (
          <button
            key={id}
            type="button"
            disabled={phase !== 'idle'}
            onClick={() => onTapLandscape(id)}
            aria-label={landscape?.name}
            className={`tap-target card flex flex-col items-center justify-center gap-1 py-5 transition-transform active:scale-95 ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-bounce-in' : ''} ${pulse ? 'animate-pulse-glow' : ''}`}
          >
            <span className={`leading-none ${found ? 'text-6xl' : 'text-5xl'}`} aria-hidden="true">
              {landscape?.emoji}
            </span>
            <span className="text-sm font-extrabold text-ink">{landscape?.name}</span>
          </button>
        )
      })}
    </div>
  )

  const renderSort = (it: Extract<TdmItem, { kind: 'sort' }>): ReactNode => {
    const element = GLOBE_ELEMENTS_BY_ID.get(it.elementId)
    const anim =
      mood === 'happy' ? 'animate-wiggle' : mood === 'shake' ? 'animate-wiggle' : 'animate-floaty'
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-5">
        <span
          key={animKey}
          className={`text-7xl leading-none sm:text-8xl ${anim}`}
          role="img"
          aria-label={element?.name}
        >
          {element?.emoji}
        </span>
        <div className="grid w-full grid-cols-2 gap-3">
          {it.zones.map((zone) => {
            const info = ZONE_INFO[zone]
            const pulse = hint && phase !== 'success' && zone === kindOf(it.elementId)
            return (
              <button
                key={zone}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapZone(zone)}
                aria-label={info.label}
                className={`tap-target card flex flex-col items-center justify-center gap-1 py-6 transition-transform active:scale-95 ${pulse ? 'animate-pulse-glow' : ''}`}
              >
                <span className="text-4xl leading-none" aria-hidden="true">
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

  const renderPlay = (it: TdmItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-5 px-3 pb-6">
      <div className="flex items-center justify-center gap-3">
        <p className="text-center text-lg font-extrabold text-ink sm:text-xl">
          {instructionText(it)}
        </p>
        <Mascot mood={phase === 'success' ? 'cheer' : 'idle'} size={48} />
      </div>
      {isFindTier(it.tier) && it.kind === 'find' ? renderFind(it) : it.kind === 'sort' ? renderSort(it) : null}
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
              🔓 Nouvelle étape débloquée !
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
