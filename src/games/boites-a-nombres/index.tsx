import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { numberEntry } from '@/content/numbers'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pick } from '@/engine/rng'
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
  FRESH_PROGRESS,
  generateItem,
  isExact,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  OBJECTS,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { BanFlash, BanItem, BanObject, BanProgress, TierId } from './logic'

// ============================================================
// Les Boîtes à Nombres — l'atelier d'expédition de la forêt :
// l'écureuil passe commande, l'enfant remplit la boîte en
// comptant à voix haute, la ferme, le camion l'emporte.
// Dénombrement, surcomptage et subitizing. Zéro QCM.
// ============================================================

const STORE_KEY = 'game:boites-a-nombres'

const META: GameMeta = GAMES_BY_ID.get('boites-a-nombres') ?? {
  id: 'boites-a-nombres',
  title: 'Les Boîtes à Nombres',
  tagline: 'Remplis les boîtes, ferme, expédie !',
  icon: '📦',
  island: 'nombres',
  accent: '#8d6e63',
  skills: ['ma.gs.subitizing', 'ma.gs.denombrer10', 'ma.gs.comparer'],
  status: 'v2',
}
const ACCENT = META.accent

const BOX_BROWN = '#a1887f'
const LID_BROWN = '#6d4c41'
const BOX_INSIDE = '#efebe9'

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '📦', name: 'Petites commandes', sub: 'Jusqu’à 5' },
  { emoji: '🚚', name: 'Grandes commandes', sub: 'Jusqu’à 10' },
  { emoji: '🐿️', name: 'Complète la commande', sub: 'Il y en a déjà dedans !' },
  { emoji: '⚡', name: 'Coup d’œil !', sub: 'Vois en un éclair' },
]

const SUCCESS_CLIPS = ['ban.succes.expedie', 'ban.succes.merci'] as const

/** Libellés français des objets (consigne écrite + aria). */
const OBJ_TEXT: Record<BanObject['key'], { aria: string; one: string; many: string }> = {
  noisette: { aria: 'une noisette', one: 'noisette', many: 'noisettes' },
  fraise: { aria: 'une fraise', one: 'fraise', many: 'fraises' },
  fleur: { aria: 'une fleur', one: 'fleur', many: 'fleurs' },
  pomme: { aria: 'une pomme', one: 'pomme', many: 'pommes' },
  champignon: { aria: 'un champignon', one: 'champignon', many: 'champignons' },
  feuille: { aria: 'une feuille', one: 'feuille', many: 'feuilles' },
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// ---------- Configurations de subitizing (faces de dé, ten-frame) ----------

const DICE_POS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

/** Opacité/pop d'un objet pendant le recomptage (counted = null hors recompte). */
function dotClass(seqIdx: number, counted: number | null): string {
  if (counted === null) return ''
  return seqIdx < counted ? 'animate-pop' : 'opacity-30'
}

function Die({
  n,
  emoji,
  counted,
  base,
}: {
  n: number
  emoji: string
  counted: number | null
  base: number
}) {
  const cells = DICE_POS[n] ?? []
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-2 shadow-card">
      {Array.from({ length: 9 }, (_, i) => {
        const seq = cells.indexOf(i)
        return (
          <span key={i} className="flex h-9 w-9 items-center justify-center text-2xl leading-none">
            {seq >= 0 && <span className={dotClass(base + seq, counted)}>{emoji}</span>}
          </span>
        )
      })}
    </div>
  )
}

function TenFrameFace({
  value,
  emoji,
  counted,
}: {
  value: number
  emoji: string
  counted: number | null
}) {
  return (
    <div className="grid grid-cols-5 gap-1 rounded-xl bg-white p-2 shadow-card">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-paper text-2xl leading-none"
        >
          {i < value && <span className={dotClass(i, counted)}>{emoji}</span>}
        </span>
      ))}
    </div>
  )
}

function FlashFace({
  flash,
  emoji,
  counted,
}: {
  flash: BanFlash
  emoji: string
  counted: number | null
}) {
  if (flash.kind === 'ten-frame') {
    return <TenFrameFace value={flash.value} emoji={emoji} counted={counted} />
  }
  if (flash.kind === 'double-dice' && flash.parts) {
    return (
      <div className="flex items-center justify-center gap-3">
        <Die n={flash.parts[0]} emoji={emoji} counted={counted} base={0} />
        <Die n={flash.parts[1]} emoji={emoji} counted={counted} base={flash.parts[0]} />
      </div>
    )
  }
  return <Die n={flash.value} emoji={emoji} counted={counted} base={0} />
}

// ---------- Keyframes locales (couvercle, camion) ----------

function BanStyles() {
  return (
    <style>{`
@keyframes ban-boing {
  0% { transform: translateY(-30px); opacity: 0; }
  35% { transform: translateY(0); opacity: 1; }
  55% { transform: translateY(-16px) rotate(-5deg); }
  72% { transform: translateY(-2px) rotate(3deg); }
  100% { transform: translateY(-34px) rotate(-10deg); opacity: 0; }
}
.ban-boing { animation: ban-boing 0.95s ease-in-out both; }
@keyframes ban-close {
  0% { transform: translateY(-30px); opacity: 0; }
  60% { transform: translateY(3px); opacity: 1; }
  100% { transform: translateY(0); opacity: 1; }
}
.ban-close { animation: ban-close 0.4s ease-out both; }
@keyframes ban-truck {
  0% { left: 100%; }
  100% { left: -40%; }
}
.ban-truck { animation: ban-truck 1.8s ease-in-out both; }
`}</style>
  )
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'flash' | 'answer' | 'error' | 'counting' | 'success'

export default function BoitesANombres() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<BanProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<BanItem | null>(null)
  const [obj, setObj] = useState<BanObject>(OBJECTS[0])
  /** ids (dans le tas) des objets que l'enfant a mis dans la boîte, dans l'ordre */
  const [added, setAdded] = useState<number[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  /** recomptage : nombre d'objets déjà comptés (null hors recompte) */
  const [counted, setCounted] = useState<number | null>(null)
  /** T3 : la boîte est ouverte pendant le flash */
  const [flashOpen, setFlashOpen] = useState(false)
  /** T3 : après une erreur, la boîte reste ouverte en grand */
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [lidGag, setLidGag] = useState(0)
  const [truckKey, setTruckKey] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const whooshTimer = useRef<number | undefined>(undefined)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<BanProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips([
      ...corpus.entries.map((e) => e.id),
      ...Array.from({ length: 11 }, (_, n) => `nombre.${n}`),
    ])
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(whooshTimer.current)
    }
  }, [])

  // ---------- Audio ----------

  const speakOrder = useCallback(async (it: BanItem, o: BanObject): Promise<void> => {
    const seq = ++seqRef.current
    if (it.tier === 2) {
      await say(E('ban.consigne.deja'))
      if (seqRef.current !== seq) return
      await say(numberEntry(it.prefilled), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('ban.consigne.il-en-faut'), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(numberEntry(it.order), { interrupt: false })
      if (seqRef.current !== seq) return
      await say(E('ban.consigne.en-tout'), { interrupt: false })
      return
    }
    await say(E('ban.consigne.mets'))
    if (seqRef.current !== seq) return
    if (it.order === 1) {
      await say(E(`ban.obj.${o.key}.une`), { interrupt: false })
      return
    }
    await say(numberEntry(it.order), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(E(`ban.obj.${o.key}.des`), { interrupt: false })
  }, [])

  /** T3 : consigne + ouverture flash de la boîte, puis pavé numérique. */
  const runFlash = useCallback(async (it: BanItem): Promise<void> => {
    if (!it.flash) return
    const seq = ++seqRef.current
    setPhase('flash')
    setFlashOpen(false)
    setRevealed(false)
    setTyped('')
    setCounted(null)
    await say(E('ban.consigne.flash'))
    if (seqRef.current !== seq) return
    sfx('whoosh')
    setFlashOpen(true)
    await sleep(it.flash.durationMs)
    if (seqRef.current !== seq) return
    setFlashOpen(false)
    sfx('slide')
    setPhase('answer')
    void say(E('ban.consigne.combien'))
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen !== 'play' || !item) {
      void say(E('ban.intro'))
      return
    }
    if (item.tier === 3) {
      if (phase !== 'answer') return
      if (revealed) {
        void say(E('ban.flash.retape'))
        return
      }
      // Un seul coup d'œil par commande : réécouter ne rejoue que la QUESTION,
      // jamais la configuration (sinon le subitizing redevient du comptage).
      void say(E('ban.consigne.combien'))
      return
    }
    // Pendant le recomptage/gag/expédition, ne pas annuler la séquence en cours.
    if (phase !== 'idle') return
    void speakOrder(item, obj)
  }, [screen, item, phase, revealed, obj, speakOrder])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const o = pick(OBJECTS)
    const first = generateItem(t, 0)
    setObj(o)
    setTier(t)
    setItem(first)
    setAdded([])
    setResolved(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setHint(false)
    setCounted(null)
    setFlashOpen(false)
    setRevealed(false)
    setTyped('')
    setLidGag(0)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    if (t === 3) {
      void runFlash(first)
    } else {
      setPhase('idle')
      void speakOrder(first, o)
    }
  }

  /** Tap sur un objet du tas → il saute dans la boîte, comptage à voix haute. */
  const addObject = (pid: number): void => {
    if (!item || item.tier === 3 || phase !== 'idle' || added.includes(pid)) return
    const inBox = item.prefilled + added.length
    if (inBox >= item.boxSize) {
      sfx('slide')
      return
    }
    seqRef.current += 1
    sfx('pop')
    const next = [...added, pid]
    setAdded(next)
    // La comptine s'incarne : à T2, le comptage REPART de k (k+1, k+2…).
    void say(numberEntry(item.prefilled + next.length))
  }

  /** Tap sur un objet DANS la boîte → il ressort, on dit le nouveau compte. */
  const removeObject = (pid: number): void => {
    if (!item || phase !== 'idle') return
    seqRef.current += 1
    sfx('slide')
    const next = added.filter((p) => p !== pid)
    setAdded(next)
    void say(numberEntry(item.prefilled + next.length))
  }

  /** Résolution d'un item : maîtrise + Tuner UNE seule fois, puis expédition. */
  const resolveItem = (it: BanItem): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setHint(false)
    setCounted(null)
    sfx('magic')
    setTruckKey((k) => k + 1)
    window.clearTimeout(whooshTimer.current)
    whooshTimer.current = window.setTimeout(() => sfx('whoosh'), 400)
    void (async () => {
      // Le clip de l'écureuil joue EN ENTIER (l'overlay « Bravo ! » l'aurait
      // tronqué), puis l'overlay arrive INCONDITIONNELLEMENT — jamais de blocage.
      await say(E(pick(SUCCESS_CLIPS)))
      await sleep(250)
      setOverlay('success')
    })()
  }

  /** « Ferme la boîte ! » — le premier Ferme est le premier essai. */
  const onClose = (): void => {
    if (!item || item.tier === 3 || phase !== 'idle') return
    seqRef.current += 1
    const inBox = item.prefilled + added.length
    if (isExact(item, inBox)) {
      resolveItem(item)
      return
    }
    // Gag diégétique : le couvercle rebondit et s'ouvre.
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setLidGag((k) => k + 1)
    setOverlay('retry')
    void runGagThenRecount(item)
  }

  /** T3 : réponse tapée au pavé numérique. */
  const onValidateAnswer = (): void => {
    if (!item || item.tier !== 3 || phase !== 'answer' || typed.length === 0) return
    seqRef.current += 1
    const n = Number.parseInt(typed, 10)
    if (Number.isInteger(n) && isExact(item, n)) {
      resolveItem(item)
      return
    }
    firstTryRef.current = false
    failsRef.current += 1
    setTyped('')
    setPhase('error')
    setOverlay('retry')
    void runGagThenRecount(item)
  }

  const advance = (): void => {
    if (!item) return
    const done = resolved + 1
    setResolved(done)
    if (done >= ITEMS_PER_RUN) {
      finishRun()
      return
    }
    const next = generateItem(item.tier, tunerRef.current.level, item.order)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setAdded([])
    setCounted(null)
    setFlashOpen(false)
    setRevealed(false)
    setTyped('')
    setLidGag(0)
    setItem(next)
    if (next.tier === 3) {
      void runFlash(next)
    } else {
      setPhase('idle')
      void speakOrder(next, obj)
    }
  }

  const finishRun = (): void => {
    if (!item) return
    const stars = starsFor(firstTryCorrect, ITEMS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: ITEMS_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, item.tier, stars)
    const unlockedNow = updated.unlockedTier > base.unlockedTier
    if (unlockedNow) sfx('levelup')
    setNewUnlock(unlockedNow)
    setProgress(updated)
    void pset(STORE_KEY, updated)
    setScreen('end')
  }

  /** Feedback élaboratif (T0-T2) : on recompte la boîte un par un à voix haute. */
  const runRecount = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    const total = item.prefilled + added.length
    setPhase('counting')
    setCounted(0)
    for (let i = 1; i <= total; i++) {
      if (seqRef.current !== seq) return
      setCounted(i)
      sfx('tap')
      await say(numberEntry(i), { interrupt: i === 1 })
    }
    if (seqRef.current !== seq) return
    await say(E('ban.recompte.ca-fait'), { interrupt: total === 0 })
    if (seqRef.current !== seq) return
    await say(numberEntry(total), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(E('ban.consigne.il-en-faut'), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(numberEntry(item.order), { interrupt: false })
    if (item.tier === 2) {
      if (seqRef.current !== seq) return
      await say(E('ban.consigne.en-tout'), { interrupt: false })
    }
    if (seqRef.current !== seq) return
    setCounted(null)
    setPhase('idle')
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      void say(E(total < item.order ? 'ban.indice.manque' : 'ban.indice.trop'), {
        interrupt: false,
      })
    }
  }

  /** Feedback élaboratif (T3) : la boîte se rouvre en GRAND, on compte ensemble. */
  const runRecountFlash = async (): Promise<void> => {
    if (!item?.flash) return
    const seq = ++seqRef.current
    const total = item.flash.value
    setRevealed(true)
    setPhase('counting')
    setCounted(0)
    sfx('whoosh')
    await sleep(500)
    if (seqRef.current !== seq) return
    for (let i = 1; i <= total; i++) {
      if (seqRef.current !== seq) return
      setCounted(i)
      sfx('tap')
      await say(numberEntry(i), { interrupt: i === 1 })
    }
    if (seqRef.current !== seq) return
    await say(E('ban.recompte.ca-fait'), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(numberEntry(total), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(E('ban.flash.retape'), { interrupt: false })
    if (seqRef.current !== seq) return
    // counted reste à total : tout est compté, l'enfant retape boîte ouverte.
    setPhase('answer')
  }

  /**
   * Erreur : le clip d'explication joue EN ENTIER (il dure plus longtemps que
   * l'overlay « Presque ! »), puis le recomptage s'enchaîne. Le jeton n'annule
   * que la SUITE audio : l'état redevient toujours jouable avant l'early-return.
   */
  const runGagThenRecount = async (it: BanItem): Promise<void> => {
    const seq = ++seqRef.current
    await say(E(it.tier === 3 ? 'ban.flash.oups' : 'ban.gag.rebond'))
    if (seqRef.current !== seq) {
      setPhase(it.tier === 3 ? 'answer' : 'idle')
      return
    }
    if (it.tier === 3) void runRecountFlash()
    else void runRecount()
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    // retry : le recomptage est enchaîné par runGagThenRecount à la fin du clip.
    if (kind === 'success') advance()
  }

  // ---------- Rendus ----------

  const instructionFor = (it: BanItem): string => {
    if (it.tier === 3) {
      if (phase === 'flash') return 'Regarde bien…'
      if (phase === 'counting') return 'On compte ensemble !'
      if (revealed) return 'Compte, puis tape le nombre !'
      return 'Combien y en avait-il ?'
    }
    if (it.tier === 2) return `Déjà ${it.prefilled}… il en faut ${it.order} en tout !`
    const t = OBJ_TEXT[obj.key]
    return it.order === 1
      ? `Mets 1 ${t.one} dans la boîte !`
      : `Mets ${it.order} ${t.many} dans la boîte !`
  }

  const countingLabel = (it: BanItem): string => {
    if (counted === null) return ''
    const total = it.tier === 3 ? it.order : it.prefilled + added.length
    if (total === 0) return `Ça fait 0… il en faut ${it.order} !`
    if (counted < total) return counted > 0 ? `${counted}…` : ' '
    if (it.tier === 3) return `Ça fait ${total} !`
    return `Ça fait ${total}… il en faut ${it.order}${it.tier === 2 ? ' en tout' : ''} !`
  }

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            📦
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('ban.intro')} autoPlay />
        </div>
        <div className="flex items-center gap-3 text-5xl" aria-hidden="true">
          <span className="animate-floaty">🐿️</span>
          <span>📦</span>
          <span className="animate-floaty" style={{ animationDelay: '0.4s' }}>
            🚚
          </span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Prépare les commandes de l’écureuil !
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
                  void say(E(`ban.niveau.${t}`))
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

  const renderOrderCard = (it: BanItem): ReactNode => (
    <div className="card flex items-center gap-3 px-5 py-2">
      <span aria-hidden="true" className={`text-3xl ${phase === 'success' ? 'animate-wiggle' : ''}`}>
        🐿️
      </span>
      <span className="text-sm font-extrabold text-ink-soft">Commande :</span>
      {it.tier === 3 ? (
        <span className="text-4xl font-extrabold text-ink">?</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="text-4xl font-extrabold" style={{ color: ACCENT }}>
            {it.order}
          </span>
          <span aria-hidden="true" className="text-3xl">
            {obj.emoji}
          </span>
          {it.tier === 2 && (
            <span className="rounded-full bg-sand px-3 py-1 text-sm font-extrabold text-ink">
              déjà {it.prefilled} dedans
            </span>
          )}
        </span>
      )}
    </div>
  )

  /** Cases de la boîte : préposés (fixes), ajoutés (tap → ressort), vides. */
  const renderCells = (it: BanItem): ReactNode => {
    const inBox = it.prefilled + added.length
    return (
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: it.boxSize }, (_, i) => {
          const lit = counted !== null && i < counted
          if (i < it.prefilled) {
            return (
              <div
                key={i}
                role="img"
                aria-label={`${OBJ_TEXT[obj.key].aria} déjà dans la boîte`}
                className={`flex h-16 w-16 items-center justify-center rounded-xl bg-sand text-3xl leading-none ${lit ? 'ring-4 ring-sun' : ''}`}
              >
                <span aria-hidden="true" className={lit ? 'animate-pop' : ''}>
                  {obj.emoji}
                </span>
              </div>
            )
          }
          if (i < inBox) {
            const pid = added[i - it.prefilled]
            const extra = hint && inBox > it.order && i >= it.order
            return (
              <button
                key={i}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => removeObject(pid)}
                aria-label={`Sortir ${OBJ_TEXT[obj.key].aria} de la boîte`}
                className={`flex h-16 w-16 items-center justify-center rounded-xl bg-white text-3xl leading-none shadow-card transition-transform active:scale-90 ${extra ? 'animate-pulse-glow' : ''} ${lit ? 'ring-4 ring-sun' : ''}`}
              >
                <span aria-hidden="true" className={lit ? 'animate-pop' : ''}>
                  {obj.emoji}
                </span>
              </button>
            )
          }
          const missing = hint && inBox < it.order && i < it.order
          return (
            <div
              key={i}
              aria-hidden="true"
              className={`h-16 w-16 rounded-xl border-2 border-dashed border-ink-soft/30 bg-white/40 ${missing ? 'animate-pulse-glow' : ''}`}
            />
          )
        })}
      </div>
    )
  }

  const renderFlashBox = (it: BanItem): ReactNode => {
    const open = phase !== 'success' && (flashOpen || revealed)
    return (
      <div className="relative w-full max-w-sm pt-4">
        <div className="rounded-card p-1.5" style={{ background: BOX_BROWN, boxShadow: 'var(--shadow-card)' }}>
          <div
            className="flex min-h-[170px] items-center justify-center rounded-2xl p-2"
            style={{ background: BOX_INSIDE }}
          >
            {open && it.flash ? (
              <FlashFace flash={it.flash} emoji={obj.emoji} counted={counted} />
            ) : (
              <div className="flex flex-col items-center gap-1" aria-hidden="true">
                <span className="text-6xl leading-none">📦</span>
                <span className="text-3xl font-extrabold text-ink-soft">?</span>
              </div>
            )}
          </div>
        </div>
        {phase === 'success' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="animate-pop text-6xl" role="img" aria-label="Boîte expédiée">
              ✅
            </span>
          </div>
        )}
      </div>
    )
  }

  const renderBox = (it: BanItem): ReactNode => {
    if (it.tier === 3) return renderFlashBox(it)
    return (
      <div className="relative pt-4">
        {/* Couvercle : rebondit sur erreur, se scelle au succès */}
        {phase === 'error' && lidGag > 0 && (
          <div
            key={`lid-${lidGag}`}
            aria-hidden="true"
            className="ban-boing absolute inset-x-2 top-1 z-10 h-4 rounded-full"
            style={{ background: LID_BROWN }}
          />
        )}
        {phase === 'success' && (
          <div
            aria-hidden="true"
            className="ban-close absolute inset-x-2 top-1 z-10 h-4 rounded-full"
            style={{ background: LID_BROWN }}
          />
        )}
        <div className="rounded-card p-1" style={{ background: BOX_BROWN, boxShadow: 'var(--shadow-card)' }}>
          <div className="rounded-2xl p-1" style={{ background: BOX_INSIDE }}>
            {renderCells(it)}
          </div>
        </div>
        {phase === 'success' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="animate-pop text-6xl" role="img" aria-label="Boîte expédiée">
              ✅
            </span>
          </div>
        )}
      </div>
    )
  }

  const renderPlay = (it: BanItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-3 px-2 pb-6 sm:px-3 md:flex-row md:items-center md:justify-center md:gap-8">
      {/* Scène : bon de commande, boîte, camion, recomptage */}
      <div className="flex w-full max-w-md flex-col items-center gap-2 md:flex-1">
        <p className="text-center text-lg font-extrabold text-ink">{instructionFor(it)}</p>
        {renderOrderCard(it)}
        {renderBox(it)}
        {/* Piste du camion (traversée d'écran après expédition) */}
        <div className="relative h-12 w-full overflow-hidden" aria-hidden="true">
          {phase === 'success' && (
            <span key={`truck-${truckKey}`} className="ban-truck absolute top-0 text-4xl leading-none">
              🚚📦
            </span>
          )}
        </div>
        {counted !== null && (
          <p className="min-h-6 text-center text-base font-extrabold text-ink" aria-live="polite">
            {countingLabel(it)}
          </p>
        )}
      </div>

      {/* Tas d'objets + Ferme la boîte — ou pavé numérique à T3 */}
      {it.tier === 3 ? (
        <div className="flex w-full max-w-md flex-col items-center gap-3 md:flex-1">
          {phase === 'answer' ? (
            <NumPad value={typed} onChange={setTyped} onValidate={onValidateAnswer} maxLen={2} />
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center">
              <Mascot mood={phase === 'success' ? 'cheer' : 'thinking'} size={88} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col items-center gap-3 md:flex-1">
          <div className={`grid w-full gap-2 ${it.supply > 6 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {Array.from({ length: it.supply }, (_, pid) => {
              if (added.includes(pid)) {
                return (
                  <div
                    key={pid}
                    aria-hidden="true"
                    className="min-h-16 rounded-card border-2 border-dashed border-ink-soft/25"
                  />
                )
              }
              return (
                <button
                  key={pid}
                  type="button"
                  disabled={phase !== 'idle'}
                  onClick={() => addObject(pid)}
                  aria-label={`Mettre ${OBJ_TEXT[obj.key].aria} dans la boîte`}
                  className="tap-target card flex min-h-16 items-center justify-center text-3xl leading-none transition-transform active:scale-90"
                >
                  <span aria-hidden="true">{obj.emoji}</span>
                </button>
              )
            })}
          </div>
          <BigButton
            variant="accent"
            accent={ACCENT}
            className="w-full max-w-xs text-2xl"
            disabled={phase !== 'idle' || (it.tier !== 2 && added.length === 0)}
            onClick={onClose}
          >
            Ferme la boîte ! 📦
          </BigButton>
        </div>
      )}
    </div>
  )

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      <BanStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouvelle commande débloquée !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
