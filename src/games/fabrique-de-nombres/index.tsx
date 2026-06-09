// ============================================================
// La Fabrique de Nombres — l'usine à nombres.
// Un ticket de commande arrive sur le tapis roulant, l'enfant
// pose des barres-dizaines et des cubes-unités sur le plateau,
// la Machine casse (1 barre -> 10 cubes) et soude (10 cubes ->
// 1 barre). Le total reste MASQUÉ jusqu'à la livraison, comptée
// à voix haute (dix, vingt… puis 41, 42…).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { numberEntry, numberToFrench } from '@/content/numbers'
import { Tuner } from '@/engine/adaptive'
import { say, sfx } from '@/engine/audio'
import { recordAttempt } from '@/engine/mastery'
import { pget, pset } from '@/engine/storage'
import type { CorpusEntry, GameMeta, LevelResult } from '@/engine/types'
import {
  BigButton,
  FeedbackOverlay,
  GameShell,
  LevelEnd,
  Mascot,
  ProgressDots,
  SpeakerButton,
  uiEntry,
} from '@/ui'
import corpusJson from './corpus.json'
import {
  EMPTY_SAVE,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  MIN_TUNER_LEVEL,
  TIERS,
  applyRunToSave,
  boardTotal,
  canAddBar,
  canAddCube,
  canBreak,
  canSolder,
  countingSteps,
  deliveryDiff,
  generateOrder,
  solveOrder,
  starsFor,
  validateDelivery,
} from './logic'
import type {
  BoardState,
  Constraint,
  DeliveryPlan,
  Order,
  SaveData,
  TierDef,
  TierId,
} from './logic'

const GAME_ID = 'fabrique-de-nombres'
const SAVE_KEY = `game:${GAME_ID}`

// Mêmes valeurs que l'entrée du manifest (src/games.manifest.ts) — défini
// localement pour éviter le cycle d'import jeu <-> manifest (lazy import).
const META: GameMeta = {
  id: GAME_ID,
  title: 'La Fabrique de Nombres',
  tagline: 'Fabrique les nombres avec barres et cubes !',
  icon: '🏗️',
  island: 'nombres',
  accent: '#1565c0',
  skills: ['ma.cp.num.lire59', 'ma.cp.num.dizaines', 'ma.cp.num.echange', 'ma.cp.num.decompo100'],
  status: 'v2',
}

const ACCENT = META.accent

// ---------- Corpus local (clips fdn.*) ----------

function toVoice(v: string | undefined): CorpusEntry['voice'] {
  return v === 'denise' || v === 'eloise' || v === 'henri' ? v : undefined
}

const CORPUS: ReadonlyMap<string, CorpusEntry> = new Map(
  corpusJson.entries.map((e): [string, CorpusEntry] => [
    e.id,
    { id: e.id, text: e.text, voice: toVoice('voice' in e ? e.voice : undefined) },
  ]),
)

function C(id: string): CorpusEntry {
  return CORPUS.get(id) ?? { id, text: '' }
}

/** Enchaîne des clips (consigne + nombres) ; seul le premier interrompt. */
async function speakSeq(entries: readonly CorpusEntry[], isLive: () => boolean): Promise<void> {
  for (let i = 0; i < entries.length; i++) {
    if (!isLive()) return
    await say(entries[i], { interrupt: i === 0 })
  }
}

function consigneEntries(order: Order): CorpusEntry[] {
  const list: CorpusEntry[] = [C('fdn.consigne.fabrique'), numberEntry(order.target)]
  const c = order.constraint
  if (c?.kind === 'max-bars') {
    list.push(
      C('fdn.contrainte.avec-seulement'),
      numberEntry(c.value),
      C(c.value > 1 ? 'fdn.contrainte.barres' : 'fdn.contrainte.barre'),
    )
  } else if (c?.kind === 'no-bars') {
    list.push(C('fdn.contrainte.sans-barre'))
  } else if (c?.kind === 'min-cubes') {
    list.push(C('fdn.contrainte.au-moins'), numberEntry(c.value), C('fdn.contrainte.cubes'))
  }
  return list
}

function hintEntries(sol: BoardState): CorpusEntry[] {
  const list: CorpusEntry[] = [C('fdn.indice.il-faut')]
  if (sol.bars > 0) {
    list.push(numberEntry(sol.bars))
    if (sol.cubes === 0) {
      list.push(C(sol.bars > 1 ? 'fdn.indice.barres-seules' : 'fdn.indice.barre-seule'))
    } else {
      list.push(
        C(sol.bars > 1 ? 'fdn.indice.barres-et' : 'fdn.indice.barre-et'),
        numberEntry(sol.cubes),
        C(sol.cubes > 1 ? 'fdn.indice.cubes-fin' : 'fdn.indice.cube-fin'),
      )
    }
  } else {
    list.push(
      numberEntry(sol.cubes),
      C(sol.cubes > 1 ? 'fdn.indice.cubes-fin' : 'fdn.indice.cube-fin'),
    )
  }
  return list
}

function constraintLabel(c: Constraint): string {
  if (c.kind === 'max-bars') return c.value > 1 ? `${c.value} barres maxi !` : '1 barre maxi !'
  if (c.kind === 'no-bars') return 'Zéro barre !'
  return `${c.value} cubes au moins !`
}

function hintLabel(sol: BoardState): string {
  const b = sol.bars > 0 ? `${sol.bars} barre${sol.bars > 1 ? 's' : ''}` : ''
  const c = sol.cubes > 0 ? `${sol.cubes} cube${sol.cubes > 1 ? 's' : ''}` : ''
  if (b !== '' && c !== '') return `${b} et ${c}`
  return b !== '' ? b : c
}

// ============================================================
// Pièces : barre-dizaine (10 cellules bleues) et cube-unité.
// Purement décoratives (aria-hidden) — les zones parentes portent
// les labels et les cibles tactiles.
// ============================================================

interface PieceProps {
  selected?: boolean
  counting?: boolean
  excess?: boolean
  ghost?: boolean
  mini?: boolean
}

function BarPiece({
  selected = false,
  counting = false,
  excess = false,
  ghost = false,
  mini = false,
}: PieceProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex ${mini ? 'flex-row' : 'flex-col-reverse'} gap-[2px] rounded-md p-[3px] transition-transform duration-150 ${
        ghost ? '' : 'animate-pop shadow-card'
      } ${selected ? '-translate-y-1.5 scale-110' : ''} ${counting ? 'scale-110' : ''}`}
      style={{
        background: ghost ? 'transparent' : '#1565c0',
        border: ghost ? '2px dashed rgba(30, 58, 76, 0.45)' : undefined,
        outline: excess
          ? '3px solid #e85d4a'
          : selected || counting
            ? '3px solid #ffc94d'
            : undefined,
        opacity: excess ? 0.75 : 1,
      }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`${mini ? 'h-4 w-[5px]' : 'h-2 w-6'} rounded-[2px]`}
          style={{
            background: ghost ? 'transparent' : i % 2 === 0 ? '#42a5f5' : '#64b5f6',
            border: ghost ? '1px dashed rgba(30, 58, 76, 0.3)' : undefined,
          }}
        />
      ))}
    </span>
  )
}

function CubePiece({
  selected = false,
  counting = false,
  excess = false,
  ghost = false,
  mini = false,
  delaySec = 0,
}: PieceProps & { delaySec?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`${mini ? 'h-5 w-5' : 'h-6 w-6'} rounded-md transition-transform duration-150 ${
        ghost ? '' : 'animate-pop'
      } ${selected ? '-translate-y-1 scale-125' : ''} ${counting ? 'scale-125' : ''}`}
      style={{
        background: ghost ? 'transparent' : 'linear-gradient(145deg, #ffb74d, #f57c00)',
        border: ghost ? '2px dashed rgba(30, 58, 76, 0.45)' : '1px solid rgba(230, 81, 0, 0.5)',
        outline: excess
          ? '3px solid #e85d4a'
          : selected
            ? '3px solid #ffc94d'
            : counting
              ? '3px solid #1e3a4c'
              : undefined,
        opacity: excess ? 0.75 : 1,
        animationDelay: ghost ? undefined : `${delaySec}s`,
      }}
    />
  )
}

// ============================================================
// Écran d'accueil : choix de l'atelier (palier) + Jouer !
// ============================================================

interface HomeProps {
  save: SaveData
  tierId: TierId
  onSelect: (t: TierId) => void
  onPlay: () => void
}

function HomeScreen({ save, tierId, onSelect, onPlay }: HomeProps) {
  const [shake, setShake] = useState<TierId | null>(null)

  const pickTier = (t: TierDef): void => {
    sfx('tap')
    if (t.id > save.unlockedTier) {
      setShake(t.id)
      void say(C('fdn.palier.verrouille'))
      window.setTimeout(() => setShake(null), 500)
      return
    }
    onSelect(t.id)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-4 pb-8">
      <div className="flex items-center gap-4">
        <Mascot mood="happy" size={84} />
        <span aria-hidden="true" className="animate-floaty text-7xl">🏗️</span>
        <SpeakerButton entry={C('fdn.intro')} autoPlay />
      </div>

      <h2 className="text-2xl font-extrabold text-ink">Choisis ton atelier !</h2>

      <div className="grid w-full max-w-lg grid-cols-2 gap-3">
        {TIERS.map((t) => {
          const locked = t.id > save.unlockedTier
          const stars = save.bestStars[t.id] ?? 0
          const active = t.id === tierId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTier(t)}
              aria-label={`${t.name}, ${t.sub}${locked ? ', verrouillé' : ''}`}
              className={`card tap-target flex flex-col items-center gap-1 border-4 px-3 py-4 transition-transform active:scale-95 ${
                locked ? 'opacity-60' : ''
              } ${shake === t.id ? 'animate-shake-soft' : ''}`}
              style={{ borderColor: active ? ACCENT : 'transparent' }}
            >
              <span aria-hidden="true" className="text-4xl">{locked ? '🔒' : t.emoji}</span>
              <span className="text-center text-base font-extrabold leading-tight text-ink">
                {t.name}
              </span>
              <span className="text-xs font-bold text-ink-soft">{t.sub}</span>
              <span aria-hidden="true" className="text-sm tracking-wider">
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
        onClick={onPlay}
        className="w-full max-w-xs text-2xl"
      >
        Jouer !
      </BigButton>
    </div>
  )
}

// ============================================================
// Une partie : 8 commandes à fabriquer et livrer.
// ============================================================

type Phase = 'build' | 'count' | 'verdict'

interface RunProps {
  tier: TierDef
  replayRef: RefObject<(() => void) | null>
  onProgress: (resolved: number) => void
  onEnd: (res: LevelResult, tier: TierId) => void
}

function Run({ tier, replayRef, onProgress, onEnd }: RunProps) {
  const [order, setOrder] = useState<Order>(() => generateOrder(tier.id, MIN_TUNER_LEVEL, 0, []))
  const [board, setBoard] = useState<BoardState>({ bars: 0, cubes: 0 })
  const [selected, setSelected] = useState<'bar' | 'cube' | null>(null)
  const [phase, setPhase] = useState<Phase>('build')
  const [feedback, setFeedback] = useState<'success' | 'retry' | null>(null)
  const [itemIndex, setItemIndex] = useState(0)
  const [resolved, setResolved] = useState(0)
  const [countShown, setCountShown] = useState<number | null>(null)
  const [countMark, setCountMark] = useState(-1)
  const [plan, setPlan] = useState<DeliveryPlan | null>(null)
  const [hint, setHint] = useState<BoardState | null>(null)
  const [machineFx, setMachineFx] = useState<'break' | 'solder' | 'nope' | null>(null)
  const [paletteShake, setPaletteShake] = useState<'bar' | 'cube' | null>(null)
  const [stamp, setStamp] = useState(false)
  const [burstBase, setBurstBase] = useState(0)

  const tunerRef = useRef<Tuner | null>(null)
  tunerRef.current ??= new Tuner({ min: MIN_TUNER_LEVEL, max: MAX_TUNER_LEVEL })
  const firstTryRef = useRef(true)
  const failsRef = useRef(0)
  const firstTryCountRef = useRef(0)
  const recentRef = useRef<number[]>([])
  const aliveRef = useRef(true)
  const orderRef = useRef(order)

  useEffect(() => {
    orderRef.current = order
  }, [order])

  useEffect(() => {
    replayRef.current = () => {
      void speakSeq(consigneEntries(orderRef.current), () => aliveRef.current)
    }
    return () => {
      replayRef.current = null
    }
  }, [replayRef])

  useEffect(() => {
    aliveRef.current = true
    recentRef.current = [orderRef.current.target]
    void speakSeq(consigneEntries(orderRef.current), () => aliveRef.current)
    return () => {
      aliveRef.current = false
    }
  }, [])

  // La pièce « prise en main » se repose toute seule au bout de 12 s
  // (un enfant de 5 ans peut hésiter entre prendre la pièce et choisir la machine).
  useEffect(() => {
    if (selected === null) return
    const t = window.setTimeout(() => setSelected(null), 12000)
    return () => window.clearTimeout(t)
  }, [selected])

  const clearAids = (): void => {
    setPlan(null)
    setHint(null)
  }

  const nudgePalette = (kind: 'bar' | 'cube'): void => {
    sfx('tap')
    setPaletteShake(kind)
    window.setTimeout(() => {
      if (aliveRef.current) setPaletteShake(null)
    }, 500)
  }

  /** Palette : ajoute une pièce — ou, si une pièce est en main, la range. */
  const tapPalette = (kind: 'bar' | 'cube'): void => {
    if (phase !== 'build') return
    if (selected !== null) {
      if (selected === kind) {
        sfx('whoosh')
        setBoard((b) =>
          kind === 'bar'
            ? { ...b, bars: Math.max(0, b.bars - 1) }
            : { ...b, cubes: Math.max(0, b.cubes - 1) },
        )
        clearAids()
      } else {
        sfx('tap')
      }
      setSelected(null)
      return
    }
    const ok = kind === 'bar' ? canAddBar(board, order) : canAddCube(board)
    if (!ok) {
      nudgePalette(kind)
      return
    }
    sfx(kind === 'bar' ? 'slide' : 'pop')
    if (kind === 'cube') setBurstBase(board.cubes)
    setBoard((b) =>
      kind === 'bar' ? { ...b, bars: b.bars + 1 } : { ...b, cubes: b.cubes + 1 },
    )
    clearAids()
  }

  /** Plateau : prend la dernière pièce en main (tap à nouveau = repose). */
  const tapBoard = (kind: 'bar' | 'cube'): void => {
    if (phase !== 'build') return
    if ((kind === 'bar' ? board.bars : board.cubes) === 0) return
    sfx('tap')
    setSelected((s) => (s === kind ? null : kind))
  }

  /** Machine casse-barre : une barre en main + tap -> 10 cubes. */
  const tapMachine = (): void => {
    if (phase !== 'build') return
    if (selected === 'bar' && canBreak(board)) {
      sfx('magic')
      setMachineFx('break')
      setSelected(null)
      setBurstBase(board.cubes)
      setBoard((b) => ({ bars: b.bars - 1, cubes: b.cubes + 10 }))
      clearAids()
      void say(C('fdn.machine.casse'))
      window.setTimeout(() => {
        if (aliveRef.current) setMachineFx(null)
      }, 900)
      return
    }
    sfx('tap')
    setMachineFx('nope')
    window.setTimeout(() => {
      if (aliveRef.current) setMachineFx(null)
    }, 500)
  }

  /** Soudeuse : 10 cubes fusionnent en 1 barre. */
  const solder = (): void => {
    if (phase !== 'build' || !canSolder(board, order)) return
    sfx('magic')
    setMachineFx('solder')
    setSelected(null)
    setBoard((b) => ({ bars: b.bars + 1, cubes: b.cubes - 10 }))
    clearAids()
    void say(C('fdn.machine.soude'))
    window.setTimeout(() => {
      if (aliveRef.current) setMachineFx(null)
    }, 900)
  }

  /** Livraison : le panneau se soulève, comptage animé et sonore. */
  const deliver = async (): Promise<void> => {
    if (phase !== 'build' || boardTotal(board) === 0) return
    const state = board
    setPhase('count')
    setSelected(null)
    clearAids()
    sfx('whoosh')
    await say(C('fdn.livraison.compte'))
    if (!aliveRef.current) return
    const steps = countingSteps(state)
    for (let i = 0; i < steps.length; i++) {
      if (!aliveRef.current) return
      setCountMark(i)
      setCountShown(steps[i])
      sfx(i < state.bars ? 'coin' : 'pop')
      await say(numberEntry(steps[i]), { interrupt: false })
    }
    if (!aliveRef.current) return
    setCountMark(-1)
    setPhase('verdict')

    const verdict = validateDelivery(order, state)
    if (verdict.ok) {
      const wasFirst = firstTryRef.current
      if (wasFirst) firstTryCountRef.current += 1
      tunerRef.current?.onResult(wasFirst)
      void recordAttempt(tier.skill, wasFirst)
      setStamp(true)
      sfx('fanfare')
      await say(C('fdn.livraison.bravo'), { interrupt: false })
      if (!aliveRef.current) return
      setFeedback('success')
      return
    }

    firstTryRef.current = false
    failsRef.current += 1
    setPlan(deliveryDiff(order, state))
    const speech: CorpusEntry[] =
      verdict.reason === 'constraint'
        ? [
            C('fdn.livraison.contrainte'),
            numberEntry(verdict.constraint.value),
            C('fdn.contrainte.cubes'),
          ]
        : verdict.reason === 'missing'
          ? [C('fdn.livraison.manque'), numberEntry(verdict.diff)]
          : [C('fdn.livraison.trop'), numberEntry(verdict.diff), C('fdn.livraison.trop-fin')]
    await speakSeq(speech, () => aliveRef.current)
    if (!aliveRef.current) return
    setFeedback('retry')
  }

  const handleFeedbackDone = (): void => {
    const kind = feedback
    setFeedback(null)
    if (kind === 'success') {
      setStamp(false)
      const done = resolved + 1
      setResolved(done)
      onProgress(done)
      if (done >= ITEMS_PER_RUN) {
        onEnd(
          {
            gameId: GAME_ID,
            stars: starsFor(firstTryCountRef.current, ITEMS_PER_RUN),
            firstTryCorrect: firstTryCountRef.current,
            total: ITEMS_PER_RUN,
          },
          tier.id,
        )
        return
      }
      // Item suivant : TOUJOURS une nouvelle commande, jamais rejouée.
      const nextIndex = itemIndex + 1
      const level = tunerRef.current?.level ?? MIN_TUNER_LEVEL
      const next = generateOrder(tier.id, level, nextIndex, recentRef.current)
      recentRef.current = [...recentRef.current, next.target].slice(-4)
      firstTryRef.current = true
      failsRef.current = 0
      setItemIndex(nextIndex)
      setOrder(next)
      setBoard({ bars: 0, cubes: 0 })
      setBurstBase(0)
      setCountShown(null)
      setCountMark(-1)
      clearAids()
      setPhase('build')
      void speakSeq(consigneEntries(next), () => aliveRef.current)
      return
    }
    // Retry : MÊME commande, plateau conservé, panneau re-masqué.
    setCountShown(null)
    setPhase('build')
    if (failsRef.current >= 2) {
      const sol = solveOrder(orderRef.current)
      setHint(sol)
      void speakSeq(hintEntries(sol), () => aliveRef.current)
      window.setTimeout(() => {
        if (aliveRef.current) setHint(null)
      }, 5200)
    }
  }

  const busy = phase !== 'build'
  const total = boardTotal(board)
  const barConstrained =
    order.constraint?.kind === 'max-bars' || order.constraint?.kind === 'no-bars'
  const barAddable = canAddBar(board, order)
  const cubeAddable = canAddCube(board)
  const breakReady = selected === 'bar' && canBreak(board)

  return (
    <div className="flex w-full flex-1 flex-col gap-2 p-3 sm:gap-3 lg:mx-auto lg:max-w-5xl">
      {/* ---------- Tapis roulant + ticket de commande ---------- */}
      <div className="relative shrink-0 pb-3">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-5 rounded-full opacity-80"
          style={{
            background: 'repeating-linear-gradient(60deg, #455a64 0 14px, #2f3e46 14px 28px)',
          }}
        />
        <div
          key={itemIndex}
          className="card animate-bounce-in relative mx-auto w-fit min-w-[230px] border-2 border-dashed border-ink-soft/20 px-5 py-2 text-center"
        >
          <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-ink-soft">
            Ticket de commande
          </div>
          <div className="flex items-center justify-center gap-2">
            <span aria-hidden="true" className="text-2xl">🧾</span>
            <span className="text-[44px] font-extrabold leading-tight" style={{ color: ACCENT }}>
              {order.target}
            </span>
          </div>
          {tier.id === 0 && (
            <div className="text-base font-bold text-ink-soft">
              {numberToFrench(order.target)}
            </div>
          )}
          {order.constraint && (
            <div
              className="mx-auto mt-1 w-fit rounded-full px-3 py-0.5 text-sm font-extrabold text-white"
              style={{ background: '#e85d4a' }}
            >
              🔒 {constraintLabel(order.constraint)}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3 lg:flex-row">
        {/* ---------- Plateau de fabrication ---------- */}
        <div className="card relative flex min-h-[240px] flex-1 flex-col gap-2 p-3">
          <div className="absolute right-3 top-2 z-10 flex flex-col items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-ink-soft">
              Total
            </span>
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold shadow-card transition-all duration-500 ${
                countShown === null ? 'bg-ink text-white' : 'animate-pop bg-sun text-ink'
              }`}
            >
              {countShown ?? '?'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => tapBoard('bar')}
            aria-label={`${board.bars} barre${board.bars > 1 ? 's' : ''} de dix sur le plateau`}
            className="tap-target flex min-h-[124px] flex-wrap content-start items-start gap-1.5 rounded-2xl border-2 border-dashed border-lagoon-300/60 p-2 pr-16 text-left"
          >
            {Array.from({ length: board.bars }, (_, i) => (
              <BarPiece
                key={`b-${i}`}
                selected={selected === 'bar' && i === board.bars - 1}
                counting={phase === 'count' && countMark === i}
                excess={plan !== null && plan.removeBars > 0 && i >= board.bars - plan.removeBars}
              />
            ))}
            {plan !== null &&
              Array.from({ length: plan.addBars }, (_, i) => <BarPiece key={`gb-${i}`} ghost />)}
            {board.bars === 0 && (plan === null || plan.addBars === 0) && (
              <span className="self-center px-2 text-sm font-bold text-ink-soft/60">
                Les barres de dix iront ici
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => tapBoard('cube')}
            aria-label={`${board.cubes} petit${board.cubes > 1 ? 's' : ''} cube${board.cubes > 1 ? 's' : ''} sur le plateau`}
            className="tap-target flex-1 rounded-2xl border-2 border-dashed border-sun-deep/40 p-2 text-left"
          >
            <div className="grid w-fit grid-cols-10 gap-1">
              {Array.from({ length: board.cubes }, (_, i) => (
                <CubePiece
                  key={`c-${i}`}
                  delaySec={i >= burstBase ? (i - burstBase) * 0.045 : 0}
                  selected={selected === 'cube' && i === board.cubes - 1}
                  counting={
                    phase === 'count' && countMark >= board.bars && countMark - board.bars === i
                  }
                  excess={
                    plan !== null && plan.removeCubes > 0 && i >= board.cubes - plan.removeCubes
                  }
                />
              ))}
              {plan !== null &&
                Array.from({ length: plan.addCubes }, (_, i) => (
                  <CubePiece key={`gc-${i}`} ghost />
                ))}
            </div>
            {board.cubes === 0 && (plan === null || plan.addCubes === 0) && (
              <span className="px-2 text-sm font-bold text-ink-soft/60">
                Les petits cubes iront ici
              </span>
            )}
          </button>

          {/* Indice en filigrane après 2 échecs */}
          {hint && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-card bg-white/85">
              <div className="animate-pop flex flex-col items-center gap-2 p-4 text-center">
                <span className="text-base font-extrabold text-ink-soft">Petit secret…</span>
                <div className="flex items-start gap-2">
                  <div className="flex gap-1.5">
                    {Array.from({ length: hint.bars }, (_, i) => (
                      <BarPiece key={`hb-${i}`} ghost />
                    ))}
                  </div>
                  {hint.cubes > 0 && (
                    <div className="grid grid-cols-5 gap-1">
                      {Array.from({ length: hint.cubes }, (_, i) => (
                        <CubePiece key={`hc-${i}`} ghost />
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xl font-extrabold text-ink">{hintLabel(hint)}</span>
              </div>
            </div>
          )}

          {/* Tampon de livraison réussie */}
          {stamp && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2">
              <span aria-hidden="true" className="animate-bounce-in text-7xl">📦</span>
              <span className="animate-pop -rotate-6 rounded-xl border-4 border-coral-deep bg-white/90 px-4 py-1 text-3xl font-extrabold text-coral-deep">
                LIVRÉ !
              </span>
            </div>
          )}
        </div>

        {/* ---------- Palette + Machine + Livraison ---------- */}
        <div className="flex shrink-0 flex-col gap-2 sm:gap-3 lg:w-64">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-3">
            <button
              type="button"
              onClick={() => tapPalette('bar')}
              aria-label={
                selected === 'bar' ? 'Ranger la barre prise' : 'Prendre une barre de dix'
              }
              className={`card tap-target relative flex items-center justify-center gap-2 px-2 py-2 transition-transform active:scale-95 ${
                paletteShake === 'bar' ? 'animate-shake-soft' : ''
              } ${!barAddable && selected !== 'bar' ? 'opacity-45' : ''} ${
                selected === 'bar' ? 'animate-pulse-glow' : ''
              }`}
            >
              <BarPiece mini />
              <span className="text-left text-sm font-extrabold leading-tight text-ink">
                Barre
                <br />
                <span className="font-bold text-ink-soft">de dix</span>
              </span>
              {selected === 'bar' && (
                <span aria-hidden="true" className="animate-pop absolute -right-1 -top-2 text-2xl">
                  ↩️
                </span>
              )}
              {!barAddable && barConstrained && selected !== 'bar' && (
                <span aria-hidden="true" className="absolute -right-1 -top-2 text-2xl">🔒</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => tapPalette('cube')}
              aria-label={selected === 'cube' ? 'Ranger le cube pris' : 'Prendre un petit cube'}
              className={`card tap-target relative flex items-center justify-center gap-2 px-2 py-2 transition-transform active:scale-95 ${
                paletteShake === 'cube' ? 'animate-shake-soft' : ''
              } ${!cubeAddable && selected !== 'cube' ? 'opacity-45' : ''} ${
                selected === 'cube' ? 'animate-pulse-glow' : ''
              }`}
            >
              <CubePiece mini />
              <span className="text-left text-sm font-extrabold leading-tight text-ink">
                Cube
                <br />
                <span className="font-bold text-ink-soft">tout seul</span>
              </span>
              {selected === 'cube' && (
                <span aria-hidden="true" className="animate-pop absolute -right-1 -top-2 text-2xl">
                  ↩️
                </span>
              )}
            </button>
          </div>

          <div
            className={`card relative flex flex-col items-center gap-1.5 p-3 ${
              machineFx === 'nope' ? 'animate-shake-soft' : ''
            }`}
          >
            <button
              type="button"
              onClick={tapMachine}
              aria-label="La machine casse-barre : prends une barre puis tape ici"
              className={`tap-target relative flex w-full items-center justify-center gap-1 rounded-2xl py-1 transition-transform active:scale-95 ${
                breakReady ? 'animate-pulse-glow' : ''
              }`}
              style={{ background: 'linear-gradient(160deg, #eceff1, #cfd8dc)' }}
            >
              <span aria-hidden="true" className={`text-5xl ${machineFx ? 'animate-wiggle' : ''}`}>
                ⚙️
              </span>
              <span aria-hidden="true" className="text-3xl">🔨</span>
              {machineFx === 'break' && (
                <span aria-hidden="true" className="animate-pop absolute -top-3 text-4xl">💥</span>
              )}
              {machineFx === 'solder' && (
                <span aria-hidden="true" className="animate-pop absolute -top-3 text-4xl">✨</span>
              )}
            </button>
            <span className="text-center text-xs font-extrabold text-ink-soft">
              {breakReady
                ? 'Tape la machine : crac, 10 cubes !'
                : 'La Machine — prends une barre, puis tape-la ici !'}
            </span>
            <button
              type="button"
              onClick={solder}
              disabled={busy || !canSolder(board, order)}
              className="tap-target w-full rounded-full bg-grape px-4 py-1.5 text-base font-extrabold text-white shadow-card transition-transform active:scale-95 disabled:opacity-35"
            >
              Souder 10 cubes ✨
            </button>
          </div>

          <BigButton
            variant="accent"
            accent={ACCENT}
            disabled={busy || total === 0}
            onClick={() => {
              void deliver()
            }}
            className="w-full text-2xl"
          >
            Livrer ! 🚚
          </BigButton>
        </div>
      </div>

      <FeedbackOverlay kind={feedback} onDone={handleFeedbackDone} />
    </div>
  )
}

// ============================================================
// Composant racine : accueil -> partie -> écran de fin.
// ============================================================

type Screen = 'home' | 'play' | 'end'

export default function FabriqueDeNombres() {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('home')
  const [save, setSave] = useState<SaveData>(EMPTY_SAVE)
  const [tierId, setTierId] = useState<TierId>(0)
  const [runId, setRunId] = useState(0)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<LevelResult | null>(null)
  const saveRef = useRef<SaveData>(EMPTY_SAVE)
  const replayRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let live = true
    void pget<SaveData>(SAVE_KEY).then((stored) => {
      if (!live || !stored) return
      saveRef.current = stored
      setSave(stored)
      setTierId(Math.min(stored.unlockedTier, TIERS.length - 1) as TierId)
    })
    return () => {
      live = false
    }
  }, [])

  const startRun = (): void => {
    setProgress(0)
    setRunId((r) => r + 1)
    setScreen('play')
  }

  const handleRunEnd = useCallback((res: LevelResult, tier: TierId): void => {
    const prev = saveRef.current
    const next = applyRunToSave(prev, tier, res.stars)
    saveRef.current = next
    setSave(next)
    void pset(SAVE_KEY, next)
    setResult(res)
    setScreen('end')
    if (next.unlockedTier > prev.unlockedTier) {
      window.setTimeout(() => {
        void say(uiEntry('ui.nouveau-niveau'), { interrupt: false })
      }, 2400)
    }
  }, [])

  return (
    <GameShell
      meta={META}
      hud={
        screen === 'play' ? <ProgressDots total={ITEMS_PER_RUN} done={progress} /> : undefined
      }
      onReplayInstruction={screen === 'play' ? () => replayRef.current?.() : undefined}
    >
      {screen === 'home' && (
        <HomeScreen save={save} tierId={tierId} onSelect={setTierId} onPlay={startRun} />
      )}
      {screen === 'play' && (
        <Run
          key={runId}
          tier={TIERS[tierId]}
          replayRef={replayRef}
          onProgress={setProgress}
          onEnd={handleRunEnd}
        />
      )}
      {screen === 'end' && result && (
        <LevelEnd result={result} onReplay={startRun} onHome={() => navigate('/')} />
      )}
    </GameShell>
  )
}
