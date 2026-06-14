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
  CELL_COUNT,
  colOf,
  FRESH_PROGRESS,
  generateItem,
  guideReaches,
  GRID,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  neighbor,
  nextHint,
  PLAN,
  reached,
  ROOMS_BY_ID,
  roomIdAt,
  rowOf,
  starsFor,
  step,
  TIER_SKILLS,
  walkable,
} from './logic'
import type { Dir, PlumeItem, PlumeProgress, TierId } from './logic'

// ============================================================
// L'École de Plume — plan d'école sur grille 5×5. L'enfant produit :
// il LOCALISE une salle (T0), désigne la case VOISINE de Plume (T1),
// puis COMPOSE un itinéraire de flèches pour guider Plume jusqu'à la
// salle cible (T2/T3). « Se repérer sur un plan » et « suivre un
// itinéraire ». Zéro QCM, tout audio-guidé.
// ============================================================

const STORE_KEY = 'game:ecole-plume'

const META: GameMeta = GAMES_BY_ID.get('ecole-plume') ?? {
  id: 'ecole-plume',
  title: 'L’École de Plume',
  tagline: 'Guide Plume dans toute l’école !',
  icon: '🗺️',
  island: 'monde',
  accent: '#43a047',
  skills: [...new Set(TIER_SKILLS)],
  status: 'v2',
}
const ACCENT = META.accent

const TIER_INFO: ReadonlyArray<{ emoji: string; name: string; sub: string }> = [
  { emoji: '📍', name: 'Trouve la salle', sub: 'Appuie sur la bonne salle' },
  { emoji: '🧭', name: 'Qui est à côté ?', sub: 'La case voisine de Plume' },
  { emoji: '🐾', name: 'Guide Plume', sub: 'Trace un chemin court' },
  { emoji: '🗺️', name: 'Grand voyage', sub: 'Un chemin plus long' },
]

const DIR_INFO: Readonly<Record<Dir, { arrow: string; label: string }>> = {
  up: { arrow: '⬆️', label: 'au-dessus' },
  down: { arrow: '⬇️', label: 'en-dessous' },
  left: { arrow: '⬅️', label: 'à gauche' },
  right: { arrow: '➡️', label: 'à droite' },
}

const GUIDE_DIRS: readonly Dir[] = ['up', 'left', 'right', 'down']

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

// ---------- Helpers d'affichage ----------

function instructionText(it: PlumeItem): string {
  if (it.mode === 'find') {
    return `Trouve : ${ROOMS_BY_ID.get(it.roomId)?.name ?? ''}`
  }
  if (it.mode === 'adjacent') {
    return `Quelle case est ${DIR_INFO[it.dir].label} de Plume ?`
  }
  const room = roomIdAt(it.targetIdx)
  return `Guide Plume jusqu'à : ${room ? (ROOMS_BY_ID.get(room)?.name ?? '') : ''}`
}

type Screen = 'menu' | 'play' | 'end'
type Phase = 'idle' | 'success' | 'error'

export default function EcolePlume() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<PlumeProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tier, setTier] = useState<TierId>(0)
  const [item, setItem] = useState<PlumeItem | null>(null)
  /** Position courante de Plume en mode guider. */
  const [plumePos, setPlumePos] = useState(0)
  /** Flèches déjà jouées en mode guider (pour rejouer / annuler implicite). */
  const [trail, setTrail] = useState<Dir[]>([])
  const [resolved, setResolved] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const [wrongIdx, setWrongIdx] = useState<number | null>(null)
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
    void pget<PlumeProgress>(STORE_KEY).then((stored) => {
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

  const speakConsigne = useCallback(async (it: PlumeItem): Promise<void> => {
    const seq = ++seqRef.current
    if (it.mode === 'find') {
      await say(E(`epl.va.${it.roomId}`))
      return
    }
    if (it.mode === 'adjacent') {
      await say(E(`epl.dir.${it.dir}`))
      if (seqRef.current !== seq) return
      await say(E('epl.consigne.adjacent'), { interrupt: false })
      return
    }
    const room = roomIdAt(it.targetIdx)
    if (room) await say(E(`epl.va.${room}`))
    if (seqRef.current !== seq) return
    await say(E('epl.consigne.guide'), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play' && item) void speakConsigne(item)
    else void say(E('epl.intro'))
  }, [screen, item, speakConsigne])

  // ---------- Déroulé d'une partie ----------

  const setupItem = (it: PlumeItem): void => {
    setItem(it)
    setTrail([])
    setWrongIdx(null)
    if (it.mode === 'guide') setPlumePos(it.startIdx)
    else if (it.mode === 'adjacent') setPlumePos(it.plumeIdx)
    else setPlumePos(-1)
  }

  const startRun = (t: TierId): void => {
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    firstTryRef.current = true
    failsRef.current = 0
    const first = generateItem(t, 0)
    setTier(t)
    setResolved(0)
    setFirstTryCorrect(0)
    setPhase('idle')
    setOverlay(null)
    setHint(false)
    setResult(null)
    setNewUnlock(false)
    setupItem(first)
    setScreen('play')
    void speakConsigne(first)
  }

  /** Résolution réussie d'un item : maîtrise + Tuner, UNE seule fois. */
  const resolveSuccess = (it: PlumeItem, successClip: string): void => {
    const wasFirst = firstTryRef.current
    void recordAttempt(TIER_SKILLS[it.tier], wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('success')
    setAnimKey((k) => k + 1)
    sfx('magic')
    void say(E(successClip))
    window.setTimeout(() => setOverlay('success'), 700)
  }

  /** Un essai raté : firstTry tombe, le compteur d'erreurs monte. */
  const registerFail = (reactionClip: string): void => {
    firstTryRef.current = false
    failsRef.current += 1
    setPhase('error')
    setAnimKey((k) => k + 1)
    sfx('wrong')
    setOverlay('retry')
    void say(E(reactionClip))
  }

  // ---------- T0 : trouver / T1 : voisin (tap d'une case) ----------

  const onTapCell = (idx: number): void => {
    if (!item || phase !== 'idle') return
    if (item.mode === 'find') {
      if (roomIdAt(idx) === null) return // on ne tape que des salles
      if (idx === item.answerIdx) {
        sfx('pop')
        resolveSuccess(item, 'epl.trouve')
        return
      }
      setWrongIdx(idx)
      registerFail('epl.presque')
      return
    }
    if (item.mode === 'adjacent') {
      if (idx === item.plumeIdx) return // on ne tape pas Plume elle-même
      if (idx === item.answerIdx) {
        sfx('pop')
        resolveSuccess(item, 'epl.voisin-ok')
        return
      }
      setWrongIdx(idx)
      registerFail('epl.presque')
      return
    }
  }

  // ---------- T2/T3 : guider (tap d'une flèche) ----------

  const onTapArrow = (dir: Dir): void => {
    if (!item || item.mode !== 'guide' || phase !== 'idle') return
    const n = neighbor(plumePos, dir)
    if (n === null || !walkable(n)) {
      // Mur ou bord : micro-feedback sans pénalité réelle, Plume ne bouge pas.
      sfx('slide')
      setAnimKey((k) => k + 1)
      void say(E('epl.mur'))
      return
    }
    sfx('whoosh')
    const nextPos = step(plumePos, dir)
    const nextTrail = [...trail, dir]
    setPlumePos(nextPos)
    setTrail(nextTrail)
    setAnimKey((k) => k + 1)
    if (reached(nextPos, item.targetIdx)) {
      resolveSuccess(item, 'epl.bravo')
      return
    }
    // Trajet « impasse » : pas de chemin plus court possible ne devrait pas
    // arriver (toujours connexe). On ne pénalise qu'à la demande de validation.
  }

  /** L'enfant déclare avoir fini son chemin sans avoir atteint la salle. */
  const onCheckGuide = (): void => {
    if (!item || item.mode !== 'guide' || phase !== 'idle') return
    if (guideReaches(item, trail)) return // sécurité : déjà géré au tap
    registerFail('epl.rate')
  }

  // ---------- Feedback élaboratif + suite ----------

  /** Après une erreur : on rappelle la notion, puis indice si besoin. */
  const runTeaching = async (): Promise<void> => {
    if (!item) return
    const seq = ++seqRef.current
    setPhase('idle')
    setWrongIdx(null)
    if (item.mode === 'guide') {
      // On replace Plume au départ pour re-tenter le trajet.
      setPlumePos(item.startIdx)
      setTrail([])
    }
    await say(E(`epl.consigne.${item.mode}`))
    if (seqRef.current !== seq) return
    if (failsRef.current >= 2 && !hint) {
      setHint(true)
      await say(E(`epl.aide.${item.mode}`), { interrupt: false })
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
    const avoid =
      item.mode === 'find'
        ? item.answerIdx
        : item.mode === 'adjacent'
          ? item.plumeIdx
          : item.targetIdx
    const next = generateItem(item.tier, tunerRef.current.level, avoid)
    firstTryRef.current = true
    failsRef.current = 0
    setHint(false)
    setPhase('idle')
    setupItem(next)
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

  // ---------- Rendu du plan 5×5 ----------

  /** Index de la case actuellement « surlignée » par l'indice, ou null. */
  const hintCell = ((): number | null => {
    if (!hint || !item) return null
    if (item.mode === 'find') return item.answerIdx
    if (item.mode === 'adjacent') return item.answerIdx
    const dir = nextHint(plumePos, item.targetIdx)
    return dir === null ? null : neighbor(plumePos, dir)
  })()

  const renderCell = (idx: number): ReactNode => {
    const cell = PLAN[idx]
    const room = cell.kind === 'room' ? ROOMS_BY_ID.get(cell.roomId ?? '') : undefined
    const isWall = cell.kind === 'wall'
    const isPlume =
      item !== null && item.mode !== 'find' && plumePos === idx && plumePos >= 0
    const isTarget = item?.mode === 'guide' && idx === item.targetIdx
    const glow = hintCell === idx
    const isWrong = wrongIdx === idx
    const onPlan = item !== null && (item.mode === 'find' || item.mode === 'adjacent')
    const tappable = onPlan && !isWall && phase === 'idle'

    const base =
      'relative flex aspect-square items-center justify-center rounded-2xl text-2xl sm:text-3xl select-none transition-transform'
    const skin = isWall
      ? 'bg-black/10'
      : room
        ? 'bg-white shadow-sm'
        : 'bg-white/55'

    return (
      <button
        key={idx}
        type="button"
        disabled={!tappable}
        onClick={() => onTapCell(idx)}
        aria-label={
          isWall
            ? 'mur'
            : room
              ? room.name
              : `couloir ligne ${rowOf(idx) + 1} colonne ${colOf(idx) + 1}`
        }
        className={`${base} ${skin} ${tappable ? 'cursor-pointer active:scale-90' : 'cursor-default'} ${
          glow ? 'animate-pulse-glow' : ''
        } ${isWrong ? 'animate-shake-soft' : ''}`}
        style={
          isTarget && !isPlume
            ? { outline: `4px solid ${ACCENT}`, outlineOffset: '-4px' }
            : undefined
        }
      >
        {isWall ? (
          <span aria-hidden="true" className="text-xl opacity-50">
            🧱
          </span>
        ) : isPlume ? (
          <span key={animKey} aria-hidden="true" className="animate-bounce-in text-3xl sm:text-4xl">
            🦜
          </span>
        ) : isTarget ? (
          <span aria-hidden="true" className="animate-floaty">
            {room?.emoji}
          </span>
        ) : room ? (
          <span aria-hidden="true">{room.emoji}</span>
        ) : null}
      </button>
    )
  }

  const renderPlan = (): ReactNode => (
    <div
      className="grid w-full max-w-[22rem] gap-1.5 sm:max-w-md sm:gap-2"
      style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }}
      role="grid"
      aria-label="Plan de l’école"
    >
      {Array.from({ length: CELL_COUNT }, (_, idx) => renderCell(idx))}
    </div>
  )

  const renderArrows = (): ReactNode => (
    <div className="flex flex-col items-center gap-2">
      <div className="grid grid-cols-3 gap-2" aria-label="Flèches de direction">
        {GUIDE_DIRS.map((dir, i) => {
          // Disposition en croix : up en haut-centre, left/right au milieu, down en bas-centre.
          const place =
            dir === 'up'
              ? 'col-start-2'
              : dir === 'left'
                ? 'col-start-1 row-start-2'
                : dir === 'right'
                  ? 'col-start-3 row-start-2'
                  : 'col-start-2 row-start-3'
          return (
            <button
              key={dir}
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => onTapArrow(dir)}
              aria-label={`Avancer ${DIR_INFO[dir].label}`}
              className={`tap-target card flex items-center justify-center text-3xl transition-transform active:scale-90 ${place} ${
                i < 0 ? 'animate-pop' : ''
              }`}
            >
              <span aria-hidden="true">{DIR_INFO[dir].arrow}</span>
            </button>
          )
        })}
      </div>
      {trail.length > 0 && (
        <BigButton
          variant="soft"
          className="text-base"
          disabled={phase !== 'idle'}
          onClick={onCheckGuide}
        >
          J’ai fini le chemin
        </BigButton>
      )}
    </div>
  )

  // ---------- Rendus d'écran ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🗺️
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('epl.intro')} autoPlay />
        </div>
        <div className="text-6xl" aria-hidden="true">
          🦜🗺️🚪
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Aide Plume à se repérer dans toute l’école !
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
                  void say(E(`epl.niveau.${t}`))
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

  const renderPlay = (it: PlumeItem): ReactNode => (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-3 px-3 pb-6">
      <p className="text-center text-lg font-extrabold text-ink">{instructionText(it)}</p>
      {it.mode === 'adjacent' && (
        <div className="flex items-center gap-2 text-2xl" aria-hidden="true">
          <span className="animate-wiggle">{DIR_INFO[it.dir].arrow}</span>
          <span className="text-sm font-semibold text-ink-soft">{DIR_INFO[it.dir].label}</span>
        </div>
      )}
      {renderPlan()}
      {it.mode === 'guide' && renderArrows()}
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
