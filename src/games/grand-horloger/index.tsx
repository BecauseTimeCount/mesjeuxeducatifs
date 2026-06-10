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
  consigneClips,
  DAY_LABELS,
  DAYS,
  FRESH_PROGRESS,
  generateItem,
  hourAngle,
  isClockSet,
  isCorrectDay,
  isCorrectMoment,
  isCorrectMonth,
  isCorrectSeason,
  ITEMS_PER_RUN,
  itemKey,
  MAX_TUNER_LEVEL,
  minuteAngle,
  MOMENT_LABELS,
  MONTH_LABELS,
  MONTH_SHORT,
  SEASON_LABELS,
  SEASONS,
  skillFor,
  starsFor,
  teachClips,
} from './logic'
import type { ClockItem, DayItem, GhoItem, GhoProgress, Moment, MomentItem, MonthItem, Season, SeasonItem, TierId } from './logic'

// ============================================================
// Le Grand Horloger — l'enfant FAIT le temps : il place le
// soleil sur l'arc du ciel, tape les jours sur la roue, règle
// les aiguilles de l'horloge, parcourt les mois et les saisons.
// Taper sur la roue / le cadran EST la compétence. Zéro QCM.
// ============================================================

const STORE_KEY = 'game:grand-horloger'

const META: GameMeta = GAMES_BY_ID.get('grand-horloger') ?? {
  id: 'grand-horloger',
  title: 'Le Grand Horloger',
  tagline: 'Règle les aiguilles, fais tourner le temps !',
  icon: '🕰️',
  island: 'monde',
  accent: '#9b59b6',
  skills: ['mo.gs.temps.journee', 'mo.gs.temps.semaine', 'mo.cp.temps.heures', 'mo.cp.temps.calendrier'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🌞', name: 'La journée', sub: 'Matin, midi et soir' },
  { emoji: '🗓️', name: 'La roue des jours', sub: 'Les 7 jours de la semaine' },
  { emoji: '🕰️', name: 'Les heures piles', sub: 'Règle la petite aiguille' },
  { emoji: '⏰', name: 'Heures et demies', sub: 'Aiguilles, mois et saisons' },
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

// ---------- Keyframes locales du jeu ----------

function GhoStyles() {
  return (
    <style>{`
@keyframes gho-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 201, 77, 0); background-color: rgba(255, 201, 77, 0.3); }
  50% { box-shadow: 0 0 20px 8px rgba(255, 201, 77, 0.55); background-color: rgba(255, 201, 77, 0.85); }
}
.gho-glow { animation: gho-glow 1.1s ease-in-out infinite; }
@keyframes gho-pulse-svg {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.85; }
}
.gho-pulse-svg { animation: gho-pulse-svg 1.1s ease-in-out infinite; }
@keyframes gho-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.gho-spin { animation: gho-spin 9s linear infinite; }
@keyframes gho-swing {
  0%, 100% { transform: rotate(-7deg); }
  50% { transform: rotate(7deg); }
}
.gho-swing { animation: gho-swing 2.2s ease-in-out infinite; transform-origin: 50% 10%; }
`}</style>
  )
}

// ---------- Données de scène (UI pure) ----------

/** Positions des 4 moments sur l'arc du ciel (de gauche à droite). */
const MOMENT_SLOTS: ReadonlyArray<{ moment: Moment; left: string; top: string; emoji: string }> = [
  { moment: 'matin', left: '9%', top: '62%', emoji: '🌅' },
  { moment: 'midi', left: '33%', top: '20%', emoji: '☀️' },
  { moment: 'apres-midi', left: '67%', top: '20%', emoji: '🌤️' },
  { moment: 'soir', left: '91%', top: '62%', emoji: '🌙' },
]

const SEASON_EMOJI: Readonly<Record<Season, string>> = {
  printemps: '🌸',
  ete: '☀️',
  automne: '🍂',
  hiver: '❄️',
}

/** Emoji-saison d'un mois (déc-févr hiver, mars-mai printemps…). */
function monthEmoji(index: number): string {
  if (index === 11 || index <= 1) return '❄️'
  if (index <= 4) return '🌸'
  if (index <= 7) return '☀️'
  return '🍂'
}

// ---------- Géométrie de l'horloge SVG ----------

const CLOCK_C = 130

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [CLOCK_C + r * Math.cos(rad), CLOCK_C + r * Math.sin(rad)]
}

/** Secteur annulaire de 30° autour d'un chiffre : grande cible tactile. */
function wedgePath(digit: number): string {
  const a1 = digit * 30 - 105
  const a2 = digit * 30 - 75
  const [x1, y1] = polar(46, a1)
  const [x2, y2] = polar(124, a1)
  const [x3, y3] = polar(124, a2)
  const [x4, y4] = polar(46, a2)
  return `M ${x1} ${y1} L ${x2} ${y2} A 124 124 0 0 1 ${x3} ${y3} L ${x4} ${y4} A 46 46 0 0 0 ${x1} ${y1} Z`
}

// ---------- Roue générique (jours et mois) ----------

interface WheelSlot {
  key: string
  ariaLabel: string
  content: ReactNode
  onTap: () => void
  /** la bonne réponse brille (réussite, enseignement, indice) */
  glow: boolean
  /** jour/mois de référence de la consigne : épinglé 📍 */
  pinned: boolean
  /** le choix erroné frissonne */
  shaking: boolean
}

function Wheel({
  slots,
  slotSize,
  center,
  disabled,
}: {
  slots: WheelSlot[]
  slotSize: number
  center: ReactNode
  disabled: boolean
}) {
  return (
    <div
      className="relative mx-auto"
      style={{ width: 'min(90vw, 344px)', height: 'min(90vw, 344px)' }}
    >
      <div className="absolute top-1/2 left-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white text-center shadow-card">
        {center}
      </div>
      {slots.map((slot, i) => {
        const angle = -90 + (i * 360) / slots.length
        const rad = (angle * Math.PI) / 180
        const left = 50 + 41 * Math.cos(rad)
        const top = 50 + 41 * Math.sin(rad)
        return (
          <button
            key={slot.key}
            type="button"
            disabled={disabled}
            aria-label={slot.ariaLabel}
            onClick={slot.onTap}
            className={`tap-target absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white font-extrabold text-ink shadow-card transition-transform active:scale-90 ${slot.glow ? 'gho-glow' : ''} ${slot.shaking ? 'animate-shake-soft' : ''}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: slotSize,
              height: slotSize,
              outline: slot.pinned ? `4px solid ${ACCENT}` : undefined,
            }}
          >
            {slot.pinned && (
              <span aria-hidden="true" className="absolute -top-3 text-base">
                📍
              </span>
            )}
            {slot.content}
          </button>
        )
      })}
    </div>
  )
}

// ---------- Composant principal ----------

type Screen = 'menu' | 'play' | 'end'
type Phase = 'aim' | 'success' | 'error' | 'teach'
type Hand = 'hour' | 'minute'

const CORE_CLIPS = ['gho.bien-joue', 'gho.oups', 'gho.reessaie', 'gho.indice', 'gho.valide-heure']

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function GrandHorloger() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<GhoProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<GhoItem | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('aim')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [revealTarget, setRevealTarget] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  // Horloge : chiffre pointé par chaque aiguille (12 = position de départ)
  const [hourDigit, setHourDigit] = useState(12)
  const [minuteDigit, setMinuteDigit] = useState(12)
  const [activeHand, setActiveHand] = useState<Hand>('hour')
  const [touched, setTouched] = useState(false)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const usedKeysRef = useRef<string[]>([])
  /** le conseil « appuie sur c'est l'heure » n'est donné qu'une fois par partie */
  const confirmHintRef = useRef(false)
  /** promesse de la consigne en cours : les conseils s'enchaînent APRÈS elle */
  const consignePromiseRef = useRef<Promise<void>>(Promise.resolve())

  // Chargement de la progression + préchargement des clips de base
  useEffect(() => {
    let alive = true
    void pget<GhoProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    // Le corpus compte ~100 clips : précharger item par item (cache LRU Howler)
    preloadClips(['gho.intro', ...CORE_CLIPS])
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: GhoItem): Promise<void> => {
    const seq = ++seqRef.current
    const clips = consigneClips(it)
    for (let i = 0; i < clips.length; i++) {
      await say(E(clips[i]), i === 0 ? undefined : { interrupt: false })
      if (seqRef.current !== seq) return
    }
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Verrou anti soft-lock : réécouter n'est possible qu'en phase de visée.
      // Pendant un feedback ou l'enseignement, le bouton est un no-op — il ne
      // doit jamais pouvoir invalider la séquence audio en cours.
      if (item && phase === 'aim') consignePromiseRef.current = speakConsigne(item)
      return
    }
    void say(E('gho.intro'))
  }, [screen, item, phase, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const prepareItem = (it: GhoItem): void => {
    firstTryRef.current = true
    failsRef.current = 0
    preloadClips([...consigneClips(it), ...teachClips(it)])
    setItem(it)
    setChosen(null)
    setHint(false)
    setRevealTarget(false)
    setHourDigit(12)
    setMinuteDigit(12)
    setActiveHand('hour')
    setTouched(false)
    setPhase('aim')
    consignePromiseRef.current = speakConsigne(it)
  }

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    confirmHintRef.current = false
    usedKeysRef.current = []
    const first = generateItem(t, 0, [], 0)
    usedKeysRef.current.push(itemKey(first))
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    prepareItem(first)
  }

  // ---------- Résolution d'un item ----------

  const succeed = (it: GhoItem): void => {
    // Résolution de l'item : maîtrise + Tuner, UNE seule fois.
    const wasFirst = firstTryRef.current
    void recordAttempt(skillFor(it), wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setRevealTarget(true)
    sfx('magic')
    // L'overlay attend la fin du clip et arrive INCONDITIONNELLEMENT :
    // say() résout toujours, même interrompu.
    void say(E('gho.bien-joue')).then(() => setOverlay('success'))
  }

  const fail = (): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    void say(E('gho.oups')).then(() => setOverlay('retry'))
  }

  /** Tap direct sur une cible (moment, jour, mois, saison). */
  const resolveChoice = (ok: boolean, chosenId: string): void => {
    if (!item || phase !== 'aim') return
    // Invalide la consigne en cours : le verdict ne doit jamais être chevauché.
    seqRef.current += 1
    sfx('tap')
    setChosen(chosenId)
    if (ok) succeed(item)
    else fail()
  }

  /** Tap sur un chiffre du cadran : déplace l'aiguille active. */
  const onClockDigit = (digit: number): void => {
    if (!item || item.kind !== 'heure' || phase !== 'aim') return
    sfx('tap')
    setTouched(true)
    if (item.half && activeHand === 'minute') setMinuteDigit(digit)
    else setHourDigit(digit)
    if (!confirmHintRef.current) {
      confirmHintRef.current = true
      // Le conseil attend la FIN de la consigne (jamais deux voix en même
      // temps) et s'abandonne si une autre séquence a démarré entre-temps.
      const seq = seqRef.current
      void consignePromiseRef.current.then(() => {
        if (seqRef.current !== seq) return
        void say(E('gho.valide-heure'), { interrupt: false })
      })
    }
  }

  const onValidateClock = (): void => {
    if (!item || item.kind !== 'heure' || phase !== 'aim' || !touched) return
    seqRef.current += 1
    if (isClockSet(item, hourDigit, minuteDigit)) succeed(item)
    else fail()
  }

  /** Feedback élaboratif : la bonne réponse s'allume et se NOMME,
   *  puis nouvel essai sur le MÊME item. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('teach')
    setRevealTarget(true)
    sfx('magic')
    if (item.kind === 'heure') {
      // Les aiguilles glissent d'elles-mêmes vers la bonne heure.
      setHourDigit(item.hour)
      setMinuteDigit(item.half ? 6 : 12)
    }
    try {
      const clips = teachClips(item)
      for (let i = 0; i < clips.length; i++) {
        await say(E(clips[i]), i === 0 ? undefined : { interrupt: false })
        if (seqRef.current !== seq) return
      }
      await wait(700)
    } finally {
      // Restauration INCONDITIONNELLE (anti soft-lock) : le jeton seq
      // n'annule que la suite audio, jamais le retour en phase de visée.
      setRevealTarget(false)
      setChosen(null)
      setHourDigit(12)
      setMinuteDigit(12)
      setActiveHand('hour')
      setTouched(false)
      setPhase('aim')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      void say(E('gho.indice'), { interrupt: false })
    }
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    const next = generateItem(tier, done, usedKeysRef.current, tunerRef.current.level)
    usedKeysRef.current.push(itemKey(next))
    prepareItem(next)
  }

  const finishRun = (): void => {
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, tier, stars)
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

  // ---------- Rendus : menu ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🕰️
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('gho.intro')} autoPlay />
        </div>
        <div
          className="relative flex h-24 w-full max-w-sm items-center justify-center overflow-hidden rounded-card shadow-card"
          style={{ background: 'linear-gradient(135deg, #2e1a47 0%, #6d3f8f 55%, #b07cc6 100%)' }}
          aria-hidden="true"
        >
          <span className="gho-spin absolute top-2 left-4 text-2xl">⚙️</span>
          <span className="gho-spin absolute right-4 bottom-1 text-xl" style={{ animationDirection: 'reverse' }}>⚙️</span>
          <span className="absolute top-2 right-10 text-lg">🗝️</span>
          <span className="absolute bottom-1 left-12 text-lg">🌙</span>
          <span className="gho-swing text-5xl">🕰️</span>
          <span className="ml-3 text-3xl">☀️</span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Règle les aiguilles, fais tourner le temps !
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          {TIER_INFO.map((info, i) => {
            const t = i as TierId
            const locked = t > progress.unlockedTier
            const stars = progress.bestStars[t]
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
                  void say(E(`gho.niveau.${t}`))
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

  // ---------- Rendus : tier 0 — l'arc du ciel ----------

  const renderMoment = (it: MomentItem): ReactNode => {
    const showGlow = revealTarget || (hint && phase === 'aim')
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <p className="text-center text-lg font-extrabold text-ink">
          Écoute, et place le soleil dans le ciel !
        </p>
        <div
          className="relative h-56 w-full max-w-md overflow-hidden rounded-card shadow-card"
          style={{ background: 'linear-gradient(180deg, #3b2a5e 0%, #8e6bb5 45%, #f7c873 100%)' }}
        >
          {MOMENT_SLOTS.map((slot) => {
            const isTarget = slot.moment === it.moment
            const isChosen = chosen === slot.moment
            const placed = isChosen && (phase === 'success' || phase === 'error')
            return (
              <button
                key={slot.moment}
                type="button"
                disabled={phase !== 'aim'}
                aria-label={MOMENT_LABELS[slot.moment]}
                onClick={() => resolveChoice(isCorrectMoment(it, slot.moment), slot.moment)}
                className={`tap-target absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 border-dashed border-white/60 transition-transform active:scale-90 ${showGlow && isTarget ? 'gho-glow' : ''} ${isChosen && phase === 'error' ? 'animate-shake-soft' : ''}`}
                style={{ left: slot.left, top: slot.top, width: 80, height: 80 }}
              >
                <span
                  aria-hidden="true"
                  className={`text-3xl leading-none ${placed && phase === 'success' ? 'animate-bounce-in' : ''}`}
                  style={{ opacity: placed || (showGlow && isTarget) ? 1 : 0.45 }}
                >
                  {slot.emoji}
                </span>
                <span className="text-[11px] leading-tight font-extrabold text-white drop-shadow">
                  {MOMENT_LABELS[slot.moment]}
                </span>
              </button>
            )
          })}
          <span aria-hidden="true" className="absolute bottom-1 left-3 text-3xl">🏡</span>
          <span aria-hidden="true" className="absolute right-3 bottom-1 text-3xl">🌳</span>
        </div>
      </div>
    )
  }

  // ---------- Rendus : tier 1 — la roue des jours ----------

  const renderDay = (it: DayItem): ReactNode => {
    const showGlow = revealTarget || (hint && phase === 'aim')
    const centerTop =
      it.variant === 'apres' ? 'Juste après' : it.variant === 'avant' ? 'Juste avant' : 'Aujourd’hui :'
    const centerBottom =
      it.variant === 'demain' ? 'Et demain ?' : it.variant === 'hier' ? 'Et hier ?' : 'c’est quel jour ?'
    const slots: WheelSlot[] = DAYS.map((day, i) => ({
      key: day,
      ariaLabel: DAY_LABELS[i],
      content: <span className="px-1 text-[13px] leading-tight">{DAY_LABELS[i]}</span>,
      onTap: () => resolveChoice(isCorrectDay(it, i), day),
      glow: showGlow && i === it.answer,
      pinned: i === it.ref,
      shaking: phase === 'error' && chosen === day,
    }))
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <Wheel
          slots={slots}
          slotSize={76}
          disabled={phase !== 'aim'}
          center={
            <>
              <span className="text-xs font-bold text-ink-soft">{centerTop}</span>
              <span className="text-lg leading-tight font-extrabold text-ink">{DAY_LABELS[it.ref]}</span>
              <span className="text-xs font-bold" style={{ color: ACCENT }}>
                {centerBottom}
              </span>
            </>
          }
        />
      </div>
    )
  }

  // ---------- Rendus : tier 2/3 — l'horloge ----------

  const renderClock = (it: ClockItem): ReactNode => {
    const showGlow = revealTarget || (hint && phase === 'aim')
    const targets = new Set<number>()
    if (showGlow) {
      targets.add(it.hour)
      if (it.half) targets.add(6)
    }
    const hDeg = hourAngle(hourDigit, minuteDigit)
    const mDeg = minuteAngle(minuteDigit)
    const handStyle = (deg: number): CSSProperties => ({
      transform: `rotate(${deg}deg)`,
      transformOrigin: `${CLOCK_C}px ${CLOCK_C}px`,
      transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
    })
    return (
      <div className="flex w-full flex-col items-center gap-3">
        {/* L'enseigne de l'atelier : l'heure cible, en double codage écrit + audio */}
        <div className="flex items-center gap-3">
          <p className="text-lg font-extrabold text-ink">Règle l’horloge sur</p>
          <div
            className="flex h-14 min-w-20 items-center justify-center rounded-2xl px-3 text-3xl font-extrabold text-ink shadow-card"
            style={{ background: 'var(--color-sun)', border: `4px solid ${ACCENT}` }}
          >
            {it.hour} h{it.half ? ' 30' : ''}
          </div>
        </div>

        <svg
          viewBox="0 0 260 260"
          className={`w-full max-w-[340px] touch-none select-none ${phase === 'error' ? 'animate-shake-soft' : ''}`}
          role="application"
          aria-label={`Horloge à régler sur ${it.hour} heure${it.hour > 1 ? 's' : ''}${it.half ? ' et demie' : ''}. Tape un chiffre du cadran pour y amener l'aiguille.`}
        >
          {/* Cadran de l'atelier */}
          <circle cx={CLOCK_C} cy={CLOCK_C} r={126} fill="#3b2a5e" />
          <circle cx={CLOCK_C} cy={CLOCK_C} r={118} fill="#fff8ec" stroke={ACCENT} strokeWidth={5} />
          {/* Secteurs tactiles + chiffres */}
          {Array.from({ length: 12 }, (_, i) => i + 1).map((digit) => {
            const [nx, ny] = polar(92, digit * 30 - 90)
            const isHourSet = hourDigit === digit
            return (
              <g key={digit} onPointerDown={() => onClockDigit(digit)} style={{ cursor: 'pointer' }}>
                <path
                  d={wedgePath(digit)}
                  fill={isHourSet ? ACCENT : 'transparent'}
                  opacity={isHourSet ? 0.16 : 1}
                />
                {targets.has(digit) && (
                  <circle
                    className="gho-pulse-svg"
                    cx={nx}
                    cy={ny}
                    r={22}
                    fill="var(--color-sun)"
                  />
                )}
                <text
                  x={nx}
                  y={ny}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={30}
                  fontWeight={800}
                  fill={isHourSet ? ACCENT : '#3a3357'}
                  style={{ pointerEvents: 'none' }}
                >
                  {digit}
                </text>
              </g>
            )
          })}
          {/* Grande aiguille (minutes) puis petite (heures) par-dessus */}
          <g style={handStyle(mDeg)}>
            <line
              x1={CLOCK_C}
              y1={CLOCK_C}
              x2={CLOCK_C}
              y2={56}
              stroke="#6d3f8f"
              strokeWidth={7}
              strokeLinecap="round"
            />
          </g>
          <g style={handStyle(hDeg)}>
            <line
              x1={CLOCK_C}
              y1={CLOCK_C}
              x2={CLOCK_C}
              y2={82}
              stroke="#3a3357"
              strokeWidth={11}
              strokeLinecap="round"
            />
          </g>
          <circle cx={CLOCK_C} cy={CLOCK_C} r={9} fill={ACCENT} />
        </svg>

        {/* « Et demie » : on choisit quelle aiguille obéit au cadran */}
        {it.half && (
          <div className="flex w-full max-w-sm gap-2">
            {(
              [
                { hand: 'hour' as Hand, label: 'Petite aiguille', emoji: '🕐' },
                { hand: 'minute' as Hand, label: 'Grande aiguille', emoji: '🕡' },
              ] as const
            ).map(({ hand, label, emoji }) => (
              <button
                key={hand}
                type="button"
                aria-pressed={activeHand === hand}
                onClick={() => {
                  if (phase !== 'aim') return
                  sfx('pop')
                  setActiveHand(hand)
                }}
                className="tap-target card flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-sm font-extrabold text-ink transition-transform active:scale-95"
                style={activeHand === hand ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-xl">
                  {emoji}
                </span>
                {label}
              </button>
            ))}
          </div>
        )}

        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-2xl"
          disabled={phase !== 'aim' || !touched}
          onClick={onValidateClock}
        >
          C’est l’heure ! 🕰️
        </BigButton>
      </div>
    )
  }

  // ---------- Rendus : tier 3 — la roue des mois ----------

  const renderMonth = (it: MonthItem): ReactNode => {
    const showGlow = revealTarget || (hint && phase === 'aim')
    const slots: WheelSlot[] = MONTH_SHORT.map((short, i) => ({
      key: short,
      ariaLabel: MONTH_LABELS[i],
      content: (
        <>
          <span aria-hidden="true" className="text-base leading-none">
            {monthEmoji(i)}
          </span>
          <span className="text-[11px] leading-tight">{short}</span>
        </>
      ),
      onTap: () => resolveChoice(isCorrectMonth(it, i), short),
      glow: showGlow && i === it.answer,
      pinned: i === it.ref,
      shaking: phase === 'error' && chosen === short,
    }))
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <Wheel
          slots={slots}
          slotSize={64}
          disabled={phase !== 'aim'}
          center={
            <>
              <span className="text-xs font-bold text-ink-soft">
                {it.variant === 'apres' ? 'Juste après' : 'Juste avant'}
              </span>
              <span className="px-1 text-base leading-tight font-extrabold text-ink">
                {MONTH_LABELS[it.ref]}
              </span>
              <span className="text-xs font-bold" style={{ color: ACCENT }}>
                c’est quel mois ?
              </span>
            </>
          }
        />
      </div>
    )
  }

  // ---------- Rendus : tier 3 — les saisons ----------

  const renderSeason = (it: SeasonItem): ReactNode => {
    const showGlow = revealTarget || (hint && phase === 'aim')
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <p className="text-center text-base font-extrabold text-ink">{E(it.questionId).text}</p>
        <div className="grid w-full grid-cols-2 gap-3">
          {SEASONS.map((season) => (
            <button
              key={season}
              type="button"
              disabled={phase !== 'aim'}
              aria-label={SEASON_LABELS[season]}
              onClick={() => resolveChoice(isCorrectSeason(it, season), season)}
              className={`tap-target card flex h-28 flex-col items-center justify-center gap-1 transition-transform active:scale-95 ${showGlow && season === it.answer ? 'gho-glow' : ''} ${phase === 'error' && chosen === season ? 'animate-shake-soft' : ''}`}
            >
              <span aria-hidden="true" className="text-4xl">
                {SEASON_EMOJI[season]}
              </span>
              <span className="text-base font-extrabold text-ink">{SEASON_LABELS[season]}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const renderPlay = (it: GhoItem): ReactNode => {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-3 pb-6">
        {it.kind === 'moment' && renderMoment(it)}
        {it.kind === 'jour' && renderDay(it)}
        {it.kind === 'heure' && renderClock(it)}
        {it.kind === 'mois' && renderMonth(it)}
        {it.kind === 'saison' && renderSeason(it)}
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      <GhoStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouvel atelier débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
