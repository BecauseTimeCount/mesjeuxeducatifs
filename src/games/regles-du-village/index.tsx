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
  applyRun,
  FRESH_PROGRESS,
  GESTURES_BY_ID,
  generateItem,
  isCorrect,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { RdvProgress, TierId, VillageItem } from './logic'

// ============================================================
// Les Règles du Village — EMC (le droit, la règle, l'engagement).
// Une situation de vie de classe/cour est lue ; l'enfant TROUVE le
// bon geste (respecter la règle / aider) parmi des cartes : la bonne
// + des pièges plausibles de la même catégorie. L'erreur explique
// gentiment la meilleure attitude — jamais le mot « faux », jamais
// de jugement dur. Zéro QCM pur : l'erreur coûte (1er essai), un
// nouvel essai est redonné, indice automatique après 2 échecs.
// ============================================================

const STORE_KEY = 'game:regles-du-village'

const META: GameMeta = GAMES_BY_ID.get('regles-du-village') ?? {
  id: 'regles-du-village',
  title: 'Les Règles du Village',
  tagline: 'Choisis ce qui aide et respecte les autres !',
  icon: '🤝',
  island: 'sentiments',
  accent: '#f06292',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🙋', name: 'Les règles', sub: 'Bien vivre ensemble' },
  { emoji: '🧸', name: 'Encore les règles', sub: 'Plus de choix' },
  { emoji: '🤝', name: "L'entraide", sub: 'Aider ses amis' },
  { emoji: '🫂', name: 'Le grand cœur', sub: 'Aider, plus de choix' },
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

// ---------- Helpers d'affichage ----------

function consigneText(family: VillageItem['family']): string {
  return family === 'regle'
    ? 'Écoute la situation. Quel est le bon geste ?'
    : 'Écoute bien. Comment aider ton camarade ?'
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function ReglesDuVillage() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<RdvProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<VillageItem | null>(null)
  /** Cartes-pièges déjà tapées (purement décoratif : on les estompe). */
  const [tried, setTried] = useState<string[]>([])
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
    void pget<RdvProgress>(STORE_KEY).then((stored) => {
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

  const speakConsigne = useCallback(async (it: VillageItem): Promise<void> => {
    const seq = ++seqRef.current
    await say(E(it.situationId))
    if (seqRef.current !== seq) return
    const consigne = it.family === 'regle' ? 'rdv.consigne.regle' : 'rdv.consigne.entraide'
    await say(E(consigne), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item) void speakConsigne(item)
    else void say(E('rdv.intro'))
  }, [screen, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setTried([])
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
  const resolveSuccess = (it: VillageItem): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setMood('happy')
    setAnimKey((k) => k + 1)
    sfx('magic')
    void say(E(it.family === 'regle' ? 'rdv.bravo.regle' : 'rdv.bravo.entraide'))
    window.setTimeout(() => setOverlay('success'), 700)
  }

  /** Un essai raté : firstTry tombe, le compteur d'erreurs monte. */
  const registerFail = (): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setMood('shake')
    setAnimKey((k) => k + 1)
    sfx('wrong')
    setOverlay('retry')
    void say(E('rdv.encore'))
  }

  // ---------- Trouver le bon geste ----------

  const onTapGesture = (it: VillageItem, gestureId: string): void => {
    if (phase !== 'idle') return
    if (tried.includes(gestureId)) return
    sfx('tap')
    if (isCorrect(it, gestureId)) {
      resolveSuccess(it)
      return
    }
    // Geste-piège : on l'estompe, l'erreur enseigne (pas de game over).
    setTried((t) => [...t, gestureId])
    registerFail()
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on nomme/explique la bonne attitude, indice après 2 échecs. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setMood('idle')
    await say(E(`rdv.dit.${item.answer}`))
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      const indice = item.family === 'regle' ? 'rdv.indice.regle' : 'rdv.indice.entraide'
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
    const next = generateItem(item.tier, tunerRef.current.level, item.situationId)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setMood('idle')
    setPhase('idle')
    setTried([])
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
            🤝
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('rdv.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🙋🤝🫂
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Choisis ce qui aide et respecte les autres !
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
                  void say(E(`rdv.niveau.${t}`))
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

  // — La situation : on l'écoute, puis on tape le bon geste —
  const renderPlay = (it: VillageItem): ReactNode => {
    const cols = it.choices.length >= 4 ? 'grid-cols-2' : 'grid-cols-3'
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-3 pb-6">
        <p className="text-center text-lg font-extrabold text-ink">{consigneText(it.family)}</p>
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <span
              key={animKey}
              className={`text-7xl leading-none ${mood === 'happy' ? 'animate-pop' : mood === 'shake' ? 'animate-wiggle' : 'animate-floaty'}`}
              aria-hidden="true"
            >
              {it.family === 'regle' ? '🏫' : '🧒'}
            </span>
            <SpeakerButton entry={E(it.situationId)} size="lg" />
          </div>
          <div className={`grid w-full gap-2.5 ${cols}`}>
            {it.choices.map((id) => {
              const g = GESTURES_BY_ID.get(id)
              const glow = hint && id === it.answer
              const faded = tried.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  disabled={phase !== 'idle' || faded}
                  onClick={() => onTapGesture(it, id)}
                  aria-label={g?.label}
                  className={`tap-target card flex flex-col items-center justify-center gap-1 py-4 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''} ${faded ? 'opacity-40' : ''}`}
                  style={glow ? { outline: `3px solid ${ACCENT}` } : undefined}
                >
                  <span className="text-4xl leading-none" aria-hidden="true">
                    {g?.emoji}
                  </span>
                  <span className="text-sm font-extrabold text-ink">{g?.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

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
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
