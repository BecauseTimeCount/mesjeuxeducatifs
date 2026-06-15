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
  CARDS_BY_ID,
  cardClip,
  COLOURS_BY_ID,
  FRESH_PROGRESS,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { HefProgress, Round, TierId } from './logic'

// ============================================================
// Hello Friends! — compréhension orale de l'anglais (Pré-A1).
// On écoute une formule / un mot anglais (voix sonia) puis on tape
// la bonne image parmi des choix de la même catégorie. L'erreur
// nomme à voix haute la carte touchée, redonne un essai et fait
// briller la bonne réponse après deux échecs. Zéro QCM passif :
// le mot anglais est écrit sous l'emoji pour le non-lecteur, mais
// l'enfant doit PRODUIRE le geste juste pour que l'item compte.
// ============================================================

const STORE_KEY = 'game:hello-friends'

const META: GameMeta = GAMES_BY_ID.get('hello-friends') ?? {
  id: 'hello-friends',
  title: 'Hello Friends!',
  tagline: 'Salue, présente-toi et dis comment tu te sens, in English!',
  icon: '👋',
  island: 'ailleurs',
  accent: '#ff7043',
  skills: ['en.cp.greetings', 'en.cp.self', 'en.cp.feelings'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '👋', name: 'Bonjour, au revoir', sub: 'Hello & goodbye' },
  { emoji: '🙏', name: 'Merci, s’il te plaît', sub: 'Politesse' },
  { emoji: '😄', name: 'Mes émotions', sub: 'Happy, sad, tired, OK' },
  { emoji: '🎂', name: 'Je me présente', sub: 'Mon âge, ma couleur' },
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

/** Clip de consigne (français, denise) selon le round. */
function consigneClip(r: Round): string {
  if (r.category === 'greetings') return 'hef.consigne.greetings'
  if (r.category === 'feelings') return 'hef.consigne.feelings'
  return r.kind === 'age' ? 'hef.consigne.age' : 'hef.consigne.colour'
}

// ---------- Keyframes locales du jeu ----------

function HefStyles() {
  return (
    <style>{`
@keyframes hef-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 112, 67, 0.85); }
  50% { box-shadow: 0 0 0 12px rgba(255, 112, 67, 0); }
}
.hef-pulse { animation: hef-pulse 1.1s ease-in-out infinite; }
@keyframes hef-wave {
  0%, 100% { transform: rotate(-8deg); }
  50% { transform: rotate(12deg); }
}
.hef-wave { animation: hef-wave 1.4s ease-in-out infinite; transform-origin: 70% 70%; }
`}</style>
  )
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'aim' | 'teach' | 'success'

export default function HelloFriends() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<HefProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [round, setRound] = useState<Round | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('aim')
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
  const usedTargetsRef = useRef<string[]>([])
  const wrongTimerRef = useRef(0)

  // Chargement de la progression + préchargement des clips d'encadrement
  useEffect(() => {
    let alive = true
    void pget<HefProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips(['hef.intro', 'hef.bravo', 'hef.thatone', 'hef.essaie', 'hef.indice'])
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(wrongTimerRef.current)
      stopSpeech()
    }
  }, [])

  const saveProgress = (p: HefProgress): void => {
    setProgress(p)
    void pset(STORE_KEY, p)
  }

  // ---------- Audio ----------

  /** Consigne d'un round : la phrase française (denise) puis le mot/phrase anglais (sonia). */
  const speakRound = useCallback(async (r: Round): Promise<void> => {
    const seq = ++seqRef.current
    await say(E(consigneClip(r)))
    if (seqRef.current !== seq) return
    await say(E(cardClip(r.targetId)), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Réécouter n'est possible que pendant la visée (anti soft-lock pendant
      // le feedback/l'enseignement).
      if (round && phase === 'aim') void speakRound(round)
      return
    }
    void say(E('hef.intro'))
  }, [screen, round, phase, speakRound])

  // ---------- Déroulé d'une partie ----------

  const installRound = (r: Round): void => {
    usedTargetsRef.current.push(r.targetId)
    preloadClips([consigneClip(r), ...r.optionIds.map((id) => cardClip(id))])
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setWrongId(null)
    setFoundId(null)
    setPhase('aim')
    setRound(r)
    void speakRound(r)
  }

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    usedTargetsRef.current = []
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    installRound(generateItem(t, tunerRef.current.level))
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
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun(tier)
      return
    }
    const prev = usedTargetsRef.current[usedTargetsRef.current.length - 1]
    installRound(generateItem(tier, tunerRef.current.level, prev))
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
    void say(E('hef.bravo')).then(() => setOverlay('success'))
  }

  // ---------- Interaction : taper une carte ----------

  const onTapCard = (id: string): void => {
    if (!round || phase !== 'aim') return
    if (id === round.targetId) {
      setFoundId(id)
      sfx(round.tier === 3 ? 'magic' : 'pop')
      resolveItem()
      return
    }
    // L'erreur enseigne : la carte tremble et la voix la NOMME en anglais.
    firstTryRef.current = false
    failsRef.current += 1
    sfx('wrong')
    setPhase('teach')
    setWrongId(id)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    const seq = ++seqRef.current
    void say(E('hef.thatone'))
      .then(() => {
        if (seqRef.current !== seq) return
        return say(E(cardClip(id)), { interrupt: false })
      })
      .then(() => {
        if (seqRef.current !== seq) return
        if (failsRef.current >= 2 && !hint) {
          setHint(true)
          void say(E('hef.indice'), { interrupt: false })
        }
        setOverlay('retry')
      })
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') {
      advance()
      return
    }
    // retry : on redonne un essai dans le MÊME contexte.
    setPhase('aim')
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            👋
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('hef.intro')} autoPlay />
        </div>
        <div className="flex items-center gap-2 text-5xl" aria-hidden="true">
          <span>🇬🇧</span>
          <span className="hef-wave inline-block">👋</span>
          <span>😄</span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute l’anglais, tape la bonne image !
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
                aria-label={locked ? `${info.name}, ${info.sub} (verrouillé)` : `${info.name}, ${info.sub}`}
                onClick={() => {
                  if (locked) {
                    sfx('slide')
                    void say(E('hef.verrou.etoiles'))
                    return
                  }
                  sfx('tap')
                  setTier(t)
                  void say(E(`hef.niveau.${t}`))
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

  const renderPlay = (r: Round): ReactNode => {
    const cols = r.optionIds.length >= 5 ? 'grid-cols-3' : 'grid-cols-2'
    const heading =
      r.category === 'greetings'
        ? 'Écoute, puis tape la bonne image !'
        : r.category === 'feelings'
          ? 'Écoute, puis tape le bon visage !'
          : r.kind === 'age'
            ? 'Écoute l’âge, puis tape le bon chiffre !'
            : 'Écoute la couleur, puis tape la bonne couleur !'
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-3 pb-6">
        <div className="flex items-center justify-center gap-3">
          <span aria-hidden="true" className="text-base">🇬🇧</span>
          <p className="text-center text-lg font-extrabold text-ink sm:text-xl">{heading}</p>
          <Mascot mood={phase === 'success' ? 'cheer' : 'idle'} size={48} />
        </div>
        <div className={`grid w-full ${cols} gap-3`}>
          {r.optionIds.map((id) => {
            const card = CARDS_BY_ID.get(id)
            const colour = COLOURS_BY_ID.get(id)
            const found = foundId === id
            const isWrong = wrongId === id
            const pulse = hint && phase === 'aim' && id === r.targetId
            return (
              <button
                key={id}
                type="button"
                aria-label={card?.en ?? id}
                disabled={phase !== 'aim'}
                onClick={() => onTapCard(id)}
                className={`tap-target card flex flex-col items-center justify-center gap-1.5 p-3 transition-transform active:scale-95 ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-bounce-in' : ''} ${pulse ? 'hef-pulse' : ''}`}
                style={pulse ? { borderRadius: 16 } : undefined}
              >
                {colour ? (
                  <span
                    aria-hidden="true"
                    className="h-14 w-14 rounded-full shadow-card"
                    style={{ background: `radial-gradient(circle at 35% 30%, ${colour.hex}cc, ${colour.hex})` }}
                  />
                ) : (
                  <span aria-hidden="true" className={found ? 'text-6xl' : 'text-5xl'}>
                    {card?.emoji}
                  </span>
                )}
                <span className="text-base font-extrabold" style={{ color: ACCENT }}>
                  {card?.en}
                </span>
              </button>
            )
          })}
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
      <HefStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && round && renderPlay(round)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Un nouveau jeu est débloqué !
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
