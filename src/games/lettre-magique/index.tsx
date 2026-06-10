import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx, stopSpeech } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, GameMeta, LevelResult, SkillId } from '@/engine/types'
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
  applyTraceResult,
  evaluateTrace,
  FRESH_PROGRESS,
  initialFlow,
  isFirstTry,
  MAX_TUNER_LEVEL,
  pathLength,
  pickSessionStrokes,
  starsFor,
  toleranceFor,
  TRACES_PER_RUN,
} from './logic'
import type { Atelier, LmaProgress, Pt, TraceFlow } from './logic'
import { FORME_STROKES, LETTER_FAMILIES, STROKES_BY_ID } from './strokes'
import type { StrokeDef } from './strokes'

// ============================================================
// La Lettre Magique — tracé cursif au doigt, guidage progressif.
// Palier 1 : la fée trace (démonstration animée). Palier 2 : suis
// les pointillés. Palier 3 : toute seule, de mémoire. La lettre
// acquise rejoint la guirlande. Zéro clavier, zéro QCM : l'enfant
// PRODUIT le geste, validé par evaluateTrace (logique pure).
// ============================================================

const STORE_KEY = 'game:lettre-magique'

const META: GameMeta = GAMES_BY_ID.get('lettre-magique') ?? {
  id: 'lettre-magique',
  title: 'La Lettre Magique',
  tagline: 'Trace les lettres avec ton doigt !',
  icon: '✍️',
  island: 'sons',
  accent: '#6d4c41',
  skills: ['fr.gs.graphisme.formes', 'fr.cp.ecriture.cursive'],
  status: 'v2',
}
const ACCENT = META.accent
const GOLD = '#d4a017'

const SKILL_BY_ATELIER: Record<Atelier, SkillId> = {
  formes: 'fr.gs.graphisme.formes',
  lettres: 'fr.cp.ecriture.cursive',
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

const STRUCTURE_CLIPS = [
  'lma.intro',
  'lma.atelier.formes',
  'lma.atelier.lettres',
  'lma.palier.regarde',
  'lma.palier.pointilles',
  'lma.palier.seule',
  'lma.encore',
  'lma.depart',
  'lma.acquise',
  'lma.famille.debloquee',
  'lma.verrou',
]

// ---------- Keyframes locales du jeu ----------

function LmaStyles() {
  return (
    <style>{`
@keyframes lma-star-pulse {
  0%, 100% { transform: scale(1); opacity: 0.95; }
  50% { transform: scale(1.35); opacity: 1; }
}
.lma-star { animation: lma-star-pulse 1s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
@keyframes lma-flyaway {
  0% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-26px) rotate(-4deg); opacity: 0; }
}
.lma-flyaway { animation: lma-flyaway 0.9s ease-in both; }
@keyframes lma-glow {
  0% { filter: drop-shadow(0 0 1px rgba(212, 160, 23, 0.4)); }
  50% { filter: drop-shadow(0 0 7px rgba(212, 160, 23, 1)); }
  100% { filter: drop-shadow(0 0 3px rgba(212, 160, 23, 0.7)); }
}
.lma-glow { animation: lma-glow 1.1s ease-in-out both; }
@keyframes lma-fairy-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.lma-fairy { animation: lma-fairy-bob 0.8s ease-in-out infinite; }
@keyframes lma-bead-in {
  0% { transform: scale(0) rotate(-30deg); }
  70% { transform: scale(1.25) rotate(6deg); }
  100% { transform: scale(1) rotate(0); }
}
.lma-bead { animation: lma-bead-in 0.5s ease-out both; }
`}</style>
  )
}

// ---------- Petits composants de scène ----------

function toSvgPath(points: readonly Pt[]): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
}

/** Miniature d'un tracé (guirlande, menus). */
function StrokeMini({ stroke, size, gold }: { stroke: StrokeDef; size: number; gold?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <path
        d={toSvgPath(stroke.points)}
        fill="none"
        stroke={gold ? GOLD : ACCENT}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Lignes Seyès simplifiées : interligne + ligne de base bien visibles. */
function SeyesLines() {
  return (
    <g aria-hidden="true">
      <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(109, 76, 65, 0.14)" strokeWidth="0.4" />
      <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(41, 128, 185, 0.4)" strokeWidth="0.5" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(109, 76, 65, 0.65)" strokeWidth="0.9" />
      <line x1="0" y1="70" x2="100" y2="70" stroke="rgba(109, 76, 65, 0.14)" strokeWidth="0.4" />
    </g>
  )
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'demo' | 'trace' | 'success' | 'retry'

export default function LettreMagique() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<LmaProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [atelier, setAtelier] = useState<Atelier>('formes')
  const [familyIndex, setFamilyIndex] = useState(0)

  const [queue, setQueue] = useState<string[]>([])
  const [itemIndex, setItemIndex] = useState(0)
  const [flow, setFlow] = useState<TraceFlow>(initialFlow())
  const [phase, setPhase] = useState<Phase>('demo')
  const [demoProg, setDemoProg] = useState(0)
  const [drawn, setDrawn] = useState<Pt[]>([])
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [acquiredRun, setAcquiredRun] = useState<string[]>([])
  const [burst, setBurst] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  /** promesse de l'audio de démo : les clips suivants s'enchaînent APRÈS */
  const demoAudioRef = useRef<Promise<void>>(Promise.resolve())
  /** le nom du tracé n'est annoncé qu'à la PREMIÈRE démo de l'item */
  const announcedItemRef = useRef(-1)
  /** consigne de palier déjà dite pour (item, palier) */
  const spokenPalierRef = useRef('')
  const zoneRef = useRef<HTMLDivElement | null>(null)
  const drawingRef = useRef(false)
  const pointsRef = useRef<Pt[]>([])
  const lastTrailSfxRef = useRef(0)

  const currentStroke: StrokeDef | null =
    screen === 'play' ? (STROKES_BY_ID.get(queue[itemIndex] ?? '') ?? null) : null

  // Chargement de la progression + préchargement des clips de structure
  useEffect(() => {
    let alive = true
    void pget<LmaProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      setProgress(stored ?? { ...FRESH_PROGRESS })
    })
    // 51 clips au total : seuls ceux de structure sont préchargés d'emblée,
    // les clips nom/geste le sont item par item (cache LRU Howler ~30).
    preloadClips(STRUCTURE_CLIPS)
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  // ---------- Palier 1 : la fée trace (démonstration animée) ----------

  useEffect(() => {
    if (phase !== 'demo' || !currentStroke) return
    const seq = ++seqRef.current
    setDemoProg(0)
    setDrawn([])
    const fresh = announcedItemRef.current !== itemIndex
    announcedItemRef.current = itemIndex
    demoAudioRef.current = (async () => {
      await say(E('lma.palier.regarde'))
      if (seqRef.current !== seq) return
      if (fresh) {
        await say(E(`lma.nom.${currentStroke.id}`), { interrupt: false })
        if (seqRef.current !== seq) return
      }
      await say(E(`lma.geste.${currentStroke.id}`), { interrupt: false })
    })()

    const duration = Math.max(2200, pathLength(currentStroke.points) * 16)
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number): void => {
      const p = Math.min(1, (t - t0) / duration)
      setDemoProg(p)
      if (seqRef.current !== seq) return
      if (p < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        // La fée a fini : à l'enfant de tracer.
        setPhase('trace')
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, itemIndex, screen])

  // Consigne du palier, énoncée APRÈS l'audio de démo (jamais deux voix).
  useEffect(() => {
    if (phase !== 'trace' || screen !== 'play') return
    const key = `${itemIndex}:${flow.palier}`
    if (spokenPalierRef.current === key) return
    spokenPalierRef.current = key
    const seq = seqRef.current
    void demoAudioRef.current.then(() => {
      if (seqRef.current !== seq) return
      void say(E(flow.palier === 2 ? 'lma.palier.pointilles' : 'lma.palier.seule'), {
        interrupt: false,
      })
    })
  }, [phase, flow.palier, itemIndex, screen])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Réécouter n'est possible qu'en phase de tracé — jamais pendant un
      // feedback ou la démo (la séquence audio en cours resterait intacte).
      if (currentStroke && phase === 'trace') {
        demoAudioRef.current = say(E(`lma.geste.${currentStroke.id}`))
      }
      return
    }
    void say(E('lma.intro'))
  }, [screen, currentStroke, phase])

  // ---------- Déroulé d'une partie ----------

  const startRun = (a: Atelier, fam: number): void => {
    const pool =
      a === 'formes' ? FORME_STROKES.map((s) => s.id) : (LETTER_FAMILIES[fam]?.strokes ?? [])
    const q = pickSessionStrokes(pool, TRACES_PER_RUN)
    if (q.length === 0) return
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    announcedItemRef.current = -1
    spokenPalierRef.current = ''
    pointsRef.current = []
    seqRef.current += 1
    preloadClips(q.slice(0, 2).flatMap((id) => [`lma.nom.${id}`, `lma.geste.${id}`]))
    setAtelier(a)
    setFamilyIndex(fam)
    setQueue(q)
    setItemIndex(0)
    setFlow(initialFlow())
    setDrawn([])
    setOverlay(null)
    setFirstTryCorrect(0)
    setAcquiredRun([])
    setNewUnlock(false)
    setResult(null)
    setPhase('demo')
    setScreen('play')
  }

  const advance = (): void => {
    const next = itemIndex + 1
    setDrawn([])
    pointsRef.current = []
    if (next >= queue.length) {
      finishRun()
      return
    }
    const id = queue[next]
    preloadClips([`lma.nom.${id}`, `lma.geste.${id}`])
    setFlow(initialFlow())
    setItemIndex(next)
    setPhase('demo')
  }

  const finishRun = (): void => {
    const stars = starsFor(firstTryCorrect, TRACES_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: TRACES_PER_RUN })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, atelier, familyIndex, stars, acquiredRun, LETTER_FAMILIES.length)
    const unlockedNow = updated.unlockedFamily > base.unlockedFamily
    if (unlockedNow) {
      sfx('levelup')
      void say(E('lma.famille.debloquee'))
    }
    setNewUnlock(unlockedNow)
    setProgress(updated)
    void pset(STORE_KEY, updated)
    setScreen('end')
  }

  // ---------- Tracer au doigt ----------

  const toLocal = (e: ReactPointerEvent<HTMLDivElement>): Pt | null => {
    const el = zoneRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    }
  }

  const onZonePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (phase !== 'trace' || !currentStroke) return
    const p = toLocal(e)
    if (!p) return
    drawingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    sfx('pop')
    pointsRef.current = [p]
    setDrawn([p])
  }

  const onZonePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drawingRef.current || phase !== 'trace') return
    const p = toLocal(e)
    if (!p) return
    const pts = pointsRef.current
    const last = pts[pts.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1) return
    pts.push(p)
    setDrawn([...pts])
    // SFX doux pendant le tracé (jamais plus d'un toutes les 350 ms).
    const now = performance.now()
    if (now - lastTrailSfxRef.current > 350) {
      lastTrailSfxRef.current = now
      sfx('slide')
    }
  }

  const onZonePointerUp = (): void => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (phase !== 'trace' || !currentStroke) return
    const pts = pointsRef.current
    // Tap accidentel (trait minuscule) : on efface sans juger.
    if (pts.length < 2 || pathLength(pts) < 6) {
      pointsRef.current = []
      setDrawn([])
      return
    }
    const tolerance = toleranceFor(flow.palier, tunerRef.current.level)
    const res = evaluateTrace(currentStroke.points, pts, tolerance)
    // Le verdict ne doit jamais être chevauché par la consigne en cours.
    seqRef.current += 1
    const next = applyTraceResult(flow, res.ok)
    setFlow(next)

    if (res.ok) {
      setPhase('success')
      if (next.done) {
        // Tracé acquis : maîtrise + Tuner, UNE seule fois, sur le palier 3.
        const ft = isFirstTry(next)
        void recordAttempt(SKILL_BY_ATELIER[atelier], ft)
        tunerRef.current.onResult(ft)
        if (ft) setFirstTryCorrect((c) => c + 1)
        setAcquiredRun((a) => [...a, currentStroke.id])
        setBurst((b) => b + 1)
        sfx('magic')
        void say(E('lma.acquise')).then(() => setOverlay('success'))
      } else {
        setOverlay('success')
      }
      return
    }

    // Échec : jamais « faux » — le tracé s'envole, la fée remontre le geste.
    setPhase('retry')
    void say(E(res.wrongStart ? 'lma.depart' : 'lma.encore')).then(() => setOverlay('retry'))
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') {
      if (flow.done) {
        advance()
      } else {
        pointsRef.current = []
        setDrawn([])
        setPhase('trace')
      }
      return
    }
    if (kind === 'retry') {
      // L'animation modèle se rejoue (l'erreur enseigne) ; si l'enfant est
      // retombé au palier 2, le guidage pointillés sera de retour.
      pointsRef.current = []
      setDrawn([])
      setPhase('demo')
    }
  }

  // ---------- Rendu : menu ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            ✍️
          </div>
        </div>
      )
    }
    const acquiredCount = Object.keys(progress.acquired).length
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('lma.intro')} autoPlay />
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Regarde la fée 🧚, puis trace avec ton doigt !
        </p>

        <div className="grid w-full grid-cols-2 gap-3">
          {(
            [
              { a: 'formes' as Atelier, emoji: '🌀', name: 'Formes magiques', sub: 'Boucles, ponts, vagues…' },
              { a: 'lettres' as Atelier, emoji: '✍️', name: 'Lettres cursives', sub: 'En attaché !' },
            ] as const
          ).map(({ a, emoji, name, sub }) => (
            <button
              key={a}
              type="button"
              aria-pressed={atelier === a}
              onClick={() => {
                sfx('tap')
                setAtelier(a)
                void say(E(`lma.atelier.${a}`))
              }}
              className="tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95"
              style={atelier === a ? { outline: `4px solid ${ACCENT}` } : undefined}
            >
              <span aria-hidden="true" className="text-3xl">{emoji}</span>
              <span className="text-base leading-tight font-extrabold text-ink">{name}</span>
              <span className="text-xs font-semibold text-ink-soft">{sub}</span>
            </button>
          ))}
        </div>

        {atelier === 'lettres' && (
          <div className="flex w-full flex-wrap justify-center gap-2">
            {LETTER_FAMILIES.map((fam, i) => {
              const locked = i > progress.unlockedFamily
              const active = familyIndex === i && !locked
              return (
                <button
                  key={fam.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={locked ? `${fam.name} (verrouillé)` : fam.name}
                  onClick={() => {
                    if (locked) {
                      sfx('slide')
                      void say(E('lma.verrou'))
                      return
                    }
                    sfx('tap')
                    setFamilyIndex(i)
                  }}
                  className={`tap-target card flex items-center gap-1.5 px-3 py-2 transition-transform active:scale-95 ${locked ? 'opacity-50' : ''}`}
                  style={active ? { outline: `3px solid ${ACCENT}` } : undefined}
                >
                  <span aria-hidden="true" className="text-xl">{locked ? '🔒' : fam.emoji}</span>
                  <span className="text-sm font-extrabold text-ink">{fam.name}</span>
                  <span className="font-serif text-base italic" aria-hidden="true">
                    {fam.strokes.map((id) => (
                      <span
                        key={id}
                        style={{ color: progress.acquired[id] ? GOLD : 'var(--color-ink-soft)' }}
                      >
                        {id}
                      </span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {atelier === 'formes' && (
          <div className="flex w-full flex-wrap justify-center gap-1.5" aria-hidden="true">
            {FORME_STROKES.map((s) => (
              <span key={s.id} className="card p-1">
                <StrokeMini stroke={s} size={34} gold={Boolean(progress.acquired[s.id])} />
              </span>
            ))}
          </div>
        )}

        <p className="text-sm font-semibold text-ink-soft">
          {acquiredCount > 0
            ? `${acquiredCount} tracé${acquiredCount > 1 ? 's' : ''} dans ta guirlande ✨`
            : 'Ta guirlande t’attend !'}
        </p>
        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-2xl"
          onClick={() => startRun(atelier, atelier === 'lettres' ? familyIndex : 0)}
        >
          Jouer !
        </BigButton>
      </div>
    )
  }

  // ---------- Rendu : zone de tracé ----------

  const renderZone = (stroke: StrokeDef): ReactNode => {
    const model = stroke.points
    const start = model[0]
    const demoCount = Math.max(2, Math.ceil(demoProg * model.length))
    const demoPts = model.slice(0, demoCount)
    const fairyPos = demoPts[demoPts.length - 1]
    const arrowA = model[1]
    const arrowB = model[3] ?? model[model.length - 1]
    const arrowDeg = (Math.atan2(arrowB.y - arrowA.y, arrowB.x - arrowA.x) * 180) / Math.PI
    const tip = drawn[drawn.length - 1]

    return (
      <div
        ref={zoneRef}
        onPointerDown={onZonePointerDown}
        onPointerMove={onZonePointerMove}
        onPointerUp={onZonePointerUp}
        onPointerCancel={onZonePointerUp}
        role="application"
        aria-label={`Zone de tracé : ${stroke.name}. Pars de l'étoile et trace avec ton doigt.`}
        className="game-surface relative touch-none rounded-card shadow-card"
        style={{
          width: 'min(100%, 70dvh)',
          aspectRatio: '1 / 1',
          background: 'linear-gradient(180deg, #fdf6e6 0%, #f6e9d2 100%)',
          border: '4px solid #d9c5a0',
        }}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <SeyesLines />

          {/* Palier 2 : le modèle en pointillés + flèche du sens */}
          {phase !== 'demo' && flow.palier === 2 && (
            <>
              <path
                d={toSvgPath(model)}
                fill="none"
                stroke="rgba(109, 76, 65, 0.45)"
                strokeWidth="1.6"
                strokeDasharray="2.6 2.6"
                strokeLinecap="round"
              />
              <polygon
                points="0,-2.6 4.4,0 0,2.6"
                fill={ACCENT}
                transform={`translate(${arrowB.x} ${arrowB.y}) rotate(${arrowDeg})`}
                opacity="0.85"
              />
            </>
          )}

          {/* Démo : le tracé de la fée se dessine, paillettes dans son sillage */}
          {phase === 'demo' && (
            <>
              <path
                d={toSvgPath(demoPts)}
                fill="none"
                stroke={GOLD}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
              {demoPts.length > 6 && (
                <text x={demoPts[demoPts.length - 6].x} y={demoPts[demoPts.length - 6].y} fontSize="4" textAnchor="middle">✨</text>
              )}
              {fairyPos && (
                <text className="lma-fairy" x={fairyPos.x} y={fairyPos.y - 3} fontSize="9" textAnchor="middle">🧚</text>
              )}
            </>
          )}

          {/* Réussite : la lettre s'illumine, la fée applaudit */}
          {phase === 'success' && (
            <g className="lma-glow">
              <path
                d={toSvgPath(model)}
                fill="none"
                stroke={GOLD}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text x={model[Math.floor(model.length / 2)].x} y="16" fontSize="9" textAnchor="middle" className="lma-fairy">🧚</text>
            </g>
          )}

          {/* Le tracé de l'enfant : encre dorée + traînée de paillettes */}
          {drawn.length > 1 && phase !== 'success' && (
            <g className={phase === 'retry' ? 'lma-flyaway' : undefined}>
              <path
                d={toSvgPath(drawn)}
                fill="none"
                stroke={GOLD}
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.95"
              />
              {tip && phase === 'trace' && (
                <>
                  <text x={tip.x} y={tip.y + 1.5} fontSize="5" textAnchor="middle">✨</text>
                  {drawn.length > 7 && (
                    <text x={drawn[drawn.length - 7].x} y={drawn[drawn.length - 7].y + 1} fontSize="3.5" textAnchor="middle" opacity="0.6">✨</text>
                  )}
                  {drawn.length > 14 && (
                    <text x={drawn[drawn.length - 14].x} y={drawn[drawn.length - 14].y + 1} fontSize="2.8" textAnchor="middle" opacity="0.35">✨</text>
                  )}
                </>
              )}
            </g>
          )}

          {/* L'étoile de départ, très visible (paliers 2 ET 3) */}
          {phase === 'trace' && drawn.length === 0 && (
            <>
              <circle cx={start.x} cy={start.y} r="6" fill="rgba(255, 201, 77, 0.35)" className="lma-star" />
              <text x={start.x} y={start.y + 2.6} fontSize="8" textAnchor="middle" className="lma-star">⭐</text>
            </>
          )}
        </svg>
      </div>
    )
  }

  // ---------- Rendu : partie ----------

  const renderPlay = (stroke: StrokeDef): ReactNode => {
    const palierLabel =
      phase === 'demo' ? '🧚 Regarde…' : flow.palier === 2 ? '✨ Suis les pointillés !' : '🌟 Toute seule !'
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col items-center gap-2 px-3 pb-3">
        {/* La guirlande des tracés acquis de la partie */}
        <div className="flex h-12 w-full items-center justify-center gap-2" aria-label="Guirlande des lettres réussies">
          <span aria-hidden="true" className="text-sm opacity-60">🪢</span>
          {acquiredRun.map((id, i) => {
            const s = STROKES_BY_ID.get(id)
            return s ? (
              <span key={`${id}-${i}`} className="lma-bead card rounded-full p-1" style={{ background: '#fff8e7' }}>
                <StrokeMini stroke={s} size={26} gold />
              </span>
            ) : null
          })}
          {acquiredRun.length === 0 && (
            <span className="text-xs font-semibold text-ink-soft">Ta guirlande se remplit ici…</span>
          )}
          <span aria-hidden="true" className="text-sm opacity-60">🪢</span>
        </div>

        {/* Consigne compacte : nom du tracé + palier + réécoute du geste */}
        <div className="flex w-full items-center justify-center gap-3">
          <span className="card flex items-center gap-2 px-3 py-1.5">
            <StrokeMini stroke={stroke} size={28} />
            <span className="text-base font-extrabold text-ink capitalize">{stroke.name}</span>
          </span>
          <span className="text-sm font-extrabold" style={{ color: ACCENT }}>{palierLabel}</span>
          <SpeakerButton entry={E(`lma.geste.${stroke.id}`)} />
        </div>

        {/* La zone de tracé, énorme */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          {renderZone(stroke)}
        </div>
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={TRACES_PER_RUN} done={itemIndex} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      <LmaStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && currentStroke && renderPlay(currentStroke)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouvelle famille de lettres débloquée !
            </div>
          )}
          <LevelEnd
            result={result}
            onReplay={() => startRun(atelier, familyIndex)}
            onHome={() => navigate('/')}
          />
        </div>
      )}
      <ConfettiBurst burst={burst} />
      <FeedbackOverlay
        kind={overlay}
        message={overlay === 'retry' ? 'On recommence ensemble !' : undefined}
        onDone={onOverlayDone}
      />
    </GameShell>
  )
}
