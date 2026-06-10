import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tuner } from '@/engine/adaptive'
import { preloadClips, say, sfx, stopSpeech } from '@/engine/audio'
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
  ProgressDots,
  SpeakerButton,
} from '@/ui'
import corpus from './corpus.json'
import {
  applyRun,
  checkCuts,
  correctCuts,
  fracClipId,
  fracEquals,
  fracText,
  FRESH_PROGRESS,
  GATEAU_NOTCHES,
  GATEAU_UNITS,
  gateauBoundaries,
  generateItem,
  itemKey,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  neededParts,
  normalizeDiameter,
  pizzaRays,
  servedFraction,
  starsFor,
  TIER_SKILLS,
} from './logic'
import type { CutCheck, Frac, PzfItem, PzfProgress, TierId } from './logic'

// ============================================================
// La Pizzeria des Fractions — moitié, tiers, quart (CE1, 2025).
// L'enfant est le pizzaïolo : il COUPE en parts égales (tier 0),
// SERT la fraction commandée (tier 1) et LIT la notation 1/2,
// 1/3, 1/4 sur les tickets (tier 2). Double support : pizza ronde
// (parts angulaires) et gâteau rectangulaire (bandes verticales).
// ============================================================

const STORE_KEY = 'game:pizzeria-des-fractions'

const META: GameMeta = GAMES_BY_ID.get('pizzeria-des-fractions') ?? {
  id: 'pizzeria-des-fractions',
  title: 'La Pizzeria des Fractions',
  tagline: 'Coupe, partage, sers les parts égales !',
  icon: '🍕',
  island: 'nombres',
  accent: '#d84315',
  skills: ['ma.ce1.fractions.parts', 'ma.ce1.fractions.lire'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🔪', name: 'Coupe !', sub: 'Parts égales' },
  { emoji: '🍽️', name: 'Sers !', sub: 'Moitié, tiers, quart' },
  { emoji: '🎫', name: 'L’étiquette', sub: 'Lire 1/2, 1/3, 1/4' },
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

function PzfStyles() {
  return (
    <style>{`
@keyframes pzf-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.pzf-pulse { animation: pzf-pulse 1s ease-in-out infinite; }
@keyframes pzf-tilt {
  0%, 100% { transform: rotate(-7deg); }
  50% { transform: rotate(7deg); }
}
.pzf-tilt { animation: pzf-tilt 1.2s ease-in-out infinite; transform-origin: 50% 0%; }
@keyframes pzf-cut {
  from { opacity: 0; stroke-dashoffset: 240; }
  to { opacity: 1; stroke-dashoffset: 0; }
}
.pzf-cut { stroke-dasharray: 240; animation: pzf-cut 0.3s ease-out both; }
@keyframes pzf-flame {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
.pzf-flame { display: inline-block; animation: pzf-flame 1.6s ease-in-out infinite; }
@keyframes pzf-wobble {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
.pzf-wobble { animation: pzf-wobble 0.5s ease-in-out infinite; }
`}</style>
  )
}

/** Nappe à carreaux rouge/blanc de la pizzeria (CSS pur). */
const TABLECLOTH: CSSProperties = {
  backgroundColor: '#fdf6ec',
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(216, 67, 21, 0.12) 0 16px, transparent 16px 32px), ' +
    'repeating-linear-gradient(90deg, rgba(216, 67, 21, 0.12) 0 16px, transparent 16px 32px)',
}

// ---------- Géométrie SVG (rendu uniquement) ----------

/** Angle 0° = en haut, sens horaire (convention du jeu). */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function sectorPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start)
  const [x2, y2] = polar(cx, cy, r, end)
  const large = end - start > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
}

/** Couleurs des parts quand le partage est raté : même taille = même couleur. */
function sizeColors(sizes: readonly number[]): string[] {
  const uniq = [...new Set(sizes)].sort((a, b) => a - b)
  const palette = ['#aed581', '#ffb300', '#ef5350']
  return sizes.map((s) =>
    uniq.length === 1 ? '#f6c453' : palette[Math.min(uniq.indexOf(s), palette.length - 1)],
  )
}

const NOTCH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const
const OLIVE_SPOTS: ReadonlyArray<[number, number]> = [
  [-32, -20], [26, -34], [38, 18], [-12, 34], [-44, 14], [8, -6],
]

// ---------- La balance des parts inégales ----------

function Balance({ sizes }: { sizes: readonly number[] }) {
  const min = Math.min(...sizes)
  const max = Math.max(...sizes)
  if (min === max) return null
  const w = (s: number): number => 16 + Math.round((s / max) * 36)
  return (
    <div
      className="card flex items-center justify-center gap-3 px-4 py-2"
      role="img"
      aria-label="Une balance montre que les parts ne sont pas pareilles"
    >
      <span className="pzf-tilt inline-flex items-center gap-2">
        <span
          className="inline-block rounded-md"
          style={{ width: w(min), height: 14, background: '#aed581' }}
        />
        <span aria-hidden="true" className="text-3xl">⚖️</span>
        <span
          className="inline-block rounded-md"
          style={{ width: w(max), height: 14, background: '#ef5350' }}
        />
      </span>
      <span className="text-sm font-extrabold text-ink">Pas pareilles !</span>
    </div>
  )
}

// ---------- Le ticket-fraction ----------

function FracTicket({ f, big }: { f: Frac; big?: boolean }) {
  return (
    <span
      className="inline-flex flex-col items-center leading-none"
      role="img"
      aria-label={`${f.num} sur ${f.den}`}
    >
      <span className={`font-extrabold text-ink ${big ? 'text-3xl' : 'text-2xl'}`}>{f.num}</span>
      <span
        aria-hidden="true"
        className="my-0.5 rounded-full"
        style={{ width: big ? 34 : 26, height: 4, background: ACCENT }}
      />
      <span className={`font-extrabold text-ink ${big ? 'text-3xl' : 'text-2xl'}`}>{f.den}</span>
    </span>
  )
}

// ============================================================
// Tier 0 — les planches de coupe
// ============================================================

interface CutBoardProps {
  cuts: number[]
  onToggle: (cut: number) => void
  /** Résultat raté à montrer (couleurs + oscillation), sinon null */
  check: CutCheck | null
  /** Encoches qui pulsent quand l'indice est actif */
  hintCuts: number[] | null
  disabled: boolean
}

function CutPizza({ cuts, onToggle, check, hintCuts, disabled }: CutBoardProps) {
  const C = 168
  const R = 100
  const rays = pizzaRays(cuts)
  const colors = check ? sizeColors(check.sizes) : null

  return (
    <svg
      viewBox="0 0 336 336"
      className="w-full max-w-sm touch-none select-none"
      role="application"
      aria-label="La pizza ronde. Tape les encoches autour pour poser ou retirer une coupe."
    >
      {/* La planche du pizzaïolo */}
      <circle cx={C} cy={C} r={R + 10} fill="#c8924f" />
      <circle cx={C} cy={C} r={R + 10} fill="none" stroke="#a9763b" strokeWidth={3} />

      {rays.length === 0 ? (
        <g>
          <circle cx={C} cy={C} r={R} fill="#e8a33d" />
          <circle cx={C} cy={C} r={R - 9} fill="#e25822" />
          <circle cx={C} cy={C} r={R - 14} fill="#f6c453" />
          {OLIVE_SPOTS.map(([dx, dy], i) => (
            <circle key={i} cx={C + dx} cy={C + dy} r={7} fill="#4a3b2a" />
          ))}
        </g>
      ) : (
        <g className={check?.reason === 'unequal' ? 'pzf-wobble' : undefined}>
          {rays.map((start, i) => {
            const end = i + 1 < rays.length ? rays[i + 1] : rays[0] + 360
            const mid = (start + end) / 2
            const [ox, oy] = polar(0, 0, 5, mid)
            const [ax, ay] = polar(C, C, (R - 14) * 0.55, mid)
            return (
              <g key={start} transform={`translate(${ox} ${oy})`}>
                <path
                  d={sectorPath(C, C, R, start, end)}
                  fill={colors ? colors[i] : '#f6c453'}
                  stroke="#e8a33d"
                  strokeWidth={6}
                  strokeLinejoin="round"
                />
                <circle cx={ax} cy={ay} r={7} fill="#4a3b2a" />
              </g>
            )
          })}
        </g>
      )}

      {/* Les coupes posées (le couteau est passé là) */}
      {cuts.map((a) => {
        const [x1, y1] = polar(C, C, R + 4, a)
        const [x2, y2] = polar(C, C, R + 4, a + 180)
        return (
          <line
            key={a}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth={4}
            strokeLinecap="round"
            className="pzf-cut"
            aria-hidden="true"
          />
        )
      })}

      {/* Les 8 encoches de coupe (≥ 56 px de zone tapable) */}
      {NOTCH_ANGLES.map((a) => {
        const d = normalizeDiameter(a)
        const active = cuts.includes(d)
        const hinted = hintCuts !== null && hintCuts.includes(d) && !active
        const [x, y] = polar(C, C, 138, a)
        return (
          <g
            key={a}
            onPointerDown={() => {
              if (!disabled) onToggle(d)
            }}
            className="cursor-pointer"
            role="button"
            aria-label={active ? 'Retirer cette coupe' : 'Couper ici'}
            aria-pressed={active}
          >
            <circle cx={x} cy={y} r={30} fill="transparent" />
            <circle
              cx={x}
              cy={y}
              r={13}
              fill={active ? ACCENT : '#ffffff'}
              stroke={ACCENT}
              strokeWidth={3}
              strokeDasharray={active ? undefined : '4 4'}
              className={hinted ? 'pzf-pulse' : undefined}
            />
            {active && (
              <text x={x} y={y + 5} textAnchor="middle" fontSize={14} aria-hidden="true">
                ✂️
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function CutGateau({ cuts, onToggle, check, hintCuts, disabled }: CutBoardProps) {
  const X0 = 28
  const W = 280
  const Y0 = 92
  const H = 92
  const px = (t: number): number => X0 + (W * t) / GATEAU_UNITS
  const bounds = gateauBoundaries(cuts)
  const colors = check ? sizeColors(check.sizes) : null

  return (
    <svg
      viewBox="0 0 336 210"
      className="w-full max-w-sm touch-none select-none"
      role="application"
      aria-label="Le gâteau rectangulaire. Tape les encoches au-dessus pour poser ou retirer une coupe."
    >
      {/* Le plat */}
      <rect x={X0 - 12} y={Y0 + H - 6} width={W + 24} height={16} rx={8} fill="#c8924f" />

      {/* Les morceaux du fraisier */}
      <g className={check?.reason === 'unequal' ? 'pzf-wobble' : undefined}>
        {bounds.slice(1).map((end, i) => {
          const start = bounds[i]
          const gap = cuts.length > 0 ? 2 : 0
          const x = px(start) + (i > 0 ? gap : 0)
          const w = px(end) - px(start) - (i > 0 ? gap : 0) - (i < bounds.length - 2 ? gap : 0)
          return (
            <g key={start}>
              <rect x={x} y={Y0} width={w} height={H} rx={6} fill={colors ? colors[i] : '#fbe3ea'} />
              <rect x={x} y={Y0 + 34} width={w} height={26} fill="#e8505b" opacity={0.85} />
              <rect x={x} y={Y0} width={w} height={H} rx={6} fill="none" stroke="#d9a0b0" strokeWidth={3} />
              <circle cx={x + w / 2} cy={Y0 + 16} r={7} fill="#c62828" />
            </g>
          )
        })}
      </g>

      {/* Les coupes posées */}
      {cuts.map((t) => (
        <line
          key={t}
          x1={px(t)}
          y1={Y0 - 6}
          x2={px(t)}
          y2={Y0 + H + 6}
          stroke="rgba(255, 255, 255, 0.95)"
          strokeWidth={4}
          strokeLinecap="round"
          className="pzf-cut"
          aria-hidden="true"
        />
      ))}

      {/* Les 5 encoches de coupe */}
      {GATEAU_NOTCHES.map((t) => {
        const active = cuts.includes(t)
        const hinted = hintCuts !== null && hintCuts.includes(t) && !active
        const x = px(t)
        return (
          <g
            key={t}
            onPointerDown={() => {
              if (!disabled) onToggle(t)
            }}
            className="cursor-pointer"
            role="button"
            aria-label={active ? 'Retirer cette coupe' : 'Couper ici'}
            aria-pressed={active}
          >
            <circle cx={x} cy={42} r={30} fill="transparent" />
            <circle
              cx={x}
              cy={42}
              r={13}
              fill={active ? ACCENT : '#ffffff'}
              stroke={ACCENT}
              strokeWidth={3}
              strokeDasharray={active ? undefined : '4 4'}
              className={hinted ? 'pzf-pulse' : undefined}
            />
            <text x={x} y={48} textAnchor="middle" fontSize={14} aria-hidden="true">
              {active ? '✂️' : '▼'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ============================================================
// Tiers 1 et 2 — le support déjà coupé, à servir
// ============================================================

interface ServeBoardProps {
  support: 'pizza' | 'gateau'
  totalParts: number
  selected: ReadonlySet<number>
  onToggle: (index: number) => void
  /** Indices des parts qui brillent (indice après 2 échecs), sinon null */
  hintCount: number | null
  disabled: boolean
}

function ServeBoard({ support, totalParts, selected, onToggle, hintCount, disabled }: ServeBoardProps) {
  if (support === 'pizza') {
    const C = 150
    const R = 110
    const step = 360 / totalParts
    return (
      <svg
        viewBox="0 0 300 300"
        className="w-full max-w-xs touch-none select-none"
        role="application"
        aria-label={`Une pizza coupée en ${totalParts} parts égales. Tape une part pour la servir ou la reprendre.`}
      >
        <circle cx={C} cy={C} r={R + 8} fill="#c8924f" />
        {Array.from({ length: totalParts }, (_, i) => {
          const start = i * step
          const end = start + step
          const mid = (start + end) / 2
          const isSel = selected.has(i)
          const hinted = hintCount !== null && i < hintCount && !isSel
          const [ox, oy] = polar(0, 0, 4, mid)
          const [ax, ay] = polar(C, C, R * 0.5, mid)
          return (
            <g
              key={i}
              transform={`translate(${ox} ${oy})`}
              onPointerDown={() => {
                if (!disabled) onToggle(i)
              }}
              className="cursor-pointer"
              role="button"
              aria-label={isSel ? `Reprendre la part ${i + 1}` : `Servir la part ${i + 1}`}
              aria-pressed={isSel}
            >
              <path
                d={sectorPath(C, C, R, start, end)}
                fill={isSel ? '#fdf2e3' : '#f6c453'}
                stroke={isSel ? ACCENT : '#e8a33d'}
                strokeWidth={isSel ? 4 : 6}
                strokeDasharray={isSel ? '8 6' : undefined}
                strokeLinejoin="round"
                className={hinted ? 'pzf-pulse' : undefined}
              />
              {!isSel && <circle cx={ax} cy={ay} r={8} fill="#4a3b2a" />}
            </g>
          )
        })}
      </svg>
    )
  }

  const X0 = 20
  const W = 260
  const Y0 = 40
  const H = 90
  const w = W / totalParts
  return (
    <svg
      viewBox="0 0 300 160"
      className="w-full max-w-xs touch-none select-none"
      role="application"
      aria-label={`Un gâteau coupé en ${totalParts} parts égales. Tape une part pour la servir ou la reprendre.`}
    >
      <rect x={X0 - 10} y={Y0 + H - 6} width={W + 20} height={16} rx={8} fill="#c8924f" />
      {Array.from({ length: totalParts }, (_, i) => {
        const isSel = selected.has(i)
        const hinted = hintCount !== null && i < hintCount && !isSel
        const x = X0 + i * w + 2
        return (
          <g
            key={i}
            onPointerDown={() => {
              if (!disabled) onToggle(i)
            }}
            className="cursor-pointer"
            role="button"
            aria-label={isSel ? `Reprendre la part ${i + 1}` : `Servir la part ${i + 1}`}
            aria-pressed={isSel}
          >
            <rect
              x={x}
              y={Y0}
              width={w - 4}
              height={H}
              rx={6}
              fill={isSel ? '#fdf2e3' : '#fbe3ea'}
              stroke={isSel ? ACCENT : '#d9a0b0'}
              strokeWidth={isSel ? 4 : 3}
              strokeDasharray={isSel ? '8 6' : undefined}
              className={hinted ? 'pzf-pulse' : undefined}
            />
            {!isSel && (
              <g>
                <rect x={x + 4} y={Y0 + 34} width={w - 12} height={24} fill="#e8505b" opacity={0.85} />
                <circle cx={x + (w - 4) / 2} cy={Y0 + 16} r={6} fill="#c62828" />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** L'assiette du client : ses parts servies + les emplacements pendant l'enseignement. */
function ClientPlate({
  client,
  support,
  count,
  ghostSlots,
}: {
  client: string
  support: 'pizza' | 'gateau'
  count: number
  ghostSlots: number | null
}) {
  const slice = support === 'pizza' ? '🍕' : '🍰'
  return (
    <div className="card flex items-center gap-3 px-4 py-2">
      <span aria-hidden="true" className="text-4xl">{client}</span>
      <div
        className="flex min-h-14 min-w-24 flex-wrap items-center justify-center gap-1 rounded-full px-3 py-1"
        style={{ background: '#ffffff', border: '3px solid #e0d5c2' }}
        role="img"
        aria-label={`L'assiette du client contient ${count} part${count > 1 ? 's' : ''}`}
      >
        {ghostSlots !== null
          ? Array.from({ length: ghostSlots }, (_, i) => (
              <span
                key={`g-${i}`}
                aria-hidden="true"
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xl ${i < count ? 'animate-bounce-in' : ''}`}
                style={{ border: `2px dashed ${ACCENT}` }}
              >
                {i < count ? slice : ''}
              </span>
            ))
          : count === 0
            ? <span aria-hidden="true" className="text-sm font-bold text-ink-soft">…</span>
            : Array.from({ length: count }, (_, i) => (
                <span key={i} aria-hidden="true" className="animate-bounce-in text-2xl">
                  {slice}
                </span>
              ))}
      </div>
    </div>
  )
}

// ============================================================
// Le jeu
// ============================================================

type Screen = 'menu' | 'play' | 'end'
type Phase = 'aim' | 'success' | 'error' | 'teach'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default function PizzeriaDesFractions() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<PzfProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<PzfItem | null>(null)
  const [cuts, setCuts] = useState<number[]>([])
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [cutCheck, setCutCheck] = useState<CutCheck | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [coins, setCoins] = useState(0)
  const [phase, setPhase] = useState<Phase>('aim')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [hint, setHint] = useState(false)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  /** le conseil d'interaction (encoches / assiette) n'est donné qu'une fois */
  const helpGivenRef = useRef(false)
  /** promesse de la consigne en cours : le conseil s'enchaîne APRÈS elle */
  const consignePromiseRef = useRef<Promise<void>>(Promise.resolve())

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<PzfProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 2) as TierId)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  // ---------- Audio ----------

  const speakConsigne = useCallback(async (it: PzfItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.kind === 'cut') {
      await say(E(it.support === 'pizza' ? 'pzf.consigne.coupe-pizza' : 'pzf.consigne.coupe-gateau'))
      if (seqRef.current !== seq) return
      await say(E(`pzf.parts.${it.parts}`), { interrupt: false })
      return
    }
    if (it.kind === 'serve') {
      if (it.written) {
        // Tier 2 : la commande est sur le ticket, denise la LIT (« un demi ! »)
        await say(E(fracClipId(it.target, true)))
        return
      }
      await say(E('pzf.cmd.donne'))
      if (seqRef.current !== seq) return
      await say(E(fracClipId(it.target, false)), { interrupt: false })
      return
    }
    await say(E('pzf.consigne.etiquette'))
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      // Verrou anti soft-lock : réécouter n'est possible qu'en phase de visée
      // (pattern seqRef) — il ne doit jamais chevaucher feedback/enseignement.
      if (item && phase === 'aim') consignePromiseRef.current = speakConsigne(item)
      return
    }
    void say(E('pzf.intro'))
  }, [screen, item, phase, speakConsigne])

  /** Conseil d'interaction donné une seule fois, APRÈS la consigne. */
  const giveHelpOnce = (clipId: string): void => {
    if (helpGivenRef.current) return
    helpGivenRef.current = true
    const seq = seqRef.current
    void consignePromiseRef.current.then(() => {
      if (seqRef.current !== seq) return
      void say(E(clipId), { interrupt: false })
    })
  }

  // ---------- Déroulé d'une partie ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    helpGivenRef.current = false
    const first = generateItem(t, 0, null, 0)
    setTier(t)
    setItem(first)
    setCuts([])
    setSelected(new Set())
    setCutCheck(null)
    setResolved(0)
    setFirstTryCorrect(0)
    setCoins(0)
    setPhase('aim')
    setOverlay(null)
    setHint(false)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    consignePromiseRef.current = speakConsigne(first)
  }

  // ---------- Interactions ----------

  const toggleCut = (cut: number): void => {
    if (!item || item.kind !== 'cut' || phase !== 'aim') return
    setCuts((cs) => {
      const has = cs.includes(cut)
      sfx(has ? 'pop' : 'whoosh') // le couteau tranche, doux
      return has ? cs.filter((c) => c !== cut) : [...cs, cut]
    })
    giveHelpOnce('pzf.consigne.coupe-aide')
  }

  const toggleSlice = (index: number): void => {
    if (!item || (item.kind !== 'serve' && item.kind !== 'label') || phase !== 'aim') return
    if (item.kind === 'label') return // au tier étiquette, les parts sont déjà servies
    setSelected((sel) => {
      const next = new Set(sel)
      if (next.has(index)) {
        next.delete(index)
        sfx('pop')
      } else {
        next.add(index)
        sfx('whoosh') // le fromage file vers l'assiette
      }
      return next
    })
    giveHelpOnce('pzf.consigne.sers')
  }

  // ---------- Résolution ----------

  const resolveSuccess = (clipId: string): void => {
    // Résolution de l'item : maîtrise + Tuner, UNE seule fois par commande.
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setCoins((c) => c + (wasFirst ? 2 : 1)) // le pourboire (cosmétique)
    setPhase('success')
    sfx('coin')
    // L'overlay attend la fin du clip et arrive inconditionnellement.
    void say(E(clipId)).then(() => setOverlay('success'))
  }

  const fail = (clipId: string): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    void say(E(clipId)).then(() => setOverlay('retry'))
  }

  const onValidate = (): void => {
    if (!item || phase !== 'aim') return
    // Invalide la consigne en cours : le verdict ne doit jamais être chevauché.
    seqRef.current += 1

    if (item.kind === 'cut') {
      const check = checkCuts(item.support, cuts, item.parts)
      if (check.ok) {
        resolveSuccess('pzf.bravo-coupe')
        return
      }
      setCutCheck(check)
      fail('pzf.oups')
      return
    }

    if (item.kind === 'serve') {
      if (servedFraction(selected.size, item.totalParts, item.target)) {
        resolveSuccess(
          item.target.num === item.target.den
            ? 'pzf.gag.appetit'
            : pick(['pzf.miam', 'pzf.merci']),
        )
        return
      }
      const needed = neededParts(item.target, item.totalParts) ?? 0
      fail(selected.size > needed ? 'pzf.teach.trop' : 'pzf.teach.pas-assez')
    }
  }

  const onPickTicket = (choice: Frac): void => {
    if (!item || item.kind !== 'label' || phase !== 'aim') return
    seqRef.current += 1
    sfx('tap')
    if (fracEquals(choice, item.target)) {
      resolveSuccess(pick(['pzf.miam', 'pzf.merci']))
      return
    }
    fail('pzf.oups')
  }

  /** Feedback élaboratif : montrer POURQUOI, puis nouvel essai, même commande. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('teach')
    sfx('magic')
    try {
      if (item.kind === 'cut') {
        if (cutCheck?.reason === 'count') {
          await say(E('pzf.teach.nombre'))
          if (seqRef.current === seq) await say(E(`pzf.parts.${item.parts}`), { interrupt: false })
        } else {
          await say(E('pzf.teach.inegal'))
        }
      } else if (item.kind === 'serve') {
        const equiv = item.totalParts !== item.target.den
        await say(E(equiv ? 'pzf.teach.equiv' : 'pzf.teach.compte'))
      } else {
        await say(E('pzf.teach.etiquette'))
      }
      if (seqRef.current === seq) await wait(700)
    } finally {
      // Restauration INCONDITIONNELLE (anti soft-lock) : on revient toujours
      // en phase de visée — les coupes/parts restent, l'enfant ajuste.
      setCutCheck(null)
      setPhase('aim')
    }
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      const clip =
        item.kind === 'cut'
          ? 'pzf.indice.coupe'
          : item.kind === 'serve'
            ? 'pzf.indice.sers'
            : 'pzf.indice.etiquette'
      void say(E(clip), { interrupt: false })
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
    const next = generateItem(tier, tunerRef.current.level, itemKey(item), done)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setCuts([])
    setSelected(new Set())
    setCutCheck(null)
    setPhase('aim')
    setItem(next)
    consignePromiseRef.current = speakConsigne(next)
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

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🍕
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('pzf.intro')} autoPlay />
        </div>
        <div
          className="relative flex h-24 w-full max-w-sm items-center justify-center gap-3 overflow-hidden rounded-card shadow-card"
          style={TABLECLOTH}
          aria-hidden="true"
        >
          <span className="pzf-flame text-3xl">🔥</span>
          <span className="text-4xl">🍕</span>
          <span className="text-3xl">🔪</span>
          <span className="text-4xl">🍰</span>
          <span className="absolute top-1 left-3 text-sm">🇮🇹</span>
          <span className="absolute top-1 right-3 text-sm">🇮🇹</span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Les clients ont faim : coupe et sers les parts égales !
        </p>
        <div className="grid w-full grid-cols-3 gap-3">
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
                  void say(E(`pzf.niveau.${t}`))
                }}
                className={`tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95 ${locked ? 'opacity-50' : ''}`}
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {locked ? '🔒' : info.emoji}
                </span>
                <span className="text-base leading-tight font-extrabold text-ink">{info.name}</span>
                <span className="text-xs leading-tight font-semibold text-ink-soft">{info.sub}</span>
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

  /** Bulle de commande du client (toujours doublée par la voix). */
  const renderOrder = (it: PzfItem): ReactNode => {
    return (
      <div className="flex items-center justify-center gap-3">
        <span aria-hidden="true" className="animate-floaty text-5xl">{it.client}</span>
        <div className="card relative max-w-64 px-4 py-2">
          {it.kind === 'cut' && (
            <p className="text-lg leading-snug font-extrabold text-ink">
              Coupe {it.support === 'pizza' ? 'la pizza' : 'le gâteau'} en{' '}
              <span style={{ color: ACCENT }}>{it.parts} parts égales</span> !
            </p>
          )}
          {it.kind === 'serve' &&
            (it.written ? (
              <div className="flex items-center gap-3">
                <FracTicket f={it.target} big />
                <p className="text-base leading-snug font-extrabold text-ink-soft">sur le ticket !</p>
              </div>
            ) : (
              <p className="text-lg leading-snug font-extrabold text-ink">
                Donne-moi <span style={{ color: ACCENT }}>{fracText(it.target)}</span> !
              </p>
            ))}
          {it.kind === 'label' && (
            <p className="text-lg leading-snug font-extrabold text-ink">Tape le bon ticket !</p>
          )}
        </div>
      </div>
    )
  }

  const renderPlay = (it: PzfItem): ReactNode => {
    const teaching = phase === 'teach'
    const boardDisabled = phase !== 'aim'

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-3 pb-6">
        {renderOrder(it)}

        <div
          className="relative flex w-full flex-col items-center gap-2 rounded-card p-3 shadow-card"
          style={TABLECLOTH}
        >
          {/* Le four à bois ronfle dans le coin */}
          <span aria-hidden="true" className="pzf-flame absolute top-2 right-3 text-2xl">🔥</span>

          {it.kind === 'cut' &&
            (it.support === 'pizza' ? (
              <CutPizza
                cuts={cuts}
                onToggle={toggleCut}
                check={phase === 'error' || teaching ? cutCheck : null}
                hintCuts={hint && phase === 'aim' ? correctCuts(it.support, it.parts) : null}
                disabled={boardDisabled}
              />
            ) : (
              <CutGateau
                cuts={cuts}
                onToggle={toggleCut}
                check={phase === 'error' || teaching ? cutCheck : null}
                hintCuts={hint && phase === 'aim' ? correctCuts(it.support, it.parts) : null}
                disabled={boardDisabled}
              />
            ))}

          {it.kind === 'cut' && (phase === 'error' || teaching) && cutCheck?.reason === 'unequal' && (
            <Balance sizes={cutCheck.sizes} />
          )}

          {it.kind === 'serve' && (
            <>
              <ServeBoard
                support={it.support}
                totalParts={it.totalParts}
                selected={selected}
                onToggle={toggleSlice}
                hintCount={hint && phase === 'aim' ? neededParts(it.target, it.totalParts) : null}
                disabled={boardDisabled}
              />
              <ClientPlate
                client={it.client}
                support={it.support}
                count={selected.size}
                ghostSlots={teaching ? neededParts(it.target, it.totalParts) : null}
              />
            </>
          )}

          {it.kind === 'label' && (
            <>
              <ServeBoard
                support={it.support}
                totalParts={it.totalParts}
                selected={new Set(Array.from({ length: it.served }, (_, i) => i))}
                onToggle={toggleSlice}
                hintCount={null}
                disabled
              />
              <ClientPlate
                client={it.client}
                support={it.support}
                count={it.served}
                ghostSlots={teaching ? it.served : null}
              />
            </>
          )}
        </div>

        {(it.kind === 'cut' || it.kind === 'serve') && (
          <BigButton
            variant="accent"
            accent={ACCENT}
            className="w-full max-w-xs text-2xl"
            disabled={phase !== 'aim' || (it.kind === 'cut' ? cuts.length === 0 : selected.size === 0)}
            onClick={onValidate}
          >
            {it.kind === 'cut' ? 'C’est coupé ! 🔪' : 'C’est servi ! 🍽️'}
          </BigButton>
        )}

        {it.kind === 'label' && (
          <div className="grid w-full max-w-md grid-cols-3 gap-3">
            {it.choices.map((choice) => {
              const isTarget = fracEquals(choice, it.target)
              return (
                <button
                  key={`${choice.num}-${choice.den}`}
                  type="button"
                  onClick={() => onPickTicket(choice)}
                  disabled={phase !== 'aim'}
                  aria-label={`Ticket ${choice.num} sur ${choice.den}`}
                  className={`tap-target card flex min-h-20 items-center justify-center p-3 transition-transform active:scale-95 ${hint && phase === 'aim' && isTarget ? 'pzf-pulse' : ''}`}
                  style={{ borderBottom: `5px solid ${ACCENT}` }}
                >
                  <FracTicket f={choice} big />
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={
        screen === 'play' ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-extrabold text-ink" aria-label={`${coins} pièces de pourboire`}>
              🪙 {coins}
            </span>
            <ProgressDots total={ITEMS_PER_RUN} done={resolved} />
          </div>
        ) : undefined
      }
      onReplayInstruction={replayInstruction}
    >
      <PzfStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && item && renderPlay(item)}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouvelle recette débloquée !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
