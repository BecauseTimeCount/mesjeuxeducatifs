import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { numberEntry } from '@/content/numbers'
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
  NumPad,
  ProgressDots,
  SpeakerButton,
} from '@/ui'
import corpus from './corpus.json'
import {
  applyRun,
  checkAnswer,
  FRESH_PROGRESS,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  neededPlacements,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { CavItem, CavProgress, TierId } from './logic'

// ============================================================
// Calcul Aventure 🗺️ — refonte du QCM V1 : l'enfant MANIPULE
// les objets (panier, singe, boîte de dix) puis PRODUIT le
// résultat au NumPad. Concret → imagé → abstrait sur 4 paliers.
// Un renard explorateur avance vers le trésor à chaque calcul.
// ============================================================

const STORE_KEY = 'game:calcul-aventure'

const META: GameMeta = GAMES_BY_ID.get('calcul-aventure') ?? {
  id: 'calcul-aventure',
  title: 'Calcul Aventure',
  tagline: 'Remplis le panier et tape le résultat !',
  icon: '🗺️',
  island: 'nombres',
  accent: '#3498db',
  skills: [...TIER_SKILLS],
  status: 'v2',
}
const ACCENT = META.accent

// ---------- Les 8 étapes de l'île (décor + objet thématique) ----------

interface Stage {
  decor: string
  obj: string
  /** nom français PLURIEL de l'objet (masculin : « un/deux » fonctionnent) */
  name: string
  /** id du clip corpus qui prononce le nom de l'objet */
  clip: string
}

/** ITEMS_PER_RUN étapes exactement : une étape = un calcul résolu. */
const STAGES: readonly Stage[] = [
  { decor: '🏖️', obj: '🐚', name: 'coquillages', clip: 'cav.obj.coquillages' },
  { decor: '🌴', obj: '🍍', name: 'ananas', clip: 'cav.obj.ananas' },
  { decor: '🌺', obj: '🦋', name: 'papillons', clip: 'cav.obj.papillons' },
  { decor: '🌳', obj: '🍄', name: 'champignons', clip: 'cav.obj.champignons' },
  { decor: '🏞️', obj: '🐟', name: 'poissons', clip: 'cav.obj.poissons' },
  { decor: '🌋', obj: '🪨', name: 'cailloux', clip: 'cav.obj.cailloux' },
  { decor: '⛰️', obj: '💎', name: 'diamants', clip: 'cav.obj.diamants' },
  { decor: '🗝️', obj: '💍', name: 'bijoux', clip: 'cav.obj.bijoux' },
]

function stageFor(idx: number): Stage {
  return STAGES[Math.min(Math.max(idx, 0), STAGES.length - 1)]
}

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🧺', name: 'Les paniers', sub: 'Additions jusqu’à 10' },
  { emoji: '🐒', name: 'Le singe chapardeur', sub: 'Soustractions jusqu’à 10' },
  { emoji: '📦', name: 'La boîte de dix', sub: 'Additions jusqu’à 20' },
  { emoji: '🧠', name: 'Le calcul de tête', sub: 'Plus et moins, jusqu’à 20' },
]

// ---------- Corpus local typé ----------

function toVoice(v: string | undefined): CorpusEntry['voice'] {
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

// ---------- Petits helpers ----------

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => start + i)
}

/** Keyframes locales du jeu — montées UNE fois dans le composant. */
function CavStyles() {
  return (
    <style>{`
@keyframes cav-hop {
  0%, 100% { transform: translateY(0); }
  40% { transform: translateY(-14px) scale(1.12); }
  75% { transform: translateY(2px); }
}
.cav-hop { animation: cav-hop 0.55s ease-out both; }
`}</style>
  )
}

// ---------- Le chemin de l'aventure (8 étapes → trésor) ----------

function AdventurePath({ resolved, stumble }: { resolved: number; stumble: boolean }) {
  const nodes = STAGES.length + 1 // 8 étapes + le trésor
  const foxLeft = `${((Math.min(resolved, STAGES.length) + 0.5) / nodes) * 100}%`
  return (
    <div
      className="relative mx-auto w-full max-w-xl"
      role="img"
      aria-label={`Étape ${Math.min(resolved + 1, STAGES.length)} sur ${STAGES.length}`}
    >
      <div className="grid grid-cols-9 items-end justify-items-center rounded-card bg-white/60 px-1 pt-9 pb-1.5">
        {STAGES.map((s, i) => (
          <span
            key={s.name}
            aria-hidden="true"
            className={`text-xl leading-none sm:text-2xl ${
              i === resolved ? 'animate-pop' : i < resolved ? 'opacity-35' : 'opacity-70'
            }`}
          >
            {s.decor}
          </span>
        ))}
        <span
          aria-hidden="true"
          className={`text-xl leading-none sm:text-2xl ${resolved >= STAGES.length ? 'animate-pop' : ''}`}
        >
          🏴‍☠️
        </span>
      </div>
      <div
        aria-hidden="true"
        className="absolute top-0 -translate-x-1/2"
        style={{ left: foxLeft, transition: 'left 0.5s ease-out' }}
      >
        <span
          key={resolved}
          className={`cav-hop inline-block text-3xl leading-none ${stumble ? 'animate-shake-soft' : ''}`}
        >
          🦊
        </span>
        {stumble && (
          <span className="animate-pop absolute -top-4 left-1/2 -translate-x-1/2 text-lg">💫</span>
        )}
      </div>
    </div>
  )
}

// ---------- La boîte de dix (T2) ----------

function TenBox({ big = false }: { big?: boolean }) {
  return (
    <span
      className={`animate-pop inline-flex items-center justify-center gap-0.5 rounded-bubble font-extrabold text-ink ${
        big ? 'px-4 py-2 text-3xl' : 'px-3 py-1.5 text-2xl'
      }`}
      style={{ background: 'rgba(255, 201, 77, 0.45)', border: '3px solid var(--color-sun-deep)' }}
      role="img"
      aria-label="Une boîte de dix"
    >
      <span aria-hidden="true">✨</span>10
    </span>
  )
}

// ---------- Le feedback élaboratif : on compte ensemble ----------

interface CountingState {
  /** plain = tout compter ; box = boîte de 10 + surcomptage ; sub = barrés puis restants */
  shape: 'plain' | 'box' | 'sub'
  /** plain : answer cellules ; sub : a cellules ; box : cellules en plus de la boîte */
  size: number
  /** sub : nombre de cellules barrées (placées en FIN de rangée) */
  removed: number
  /** cellules déjà comptées (hors boîte) */
  counted: number
  /** box : la boîte vient d'être annoncée (« déjà dix ») */
  boxLit: boolean
  total: number
  /** emoji de l'objet, ou null → rangée de points (T3 abstrait) */
  emoji: string | null
}

function CountCell({ lit, removed, emoji }: { lit: boolean; removed: boolean; emoji: string | null }) {
  if (removed) {
    return (
      <span className="relative inline-flex items-center justify-center opacity-30" aria-hidden="true">
        {emoji ? (
          <span className="text-2xl leading-none">{emoji}</span>
        ) : (
          <span className="block h-4 w-4 rounded-full" style={{ background: 'var(--color-ink-soft)' }} />
        )}
        <span className="absolute text-lg font-extrabold text-ink">✖</span>
      </span>
    )
  }
  if (emoji) {
    return (
      <span
        aria-hidden="true"
        className={`text-2xl leading-none ${lit ? 'animate-pop' : 'opacity-25'}`}
      >
        {emoji}
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`block h-4 w-4 rounded-full ${lit ? 'animate-pop' : ''}`}
      style={{ background: ACCENT, opacity: lit ? 1 : 0.25 }}
    />
  )
}

function CountingCard({ counting }: { counting: CountingState }) {
  const remaining = counting.size - counting.removed
  return (
    <div className="card flex w-full flex-col items-center gap-2 p-3">
      <div className="flex max-w-sm flex-wrap items-center justify-center gap-1.5">
        {counting.shape === 'box' && (
          <span className={counting.boxLit ? '' : 'opacity-25'}>
            <TenBox />
          </span>
        )}
        {range(0, counting.size).map((i) =>
          counting.shape === 'sub' && i >= remaining ? (
            <CountCell key={i} lit={false} removed emoji={counting.emoji} />
          ) : (
            <CountCell key={i} lit={i < counting.counted} removed={false} emoji={counting.emoji} />
          ),
        )}
      </div>
      <p className="text-center text-base font-extrabold text-ink" aria-live="polite">
        {counting.counted >= (counting.shape === 'sub' ? remaining : counting.size) &&
        (counting.shape !== 'box' || counting.boxLit)
          ? `Ça fait ${counting.total} !`
          : counting.shape === 'box'
            ? counting.boxLit
              ? `${10 + counting.counted}…`
              : ' '
            : counting.counted > 0
              ? `${counting.counted}…`
              : ' '}
      </p>
    </div>
  )
}

// ---------- Composant principal ----------

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error' | 'counting'

export default function CalculAventure() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<CavProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<CavItem | null>(null)
  /** ids d'objets déjà déplacés : vers le panier (add) ou vers le singe (sub) */
  const [placed, setPlaced] = useState<number[]>([])
  const [value, setValue] = useState('')
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [counting, setCounting] = useState<CountingState | null>(null)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const finishTimer = useRef<number | undefined>(undefined)

  const manipDone = item !== null && placed.length >= neededPlacements(item)
  const numpadActive = phase === 'idle' && manipDone

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<CavProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips([
      ...corpus.entries.map((e) => e.id),
      ...Array.from({ length: 21 }, (_, n) => `nombre.${n}`),
    ])
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(finishTimer.current)
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: CavItem, stageIdx: number): Promise<void> => {
    const seq = ++seqRef.current
    const obj = E(stageFor(stageIdx).clip)
    if (it.tier === 3) {
      // « treize... moins... cinq. Combien ça fait ? Tape le résultat ! »
      await say(numberEntry(it.a))
      if (seqRef.current !== seq) return
      await say(E(it.op === 'add' ? 'cav.op.plus' : 'cav.op.moins'), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(numberEntry(it.b), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('cav.consigne.tete'), { interrupt: false })
      return
    }
    if (it.op === 'sub') {
      // « Tu as... sept... poissons. Le singe chipe... trois... poissons ! Donne-les-lui... »
      await say(E('cav.consigne.tu-as'))
      if (seqRef.current !== seq) return
      await say(numberEntry(it.a), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(obj, { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('cav.consigne.singe'), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(numberEntry(it.b), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(obj, { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('cav.consigne.donne'), { interrupt: false })
      return
    }
    // « Trois... coquillages... et encore... quatre ! Mets tout dans le panier... »
    await say(numberEntry(it.a))
    if (seqRef.current !== seq) return
    await say(obj, { interrupt: false })
    if (seqRef.current !== seq) return
    await say(E('cav.consigne.et-encore'), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(numberEntry(it.b), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(E(it.tier === 2 ? 'cav.consigne.boite' : 'cav.consigne.panier'), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Verrou anti soft-lock : pendant un feedback (succès, erreur,
      // comptage), l'état du jeu n'est pas sûr — la relecture est ignorée.
      if (phase !== 'idle' || !item) return
      void speakConsigne(item, resolved)
      return
    }
    void say(E('cav.intro'))
  }, [screen, phase, item, resolved, speakConsigne])

  /** Fin de manipulation : petit mot du personnage puis invitation à taper. */
  const speakPlacementDone = useCallback(async (it: CavItem, sealed: boolean): Promise<void> => {
    const seq = ++seqRef.current
    if (sealed) {
      await say(E('cav.boite.magique'))
      if (seqRef.current !== seq) return
    }
    if (it.op === 'sub') {
      await say(E('cav.singe.merci'), { interrupt: !sealed })
      if (seqRef.current !== seq) return
      await say(E('cav.tape.reste'), { interrupt: false })
      return
    }
    await say(E('cav.tape.total'), { interrupt: !sealed })
  }, [])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setPlaced([])
    setValue('')
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setHint(false)
    setCounting(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakConsigne(first, 0)
  }

  const placeObject = (id: number): void => {
    if (!item || phase !== 'idle') return
    const target = neededPlacements(item)
    if (placed.includes(id) || placed.length >= target) return
    sfx('pop')
    const next = [...placed, id]
    setPlaced(next)
    // T2 : dix objets dans le panier → la boîte se scelle (la dizaine VISIBLE)
    const sealed = item.tier === 2 && next.length > 0 && next.length % 10 === 0
    if (sealed) sfx('magic')
    if (next.length === target) {
      if (item.op === 'sub') sfx('coin')
      void speakPlacementDone(item, sealed)
    } else if (sealed) {
      // Le jeton annule la consigne en cours : sinon, elle reprendrait
      // par-dessus « Et hop ! Dix dans la boîte ! » (deux voix superposées).
      seqRef.current += 1
      void say(E('cav.boite.magique'))
    }
  }

  const onValidate = (): void => {
    if (!item || !numpadActive || value.length === 0) return
    // Invalide la séquence audio en cours (consigne, fin de manipulation…) :
    // « Bravo ! » / « Oups ! » ne doivent jamais être chevauchés par sa reprise.
    seqRef.current += 1

    if (checkAnswer(item, value)) {
      // Résolution de l'item : maîtrise + Tuner, UNE seule fois.
      const wasFirst = firstTryRef.current
      void recordAttempt(item.skill, wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      setOverlay('success')
      return
    }

    // Le renard trébuche (conséquence comique), puis on compte ensemble.
    firstTryRef.current = false
    failsRef.current += 1
    setValue('')
    setPhase('error')
    setOverlay('retry')
    void say(E('cav.oups'))
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    sfx('whoosh')
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      // Laisse le renard sauter jusqu'au trésor avant l'écran de fin.
      finishTimer.current = window.setTimeout(() => finishRun(item.tier), 900)
      return
    }
    const next = generateItem(item.tier, tunerRef.current.level, item.main)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setPhase('idle')
    setPlaced([])
    setValue('')
    setItem(next)
    void speakConsigne(next, done)
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

  /** Feedback élaboratif : on aligne les objets (ou des points) et on compte. */
  const runCounting = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('counting')
    const emoji = item.tier === 3 ? null : stageFor(resolved).obj
    const base: CountingState =
      item.op === 'sub'
        ? { shape: 'sub', size: item.a, removed: item.b, counted: 0, boxLit: false, total: item.answer, emoji }
        : item.tier === 2 || item.answer > 12
          ? // T2 toujours ; T3 add > 12 aussi : le surcomptage depuis la boîte
            // (« déjà dix... onze, douze... ») reste compté à voix haute et
            // enseigne le passage de la dizaine, là où 'plain' serait muet.
            { shape: 'box', size: item.answer - 10, removed: 0, counted: 0, boxLit: false, total: item.answer, emoji }
          : { shape: 'plain', size: item.answer, removed: 0, counted: 0, boxLit: false, total: item.answer, emoji }
    setCounting(base)
    try {
      await say(E('cav.feedback.comptons'))
      if (seqRef.current !== seq) return

      if (base.shape === 'box') {
        // Surcomptage à partir de la boîte : « déjà dix... onze, douze... »
        const lit = { ...base, boxLit: true }
        setCounting(lit)
        await say(E('cav.feedback.boite'), { interrupt: false })
        for (let i = 1; i <= base.size; i++) {
          if (seqRef.current !== seq) return
          setCounting({ ...lit, counted: i })
          sfx('tap')
          await say(numberEntry(10 + i), { interrupt: false })
        }
      } else if (base.total <= 12) {
        for (let i = 1; i <= base.total; i++) {
          if (seqRef.current !== seq) return
          setCounting({ ...base, counted: i })
          sfx('tap')
          await say(numberEntry(i), { interrupt: false })
        }
      } else {
        setCounting({ ...base, counted: base.total })
      }
      if (seqRef.current !== seq) return
      await say(E('cav.feedback.ca-fait'), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(numberEntry(item.answer), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('cav.feedback.atoi'), { interrupt: false })
    } finally {
      // Restauration INCONDITIONNELLE : le jeton seqRef n'annule que la
      // suite audio, jamais le retour en phase 'idle' (sinon soft-lock).
      setCounting(null)
      setPhase('idle')
    }
    if (seqRef.current !== seq) return
    // Indice automatique après 2 échecs consécutifs : le NumPad brille
    // et la mascotte souffle la réponse à voix haute.
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      await say(E('cav.indice'), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(numberEntry(item.answer), { interrupt: false })
    }
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') advance()
    else if (kind === 'retry') void runCounting()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🦊
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('cav.intro')} autoPlay />
        </div>
        <div className="flex items-center gap-2 text-5xl" aria-hidden="true">
          <span className="animate-floaty inline-block">🦊</span>
          <span className="text-3xl opacity-60">➡️</span>
          <span>🏴‍☠️</span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Calcule pour avancer jusqu’au trésor !
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
                  void say(E(`cav.niveau.${t}`))
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

  /** Un objet tapable (vol vers le panier / le singe) ou son emplacement vide. */
  const renderObjectButton = (id: number, stage: Stage, label: string): ReactNode => {
    if (placed.includes(id)) {
      return (
        <div
          key={id}
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-bubble border-2 border-dashed border-ink-soft/25"
        />
      )
    }
    return (
      <button
        key={id}
        type="button"
        disabled={phase !== 'idle'}
        onClick={() => placeObject(id)}
        aria-label={label}
        className="tap-target card flex items-center justify-center text-3xl transition-transform active:scale-90"
      >
        <span aria-hidden="true">{stage.obj}</span>
      </button>
    )
  }

  /** Le panier : boîtes de dix scellées (T2) + objets posés. */
  const renderBasket = (it: CavItem): ReactNode => {
    const boxes = it.tier === 2 ? Math.floor(placed.length / 10) : 0
    const loose = placed.length - boxes * 10
    return (
      <div className="flex min-h-[84px] w-full flex-wrap items-center justify-center gap-1.5 rounded-card bg-white/60 p-2 ring-2 ring-sun-deep/40">
        <span className="text-3xl" aria-hidden="true">🧺</span>
        {range(0, boxes).map((i) => (
          <TenBox key={`box-${i}`} />
        ))}
        {placed.slice(placed.length - loose).map((id) => (
          <span key={id} className="animate-pop text-2xl leading-none" aria-hidden="true">
            {stageFor(resolved).obj}
          </span>
        ))}
        {placed.length === 0 && (
          <span className="text-sm font-semibold text-ink-soft">Le panier est vide !</span>
        )}
      </div>
    )
  }

  /** T0 / T2 : deux groupes d'objets qui arrivent, à mettre au panier. */
  const renderAddScene = (it: CavItem, stage: Stage): ReactNode => {
    const groups = [
      { ids: range(0, it.a), count: it.a },
      { ids: range(it.a, it.a + it.b), count: it.b },
    ]
    return (
      <div className="flex w-full flex-col items-center gap-2">
        {groups.map((g, gi) => (
          <div key={gi} className="flex w-full flex-col items-center gap-1">
            {gi === 1 && (
              <p className="text-sm font-extrabold text-ink-soft">et encore…</p>
            )}
            <div className="card flex w-full flex-wrap items-center justify-center gap-1.5 p-2">
              {it.tier === 2 && (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-white"
                  style={{ background: ACCENT }}
                  aria-label={`${g.count} ${stage.name}`}
                >
                  {g.count}
                </span>
              )}
              {g.ids.map((id) => renderObjectButton(id, stage, 'Mettre dans le panier'))}
            </div>
          </div>
        ))}
        {renderBasket(it)}
      </div>
    )
  }

  /** T1 : le panier démarre plein, le singe réclame sa part. */
  const renderSubScene = (it: CavItem, stage: Stage): ReactNode => {
    const given = placed.length
    const satisfied = given >= it.b
    return (
      <div className="flex w-full items-stretch gap-2">
        <div className="flex min-h-[84px] flex-1 flex-wrap content-center items-center justify-center gap-1.5 rounded-card bg-white/60 p-2 ring-2 ring-sun-deep/40">
          <span className="w-full text-center text-2xl leading-none" aria-hidden="true">🧺</span>
          {range(0, it.a).map((id) => renderObjectButton(id, stage, 'Donner au singe'))}
        </div>
        <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-card bg-white/60 p-2 sm:w-32">
          <span className={`text-4xl ${satisfied ? 'animate-wiggle' : 'animate-floaty'}`} aria-hidden="true">
            🐒
          </span>
          <span className="card px-2 py-1 text-center text-sm font-extrabold text-ink">
            {satisfied ? 'Merci !' : (
              <>
                Il chipe {it.b} <span aria-hidden="true">{stage.obj}</span>
              </>
            )}
          </span>
          <span className="flex max-w-full flex-wrap items-center justify-center gap-0.5">
            {placed.map((id) => (
              <span key={id} className="animate-pop text-xl leading-none" aria-hidden="true">
                {stage.obj}
              </span>
            ))}
          </span>
        </div>
      </div>
    )
  }

  /** T3 : le calcul de tête — l'expression en grand, rien d'autre. */
  const renderMentalScene = (it: CavItem): ReactNode => (
    <div className="card flex items-center justify-center gap-3 px-8 py-6 text-5xl font-extrabold text-ink sm:text-6xl">
      <span>{it.a}</span>
      <span aria-hidden="true">{it.op === 'add' ? '+' : '−'}</span>
      <span className="sr-only">{it.op === 'add' ? 'plus' : 'moins'}</span>
      <span>{it.b}</span>
      <span aria-hidden="true">=</span>
      <span className="sr-only">égale</span>
      <span className="text-ink-soft/40">?</span>
    </div>
  )

  const renderPlay = (it: CavItem): ReactNode => {
    const stage = stageFor(resolved)
    const instruction =
      it.tier === 3
        ? 'Combien ça fait ?'
        : manipDone
          ? it.op === 'sub'
            ? 'Tape combien il en reste !'
            : 'Tape combien ça fait !'
          : it.tier === 0
            ? 'Mets tout dans le panier !'
            : it.tier === 1
              ? 'Donne au singe ce qu’il chipe !'
              : 'Remplis le panier : dix font une boîte !'
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-3 px-3 pb-6">
        <AdventurePath resolved={resolved} stumble={phase === 'error'} />
        <div className="flex w-full flex-1 flex-col items-center gap-3 md:flex-row md:items-start md:justify-center md:gap-8">
          {/* Scène : décor de l'étape + manipulation */}
          <div className="flex w-full max-w-md flex-col items-center gap-2 md:flex-1">
            <p className="text-center text-lg font-extrabold text-ink" aria-live="polite">
              <span aria-hidden="true">{stage.decor} </span>
              {instruction}
            </p>
            {it.tier === 3
              ? renderMentalScene(it)
              : it.op === 'sub'
                ? renderSubScene(it, stage)
                : renderAddScene(it, stage)}
            {counting && <CountingCard counting={counting} />}
          </div>

          {/* Le NumPad : ne s'active que quand la manipulation est finie */}
          <div className="flex w-full max-w-md flex-col items-center gap-2 md:flex-1">
            <div
              aria-disabled={!numpadActive}
              className={`w-full max-w-xs rounded-card ${numpadActive ? '' : 'pointer-events-none opacity-40'} ${
                hint && numpadActive ? 'animate-pulse-glow' : ''
              }`}
            >
              <NumPad value={value} onChange={setValue} onValidate={onValidate} maxLen={2} />
            </div>
            {!manipDone && phase === 'idle' && (
              <p className="text-center text-sm font-semibold text-ink-soft">
                {it.op === 'sub' ? 'Donne d’abord ses objets au singe !' : 'Remplis d’abord le panier !'}
              </p>
            )}
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
      <CavStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouvelle étape de l’aventure débloquée !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
