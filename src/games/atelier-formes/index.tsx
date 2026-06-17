import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { randInt } from '@/engine/rng'
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
  generateItem,
  itemEntity,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  rollBinFor,
  ROLL_BINS_BY_ID,
  SHAPES_BY_ID,
  SIDE_BINS_BY_ID,
  sideBinFor,
  SOLIDS_BY_ID,
  sortRollCorrect,
  sortSidesCorrect,
  starsFor,
  tapShapeCorrect,
  tapSolidCorrect,
  TIER_SKILLS,
} from './logic'
import type {
  AfoProgress,
  FormeItem,
  RollBin,
  ShapeKind,
  SideBin,
  SolidKind,
  SortRollItem,
  SortSidesItem,
  TapShapeItem,
  TapSolidItem,
  TierId,
} from './logic'

// ============================================================
// L'Atelier des Formes — l'enfant reconnaît puis range les figures
// planes (carré, rectangle, triangle, cercle) et les solides (cube,
// boule, pavé, pyramide). T0/T2 : trouver en tapant la bonne forme ;
// T1 : trier par nombre de côtés ; T3 : trier « ça roule / ça ne
// roule pas ». Zéro QCM (l'enfant TROUVE / RANGE), l'erreur enseigne,
// jamais le mot « faux ». Figures dessinées en SVG, solides en emoji.
// ============================================================

const STORE_KEY = 'game:atelier-formes'

const META: GameMeta = GAMES_BY_ID.get('atelier-formes') ?? {
  id: 'atelier-formes',
  title: 'L’Atelier des Formes',
  tagline: 'Reconnais les formes et les solides !',
  icon: '🔷',
  island: 'nombres',
  accent: '#3949ab',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🔷', name: 'Trouve la figure', sub: 'Carré, rond, triangle…' },
  { emoji: '🗂️', name: 'Combien de côtés ?', sub: 'Range les figures' },
  { emoji: '🧊', name: 'Trouve le solide', sub: 'Cube, boule, pavé…' },
  { emoji: '🎳', name: 'Ça roule ou pas ?', sub: 'Range les solides' },
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

// ---------- Helpers de clips ----------

function shapeNameClip(id: ShapeKind): string {
  return `afo.s.${id}`
}
function solidNameClip(id: SolidKind): string {
  return `afo.so.${id}`
}
/** Clip d'enseignement (« Ça, c'est… ») pour l'entité d'un item. */
function teachClip(item: FormeItem): string {
  return `afo.dit.${itemEntity(item)}`
}

// ---------- Figures planes dessinées en SVG ----------

/**
 * Une vraie figure (carré, rectangle, triangle, cercle), pas un emoji.
 * Choix géométriques volontaires — ne pas « arrondir » :
 *  • polygones REMPLIS à angles VIFS (ni `rx`, ni jointure arrondie) — un
 *    carré aux coins arrondis n'en est plus un ;
 *  • le cercle est la LIGNE ronde (anneau non rempli) — pas un disque.
 *
 * Avec `seed`, on tire un EXEMPLAIRE varié plutôt que le prototype figé :
 * le carré n'est pas toujours posé à plat (parfois « en losange »), le
 * rectangle pas toujours 2:1 horizontal, le triangle pas toujours
 * équilatéral pointe en haut (isocèle / scalène / rectangle, pointé dans
 * toutes les directions). On évite ainsi le « concept image » erroné où
 * seul le prototype serait reconnu. La forme reste mathématiquement la
 * même : seul l'exemplaire change. Sans `seed` (icônes de bacs), on rend
 * la figure canonique, bien lisible.
 */

/** PRNG déterministe (mulberry32) : même seed → même exemplaire stable. */
function seededRandom(seed: number): () => number {
  let a = (seed >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gabarits de triangles (sommets centrés ~50,50, rayon ≤ 38) — types variés. */
const TRIANGLE_TEMPLATES: readonly string[] = [
  '50,14 81,68 19,68', // équilatéral
  '24,24 24,76 76,76', // rectangle (angle droit)
  '20,40 84,54 44,82', // scalène quelconque
  '50,28 82,70 18,70', // isocèle large et plat
  '50,14 68,82 32,82', // isocèle haut et étroit
]
/** Orientations : pointe en haut, en bas, sur le côté, oblique… */
const TRIANGLE_ANGLES: readonly number[] = [0, 36, 90, 144, 180, 216, 270, 324]

function ShapeGlyph({
  id,
  size = 96,
  seed,
}: {
  id: ShapeKind
  size?: number
  seed?: number
}): ReactNode {
  const poly = { fill: ACCENT, stroke: '#1e3a4c', strokeWidth: 4, strokeLinejoin: 'miter' as const }
  const rnd = seed === undefined ? null : seededRandom(seed)
  let figure: ReactNode = null

  if (id === 'cercle') {
    // Invariant par rotation : un seul rendu (la ligne ronde).
    figure = <circle cx={50} cy={50} r={40} fill="none" stroke={ACCENT} strokeWidth={12} />
  } else if (id === 'carre') {
    const angle = rnd ? Math.round(rnd() * 90) : 0
    const s = 52 // demi-diagonale 36,8 → tient dans la viewBox même tourné à 45°
    figure = (
      <g transform={`rotate(${angle} 50 50)`}>
        <rect x={50 - s / 2} y={50 - s / 2} width={s} height={s} {...poly} />
      </g>
    )
  } else if (id === 'rectangle') {
    const aspect = rnd ? 1.45 + rnd() * 1.15 : 2 // jamais ~1, sinon ce serait un carré
    const diag = 74
    const h = diag / Math.sqrt(aspect * aspect + 1)
    const w = aspect * h
    const angle = rnd ? Math.round(rnd() * 180) : 0
    figure = (
      <g transform={`rotate(${angle} 50 50)`}>
        <rect x={50 - w / 2} y={50 - h / 2} width={w} height={h} {...poly} />
      </g>
    )
  } else {
    const points = rnd
      ? TRIANGLE_TEMPLATES[Math.floor(rnd() * TRIANGLE_TEMPLATES.length)]
      : TRIANGLE_TEMPLATES[0]
    const angle = rnd ? TRIANGLE_ANGLES[Math.floor(rnd() * TRIANGLE_ANGLES.length)] : 0
    figure = (
      <g transform={`rotate(${angle} 50 50)`}>
        <polygon points={points} {...poly} />
      </g>
    )
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="presentation"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {figure}
    </svg>
  )
}

/** Icône d'un bac « nombre de côtés » = la figure SVG correspondante (angles
 *  vifs / vrai anneau), jamais un emoji « carré » aux coins arrondis. */
const BIN_SHAPE: Record<SideBin, ShapeKind> = { s3: 'triangle', s4: 'carre', s0: 'cercle' }

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function AtelierFormes() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<AfoProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<FormeItem | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [mood, setMood] = useState<'idle' | 'happy' | 'shake'>('idle')
  const [animKey, setAnimKey] = useState(0)
  /** Graine d'exemplaire : un nouvel item → de nouveaux exemplaires de figures. */
  const [variantSeed, setVariantSeed] = useState(1)
  const [hint, setHint] = useState(false)
  /** Id de l'option/bac qui vient d'être tapé par erreur (feedback visuel). */
  const [wrongId, setWrongId] = useState<string | null>(null)
  const [foundId, setFoundId] = useState<string | null>(null)
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
    void pget<AfoProgress>(STORE_KEY).then((stored) => {
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
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: FormeItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.kind === 'tap-shape') {
      await say(E('afo.consigne.find'))
      if (seqRef.current !== seq) return
      await say(E(shapeNameClip(it.targetId)), { interrupt: false })
      return
    }
    if (it.kind === 'tap-solid') {
      await say(E('afo.consigne.find'))
      if (seqRef.current !== seq) return
      await say(E(solidNameClip(it.targetId)), { interrupt: false })
      return
    }
    if (it.kind === 'sort-sides') {
      await say(E('afo.consigne.sides'))
      return
    }
    await say(E('afo.consigne.roll'))
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item && phase === 'idle') void speakConsigne(item)
    else if (screen !== 'play') void say(E('afo.intro'))
  }, [screen, item, phase, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setItem(first)
    setVariantSeed(randInt(1, 1_000_000))
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
  const resolveSuccess = (it: FormeItem, successClip: string, foundKey: string): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setMood('happy')
    setFoundId(foundKey)
    setAnimKey((k) => k + 1)
    sfx('magic')
    void say(E(successClip))
    window.setTimeout(() => setOverlay('success'), 700)
  }

  /** Un essai raté : firstTry tombe, le compteur d'erreurs monte. */
  const registerFail = (wrongKey: string): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setMood('shake')
    setWrongId(wrongKey)
    window.clearTimeout(wrongTimerRef.current)
    wrongTimerRef.current = window.setTimeout(() => setWrongId(null), 700)
    setAnimKey((k) => k + 1)
    sfx('wrong')
    setOverlay('retry')
  }

  // ---------- Trouver (T0/T2) ----------

  const onTapShape = (it: TapShapeItem, id: ShapeKind): void => {
    if (phase !== 'idle') return
    sfx('tap')
    if (tapShapeCorrect(it, id)) {
      resolveSuccess(it, 'afo.bravo', id)
      return
    }
    registerFail(id)
  }

  const onTapSolid = (it: TapSolidItem, id: SolidKind): void => {
    if (phase !== 'idle') return
    sfx('tap')
    if (tapSolidCorrect(it, id)) {
      resolveSuccess(it, 'afo.bravo', id)
      return
    }
    registerFail(id)
  }

  // ---------- Ranger (T1/T3) ----------

  const onTapSideBin = (it: SortSidesItem, bin: SideBin): void => {
    if (phase !== 'idle') return
    sfx('tap')
    if (sortSidesCorrect(it, bin)) {
      resolveSuccess(it, 'afo.bien-range', bin)
      return
    }
    registerFail(bin)
  }

  const onTapRollBin = (it: SortRollItem, bin: RollBin): void => {
    if (phase !== 'idle') return
    sfx('tap')
    if (sortRollCorrect(it, bin)) {
      resolveSuccess(it, 'afo.bien-range', bin)
      return
    }
    registerFail(bin)
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on NOMME et explique la bonne forme, puis indice. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setMood('idle')
    await say(E(teachClip(item)))
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      const indice =
        item.kind === 'sort-sides'
          ? 'afo.indice.sides'
          : item.kind === 'sort-roll'
            ? 'afo.indice.roll'
            : 'afo.indice.find'
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
    const next = generateItem(item.tier, tunerRef.current.level, itemEntity(item))
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setMood('idle')
    setPhase('idle')
    setWrongId(null)
    setFoundId(null)
    setItem(next)
    setVariantSeed(randInt(1, 1_000_000))
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
            🔷
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('afo.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🔷🔺🧊
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Reconnais les formes et range les solides !
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
                  void say(E(`afo.niveau.${t}`))
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

  // — Trouver une figure (T0) —
  const renderTapShape = (it: TapShapeItem): ReactNode => {
    const cols = it.optionIds.length >= 4 ? 'grid-cols-2' : 'grid-cols-3'
    return (
      <div className={`game-surface grid w-full max-w-md gap-3 ${cols}`}>
        {it.optionIds.map((id, i) => {
          const shape = SHAPES_BY_ID.get(id)
          const glow = hint && id === it.targetId
          const isWrong = wrongId === id
          const found = foundId === id
          return (
            <button
              key={id}
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => onTapShape(it, id)}
              aria-label={shape?.name}
              className={`tap-target card flex flex-col items-center justify-center gap-1 py-4 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''} ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-pop' : ''}`}
              style={glow ? { outline: `4px solid ${ACCENT}` } : undefined}
            >
              <ShapeGlyph id={id} size={84} seed={variantSeed * 131 + i} />
            </button>
          )
        })}
      </div>
    )
  }

  // — Trouver un solide (T2) —
  const renderTapSolid = (it: TapSolidItem): ReactNode => {
    const cols = it.optionIds.length >= 4 ? 'grid-cols-2' : 'grid-cols-3'
    return (
      <div className={`game-surface grid w-full max-w-md gap-3 ${cols}`}>
        {it.optionIds.map((id) => {
          const solid = SOLIDS_BY_ID.get(id)
          const glow = hint && id === it.targetId
          const isWrong = wrongId === id
          const found = foundId === id
          return (
            <button
              key={id}
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => onTapSolid(it, id)}
              aria-label={solid?.name}
              className={`tap-target card flex flex-col items-center justify-center gap-1 py-4 transition-transform active:scale-90 ${glow ? 'animate-pulse-glow' : ''} ${isWrong ? 'animate-shake-soft' : ''} ${found ? 'animate-pop' : ''}`}
              style={glow ? { outline: `4px solid ${ACCENT}` } : undefined}
            >
              <span className="text-5xl leading-none" aria-hidden="true">
                {solid?.emoji}
              </span>
              <span className="text-sm font-extrabold text-ink">{solid?.name}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // — Trier les figures par nombre de côtés (T1) —
  const renderSortSides = (it: SortSidesItem): ReactNode => {
    const shape = SHAPES_BY_ID.get(it.shapeId)
    const showAnim = mood === 'happy' || mood === 'shake' ? 'animate-wiggle' : 'animate-floaty'
    const good = sideBinFor(it.shapeId)
    return (
      <div className="game-surface flex w-full max-w-md flex-col items-center gap-4">
        <div key={animKey} className={showAnim} aria-label={shape?.name}>
          <ShapeGlyph id={it.shapeId} size={108} seed={variantSeed} />
        </div>
        <div className="grid w-full grid-cols-3 gap-2.5">
          {it.bins.map((bin) => {
            const def = SIDE_BINS_BY_ID.get(bin)
            const glow = hint && bin === good
            const isWrong = wrongId === bin
            return (
              <button
                key={bin}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapSideBin(it, bin)}
                aria-label={def?.label}
                className={`tap-target card flex flex-col items-center justify-center gap-1 py-4 transition-transform active:scale-95 ${glow ? 'animate-pulse-glow' : ''} ${isWrong ? 'animate-shake-soft' : ''}`}
                style={glow ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true">
                  <ShapeGlyph id={BIN_SHAPE[bin]} size={46} />
                </span>
                <span className="text-sm font-extrabold text-ink">{def?.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // — Trier les solides « ça roule / ça ne roule pas » (T3) —
  const renderSortRoll = (it: SortRollItem): ReactNode => {
    const solid = SOLIDS_BY_ID.get(it.solidId)
    const good = rollBinFor(it.solidId)
    const solidAnim =
      mood === 'happy' ? 'animate-wiggle' : mood === 'shake' ? 'animate-shake-soft' : 'animate-floaty'
    return (
      <div className="game-surface flex w-full max-w-md flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <span
            key={animKey}
            className={`text-8xl leading-none ${solidAnim}`}
            role="img"
            aria-label={solid?.name}
          >
            {solid?.emoji}
          </span>
          <span className="text-base font-extrabold text-ink">{solid?.name}</span>
        </div>
        <div className="grid w-full grid-cols-2 gap-3">
          {it.bins.map((bin) => {
            const def = ROLL_BINS_BY_ID.get(bin)
            const glow = hint && bin === good
            const isWrong = wrongId === bin
            return (
              <button
                key={bin}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => onTapRollBin(it, bin)}
                aria-label={def?.label}
                className={`tap-target card flex flex-col items-center justify-center gap-1 py-5 transition-transform active:scale-95 ${glow ? 'animate-pulse-glow' : ''} ${isWrong ? 'animate-shake-soft' : ''}`}
                style={glow ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span className="text-4xl leading-none" aria-hidden="true">
                  {def?.emoji}
                </span>
                <span className="text-base font-extrabold text-ink">{def?.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const consigneText = (it: FormeItem): string => {
    if (it.kind === 'tap-shape') return `Trouve ${SHAPES_BY_ID.get(it.targetId)?.name} !`
    if (it.kind === 'tap-solid') return `Trouve ${SOLIDS_BY_ID.get(it.targetId)?.name} !`
    if (it.kind === 'sort-sides') return 'Combien cette figure a-t-elle de côtés ?'
    return 'Est-ce que ce solide roule ?'
  }

  const renderPlay = (it: FormeItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 px-3 pb-6">
      <div className="flex items-center justify-center gap-3">
        <p className="text-center text-lg font-extrabold text-ink sm:text-xl">{consigneText(it)}</p>
        <Mascot mood={phase === 'success' ? 'cheer' : 'idle'} size={48} />
      </div>
      {it.kind === 'tap-shape' && renderTapShape(it)}
      {it.kind === 'tap-solid' && renderTapSolid(it)}
      {it.kind === 'sort-sides' && renderSortSides(it)}
      {it.kind === 'sort-roll' && renderSortRoll(it)}
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
