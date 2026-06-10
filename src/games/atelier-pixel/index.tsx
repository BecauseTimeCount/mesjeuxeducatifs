import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { numberEntry } from '@/content/numbers'
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
  addToGallery,
  applyRun,
  axisForLevel,
  checkGrid,
  colorClipId,
  colorCountFor,
  COLORS,
  coordLabel,
  copyPuzzle,
  emptyCells,
  FREE_COLORS,
  FREE_SIZE,
  FRESH_PROGRESS,
  generateCopyModel,
  generateDictee,
  generateMirrorPuzzle,
  gridSizeFor,
  gridsFor,
  hintCell,
  letterClipId,
  MAX_TUNER_LEVEL,
  mirrorSizeFor,
  MODE_SKILLS,
  paintCell,
  starsFor,
} from './logic'
import type {
  ApxProgress,
  Axis,
  Cell,
  DicteeCall,
  DicteePuzzle,
  ModeId,
  ObjectiveMode,
  Puzzle,
  SavedArt,
  Verdict,
} from './logic'

// ============================================================
// L'Atelier Pixel — peins les pixels : copie, miroir, mémoire,
// dictée de coordonnées… et l'atelier libre avec sa galerie.
// Tap couleur (sélection persistante) puis tap case. Zéro QCM.
// ============================================================

const STORE_KEY = 'game:atelier-pixel'
const GALLERY_KEY = 'game:atelier-pixel:galerie'

const META: GameMeta = GAMES_BY_ID.get('atelier-pixel') ?? {
  id: 'atelier-pixel',
  title: 'L’Atelier Pixel',
  tagline: 'Copie, miroir, mémoire… peins les pixels !',
  icon: '🎨',
  island: 'robots',
  accent: '#4527a0',
  skills: ['lo.gs.quadrillage', 'lo.cp.coordonnees', 'lo.cp.symetrie'],
  status: 'v2',
}
const ACCENT = META.accent

const EMPTY_CELL_BG = '#f1ecdf'
const LETTER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

const MODE_INFO: ReadonlyArray<{ id: ModeId; emoji: string; name: string; sub: string }> = [
  { id: 'copie', emoji: '🖼️', name: 'Copie', sub: 'Reproduis le modèle' },
  { id: 'miroir', emoji: '🪞', name: 'Miroir', sub: 'Complète le reflet' },
  { id: 'memoire', emoji: '🧠', name: 'Mémoire', sub: 'Le modèle se cache' },
  { id: 'dictee', emoji: '📢', name: 'Dictée', sub: 'Écoute la case' },
  { id: 'libre', emoji: '🖌️', name: 'Atelier libre', sub: 'Peins ce que tu veux' },
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

function ApxStyles() {
  return (
    <style>{`
@keyframes apx-wrong {
  0%, 100% { box-shadow: inset 0 0 0 3px rgba(255, 201, 77, 0.9); transform: scale(1); }
  50% { box-shadow: inset 0 0 0 5px rgba(255, 201, 77, 1); transform: scale(1.1); }
}
.apx-wrong { animation: apx-wrong 0.9s ease-in-out infinite; }
@keyframes apx-missing {
  0%, 100% { outline-color: rgba(69, 39, 160, 0.25); }
  50% { outline-color: rgba(69, 39, 160, 0.9); }
}
.apx-missing { outline: 3px dashed rgba(69, 39, 160, 0.6); outline-offset: -3px; animation: apx-missing 1.1s ease-in-out infinite; }
@keyframes apx-halo {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 201, 77, 0.3); }
  50% { box-shadow: 0 0 14px 5px rgba(255, 201, 77, 0.85); }
}
.apx-halo { animation: apx-halo 1.2s ease-in-out infinite; }
@keyframes apx-axis {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 1; }
}
.apx-axis { animation: apx-axis 1.6s ease-in-out infinite; background: linear-gradient(180deg, #ffe082, #ffc94d, #ffe082); box-shadow: 0 0 10px 2px rgba(255, 201, 77, 0.8); }
`}</style>
  )
}

// ---------- La grille de pixels ----------

interface PixelGridProps {
  rows: number
  cols: number
  cells: readonly Cell[]
  locked?: readonly boolean[]
  wrong?: ReadonlySet<number>
  missing?: ReadonlySet<number>
  /** Case mise en halo (indice dictée). */
  halo?: number | null
  /** Case qui frissonne après un tap raté (dictée). */
  shake?: number | null
  axis?: Axis
  /** En-têtes A-F / 1-6 du mode dictée. */
  headers?: boolean
  onTap?: (index: number) => void
  /** Grille modèle compacte (lecture seule). */
  small?: boolean
  ariaLabel: string
}

function PixelGrid({
  rows,
  cols,
  cells,
  locked,
  wrong,
  missing,
  halo,
  shake,
  axis,
  headers,
  onTap,
  small,
  ariaLabel,
}: PixelGridProps) {
  const cellSize = small ? 'minmax(0.875rem, 1.5rem)' : 'minmax(2.75rem, 3.5rem)'
  const headerSize = 'minmax(1.25rem, 1.75rem)'

  const renderCell = (i: number): ReactNode => {
    const v = cells[i] ?? 0
    const isLocked = locked?.[i] ?? false
    const color = v > 0 ? COLORS[v - 1] : undefined
    const classes = [
      'relative aspect-square rounded-md transition-transform',
      v > 0 ? 'animate-pop' : '',
      wrong?.has(i) ? 'apx-wrong' : '',
      missing?.has(i) ? 'apx-missing' : '',
      halo === i ? 'apx-halo' : '',
      shake === i ? 'animate-shake-soft' : '',
      onTap && !isLocked ? 'active:scale-90' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const style = {
      background: color ? color.hex : EMPTY_CELL_BG,
      boxShadow: isLocked ? 'inset 0 0 0 2px rgba(69, 39, 160, 0.18)' : undefined,
      border: '1px solid rgba(58, 47, 36, 0.08)',
    }
    const label = color
      ? `Case ${headers ? coordLabel(Math.floor(i / cols), i % cols) : i + 1}, ${color.name}`
      : `Case ${headers ? coordLabel(Math.floor(i / cols), i % cols) : i + 1}, vide`
    if (!onTap) {
      return <div key={`${i}:${v}`} className={classes} style={style} aria-label={label} />
    }
    return (
      <button
        key={`${i}:${v}`}
        type="button"
        className={classes}
        style={style}
        aria-label={label}
        onClick={() => onTap(i)}
      />
    )
  }

  const body = (
    <div className="relative">
      <div
        role="grid"
        aria-label={ariaLabel}
        className="grid w-full"
        style={{ gridTemplateColumns: `repeat(${cols}, ${cellSize})`, gap: 2 }}
      >
        {Array.from({ length: rows * cols }, (_, i) => renderCell(i))}
      </div>
      {/* L'axe du miroir : une ligne brillante */}
      {(axis === 'vertical' || axis === 'both') && (
        <div aria-hidden="true" className="apx-axis absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full" />
      )}
      {(axis === 'horizontal' || axis === 'both') && (
        <div aria-hidden="true" className="apx-axis absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" />
      )}
    </div>
  )

  if (!headers) return body

  return (
    <div className="flex flex-col items-center" style={{ gap: 2 }}>
      <div
        aria-hidden="true"
        className="grid w-full"
        style={{ gridTemplateColumns: `${headerSize} repeat(${cols}, ${cellSize})`, gap: 2 }}
      >
        <span />
        {LETTER_LABELS.slice(0, cols).map((l) => (
          <span key={l} className="text-center text-base font-extrabold" style={{ color: ACCENT }}>
            {l}
          </span>
        ))}
      </div>
      <div
        className="grid w-full items-center"
        style={{ gridTemplateColumns: `${headerSize} 1fr`, gap: 2 }}
      >
        <div
          aria-hidden="true"
          className="grid h-full items-center"
          style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}
        >
          {Array.from({ length: rows }, (_, r) => (
            <span key={r} className="text-center text-base font-extrabold" style={{ color: ACCENT }}>
              {r + 1}
            </span>
          ))}
        </div>
        {body}
      </div>
    </div>
  )
}

// ---------- La palette ----------

function Palette({
  count,
  selected,
  onSelect,
}: {
  count: number
  selected: Cell
  onSelect: (c: Cell) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="radiogroup" aria-label="Palette de couleurs">
      {COLORS.slice(0, count).map((color, i) => {
        const value = (i + 1) as Cell
        const active = selected === value
        return (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={color.name}
            onClick={() => {
              sfx('tap')
              onSelect(value)
            }}
            className={`h-12 w-12 rounded-full transition-transform active:scale-90 ${active ? 'scale-110' : ''}`}
            style={{
              background: color.hex,
              border: '3px solid white',
              boxShadow: active ? `0 0 0 4px ${ACCENT}` : '0 2px 6px rgba(58, 47, 36, 0.25)',
            }}
          />
        )
      })}
    </div>
  )
}

// ---------- Types d'écran ----------

type Screen = 'menu' | 'play' | 'libre' | 'end'
type Phase = 'view' | 'paint' | 'reveal'

const MEMO_VIEW_S = 5
const MEMO_REVIEW_S = 3

export default function AtelierPixel() {
  const navigate = useNavigate()

  const [progress, setProgress] = useState<ApxProgress | null>(null)
  const [screen, setScreen] = useState<Screen>('menu')
  const [mode, setMode] = useState<ModeId>('copie')

  // ----- partie en cours (modes objectifs) -----
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [dictee, setDictee] = useState<DicteePuzzle | null>(null)
  const [callIdx, setCallIdx] = useState(0)
  const [painted, setPainted] = useState<Cell[]>([])
  const [selectedColor, setSelectedColor] = useState<Cell>(1)
  const [gridsDone, setGridsDone] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [phase, setPhase] = useState<Phase>('paint')
  const [viewLeft, setViewLeft] = useState(MEMO_VIEW_S)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [haloIdx, setHaloIdx] = useState<number | null>(null)
  const [shakeIdx, setShakeIdx] = useState<number | null>(null)
  const [overlay, setOverlay] = useState<'success' | 'retry' | null>(null)
  const [burst, setBurst] = useState(0)
  const [result, setResult] = useState<LevelResult | null>(null)

  // ----- atelier libre -----
  const [freeCells, setFreeCells] = useState<Cell[]>(() => emptyCells(FREE_SIZE, FREE_SIZE))
  const [gallery, setGallery] = useState<SavedArt[]>([])

  const tunerRef = useRef(new Tuner({ min: 0, max: MAX_TUNER_LEVEL }))
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  /** jeton de séquence audio : tout changement annule la séquence en cours */
  const seqRef = useRef(0)
  const shakeTimerRef = useRef(0)

  // Chargement de la progression + préchargement des clips
  useEffect(() => {
    let alive = true
    void pget<ApxProgress>(STORE_KEY).then((stored) => {
      if (!alive) return
      setProgress(stored ?? { ...FRESH_PROGRESS })
    })
    void pget<SavedArt[]>(GALLERY_KEY).then((stored) => {
      if (!alive) return
      if (stored) setGallery(stored)
    })
    preloadClips(corpus.entries.map((e) => e.id))
    return () => {
      alive = false
      seqRef.current += 1
      window.clearTimeout(shakeTimerRef.current)
      stopSpeech()
    }
  }, [])

  // Compte à rebours doux du mode mémoire
  useEffect(() => {
    if (screen !== 'play' || mode !== 'memoire' || phase !== 'view') return
    const t = window.setInterval(() => {
      setViewLeft((s) => {
        if (s <= 1) {
          setPhase('paint')
          void say(E('apx.cache'))
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [screen, mode, phase])

  // ---------- Audio ----------

  const speakCall = useCallback(async (call: DicteeCall): Promise<void> => {
    const seq = ++seqRef.current
    await say(E(letterClipId(call.col)))
    if (seqRef.current !== seq) return
    await say(numberEntry(call.row + 1), { interrupt: false })
    if (seqRef.current !== seq) return
    await say(E(colorClipId(call.color)), { interrupt: false })
  }, [])

  const replayInstruction = useCallback((): void => {
    if (screen === 'play') {
      if (mode === 'dictee' && phase === 'paint') {
        const call = dictee?.calls[callIdx]
        if (call) void speakCall(call)
        return
      }
      if (phase === 'paint' || phase === 'view') void say(E(`apx.consigne.${mode}`))
      return
    }
    if (screen === 'libre') {
      void say(E('apx.consigne.libre'))
      return
    }
    void say(E('apx.intro'))
  }, [screen, mode, phase, dictee, callIdx, speakCall])

  // ---------- Construction des grilles ----------

  const buildNext = useCallback(
    (m: ObjectiveMode): void => {
      const level = tunerRef.current.level
      firstTryRef.current = true
      failsRef.current = 0
      setVerdict(null)
      setHaloIdx(null)
      setShakeIdx(null)
      if (m === 'dictee') {
        const d = generateDictee(3)
        setDictee(d)
        setPuzzle(null)
        setCallIdx(0)
        setPainted(emptyCells(d.rows, d.cols))
        setSelectedColor((c) => Math.min(c, d.colorCount) as Cell)
        setPhase('paint')
        const first = d.calls[0]
        if (first) void speakCall(first)
        return
      }
      const colors = colorCountFor(level)
      const p: Puzzle =
        m === 'miroir'
          ? generateMirrorPuzzle(mirrorSizeFor(level), colors, axisForLevel(level))
          : copyPuzzle(generateCopyModel(gridSizeFor(level), colors), colors)
      setPuzzle(p)
      setDictee(null)
      setPainted([...p.start])
      setSelectedColor((c) => Math.min(c, colors) as Cell)
      if (m === 'memoire') {
        setViewLeft(MEMO_VIEW_S)
        setPhase('view')
      } else {
        setPhase('paint')
      }
    },
    [speakCall],
  )

  const startRun = (m: ModeId): void => {
    seqRef.current += 1
    setMode(m)
    if (m === 'libre') {
      setScreen('libre')
      void say(E('apx.consigne.libre'))
      return
    }
    tunerRef.current = new Tuner({ min: 0, max: MAX_TUNER_LEVEL })
    setGridsDone(0)
    setFirstTryCorrect(0)
    setOverlay(null)
    setResult(null)
    setScreen('play')
    if (m === 'dictee') {
      // La consigne d'abord, la première dictée est lancée par buildNext —
      // on enchaîne donc consigne PUIS construction.
      void say(E('apx.consigne.dictee')).then(() => buildNext(m))
      return
    }
    void say(E(`apx.consigne.${m}`))
    buildNext(m)
  }

  // ---------- Peindre ----------

  const onCellTap = (index: number): void => {
    if (screen === 'libre') {
      sfx('pop')
      setFreeCells((cells) => paintCell(cells, index, selectedColor))
      return
    }
    if (phase !== 'paint') return
    if (mode === 'dictee') {
      onDicteeTap(index)
      return
    }
    if (!puzzle) return
    sfx('pop')
    setVerdict(null)
    setPainted((cells) => paintCell(cells, index, selectedColor, puzzle.locked))
  }

  const onDicteeTap = (index: number): void => {
    if (!dictee) return
    const call = dictee.calls[callIdx]
    if (!call) return
    if (index === call.index && selectedColor === call.color) {
      sfx('pop')
      setHaloIdx(null)
      setShakeIdx(null)
      failsRef.current = 0
      setPainted((cells) => {
        const out = [...cells]
        out[index] = call.color
        return out
      })
      const next = callIdx + 1
      if (next >= dictee.calls.length) {
        resolveDicteeGrid()
        return
      }
      setCallIdx(next)
      const nextCall = dictee.calls[next]
      if (nextCall) void speakCall(nextCall)
      return
    }
    // L'erreur enseigne : la case tapée frissonne, on réécoute, et après
    // 2 essais la bonne case s'illumine. Jamais le mot « faux ».
    sfx('wrong')
    firstTryRef.current = false
    failsRef.current += 1
    setShakeIdx(index)
    window.clearTimeout(shakeTimerRef.current)
    shakeTimerRef.current = window.setTimeout(() => setShakeIdx(null), 700)
    const seq = ++seqRef.current
    const hinting = failsRef.current >= 2
    if (hinting) setHaloIdx(call.index)
    void say(E(hinting ? 'apx.indice.dictee' : 'apx.ecoute')).then(() => {
      if (seqRef.current !== seq) return
      void speakCall(call)
    })
  }

  /** Les 8 dictées sont posées : la fresque surprise se révèle. */
  const resolveDicteeGrid = (): void => {
    if (!dictee) return
    seqRef.current += 1
    const wasFirst = firstTryRef.current
    void recordAttempt(MODE_SKILLS.dictee, wasFirst)
    tunerRef.current.onResult(wasFirst)
    if (wasFirst) setFirstTryCorrect((c) => c + 1)
    setPhase('reveal')
    setPainted([...dictee.target])
    sfx('magic')
    setBurst((b) => b + 1)
    void say(E('apx.fresque')).then(() => setOverlay('success'))
  }

  // ---------- « J'ai fini ! » (copie / miroir / mémoire) ----------

  const onFinish = (): void => {
    if (!puzzle || phase !== 'paint') return
    seqRef.current += 1
    const v = checkGrid(painted, puzzle.target, puzzle.locked)
    if (v.ok) {
      const wasFirst = firstTryRef.current
      void recordAttempt(MODE_SKILLS[mode as ObjectiveMode], wasFirst)
      tunerRef.current.onResult(wasFirst)
      if (wasFirst) setFirstTryCorrect((c) => c + 1)
      setPhase('reveal')
      sfx('magic')
      void say(E('apx.bravo-grille')).then(() => setOverlay('success'))
      return
    }
    // Nouvel essai sur la MÊME grille : les fautives pulsent, les
    // manquantes clignotent en pointillés.
    firstTryRef.current = false
    failsRef.current += 1
    setVerdict(v)
    void say(E('apx.presque')).then(() => setOverlay('retry'))
  }

  const onOverlayDone = (): void => {
    const kind = overlay
    setOverlay(null)
    if (kind === 'success') {
      advance()
      return
    }
    // Indice après 2 échecs : une case fautive se corrige toute seule.
    if (kind === 'retry' && failsRef.current >= 2 && puzzle && verdict) {
      const idx = hintCell(verdict)
      if (idx !== null) {
        setPainted((cells) => {
          const out = [...cells]
          out[idx] = puzzle.target[idx] ?? 0
          return out
        })
        setVerdict(null)
        sfx('magic')
        void say(E('apx.indice'))
      }
    }
  }

  const advance = (): void => {
    const m = mode as ObjectiveMode
    const done = gridsDone + 1
    setGridsDone(done)
    if (done >= gridsFor(m)) {
      finishRun(m)
      return
    }
    buildNext(m)
  }

  const finishRun = (m: ObjectiveMode): void => {
    const total = gridsFor(m)
    const stars = starsFor(firstTryCorrect, total)
    setResult({ gameId: META.id, stars, firstTryCorrect, total })
    const base = progress ?? { ...FRESH_PROGRESS }
    const updated = applyRun(base, m, stars)
    setProgress(updated)
    void pset(STORE_KEY, updated)
    setScreen('end')
  }

  // ---------- Mémoire : revoir le modèle (coûte le premier essai) ----------

  const onReview = (): void => {
    if (mode !== 'memoire' || phase !== 'paint') return
    sfx('tap')
    firstTryRef.current = false
    setViewLeft(MEMO_REVIEW_S)
    setPhase('view')
    void say(E('apx.revoir'))
  }

  // ---------- Atelier libre : galerie + export PNG ----------

  const saveToGallery = (): void => {
    const art: SavedArt = { rows: FREE_SIZE, cols: FREE_SIZE, cells: [...freeCells], ts: Date.now() }
    const next = addToGallery(gallery, art)
    setGallery(next)
    void pset(GALLERY_KEY, next)
    sfx('magic')
    setBurst((b) => b + 1)
    void say(E('apx.galerie'))
  }

  const exportPng = (): void => {
    const scale = 32
    const canvas = document.createElement('canvas')
    canvas.width = FREE_SIZE * scale
    canvas.height = FREE_SIZE * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    freeCells.forEach((v, i) => {
      if (v <= 0) return
      const color = COLORS[v - 1]
      if (!color) return
      ctx.fillStyle = color.hex
      ctx.fillRect((i % FREE_SIZE) * scale, Math.floor(i / FREE_SIZE) * scale, scale, scale)
    })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'atelier-pixel.png'
    a.click()
    sfx('coin')
  }

  // ---------- Rendus ----------

  const renderMenu = (): ReactNode => {
    if (!progress) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-floaty text-5xl" role="status" aria-label="Chargement">
            🎨
          </div>
        </div>
      )
    }
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 p-4">
        <div className="flex items-center gap-4">
          <Mascot mood="happy" size={72} />
          <SpeakerButton entry={E('apx.intro')} autoPlay />
        </div>
        <p className="text-center text-lg font-extrabold text-ink">
          Choisis ton atelier, puis peins les pixels !
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          {MODE_INFO.map((info) => {
            const active = mode === info.id
            const stars = info.id === 'libre' ? null : (progress.bestStars[info.id] ?? 0)
            return (
              <button
                key={info.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  sfx('tap')
                  setMode(info.id)
                  void say(E(`apx.mode.${info.id}`))
                }}
                className={`tap-target card flex flex-col items-center gap-0.5 p-3 transition-transform active:scale-95 ${info.id === 'libre' ? 'col-span-2' : ''}`}
                style={active ? { outline: `4px solid ${ACCENT}` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl">
                  {info.emoji}
                </span>
                <span className="text-base leading-tight font-extrabold text-ink">{info.name}</span>
                <span className="text-xs font-semibold text-ink-soft">{info.sub}</span>
                {stars === null ? (
                  <span className="text-sm" aria-label="Le jouet de l’île : sans score">
                    🌈
                  </span>
                ) : (
                  <span className="text-sm" aria-label={`${stars} étoile${stars > 1 ? 's' : ''} sur 3`}>
                    {'⭐'.repeat(stars)}
                    <span className="opacity-30">{'☆'.repeat(3 - stars)}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <BigButton
          variant="accent"
          accent={ACCENT}
          className="w-full max-w-xs text-2xl"
          onClick={() => startRun(mode)}
        >
          Jouer !
        </BigButton>
      </div>
    )
  }

  const renderModelCard = (p: Puzzle): ReactNode => {
    const showModel = mode === 'copie' || (mode === 'memoire' && phase === 'view')
    return (
      <div className="card flex flex-col items-center gap-2 p-3">
        <span className="text-sm font-extrabold text-ink-soft">
          {mode === 'memoire' ? 'Retiens le modèle !' : 'Le modèle'}
        </span>
        {showModel ? (
          <PixelGrid rows={p.rows} cols={p.cols} cells={p.target} small ariaLabel="Le modèle à reproduire" />
        ) : (
          <button
            type="button"
            onClick={onReview}
            className="tap-target flex flex-col items-center justify-center gap-1 rounded-2xl px-5 py-3 font-extrabold text-white transition-transform active:scale-95"
            style={{ background: ACCENT }}
          >
            <span aria-hidden="true" className="text-2xl">👀</span>
            <span>Revoir</span>
          </button>
        )}
        {mode === 'memoire' && phase === 'view' && (
          <span
            className="animate-pop flex h-10 w-10 items-center justify-center rounded-full text-xl font-extrabold text-white"
            style={{ background: ACCENT }}
            role="timer"
            aria-label={`Le modèle se cache dans ${viewLeft} secondes`}
            key={viewLeft}
          >
            {viewLeft}
          </span>
        )}
      </div>
    )
  }

  const renderPlay = (): ReactNode => {
    const isDictee = mode === 'dictee'
    const p = puzzle
    const d = dictee
    if (!isDictee && !p) return null
    if (isDictee && !d) return null

    const call = isDictee && phase === 'paint' ? (d?.calls[callIdx] ?? null) : null
    const colorCount = isDictee ? (d?.colorCount ?? 3) : (p?.colorCount ?? 2)
    const rows = isDictee ? (d?.rows ?? 0) : (p?.rows ?? 0)
    const cols = isDictee ? (d?.cols ?? 0) : (p?.cols ?? 0)
    const callColor = call ? COLORS[call.color - 1] : undefined

    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-3 px-2 pb-6">
        <div className="flex w-full flex-col items-center gap-3 md:flex-row md:items-start md:justify-center">
          {/* Modèle (copie / mémoire) ou dictée en cours */}
          {!isDictee && (mode === 'copie' || mode === 'memoire') && p && renderModelCard(p)}
          {isDictee && call && callColor && (
            <div className="card flex items-center gap-3 px-4 py-3" aria-live="polite">
              <span className="animate-pop text-3xl font-extrabold" style={{ color: ACCENT }} key={call.index}>
                {coordLabel(call.row, call.col)}
              </span>
              <span
                aria-label={`en ${callColor.name}`}
                className="h-8 w-8 rounded-full"
                style={{ background: callColor.hex, border: '3px solid white', boxShadow: '0 2px 6px rgba(58,47,36,0.3)' }}
              />
              <span className="text-sm font-extrabold text-ink-soft">
                Dictée {Math.min(callIdx + 1, d?.calls.length ?? 0)}/{d?.calls.length ?? 0}
              </span>
            </div>
          )}
          {isDictee && phase === 'reveal' && (
            <div className="card animate-bounce-in px-4 py-3 text-lg font-extrabold" style={{ color: ACCENT }}>
              🖼️ La fresque surprise !
            </div>
          )}

          {/* La grille de l'enfant */}
          <div className={`card p-2 ${mode === 'memoire' && phase === 'view' ? 'opacity-40' : ''}`}>
            <PixelGrid
              rows={rows}
              cols={cols}
              cells={painted}
              locked={p?.locked}
              wrong={verdict ? new Set(verdict.wrong) : undefined}
              missing={verdict ? new Set(verdict.missing) : undefined}
              halo={haloIdx}
              shake={shakeIdx}
              axis={p?.axis}
              headers={isDictee}
              onTap={phase === 'paint' ? onCellTap : undefined}
              ariaLabel={isDictee ? 'La grille de la dictée, colonnes A à F, lignes 1 à 6' : 'Ta grille de pixels'}
            />
          </div>
        </div>

        <Palette count={colorCount} selected={selectedColor} onSelect={setSelectedColor} />

        {!isDictee && (
          <BigButton
            variant="accent"
            accent={ACCENT}
            className="w-full max-w-xs text-2xl"
            disabled={phase !== 'paint'}
            onClick={onFinish}
          >
            J’ai fini ! ✨
          </BigButton>
        )}
      </div>
    )
  }

  const renderLibre = (): ReactNode => {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-3 px-2 pb-6">
        <div className="flex items-center gap-3">
          <Mascot mood="idle" size={48} />
          <p className="text-base font-extrabold text-ink">Ton atelier : peins ce que tu veux !</p>
        </div>
        <div className="card p-2">
          <PixelGrid
            rows={FREE_SIZE}
            cols={FREE_SIZE}
            cells={freeCells}
            onTap={onCellTap}
            ariaLabel="Ta toile libre de cent pixels"
          />
        </div>
        <Palette count={FREE_COLORS} selected={selectedColor} onSelect={setSelectedColor} />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <BigButton
            variant="soft"
            onClick={() => {
              sfx('whoosh')
              setFreeCells(emptyCells(FREE_SIZE, FREE_SIZE))
            }}
          >
            🧽 Effacer
          </BigButton>
          <BigButton
            variant="soft"
            onClick={() => {
              sfx('slide')
              setFreeCells(new Array<Cell>(FREE_SIZE * FREE_SIZE).fill(selectedColor))
            }}
          >
            🪣 Remplir
          </BigButton>
          <BigButton variant="accent" accent={ACCENT} onClick={saveToGallery}>
            💾 Garder
          </BigButton>
          <BigButton variant="soft" onClick={exportPng}>
            📷 Image
          </BigButton>
        </div>
        {gallery.length > 0 && (
          <div className="card w-full max-w-lg p-3">
            <p className="mb-2 text-sm font-extrabold text-ink-soft">🖼️ Ta galerie — tape pour recharger</p>
            <div className="flex flex-wrap gap-2">
              {gallery.map((art) => (
                <button
                  key={art.ts}
                  type="button"
                  aria-label="Recharger cette œuvre"
                  onClick={() => {
                    sfx('tap')
                    setFreeCells([...art.cells])
                  }}
                  className="grid shrink-0 overflow-hidden rounded-md transition-transform active:scale-90"
                  style={{
                    gridTemplateColumns: `repeat(${art.cols}, 1fr)`,
                    width: 60,
                    height: 60,
                    border: '2px solid rgba(58, 47, 36, 0.15)',
                  }}
                >
                  {art.cells.map((v, i) => (
                    <span key={i} style={{ background: v > 0 ? (COLORS[v - 1]?.hex ?? EMPTY_CELL_BG) : '#fff' }} />
                  ))}
                </button>
              ))}
            </div>
          </div>
        )}
        <BigButton variant="soft" onClick={() => setScreen('menu')}>
          ← Les ateliers
        </BigButton>
      </div>
    )
  }

  return (
    <GameShell
      meta={META}
      hud={
        screen === 'play' && mode !== 'libre' ? (
          <ProgressDots total={gridsFor(mode as ObjectiveMode)} done={gridsDone} />
        ) : undefined
      }
      onReplayInstruction={replayInstruction}
    >
      <ApxStyles />
      {screen === 'menu' && renderMenu()}
      {screen === 'play' && renderPlay()}
      {screen === 'libre' && renderLibre()}
      {screen === 'end' && result && (
        <LevelEnd result={result} onReplay={() => startRun(mode)} onHome={() => navigate('/')} />
      )}
      <FeedbackOverlay
        kind={overlay}
        message={overlay === 'retry' ? 'Regarde, ces pixels veulent changer de couleur !' : undefined}
        onDone={onOverlayDone}
      />
      <ConfettiBurst burst={burst} />
    </GameShell>
  )
}
