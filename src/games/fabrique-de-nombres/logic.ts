// ============================================================
// La Fabrique de Nombres — logique PURE.
// Génération procédurale des commandes, contraintes T3 toujours
// satisfaisables, validation des livraisons, plan de correction.
// AUCUN import React/DOM — tout est prouvé par logic.test.ts.
// ============================================================

import { randInt } from '@/engine/rng'

// ---------- Paliers ----------

export type TierId = 0 | 1 | 2 | 3

export interface TierDef {
  id: TierId
  /** Compétence du SKILL_MAP exercée par ce palier */
  skill: string
  name: string
  sub: string
  emoji: string
}

export const TIERS: readonly TierDef[] = [
  { id: 0, skill: 'ma.cp.num.lire59', name: 'Petites commandes', sub: 'Jusqu’à 19', emoji: '📦' },
  { id: 1, skill: 'ma.cp.num.dizaines', name: 'Grosses commandes', sub: 'Jusqu’à 59', emoji: '🚚' },
  { id: 2, skill: 'ma.cp.num.decompo100', name: 'Commandes géantes', sub: 'Jusqu’à 99', emoji: '🏭' },
  { id: 3, skill: 'ma.cp.num.echange', name: 'Défis de la machine', sub: 'Casse et soude !', emoji: '🔧' },
]

export const ITEMS_PER_RUN = 8

/** Limites physiques du plateau (l'écran doit rester lisible). */
export const MAX_BARS_ON_BOARD = 10
export const MAX_CUBES_ON_BOARD = 39
/** Total plafonné à 99 : le comptage vocal s'appuie sur les clips nombre.0-100. */
export const MAX_BOARD_TOTAL = 99

/** Plage du Tuner : 3 bandes de difficulté par palier. */
export const MIN_TUNER_LEVEL = 0
export const MAX_TUNER_LEVEL = 2

// ---------- Commandes et contraintes ----------

export type ConstraintKind = 'max-bars' | 'no-bars' | 'min-cubes'

export interface Constraint {
  kind: ConstraintKind
  /** max-bars : nb max de barres — no-bars : 0 — min-cubes : nb min de cubes */
  value: number
}

export interface Order {
  /** Le nombre à fabriquer */
  target: number
  /** Défi T3 (absent aux paliers 0-2) */
  constraint?: Constraint
}

export interface BoardState {
  bars: number
  cubes: number
}

// ---------- Bandes de génération (Tuner 0..2) ----------

const TIER_BANDS: Record<TierId, ReadonlyArray<readonly [number, number]>> = {
  0: [
    [5, 9],
    [10, 14],
    [15, 19],
  ],
  1: [
    [20, 32],
    [33, 45],
    [46, 59],
  ],
  2: [
    [60, 72],
    [73, 85],
    [86, 99],
  ],
  // Cibles des défis max-bars / min-cubes (dizaines >= 2 garanties)
  3: [
    [20, 39],
    [30, 49],
    [40, 59],
  ],
}

/** Cibles « sans aucune barre » : bornées pour que poser N cubes reste jouable. */
const NO_BARS_BANDS: ReadonlyArray<readonly [number, number]> = [
  [10, 13],
  [13, 16],
  [16, 20],
]

function clampLevel(level: number): number {
  return Math.max(MIN_TUNER_LEVEL, Math.min(MAX_TUNER_LEVEL, Math.trunc(level)))
}

/**
 * Tire une cible dans [lo..hi] en évitant les cibles récentes,
 * de façon DÉTERMINISTE : si tout l'intervalle est récent, on tire
 * quand même dedans (jamais de boucle infinie).
 */
function pickTarget(lo: number, hi: number, recent: readonly number[]): number {
  const fresh: number[] = []
  for (let n = lo; n <= hi; n++) {
    if (!recent.includes(n)) fresh.push(n)
  }
  if (fresh.length === 0) return randInt(lo, hi)
  return fresh[randInt(0, fresh.length - 1)]
}

export function canonical(n: number): { tens: number; units: number } {
  return { tens: Math.floor(n / 10), units: n % 10 }
}

export function boardTotal(s: BoardState): number {
  return s.bars * 10 + s.cubes
}

/** Nombre de barres autorisées sur le plateau pour cette commande. */
export function allowedBars(order: Order): number {
  const c = order.constraint
  if (c?.kind === 'max-bars') return c.value
  if (c?.kind === 'no-bars') return 0
  return MAX_BARS_ON_BOARD
}

// ---------- Génération ----------

function genSimple(tier: TierId, level: number, recent: readonly number[]): Order {
  const band = TIER_BANDS[tier][clampLevel(level)]
  return { target: pickTarget(band[0], band[1], recent) }
}

/**
 * « Fabrique 43 avec seulement 3 barres » : le quota est TOUJOURS
 * inférieur au chiffre des dizaines (le défi force une décomposition
 * non canonique) et les cubes nécessaires restent <= 24 (lisible).
 */
function genMaxBars(level: number, recent: readonly number[]): Order {
  const band = TIER_BANDS[3][clampLevel(level)]
  const target = pickTarget(band[0], band[1], recent)
  const { tens, units } = canonical(target)
  // Niveau 2 : parfois 2 barres de moins (20+u cubes), sinon 1 de moins (10+u).
  const deep = clampLevel(level) >= 2 && tens >= 3 && units <= 4 && randInt(0, 1) === 1
  const value = deep ? tens - 2 : tens - 1
  return { target, constraint: { kind: 'max-bars', value } }
}

/** « Fabrique 14 sans aucune barre » : que des cubes (cible bornée à 20). */
function genNoBars(level: number, recent: readonly number[]): Order {
  const band = NO_BARS_BANDS[clampLevel(level)]
  const target = pickTarget(band[0], band[1], recent)
  return { target, constraint: { kind: 'no-bars', value: 0 } }
}

/**
 * « Fabrique 26 avec au moins 16 cubes » : le minimum vaut 10+u
 * (ou 20+u au niveau 2), donc il dépasse toujours les unités
 * canoniques — il FAUT échanger une barre contre des cubes.
 */
function genMinCubes(level: number, recent: readonly number[]): Order {
  const band = TIER_BANDS[3][clampLevel(level)]
  const target = pickTarget(band[0], band[1], recent)
  const { tens, units } = canonical(target)
  const deep = clampLevel(level) >= 2 && tens >= 3 && units <= 4 && randInt(0, 1) === 1
  const value = (deep ? 20 : 10) + units
  return { target, constraint: { kind: 'min-cubes', value } }
}

/**
 * Génère la commande d'un item. Au palier 3 les trois variantes de
 * défi tournent en boucle (itemIndex % 3) pour varier les contraintes.
 */
export function generateOrder(
  tier: TierId,
  level: number,
  itemIndex: number,
  recent: readonly number[],
): Order {
  if (tier < 3) return genSimple(tier, level, recent)
  const variant = Math.abs(Math.trunc(itemIndex)) % 3
  if (variant === 0) return genMaxBars(level, recent)
  if (variant === 1) return genNoBars(level, recent)
  return genMinCubes(level, recent)
}

// ---------- Résolution / validation ----------

/** UNE solution valide de la commande (sert d'indice et de preuve). */
export function solveOrder(order: Order): BoardState {
  const { tens, units } = canonical(order.target)
  const c = order.constraint
  if (c?.kind === 'no-bars') return { bars: 0, cubes: order.target }
  if (c?.kind === 'max-bars') {
    const bars = Math.min(c.value, tens)
    return { bars, cubes: order.target - bars * 10 }
  }
  if (c?.kind === 'min-cubes') {
    // Le plus petit nb de cubes >= value congru aux unités modulo 10
    const rest = (((order.target - c.value) % 10) + 10) % 10
    const cubes = c.value + rest
    return { bars: (order.target - cubes) / 10, cubes }
  }
  return { bars: tens, cubes: units }
}

export type DeliveryVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'excess'; diff: number }
  | { ok: false; reason: 'constraint'; constraint: Constraint }

/** Vérifie une livraison : total d'abord, puis respect du défi. */
export function validateDelivery(order: Order, board: BoardState): DeliveryVerdict {
  const total = boardTotal(board)
  if (total < order.target) return { ok: false, reason: 'missing', diff: order.target - total }
  if (total > order.target) return { ok: false, reason: 'excess', diff: total - order.target }
  const c = order.constraint
  if (c) {
    if ((c.kind === 'max-bars' || c.kind === 'no-bars') && board.bars > allowedBars(order)) {
      return { ok: false, reason: 'constraint', constraint: c }
    }
    if (c.kind === 'min-cubes' && board.cubes < c.value) {
      return { ok: false, reason: 'constraint', constraint: c }
    }
  }
  return { ok: true }
}

/** Une commande est résoluble si SA solution passe la validation. */
export function isOrderSolvable(order: Order): boolean {
  const sol = solveOrder(order)
  if (sol.bars < 0 || sol.cubes < 0) return false
  if (sol.bars > MAX_BARS_ON_BOARD || sol.cubes > MAX_CUBES_ON_BOARD) return false
  return validateDelivery(order, sol).ok
}

// ---------- Garde-fous d'interaction (verrous de la palette) ----------

export function canAddBar(s: BoardState, order: Order): boolean {
  return (
    boardTotal(s) + 10 <= MAX_BOARD_TOTAL &&
    s.bars < Math.min(MAX_BARS_ON_BOARD, allowedBars(order))
  )
}

export function canAddCube(s: BoardState): boolean {
  return boardTotal(s) < MAX_BOARD_TOTAL && s.cubes < MAX_CUBES_ON_BOARD
}

/** Casser une barre : il en faut une, et la place pour 10 cubes de plus. */
export function canBreak(s: BoardState): boolean {
  return s.bars >= 1 && s.cubes + 10 <= MAX_CUBES_ON_BOARD
}

/** Souder : 10 cubes dispo, et le droit d'avoir une barre de plus. */
export function canSolder(s: BoardState, order: Order): boolean {
  return s.cubes >= 10 && s.bars + 1 <= Math.min(MAX_BARS_ON_BOARD, allowedBars(order))
}

// ---------- Feedback élaboratif : fantômes / surplus ----------

export interface DeliveryPlan {
  addBars: number
  removeBars: number
  addCubes: number
  removeCubes: number
}

/**
 * Plus petit chemin de correction depuis le plateau actuel vers UNE
 * solution valide (en nb de pièces à ajouter/enlever). Sert à dessiner
 * les pièces manquantes en pointillés et les pièces en trop en rouge.
 */
export function deliveryDiff(order: Order, board: BoardState): DeliveryPlan {
  const maxBars = Math.min(MAX_BARS_ON_BOARD, allowedBars(order))
  const minCubes = order.constraint?.kind === 'min-cubes' ? order.constraint.value : 0
  let best: BoardState | null = null
  let bestCost = Number.POSITIVE_INFINITY
  for (let bars = 0; bars <= maxBars; bars++) {
    const cubes = order.target - bars * 10
    if (cubes < 0 || cubes > MAX_CUBES_ON_BOARD || cubes < minCubes) continue
    const cost = Math.abs(bars - board.bars) + Math.abs(cubes - board.cubes)
    if (
      cost < bestCost ||
      (best !== null &&
        cost === bestCost &&
        Math.abs(bars - board.bars) < Math.abs(best.bars - board.bars))
    ) {
      best = { bars, cubes }
      bestCost = cost
    }
  }
  const goal = best ?? solveOrder(order)
  return {
    addBars: Math.max(0, goal.bars - board.bars),
    removeBars: Math.max(0, board.bars - goal.bars),
    addCubes: Math.max(0, goal.cubes - board.cubes),
    removeCubes: Math.max(0, board.cubes - goal.cubes),
  }
}

// ---------- Comptage sonore de la livraison ----------

/**
 * Les nombres prononcés pendant la livraison : les barres par dizaines
 * (10, 20, 30…) puis les cubes un par un (41, 42, 43…).
 */
export function countingSteps(board: BoardState): number[] {
  const steps: number[] = []
  for (let i = 1; i <= board.bars; i++) steps.push(i * 10)
  const base = board.bars * 10
  for (let j = 1; j <= board.cubes; j++) steps.push(base + j)
  return steps
}

// ---------- Étoiles et progression persistée ----------

export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface SaveData {
  bestStars: Partial<Record<TierId, 0 | 1 | 2 | 3>>
  unlockedTier: number
  runs: number
}

export const EMPTY_SAVE: SaveData = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique une fin de partie : meilleur score, déblocage à >= 2 étoiles. */
export function applyRunToSave(save: SaveData, tier: TierId, stars: 1 | 2 | 3): SaveData {
  const best = Math.max(save.bestStars[tier] ?? 0, stars) as 1 | 2 | 3
  let unlockedTier = save.unlockedTier
  if (stars >= 2 && tier < TIERS.length - 1) {
    unlockedTier = Math.max(unlockedTier, tier + 1)
  }
  return {
    bestStars: { ...save.bestStars, [tier]: best },
    unlockedTier,
    runs: save.runs + 1,
  }
}
