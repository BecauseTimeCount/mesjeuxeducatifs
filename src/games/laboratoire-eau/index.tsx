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
  addSouvenir,
  applyRun,
  applyTool,
  classifyAction,
  FRESH_PROGRESS,
  generateMission,
  GOALS,
  gouttePos,
  INITIAL_STATE,
  MAX_SOUVENIRS,
  MAX_TUNER_LEVEL,
  MISSIONS_PER_RUN,
  nextStep,
  starsFor,
  stateEmojis,
  stepsForTier,
  TIER_SKILLS,
} from './logic'
import type {
  Action,
  EffectId,
  GoalId,
  GoutteSpot,
  LdeProgress,
  Mission,
  TierId,
  Tool,
  WaterState,
  Zone,
} from './logic'

// ============================================================
// Le Laboratoire de l'Eau — sandbox à missions sur le cycle de
// l'eau. Tap-outil-puis-tap-zone : chauffer ☀️ ou refroidir ❄️
// le lac, le ciel ou la montagne. La physique est honnête, les
// erreurs transforment quand même, Goutte 💧 commente le voyage.
// ============================================================

const STORE_KEY = 'game:laboratoire-eau'
const SOUVENIRS_KEY = 'game:laboratoire-eau:souvenirs'

const META: GameMeta = GAMES_BY_ID.get('laboratoire-eau') ?? {
  id: 'laboratoire-eau',
  title: 'Le Laboratoire de l’Eau',
  tagline: 'Chauffe, gèle, fais voyager la goutte !',
  icon: '💧',
  island: 'monde',
  accent: '#0277bd',
  skills: ['mo.gs.eau.etats', 'mo.cp.eau.cycle'],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '🧊', name: 'La mare aux découvertes', sub: 'Une action' },
  { emoji: '☁️', name: 'L’atelier des nuages', sub: 'Deux actions' },
  { emoji: '🌧️', name: 'La pluie et le beau temps', sub: 'Trois actions' },
  { emoji: '🏔️', name: 'Le grand voyage de l’eau', sub: 'Le cycle complet' },
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

/** Clips de structure préchargés (les effets/gags se chargent à la demande
 *  pour ne pas déborder le cache LRU Howler, ~30 entrées). */
const PRELOAD_IDS = corpus.entries
  .map((e) => e.id)
  .filter((id) => !id.startsWith('lde.etat.') && !id.startsWith('lde.gag.'))

// ---------- Keyframes locales du jeu ----------

function LdeStyles() {
  return (
    <style>{`
@keyframes lde-fall {
  0% { transform: translateY(-10px); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(110px); opacity: 0; }
}
.lde-fall { animation: lde-fall 1.3s linear infinite; }
@keyframes lde-snow {
  0% { transform: translateY(-10px) translateX(0); opacity: 0; }
  15% { opacity: 1; }
  50% { transform: translateY(55px) translateX(8px); }
  100% { transform: translateY(120px) translateX(-6px); opacity: 0; }
}
.lde-snow { animation: lde-snow 2.6s ease-in-out infinite; }
@keyframes lde-steam {
  0% { transform: translateY(16px) scaleX(1); opacity: 0; }
  30% { opacity: 0.85; }
  100% { transform: translateY(-44px) scaleX(1.6); opacity: 0; }
}
.lde-steam { animation: lde-steam 2.2s ease-out infinite; }
@keyframes lde-wave {
  0% { transform: translateX(0); }
  100% { transform: translateX(-64px); }
}
.lde-wave { animation: lde-wave 5s linear infinite; }
@keyframes lde-shimmer {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.9; }
}
.lde-shimmer { animation: lde-shimmer 2.4s ease-in-out infinite; }
@keyframes lde-stream {
  0% { background-position: 0 0; }
  100% { background-position: 0 28px; }
}
.lde-stream { animation: lde-stream 0.8s linear infinite; }
@keyframes lde-glow {
  0%, 100% { box-shadow: inset 0 0 0 4px rgba(255, 201, 77, 0.35); }
  50% { box-shadow: inset 0 0 28px 10px rgba(255, 201, 77, 0.75); }
}
.lde-glow { animation: lde-glow 1.2s ease-in-out infinite; border-radius: 1rem; }
@keyframes lde-pulse-tool {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
.lde-pulse-tool { animation: lde-pulse-tool 0.9s ease-in-out infinite; }
`}</style>
  )
}

// ---------- La scène de nature ----------

/** Position de Goutte (en % de la scène) pour chaque endroit du voyage. */
const GOUTTE_XY: Readonly<Record<GoutteSpot, { left: string; top: string }>> = {
  lac: { left: '62%', top: '84%' },
  glace: { left: '62%', top: '84%' },
  vapeur: { left: '58%', top: '40%' },
  nuage: { left: '52%', top: '16%' },
  pluie: { left: '56%', top: '30%' },
  neige: { left: '46%', top: '30%' },
  sommet: { left: '22%', top: '44%' },
  ruisseau: { left: '30%', top: '64%' },
}

const SPOT_LABEL: Readonly<Record<GoutteSpot, string>> = {
  lac: 'Goutte nage dans le lac',
  glace: 'Goutte est prise dans la glace',
  vapeur: 'Goutte monte en vapeur',
  nuage: 'Goutte flotte dans le nuage',
  pluie: 'Goutte tombe en pluie',
  neige: 'Goutte tombe en flocon',
  sommet: 'Goutte est posée sur la neige du sommet',
  ruisseau: 'Goutte glisse dans le ruisseau',
}

function Goutte({ spot }: { spot: GoutteSpot }) {
  const xy = GOUTTE_XY[spot]
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: xy.left, top: xy.top, transition: 'left 0.9s ease-in-out, top 0.9s ease-in-out' }}
      role="img"
      aria-label={SPOT_LABEL[spot]}
    >
      <div className="animate-floaty relative text-5xl leading-none drop-shadow-md">
        <span aria-hidden="true">💧</span>
        {/* Les yeux de Goutte */}
        <span aria-hidden="true" className="absolute top-[52%] left-[24%] flex w-[52%] justify-between">
          <span className="flex h-2.5 w-2 items-center justify-center rounded-full bg-white">
            <span className="h-1 w-1 rounded-full bg-ink" />
          </span>
          <span className="flex h-2.5 w-2 items-center justify-center rounded-full bg-white">
            <span className="h-1 w-1 rounded-full bg-ink" />
          </span>
        </span>
      </div>
    </div>
  )
}

const RAIN_DROPS: ReadonlyArray<{ left: string; delay: number }> = [
  { left: '12%', delay: 0 },
  { left: '26%', delay: 0.5 },
  { left: '40%', delay: 0.2 },
  { left: '54%', delay: 0.8 },
  { left: '68%', delay: 0.35 },
  { left: '82%', delay: 0.65 },
]

const ZONE_LABEL: Readonly<Record<Zone, string>> = {
  ciel: 'Le ciel',
  sommet: 'La montagne',
  lac: 'Le lac',
}

interface SceneProps {
  water: WaterState
  /** Indice actif : la zone cible brille */
  hintZone: Zone | null
  disabled: boolean
  onZone: (zone: Zone) => void
}

/** La scène vivante : ciel (0-44 %), montagne (44-72 %), lac (72-100 %).
 *  Trois grandes bandes tappables ≥ 64 px, visuels en pur CSS/emoji. */
function Scene({ water, hintZone, disabled, onZone }: SceneProps) {
  const zoneButton = (zone: Zone, style: CSSProperties, children: ReactNode): ReactNode => (
    <button
      type="button"
      aria-label={ZONE_LABEL[zone]}
      disabled={disabled}
      onClick={() => onZone(zone)}
      className={`absolute inset-x-0 z-10 overflow-hidden text-left transition-opacity active:opacity-80 ${hintZone === zone ? 'lde-glow' : ''}`}
      style={style}
    >
      {children}
    </button>
  )

  return (
    <div
      className="relative aspect-[7/8] w-full overflow-hidden rounded-card shadow-card select-none sm:aspect-[16/10]"
      style={{ background: 'linear-gradient(180deg, #aee3f7 0%, #cdeefb 42%, #bfe6d8 44%, #a5d9c8 72%, transparent 72%)' }}
    >
      {/* ---------- Le ciel ---------- */}
      {zoneButton(
        'ciel',
        { top: 0, height: '44%' },
        <>
          <span aria-hidden="true" className="absolute top-2 right-3 text-4xl sm:text-5xl">
            ☀️
          </span>
          {water.ciel === 'vapeur' && (
            <span aria-hidden="true">
              {['30%', '48%', '64%'].map((left, i) => (
                <span
                  key={left}
                  className="lde-steam absolute bottom-0 h-14 w-7 rounded-full"
                  style={{
                    left,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0))',
                    animationDelay: `${i * 0.6}s`,
                  }}
                />
              ))}
              <span className="absolute bottom-6 left-[52%] text-2xl opacity-80">💨</span>
            </span>
          )}
          {water.ciel !== 'vide' && water.ciel !== 'vapeur' && (
            <span
              aria-hidden="true"
              className={`animate-floaty absolute top-1 left-[40%] text-6xl sm:text-7xl ${water.ciel === 'neige' ? 'grayscale' : ''}`}
              style={water.ciel === 'pluie' ? { filter: 'brightness(0.85)' } : undefined}
            >
              ☁️
            </span>
          )}
          {water.ciel === 'pluie' && (
            <span aria-hidden="true">
              {RAIN_DROPS.map((d) => (
                <span
                  key={d.left}
                  className="lde-fall absolute top-[45%] text-base text-sky-700"
                  style={{ left: d.left, animationDelay: `${d.delay}s` }}
                >
                  💧
                </span>
              ))}
            </span>
          )}
          {water.ciel === 'neige' && (
            <span aria-hidden="true">
              {RAIN_DROPS.map((d) => (
                <span
                  key={d.left}
                  className="lde-snow absolute top-[40%] text-base"
                  style={{ left: d.left, animationDelay: `${d.delay * 1.6}s` }}
                >
                  ❄️
                </span>
              ))}
            </span>
          )}
        </>,
      )}

      {/* ---------- La montagne ---------- */}
      {zoneButton(
        'sommet',
        { top: '44%', height: '28%' },
        <>
          <span aria-hidden="true" className="absolute bottom-0 left-[4%] text-7xl leading-none sm:text-8xl">
            {water.sommet === 'neige' ? '🏔️' : '⛰️'}
          </span>
          <span aria-hidden="true" className="absolute right-[6%] bottom-0 text-3xl">
            🌲
          </span>
          <span aria-hidden="true" className="absolute right-[20%] bottom-0 text-2xl">
            🌳
          </span>
        </>,
      )}

      {/* Le ruisseau descend de la montagne vers le lac (hors zone, décor) */}
      {water.sommet === 'ruisseau' && (
        <span aria-hidden="true">
          <span
            className="lde-stream absolute z-0 rounded-full"
            style={{
              left: '26%',
              top: '50%',
              width: 10,
              height: '26%',
              transform: 'rotate(14deg)',
              background:
                'repeating-linear-gradient(180deg, #4fc3f7 0, #4fc3f7 14px, #0277bd 14px, #0277bd 28px)',
            }}
          />
          <span className="absolute z-0 text-xl" style={{ left: '24%', top: '70%' }}>
            💦
          </span>
        </span>
      )}

      {/* ---------- Le lac ---------- */}
      {zoneButton(
        'lac',
        {
          top: '72%',
          height: '28%',
          background:
            water.lac === 'glace'
              ? 'linear-gradient(180deg, #d8f3fb 0%, #b3e2f2 100%)'
              : 'linear-gradient(180deg, #4fc3f7 0%, #0277bd 100%)',
        },
        water.lac === 'glace' ? (
          <span aria-hidden="true">
            <span className="lde-shimmer absolute top-1 left-[12%] text-xl">❄</span>
            <span className="lde-shimmer absolute top-5 left-[46%] text-lg" style={{ animationDelay: '0.9s' }}>
              ❄
            </span>
            <span className="lde-shimmer absolute top-2 left-[76%] text-xl" style={{ animationDelay: '1.5s' }}>
              ❄
            </span>
            <span className="absolute bottom-1 left-[30%] text-2xl">🧊</span>
            <span className="absolute right-[14%] bottom-2 text-2xl">🧊</span>
          </span>
        ) : (
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden">
            <span className="lde-wave absolute top-0 left-0 w-[200%] text-xl whitespace-nowrap opacity-70">
              {'🌊'.repeat(24)}
            </span>
            <span
              className="lde-wave absolute top-7 left-0 w-[200%] text-base whitespace-nowrap opacity-40"
              style={{ animationDelay: '-2.5s' }}
            >
              {'🌊'.repeat(30)}
            </span>
          </span>
        ),
      )}

      <Goutte spot={gouttePos(water)} />
    </div>
  )
}

// ---------- Les deux outils XXL ----------

interface ToolsProps {
  selected: Tool | null
  /** Indice actif : l'outil correct pulse */
  hintTool: Tool | null
  disabled: boolean
  onSelect: (tool: Tool) => void
}

function ToolBar({ selected, hintTool, disabled, onSelect }: ToolsProps) {
  const tools: ReadonlyArray<{ tool: Tool; emoji: string; label: string; bg: string }> = [
    { tool: 'chauffer', emoji: '☀️🔥', label: 'Chauffer', bg: '#f59e0b' },
    { tool: 'refroidir', emoji: '❄️', label: 'Refroidir', bg: '#0288d1' },
  ]
  return (
    <div className="flex w-full justify-center gap-3">
      {tools.map(({ tool, emoji, label, bg }) => {
        const active = selected === tool
        return (
          <BigButton
            key={tool}
            variant="accent"
            accent={bg}
            disabled={disabled}
            onClick={() => onSelect(tool)}
            className={`min-h-20 flex-1 max-w-52 text-2xl ${active ? 'ring-4 ring-ink ring-offset-2' : 'opacity-90'} ${hintTool === tool ? 'lde-pulse-tool' : ''}`}
          >
            <span aria-hidden="true" className="text-3xl">
              {emoji}
            </span>
            {label}
          </BigButton>
        )
      })}
    </div>
  )
}

// ---------- Le jeu ----------

type Screen = 'menu' | 'play' | 'bac' | 'end'

const EFFECT_SFX: Readonly<Record<EffectId, SfxName>> = {
  'fonte-lac': 'magic',
  evaporation: 'whoosh',
  'nuage-forme': 'magic',
  dissipation: 'whoosh',
  eclaircie: 'whoosh',
  'flocons-fondent': 'slide',
  'fonte-neige': 'whoosh',
  'ruisseau-fini': 'pop',
  gel: 'magic',
  condensation: 'magic',
  pluie: 'slide',
  neige: 'magic',
}

const MISSION_LABEL: Readonly<Record<GoalId, string>> = {
  'lac-glace': 'Transforme le lac en patinoire !',
  'lac-liquide': 'Fais fondre la glace du lac !',
  vapeur: 'Fais monter la vapeur !',
  nuage: 'Fabrique un nuage !',
  pluie: 'Fais tomber la pluie !',
  'neige-sommet': 'Couvre la montagne de neige !',
  ruisseau: 'Renvoie l’eau de la montagne au lac !',
}

export default function LaboratoireEau() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<LdeProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [water, setWater] = useState<WaterState>(INITIAL_STATE)
  const [mission, setMission] = useState<Mission | null>(null)
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [tool, setTool] = useState<Tool | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<Action | null>(null)
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [souvenirs, setSouvenirs] = useState<WaterState[]>([])
  const [burst, setBurst] = useState(0)
  const [newUnlock, setNewUnlock] = useState(false)
  const [result, setResult] = useState<LevelResult | null>(null)

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const contreRef = useRef(0)
  const recentGoalsRef = useRef<GoalId[]>([])
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)

  // Chargement progression + souvenirs + préchargement des clips de structure
  useEffect(() => {
    let alive = true
    void pget<LdeProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      const prog = stored ?? { ...FRESH_PROGRESS }
      setProgress(prog)
      setTier(Math.min(prog.unlockedTier, 3) as TierId)
    })
    void pget<WaterState[]>(SOUVENIRS_KEY).then((stored) => {
      if (alive && stored) setSouvenirs(stored)
    })
    preloadClips(PRELOAD_IDS)
    return () => {
      alive = false
      seqRef.current += 1
      stopSpeech()
    }
  }, [])

  // ---------- Audio ----------

  const speakMission = useCallback(async (m: Mission): Promise<void> => {
    const seq = ++seqRef.current
    await say(E(`lde.mission.${m.goalId}`))
    if (seqRef.current !== seq) return
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && mission) {
      if (!busy) void speakMission(mission)
      return
    }
    if (screen === 'bac') {
      void say(E('lde.mode.bac'))
      return
    }
    void say(E('lde.intro'))
  }, [screen, mission, busy, speakMission])

  // ---------- Démarrages ----------

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    contreRef.current = 0
    recentGoalsRef.current = []
    const first = generateMission(INITIAL_STATE, stepsForTier(t, 0))
    recentGoalsRef.current = [first.goalId]
    setTier(t)
    setWater(INITIAL_STATE)
    setMission(first)
    setResolved(0)
    setFirstTryCorrect(0)
    setTool(null)
    setBusy(false)
    setHint(null)
    setOverlay(null)
    setResult(null)
    setNewUnlock(false)
    setScreen('play')
    void speakMission(first)
  }

  const startBac = (): void => {
    seqRef.current += 1
    setWater(INITIAL_STATE)
    setMission(null)
    setTool(null)
    setBusy(false)
    setHint(null)
    setScreen('bac')
    void say(E('lde.mode.bac'))
  }

  const backToMenu = (): void => {
    seqRef.current += 1
    stopSpeech()
    setScreen('menu')
  }

  // ---------- Outils & zones ----------

  const onSelectTool = (t: Tool): void => {
    if (busy) return
    setTool(t)
    void say(E(`lde.outil.${t}`)).then(() => {
      void say(E('lde.consigne.zone'), { interrupt: false })
    })
  }

  const onZone = (zone: Zone): void => {
    if (busy) return
    if (!tool) {
      // Pas d'outil en main : petit nudge sonore, les outils sont en bas.
      sfx('slide')
      return
    }
    const seq = ++seqRef.current
    const before = water
    const r = applyTool(before, tool, zone)

    if (r.kind === 'gag') {
      // Action impossible : gag d'Henri, zéro pénalité, on continue.
      setBusy(true)
      sfx('pop')
      void say(E(`lde.gag.${r.gag}`)).then(() => setBusy(false))
      return
    }

    // La physique est honnête : la transformation se fait TOUJOURS.
    setBusy(true)
    setWater(r.state)
    setHint(null)
    sfx(EFFECT_SFX[r.effect])

    if (screen === 'bac' || !mission) {
      void say(E(`lde.etat.${r.effect}`)).then(() => setBusy(false))
      return
    }

    const cls = classifyAction(before, mission.goalId, tool, zone)
    const reached = GOALS[mission.goalId](r.state)

    void say(E(`lde.etat.${r.effect}`)).then(async () => {
      if (seqRef.current !== seq) return
      if (reached) {
        // Mission accomplie : maîtrise + Tuner, UNE seule fois par mission.
        const wasFirst = firstTryRef.current
        void recordAttempt(TIER_SKILLS[tier], wasFirst)
        tunerRef.current.onResult(wasFirst)
        if (wasFirst) setFirstTryCorrect((c) => c + 1)
        await say(E('lde.mission.reussie'), { interrupt: false })
        if (seqRef.current !== seq) return
        setOverlay('success')
        return
      }
      if (cls === 'contre') {
        // L'erreur enseigne : la transformation reste, Goutte recadre.
        firstTryRef.current = false
        contreRef.current += 1
        await say(E('lde.contre.rappel'), { interrupt: false })
        if (seqRef.current !== seq) return
        if (contreRef.current >= 2) {
          const step = nextStep(r.state, mission.goalId)
          if (step) {
            setHint(step)
            await say(E(`lde.indice.${step.tool}`), { interrupt: false })
            if (seqRef.current !== seq) return
          }
        }
      }
      setBusy(false)
    })
  }

  // ---------- Avancement des missions ----------

  const advance = (): void => {
    if (!mission) return
    const done = resolved + 1
    setResolved(done)
    setBusy(false)
    if (done >= MISSIONS_PER_RUN) {
      finishRun()
      return
    }
    const next = generateMission(
      water,
      stepsForTier(tier, tunerRef.current.level),
      recentGoalsRef.current,
    )
    recentGoalsRef.current = [next.goalId, ...recentGoalsRef.current].slice(0, 2)
    firstTryRef.current = true
    contreRef.current = 0
    setHint(null)
    setTool(null)
    setMission(next)
    void speakMission(next)
  }

  const finishRun = (): void => {
    const stars = starsFor(firstTryCorrect, MISSIONS_PER_RUN)
    setResult({ gameId: META.id, stars, firstTryCorrect, total: MISSIONS_PER_RUN })
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
    setOverlay(null)
    advance()
  }

  // ---------- Photo souvenir (bac à eau) ----------

  const takeSouvenir = (): void => {
    const album = addSouvenir(souvenirs, water)
    setSouvenirs(album)
    void pset(SOUVENIRS_KEY, album)
    setBurst((b) => b + 1)
    sfx('coin')
    void say(E('lde.souvenir'))
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            💧
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('lde.intro')} autoPlay />
        </div>
        <div
          className="relative flex h-24 w-full max-w-sm items-center justify-center gap-3 overflow-hidden rounded-card text-4xl shadow-card"
          style={{ background: 'linear-gradient(180deg, #aee3f7 0%, #4fc3f7 100%)' }}
          aria-hidden="true"
        >
          <span>☀️</span>
          <span className="animate-floaty">☁️</span>
          <span className="animate-floaty" style={{ animationDelay: '0.4s' }}>💧</span>
          <span>⛰️</span>
          <span>🌊</span>
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Chauffe ou refroidis l’eau, et fais voyager Goutte !
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
                  void say(E(`lde.niveau.${t}`))
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
        <BigButton variant="soft" className="w-full max-w-xs text-xl" onClick={startBac}>
          <span aria-hidden="true">🪣</span> Le bac à eau
        </BigButton>
      </div>
    )
  }

  const renderPlay = (m: Mission): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-3 pb-5">
      <div className="flex items-center justify-center gap-3">
        <SpeakerButton entry={E(`lde.mission.${m.goalId}`)} />
        <p className="max-w-64 text-center text-lg font-extrabold text-ink sm:max-w-none sm:text-xl">
          {MISSION_LABEL[m.goalId]}
        </p>
      </div>
      <Scene water={water} hintZone={hint?.zone ?? null} disabled={busy} onZone={onZone} />
      <ToolBar selected={tool} hintTool={hint?.tool ?? null} disabled={busy} onSelect={onSelectTool} />
    </div>
  )

  const renderBac = (): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-3 pb-5">
      <Scene water={water} hintZone={null} disabled={busy} onZone={onZone} />
      <ToolBar selected={tool} hintTool={null} disabled={busy} onSelect={onSelectTool} />
      <div className="flex w-full flex-wrap items-center justify-center gap-3">
        <BigButton variant="soft" className="text-lg" onClick={takeSouvenir}>
          <span aria-hidden="true">📸</span> Photo souvenir ({souvenirs.length}/{MAX_SOUVENIRS})
        </BigButton>
        <BigButton variant="soft" className="text-lg" onClick={backToMenu}>
          <span aria-hidden="true">🏠</span> Quitter le bac
        </BigButton>
      </div>
      {souvenirs.length > 0 && (
        <div className="flex w-full flex-wrap justify-center gap-2" aria-label="Album des photos souvenirs">
          {souvenirs.map((s, i) => {
            const [ciel, sommet, lac] = stateEmojis(s)
            return (
              <span
                key={i}
                className="card flex items-center gap-0.5 px-2 py-1 text-lg"
                role="img"
                aria-label={`Photo ${i + 1}`}
              >
                {ciel}
                {sommet}
                {lac}
              </span>
            )
          })}
        </div>
      )}
      <ConfettiBurst burst={burst} />
    </div>
  )

  return (
    <GameShell
      meta={META}
      hud={screen === 'play' ? <ProgressDots total={MISSIONS_PER_RUN} done={resolved} /> : undefined}
      onReplayInstruction={replayInstruction}
    >
      <LdeStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && mission && renderPlay(mission)}
      {screen === 'bac' && renderBac()}
      {screen === 'end' && result && (
        <div className="flex flex-1 flex-col">
          {newUnlock && (
            <div
              className="animate-bounce-in card mx-auto mt-3 flex items-center gap-2 px-5 py-2 text-lg font-extrabold"
              style={{ color: ACCENT }}
            >
              🔓 Nouveau laboratoire débloqué !
            </div>
          )}
          <LevelEnd result={result} onReplay={() => startRun(tier)} onHome={() => navigate('/')} />
        </div>
      )}
      <FeedbackOverlay kind={overlay} onDone={onOverlayDone} />
    </GameShell>
  )
}
