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
  ACTIONS_BY_ID,
  applyRun,
  calmComplete,
  EMOTIONS_BY_ID,
  faceCorrect,
  FRESH_PROGRESS,
  generateItem,
  isBadAction,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  starsFor,
  storyCorrect,
  TIER_SKILLS,
} from './logic'
import type {
  ActionId,
  CalmItem,
  EmotionGameItem,
  EmotionId,
  FaceItem,
  JdeProgress,
  StoryItem,
  TierId,
} from './logic'

// ============================================================
// Le Jardin des Émotions — l'enfant reconnaît, nomme puis régule
// les émotions (EMC, la sensibilité). T0/T1 : reconnaître un
// visage ; T2 : deviner l'émotion d'une histoire ; T3 : construire
// une réaction apaisée face à un conflit. Zéro QCM, l'erreur
// enseigne, jamais le mot « faux ».
// ============================================================

const STORE_KEY = 'game:jardin-emotions'

const META: GameMeta = GAMES_BY_ID.get('jardin-emotions') ?? {
  id: 'jardin-emotions',
  title: 'Le Jardin des Émotions',
  tagline: 'Reconnais les émotions et fais fleurir le jardin !',
  icon: '🌸',
  island: 'sentiments',
  accent: '#ef6f9c',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '😊', name: "Reconnais l'émotion", sub: 'Avec les mots' },
  { emoji: '🌈', name: 'Encore les visages', sub: 'Plus de graines' },
  { emoji: '⛅', name: 'La météo du cœur', sub: 'Devine en histoire' },
  { emoji: '🌬️', name: 'Le chemin du calme', sub: 'Apaise la colère' },
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

function consigneText(it: EmotionGameItem): string {
  if (it.kind === 'face') return 'Comment se sent-il ? Plante la bonne graine.'
  if (it.kind === 'story') return 'Écoute bien… Quelle émotion ressent-il ?'
  return "L'émotion est forte. Pose les gestes tout doux sur le chemin."
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function JardinEmotions() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<JdeProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<EmotionGameItem | null>(null)
  /** Actions déjà posées sur le chemin (mode calm). */
  const [placed, setPlaced] = useState<ActionId[]>([])
  /** Tuiles fanées par un piège (mode calm) — purement décoratif. */
  const [wilted, setWilted] = useState<ActionId[]>([])
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
    void pget<JdeProgress>(STORE_KEY).then((stored) => {
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

  const speakConsigne = useCallback(async (it: EmotionGameItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.kind === 'face') {
      await say(E('jde.consigne.face'))
      return
    }
    if (it.kind === 'story') {
      await say(E(it.storyId))
      if (seqRef.current !== seq) return
      await say(E('jde.consigne.story'), { interrupt: false })
      return
    }
    await say(E(it.scenarioId))
    if (seqRef.current !== seq) return
    await say(E('jde.consigne.calm'), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item) void speakConsigne(item)
    else void say(E('jde.intro'))
  }, [screen, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setPlaced([])
    setWilted([])
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
  const resolveSuccess = (it: EmotionGameItem, successClip: string): void => {
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

  // ---------- Reconnaître un visage (T0/T1) ----------

  const onTapFaceSeed = (it: FaceItem, emotionId: EmotionId): void => {
    if (phase !== 'idle') return
    sfx('tap')
    if (faceCorrect(it, emotionId)) {
      resolveSuccess(it, 'jde.bravo-fleur')
      return
    }
    registerFail('jde.encore')
  }

  // ---------- Deviner l'émotion d'une histoire (T2) ----------

  const onTapStorySeed = (it: StoryItem, emotionId: EmotionId): void => {
    if (phase !== 'idle') return
    sfx('tap')
    if (storyCorrect(it, emotionId)) {
      resolveSuccess(it, 'jde.bravo-fleur')
      return
    }
    registerFail('jde.encore-story')
  }

  // ---------- Construire le chemin du calme (T3) ----------

  const onTapCalmTile = (it: CalmItem, actionId: ActionId): void => {
    if (phase !== 'idle') return
    if (placed.includes(actionId) || wilted.includes(actionId)) return

    if (isBadAction(it, actionId)) {
      // Geste-piège : la fleur fane, l'erreur enseigne (pas de game over).
      setWilted((w) => [...w, actionId])
      registerFail('jde.piege')
      return
    }
    // Bon geste : on le pose sur le chemin.
    sfx('pop')
    const next = [...placed, actionId]
    setPlaced(next)
    setMood('happy')
    setAnimKey((k) => k + 1)
    if (calmComplete(it, next)) resolveSuccess(it, 'jde.bravo-calme')
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on explique, puis indice après 2 échecs. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setMood('idle')
    if (item.kind === 'face' || item.kind === 'story') {
      await say(E(`jde.dit.${item.target}`))
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      const indice = item.kind === 'calm' ? 'jde.indice.calm' : 'jde.indice.face'
      await say(E(indice), { interrupt: false })
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
    const avoid =
      item.kind === 'face' ? item.target : item.kind === 'story' ? item.storyId : item.scenarioId
    const next = generateItem(item.tier, tunerRef.current.level, avoid)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setMood('idle')
    setPhase('idle')
    setPlaced([])
    setWilted([])
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
            🌸
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('jde.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🌷😊🌻
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Reconnais les émotions et fais fleurir le jardin !
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
                  void say(E(`jde.niveau.${t}`))
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

  // — Visage exprimant l'émotion (T0/T1) —
  const renderFace = (it: FaceItem): ReactNode => {
    const emo = EMOTIONS_BY_ID.get(it.target)
    const anim = mood === 'happy' || mood === 'shake' ? 'animate-wiggle' : 'animate-floaty'
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <span
            key={animKey}
            className={`text-8xl leading-none ${anim}`}
            role="img"
            aria-label={emo?.label}
          >
            {emo?.emoji}
          </span>
          {it.withWord && (
            <span className="text-lg font-extrabold" style={{ color: emo?.ink }}>
              {emo?.label}
            </span>
          )}
        </div>
        <div className={`grid w-full gap-2.5 ${it.choices.length >= 5 ? 'grid-cols-3' : it.choices.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {it.choices.map((id) => {
            const e = EMOTIONS_BY_ID.get(id)
            const glow = hint && id === it.target
            return (
              <button
                key={id}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapFaceSeed(it, id)}
                aria-label={`Graine : ${e?.label}`}
                className={`tap-target card flex flex-col items-center justify-center gap-0.5 py-3 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''}`}
                style={glow ? { outline: `3px solid ${e?.ink}` } : undefined}
              >
                <span className="text-4xl leading-none" aria-hidden="true">
                  {e?.emoji}
                </span>
                <span className="text-2xl" aria-hidden="true">
                  🌱
                </span>
                <span className="text-xs font-semibold text-ink-soft">{e?.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // — Histoire à écouter (T2) —
  const renderStory = (it: StoryItem): ReactNode => (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <span key={animKey} className="animate-floaty text-7xl leading-none" aria-hidden="true">
          📖
        </span>
        <SpeakerButton entry={E(it.storyId)} size="lg" />
      </div>
      <div className="grid w-full grid-cols-3 gap-2.5">
        {it.choices.map((id) => {
          const e = EMOTIONS_BY_ID.get(id)
          const glow = hint && id === it.target
          return (
            <button
              key={id}
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => onTapStorySeed(it, id)}
              aria-label={e?.label}
              className={`tap-target card flex flex-col items-center justify-center gap-0.5 py-3 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''}`}
              style={glow ? { outline: `3px solid ${e?.ink}` } : undefined}
            >
              <span className="text-4xl leading-none" aria-hidden="true">
                {e?.emoji}
              </span>
              <span className="text-xs font-semibold text-ink-soft">{e?.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  // — Le chemin du calme (T3) : tap-tuile -> elle se pose sur le chemin —
  const renderCalm = (it: CalmItem): ReactNode => {
    const tray = it.tiles.filter((id) => !placed.includes(id) && !wilted.includes(id))
    const calmKey = mood === 'happy' ? 'animate-pop' : mood === 'shake' ? 'animate-wiggle' : ''
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <span key={animKey} className={`text-6xl leading-none ${calmKey || 'animate-floaty'}`} aria-hidden="true">
            {wilted.length > 0 ? '🥀' : placed.length > 0 ? '🌷' : '🌱'}
          </span>
          <SpeakerButton entry={E(it.scenarioId)} size="lg" />
        </div>
        {/* Le chemin : cases où se posent les bons gestes */}
        <div
          className="flex min-h-16 w-full flex-wrap items-center justify-center gap-2 rounded-2xl bg-white/60 px-3 py-2"
          aria-label="Le chemin du calme"
        >
          {placed.length === 0 ? (
            <span className="text-sm font-semibold text-ink-soft">
              Pose ici les gestes tout doux…
            </span>
          ) : (
            placed.map((id) => {
              const a = ACTIONS_BY_ID.get(id)
              return (
                <span
                  key={id}
                  className="animate-bounce-in flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-extrabold text-ink"
                >
                  <span aria-hidden="true">{a?.emoji}</span>
                  {a?.label}
                </span>
              )
            })
          )}
        </div>
        {/* Les tuiles-actions à choisir */}
        <div className="grid w-full grid-cols-2 gap-2.5">
          {tray.map((id) => {
            const a = ACTIONS_BY_ID.get(id)
            const glow = hint && !isBadAction(it, id)
            return (
              <button
                key={id}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapCalmTile(it, id)}
                aria-label={a?.label}
                className={`tap-target card flex items-center justify-center gap-1.5 py-3 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''}`}
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  {a?.emoji}
                </span>
                <span className="text-sm font-extrabold text-ink">{a?.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderPlay = (it: EmotionGameItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-3 pb-6">
      <p className="text-center text-lg font-extrabold text-ink">{consigneText(it)}</p>
      {it.kind === 'face' && renderFace(it)}
      {it.kind === 'story' && renderStory(it)}
      {it.kind === 'calm' && renderCalm(it)}
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
              🔓 Nouveau jardin débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
