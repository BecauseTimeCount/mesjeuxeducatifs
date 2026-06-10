import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx, stopSpeech } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, GameMeta, LevelResult, SfxName } from '@/engine/types'
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
  checkFill,
  FRESH_PROGRESS,
  generateItem,
  isFillComplete,
  ITEMS_PER_RUN,
  itemSignature,
  MAX_TUNER_LEVEL,
  periodGroup,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { BeadKind, CdpItem, CdpProgress, TierId } from './logic'

// ============================================================
// Le Collier de Perles — motifs organisés (pré-algèbre GS).
// L'enfant POSE les perles : tap dans la boîte à perles → la perle
// s'enfile dans le prochain emplacement vide. C'est l'enchaînement
// complet qui est jugé. Tier 3 : le code secret (transcription).
// ============================================================

const STORE_KEY = 'game:collier-de-perles'

const META: GameMeta = GAMES_BY_ID.get('collier-de-perles') ?? {
  id: 'collier-de-perles',
  title: 'Le Collier de Perles',
  tagline: 'Pose les perles, continue le motif !',
  icon: '📿',
  island: 'robots',
  accent: '#5c6bc0',
  skills: ['lo.gs.motifs.suite', 'lo.gs.motifs.creer'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🔴', name: 'Les premières perles', sub: 'Deux couleurs' },
  { emoji: '🧵', name: 'L’atelier des motifs', sub: 'Des motifs malins' },
  { emoji: '⭐', name: 'Perles et trésors', sub: 'Formes et couleurs' },
  { emoji: '🗝️', name: 'Le code secret', sub: 'Perles et symboles' },
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

// ---------- Les perles : visuel + son par couleur ----------

interface BeadVisual {
  /** nom français pour l'accessibilité (« perle rouge ») */
  name: string
  sound: SfxName
  family: 'color' | 'shape' | 'symbol'
  base: string
  deep: string
  glyph?: string
}

const VISUALS: Readonly<Record<string, BeadVisual>> = {
  rouge: { name: 'perle rouge', sound: 'pop', family: 'color', base: '#e84a44', deep: '#8e1f1c' },
  bleu: { name: 'perle bleue', sound: 'coin', family: 'color', base: '#2a8de9', deep: '#0d47a1' },
  jaune: { name: 'perle jaune', sound: 'magic', family: 'color', base: '#fdd835', deep: '#b58900' },
  vert: { name: 'perle verte', sound: 'slide', family: 'color', base: '#4caf50', deep: '#1b5e20' },
  violet: { name: 'perle violette', sound: 'whoosh', family: 'color', base: '#9c4dbb', deep: '#4a148c' },
  orange: { name: 'perle orange', sound: 'tap', family: 'color', base: '#fb8c00', deep: '#a85400' },
  etoile: { name: 'perle étoile', sound: 'magic', family: 'shape', base: '#fff6dd', deep: '#caa64b', glyph: '⭐' },
  papillon: { name: 'perle papillon', sound: 'whoosh', family: 'shape', base: '#eaf4ff', deep: '#6e9cc9', glyph: '🦋' },
  coquillage: { name: 'perle coquillage', sound: 'pop', family: 'shape', base: '#fff0f4', deep: '#c4798f', glyph: '🐚' },
  'sym-triangle': { name: 'symbole triangle', sound: 'pop', family: 'symbol', base: '#fffdf6', deep: '#5c6bc0', glyph: '▲' },
  'sym-rond': { name: 'symbole rond', sound: 'coin', family: 'symbol', base: '#fffdf6', deep: '#5c6bc0', glyph: '●' },
  'sym-carre': { name: 'symbole carré', sound: 'slide', family: 'symbol', base: '#fffdf6', deep: '#5c6bc0', glyph: '■' },
  'sym-losange': { name: 'symbole losange', sound: 'magic', family: 'symbol', base: '#fffdf6', deep: '#5c6bc0', glyph: '◆' },
}

const FALLBACK_VISUAL: BeadVisual = {
  name: 'perle',
  sound: 'pop',
  family: 'color',
  base: '#9e9e9e',
  deep: '#424242',
}

function visualOf(kind: BeadKind): BeadVisual {
  return VISUALS[kind] ?? FALLBACK_VISUAL
}

/** Une perle : sphère en dégradé CSS avec reflet, ou carte-symbole. */
function Bead({ kind, size }: { kind: BeadKind; size: number }) {
  const v = visualOf(kind)
  if (v.family === 'symbol') {
    return (
      <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-xl font-extrabold shadow-card"
        style={{
          width: size,
          height: size,
          background: v.base,
          border: `3px solid ${v.deep}`,
          color: v.deep,
          fontSize: size * 0.52,
        }}
      >
        {v.glyph}
      </span>
    )
  }
  const sphere: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '9999px',
    background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 14%, ${v.base} 45%, ${v.deep} 100%)`,
    boxShadow: `inset -2px -4px 8px rgba(0,0,0,0.25), 0 3px 6px rgba(20,20,60,0.35)`,
  }
  return (
    <span aria-hidden="true" className="relative flex items-center justify-center" style={sphere}>
      {v.glyph && <span style={{ fontSize: size * 0.5 }}>{v.glyph}</span>}
    </span>
  )
}

// ---------- Keyframes locales du jeu ----------

function CdpStyles() {
  return (
    <style>{`
@keyframes cdp-sing {
  0% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(255, 220, 120, 0)); }
  40% { transform: scale(1.3); filter: drop-shadow(0 0 14px rgba(255, 220, 120, 0.95)); }
  100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(255, 220, 120, 0)); }
}
.cdp-sing { animation: cdp-sing 0.34s ease-out both; }
@keyframes cdp-group {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(140, 158, 255, 0)); }
  50% { transform: scale(1.16); filter: drop-shadow(0 0 12px rgba(140, 158, 255, 0.95)); }
}
.cdp-group { animation: cdp-group 1.6s ease-in-out infinite; }
@keyframes cdp-twinkle {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.9; }
}
.cdp-twinkle { animation: cdp-twinkle 2.4s ease-in-out infinite; }
`}</style>
  )
}

// ---------- Géométrie du fil de collier (arc doux) ----------

interface Pt {
  x: number
  y: number
}

/** Courbe de Bézier quadratique du fil, en coordonnées du viewBox 100×60. */
const P0: Pt = { x: 7, y: 12 }
const P1: Pt = { x: 50, y: 92 }
const P2: Pt = { x: 93, y: 12 }

function bezier(t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
    y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y,
  }
}

function necklacePoints(n: number): Pt[] {
  if (n <= 1) return [bezier(0.5)]
  return Array.from({ length: n }, (_, i) => bezier(0.04 + (0.92 * i) / (n - 1)))
}

const BOX_STARS: ReadonlyArray<{ top: string; left: string; delay: number }> = [
  { top: '10%', left: '10%', delay: 0 },
  { top: '18%', left: '86%', delay: 1.1 },
  { top: '70%', left: '6%', delay: 0.5 },
  { top: '76%', left: '92%', delay: 1.7 },
]

type Screen = 'menu' | 'play' | 'end'
type Phase = 'fill' | 'error' | 'sing' | 'success'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function CollierDePerles() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<CdpProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<CdpItem | null>(null)
  const [fill, setFill] = useState<Record<number, BeadKind>>({})
  const [selected, setSelected] = useState<number | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('fill')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [singIndex, setSingIndex] = useState<number | null>(null)
  const [shaking, setShaking] = useState<readonly number[]>([])
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const usedSigsRef = useRef<string[]>([])
  const wrongHolesRef = useRef<readonly number[]>([])
  /** le conseil « appuie sur mon collier est fini » n'est donné qu'une fois */
  const finiHintRef = useRef(false)
  /** promesse de la consigne en cours : le conseil s'enchaîne APRÈS elle */
  const consignePromiseRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let alive = true
    void pget<CdpProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: CdpItem): Promise<void> => {
    const seq = ++seqRef.current
    await say(E(`cdp.consigne.${it.mode}`))
    if (seqRef.current !== seq) return
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Verrou de phase : réécouter n'est possible qu'en phase de pose.
      if (item && phase === 'fill') consignePromiseRef.current = speakConsigne(item)
      return
    }
    void say(E('cdp.intro'))
  }, [screen, item, phase, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const setupItem = (it: CdpItem): void => {
    usedSigsRef.current.push(itemSignature(it))
    firstTryRef.current = true
    failsRef.current = 0
    wrongHolesRef.current = []
    setItem(it)
    setFill({})
    setSelected(null)
    setHint(false)
    setSingIndex(null)
    setShaking([])
    setPhase('fill')
    consignePromiseRef.current = speakConsigne(it)
  }

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    usedSigsRef.current = []
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    setupItem(generateItem(t, [], 0))
  }

  // ---------- Poser / retirer les perles ----------

  const nextEmptyHole = (it: CdpItem, f: Readonly<Record<number, BeadKind>>): number | null => {
    for (const h of it.holes) if (f[h] === undefined) return h
    return null
  }

  const placeBead = (kind: BeadKind): void => {
    if (!item || phase !== 'fill') return
    const target =
      selected !== null && fill[selected] === undefined ? selected : nextEmptyHole(item, fill)
    if (target === null) {
      sfx('slide')
      return
    }
    sfx(visualOf(kind).sound)
    const nextFill = { ...fill, [target]: kind }
    setFill(nextFill)
    setSelected(null)
    if (isFillComplete(item, nextFill) && !finiHintRef.current) {
      finiHintRef.current = true
      // Le conseil attend la FIN de la consigne (jamais deux voix en même temps).
      const seq = seqRef.current
      void consignePromiseRef.current.then(() => {
        if (seqRef.current !== seq) return
        void say(E('cdp.fini'), { interrupt: false })
      })
    }
  }

  const tapSlot = (index: number): void => {
    if (!item || phase !== 'fill') return
    if (fill[index] !== undefined) {
      // Retirer la perle posée
      sfx('slide')
      const nextFill = { ...fill }
      delete nextFill[index]
      setFill(nextFill)
      setSelected(index)
      return
    }
    sfx('tap')
    setSelected(index)
  }

  /** Tap sur une perle du modèle : elle chante sa couleur (juice + aide). */
  const tapModelBead = (kind: BeadKind): void => {
    if (phase !== 'fill') return
    sfx(visualOf(kind).sound)
  }

  // ---------- Validation : « Mon collier est fini ! » ----------

  const onValidate = (): void => {
    if (!item || phase !== 'fill' || !isFillComplete(item, fill)) return
    seqRef.current += 1

    const res = checkFill(item, fill)
    if (res.ok) {
      const wasFirst = firstTryRef.current
      void recordAttempt(TIER_SKILLS[item.tier], wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('success')
      sfx('magic')
      void say(E('cdp.bravo')).then(() => setOverlay('success'))
      return
    }

    firstTryRef.current = false
    failsRef.current += 1
    wrongHolesRef.current = res.wrongHoles
    setPhase('error')
    setShaking(res.wrongHoles)
    void say(E('cdp.presque')).then(() => setOverlay('retry'))
  }

  /** L'erreur enseigne : le collier se REJOUE en chantant le motif —
   *  chaque perle pulse avec son son, la zone fautive tremble et se vide,
   *  puis nouvel essai sur le MÊME collier. */
  const runSinging = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('sing')
    const wrong = new Set(wrongHolesRef.current)
    const singKinds = item.reference ?? item.sequence
    try {
      await say(E('cdp.ecoute'))
      if (seqRef.current !== seq) return
      for (let i = 0; i < singKinds.length; i++) {
        if (seqRef.current !== seq) return
        setSingIndex(i)
        if (wrong.has(i)) {
          // La perle de travers tremble doucement... et roule hors du fil.
          sfx('slide')
          setFill((f) => {
            const next = { ...f }
            delete next[i]
            return next
          })
        } else {
          sfx(visualOf(singKinds[i]).sound)
        }
        await wait(380)
      }
      if (seqRef.current !== seq) return
      await wait(300)
    } finally {
      // Restauration INCONDITIONNELLE (anti soft-lock) : le jeton seq
      // n'annule que la suite audio, jamais le retour en phase de pose.
      setSingIndex(null)
      setShaking([])
      setFill((f) => {
        const next = { ...f }
        for (const h of wrongHolesRef.current) delete next[h]
        return next
      })
      setSelected(null)
      setPhase('fill')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      // Indice : le motif modèle pulse par groupes — la période devient visible.
      setHint(true)
      void say(E('cdp.indice'), { interrupt: false })
    } else {
      void say(E('cdp.reessaie'), { interrupt: false })
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
    setupItem(generateItem(item.tier, usedSigsRef.current, tunerRef.current.level))
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

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') advance()
    else if (kind === 'retry') void runSinging()
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            📿
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('cdp.intro')} autoPlay />
        </div>
        <div
          className="relative flex h-24 w-full max-w-sm items-center justify-center gap-2 overflow-hidden rounded-card shadow-card"
          style={{ background: 'linear-gradient(180deg, #232850 0%, #39407e 100%)' }}
          aria-hidden="true"
        >
          <span className="cdp-twinkle absolute top-2 left-5 text-sm">✨</span>
          <span className="cdp-twinkle absolute top-3 right-7 text-xs" style={{ animationDelay: '1s' }}>✨</span>
          <Bead kind="rouge" size={36} />
          <Bead kind="bleu" size={36} />
          <Bead kind="rouge" size={36} />
          <Bead kind="bleu" size={36} />
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-2xl"
            style={{ border: '3px dashed rgba(255,255,255,0.55)' }}
          >
            ?
          </span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Trouve le motif et pose les perles qui manquent !
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
                  void say(E(`cdp.niveau.${t}`))
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

  /** Un emplacement de la rangée réponse : perle posée, ou trou en pointillés. */
  const renderSlot = (index: number, size: number): ReactNode => {
    const kind = fill[index]
    const isWrongShake = shaking.includes(index)
    const isSinging = singIndex === index
    const isSelected = selected === index && phase === 'fill'
    const v = kind !== undefined ? visualOf(kind) : null
    return (
      <button
        type="button"
        onClick={() => tapSlot(index)}
        aria-label={
          v ? `${v.name} posée, tape pour la retirer` : `Emplacement vide numéro ${index + 1}`
        }
        className={`flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-90 ${isWrongShake ? 'animate-shake-soft' : ''} ${isSinging ? 'cdp-sing' : ''}`}
        style={isSelected ? { outline: `4px solid var(--color-sun)`, borderRadius: 9999 } : undefined}
      >
        {kind !== undefined ? (
          <span className="animate-pop">
            <Bead kind={kind} size={size} />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="flex items-center justify-center rounded-full text-xl font-extrabold"
            style={{
              width: size,
              height: size,
              border: '3px dashed rgba(255, 255, 255, 0.65)',
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            ?
          </span>
        )}
      </button>
    )
  }

  /** Une perle FIXE du collier (le motif amorcé, ou la rangée de référence). */
  const renderFixedBead = (kind: BeadKind, index: number, unitLen: number, size: number): ReactNode => {
    const isSinging = singIndex === index
    const grouped = hint && phase === 'fill'
    const v = visualOf(kind)
    return (
      <button
        type="button"
        onClick={() => tapModelBead(kind)}
        aria-label={v.name}
        className={`flex h-16 w-16 items-center justify-center transition-transform active:scale-90 ${isSinging ? 'cdp-sing' : ''} ${grouped ? 'cdp-group' : ''}`}
        style={grouped ? { animationDelay: `${periodGroup(index, unitLen) * 0.4}s` } : undefined}
      >
        <Bead kind={kind} size={size} />
      </button>
    )
  }

  /** Le collier en arc : fil SVG + perles/emplacements posés sur la courbe. */
  const renderNecklace = (it: CdpItem): ReactNode => {
    // Rangée portée par l'arc : la réponse (continue, decode), ou la référence (code).
    const arcKinds = it.mode === 'code' ? (it.reference ?? it.sequence) : it.sequence
    const arcInteractive = it.mode !== 'code'
    const holeSet = new Set(it.holes)
    const pts = necklacePoints(arcKinds.length)
    const beadSize = arcKinds.length >= 9 ? 46 : 52

    return (
      <div
        className="relative w-full overflow-hidden rounded-card px-2 pt-2 pb-1 shadow-card"
        style={{ background: 'linear-gradient(180deg, #232850 0%, #343a74 70%, #2c3164 100%)' }}
      >
        {BOX_STARS.map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="cdp-twinkle absolute text-xs sm:text-sm"
            style={{ top: s.top, left: s.left, animationDelay: `${s.delay}s` }}
          >
            ✨
          </span>
        ))}
        <div className="relative mx-auto h-56 w-full max-w-xl sm:h-64">
          {/* Le fil du collier */}
          <svg
            viewBox="0 0 100 60"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <path
              d={`M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`}
              fill="none"
              stroke="#d9c9a3"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.9"
            />
          </svg>
          {/* Les attaches du fil */}
          <span aria-hidden="true" className="absolute text-lg" style={{ left: '4%', top: '6%' }}>🪢</span>
          <span aria-hidden="true" className="absolute text-lg" style={{ right: '4%', top: '6%' }}>🪢</span>

          {/* Les perles, enfilées sur la courbe */}
          {arcKinds.map((kind, i) => {
            const p = pts[i]
            const isHole = arcInteractive && holeSet.has(i)
            return (
              <div
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x}%`, top: `${(p.y / 60) * 100}%` }}
              >
                {isHole
                  ? renderSlot(i, beadSize)
                  : renderFixedBead(kind, i, it.unit.length, beadSize)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /** Tier 3, mode code : la bande du code secret sous le collier. */
  const renderCodeStrip = (it: CdpItem): ReactNode => {
    const holeSet = new Set(it.holes)
    return (
      <div
        className="w-full rounded-card px-2 py-2 shadow-card"
        style={{ background: 'linear-gradient(180deg, #f6eedd 0%, #efe2c6 100%)', border: '2px solid #d9c9a3' }}
      >
        <p className="mb-1 text-center text-sm font-extrabold" style={{ color: '#8a7642' }}>
          🗝️ Le code secret
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {it.sequence.map((kind, i) => (
            <span key={i}>
              {holeSet.has(i) ? (
                renderSlot(i, 48)
              ) : (
                <span className="flex h-16 w-16 items-center justify-center">
                  <Bead kind={kind} size={48} />
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    )
  }

  /** Tier 3, mode decode : le code symbole donné, en entier, au-dessus. */
  const renderReferenceStrip = (it: CdpItem): ReactNode => {
    return (
      <div
        className="w-full rounded-card px-2 py-2 shadow-card"
        style={{ background: 'linear-gradient(180deg, #f6eedd 0%, #efe2c6 100%)', border: '2px solid #d9c9a3' }}
      >
        <p className="mb-1 text-center text-sm font-extrabold" style={{ color: '#8a7642' }}>
          🗝️ Le code secret
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {(it.reference ?? []).map((kind, i) => (
            <span
              key={i}
              className={`flex h-12 w-12 items-center justify-center ${singIndex === i ? 'cdp-sing' : ''}`}
            >
              <Bead kind={kind} size={40} />
            </span>
          ))}
        </div>
      </div>
    )
  }

  const renderPalette = (it: CdpItem): ReactNode => {
    return (
      <div
        className="w-full rounded-card p-3 shadow-card"
        style={{ background: 'linear-gradient(180deg, #8d6e63 0%, #6d4c41 100%)' }}
      >
        <p className="mb-2 text-center text-sm font-extrabold text-white/90">
          {it.mode === 'code' ? '🧰 La boîte à symboles' : '🧰 La boîte à perles'}
        </p>
        <div
          className="flex flex-wrap items-center justify-center gap-2 rounded-2xl p-2"
          style={{ background: 'rgba(62, 39, 35, 0.55)', boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.4)' }}
        >
          {it.palette.map((kind) => {
            const v = visualOf(kind)
            return (
              <button
                key={kind}
                type="button"
                onClick={() => placeBead(kind)}
                disabled={phase !== 'fill'}
                aria-label={`Poser une ${v.name}`}
                className="tap-target flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-60"
              >
                <Bead kind={kind} size={52} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderPlay = (it: CdpItem): ReactNode => {
    const complete = isFillComplete(it, fill)
    const instruction =
      it.mode === 'continue'
        ? 'Continue le motif !'
        : it.mode === 'code'
          ? 'Pose le code secret !'
          : 'Enfile les perles du code !'
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-3 pb-5">
        <p className="text-center text-lg font-extrabold text-ink sm:text-xl">
          <span style={{ color: ACCENT }}>{instruction}</span>
        </p>

        {it.mode === 'decode' && renderReferenceStrip(it)}
        {renderNecklace(it)}
        {it.mode === 'code' && renderCodeStrip(it)}
        {renderPalette(it)}

        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-xl sm:text-2xl"
          disabled={!complete || phase !== 'fill'}
          onClick={onValidate}
        >
          {it.mode === 'code' ? 'Mon code est fini ! 🗝️' : 'Mon collier est fini ! 📿'}
        </BigButton>
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      <CdpStyles />
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
