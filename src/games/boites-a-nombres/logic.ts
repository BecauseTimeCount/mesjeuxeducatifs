// ============================================================
// Les Boîtes à Nombres — logique PURE.
// Génération procédurale des commandes (dénombrement,
// surcomptage, subitizing) + validation. Aucun import React/DOM.
// Prouvé par logic.test.ts : chaque item est TOUJOURS résoluble
// (le tas contient toujours plus d'objets que nécessaire).
// ============================================================

import { pick, randInt } from '@/engine/rng'

export type TierId = 0 | 1 | 2 | 3

// ---------- Subitizing (palier T3) ----------

export type FlashKind = 'dice' | 'double-dice' | 'ten-frame'

export interface BanFlash {
  kind: FlashKind
  /** quantité montrée pendant le flash (= la commande) */
  value: number
  /** double-dé : répartition (a, b), chacun entre 1 et 6, a + b = value */
  parts: readonly [number, number] | null
  /** durée d'ouverture de la boîte en millisecondes */
  durationMs: number
}

export interface FlashSpec {
  range: readonly [number, number]
  durationMs: number
  kinds: readonly FlashKind[]
}

/** Par niveau de Tuner : dés 1-6 pendant 2 s, puis jusqu'à 10 pendant 1,5 s. */
export const FLASH_SPECS: ReadonlyArray<FlashSpec> = [
  { range: [1, 6], durationMs: 2000, kinds: ['dice'] },
  { range: [2, 10], durationMs: 1500, kinds: ['double-dice', 'ten-frame'] },
]

// ---------- Items ----------

export interface BanItem {
  tier: TierId
  /** la commande : nombre TOTAL d'objets attendus dans la boîte */
  order: number
  /** T2 : objets déjà préposés dans la boîte (0 sinon) */
  prefilled: number
  /** taille du tas d'objets offerts — TOUJOURS > order − prefilled (0 à T3) */
  supply: number
  /** cases visibles de la boîte : 5 (ligne) ou 10 (deux rangées de 5) */
  boxSize: 5 | 10
  /** T3 uniquement : configuration montrée en flash */
  flash: BanFlash | null
}

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'ma.gs.denombrer10',
  'ma.gs.denombrer10',
  'ma.gs.comparer',
  'ma.gs.subitizing',
] as const

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plage resserrée, 1 = plage élargie. */
export const MAX_TUNER_LEVEL = 1

export interface TierSpec {
  /** [min, max] de la commande, par niveau de Tuner (index = niveau) */
  orderRanges: ReadonlyArray<readonly [number, number]>
  boxSize: 5 | 10
}

export const TIER_SPECS: Readonly<Record<TierId, TierSpec>> = {
  0: { orderRanges: [[1, 3], [1, 5]], boxSize: 5 },
  1: { orderRanges: [[3, 7], [3, 10]], boxSize: 10 },
  2: { orderRanges: [[4, 8], [5, 10]], boxSize: 10 },
  3: { orderRanges: FLASH_SPECS.map((f) => f.range), boxSize: 10 },
}

/** T2 : plage de « ce qui manque » (order − prefilled), par niveau de Tuner. */
export const DELTA_RANGES: ReadonlyArray<readonly [number, number]> = [
  [1, 3],
  [1, 5],
]

/** T2 : la boîte arrive toujours avec au moins 2 objets dedans. */
export const MIN_PREFILLED = 2

/** Taille maximale du tas (lisibilité tablette/mobile). */
export const SUPPLY_MAX = 12

// ---------- Objets expédiés (un par partie) ----------

export interface BanObject {
  /** clé stable pour les clips audio ban.obj.<key>.* */
  key: 'noisette' | 'fraise' | 'fleur' | 'pomme' | 'champignon' | 'feuille'
  emoji: string
}

export const OBJECTS: readonly BanObject[] = [
  { key: 'noisette', emoji: '🌰' },
  { key: 'fraise', emoji: '🍓' },
  { key: 'fleur', emoji: '🌼' },
  { key: 'pomme', emoji: '🍎' },
  { key: 'champignon', emoji: '🍄' },
  { key: 'feuille', emoji: '🍂' },
]

// ------------------------------------------------------------
// Helpers internes
// ------------------------------------------------------------

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

function rangeValues(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let v = lo; v <= hi; v++) out.push(v)
  return out
}

/** Tire dans candidates en évitant `avoid` quand une alternative existe. */
function pickAvoiding(candidates: readonly number[], avoid?: number): number {
  const filtered = avoid === undefined ? candidates : candidates.filter((v) => v !== avoid)
  return pick(filtered.length > 0 ? filtered : candidates)
}

// ------------------------------------------------------------
// Génération d'items
// ------------------------------------------------------------

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoid` évite de reproposer la même commande deux fois de suite.
 */
export function generateItem(tier: TierId, level: number, avoid?: number): BanItem {
  const lvl = clampLevel(level)
  const spec = TIER_SPECS[tier]
  const [lo, hi] = spec.orderRanges[lvl]
  const order = pickAvoiding(rangeValues(lo, hi), avoid)

  if (tier === 3) {
    // Subitizing : la boîte s'ouvre en flash sur une configuration connue.
    const fspec = FLASH_SPECS[lvl]
    const kind = pick(fspec.kinds)
    let parts: readonly [number, number] | null = null
    if (kind === 'double-dice') {
      const a = randInt(Math.max(1, order - 6), Math.min(6, order - 1))
      parts = [a, order - a]
    }
    return {
      tier,
      order,
      prefilled: 0,
      supply: 0,
      boxSize: spec.boxSize,
      flash: { kind, value: order, parts, durationMs: fspec.durationMs },
    }
  }

  // T2 : la boîte arrive déjà remplie — le comptage repart de prefilled.
  let prefilled = 0
  if (tier === 2) {
    const [dlo, dhi] = DELTA_RANGES[lvl]
    const delta = randInt(dlo, Math.min(dhi, order - MIN_PREFILLED))
    prefilled = order - delta
  }

  // Le tas offre TOUJOURS un surplus : jamais « exactement le compte »,
  // sinon l'exercice de dénombrement disparaît.
  const needed = order - prefilled
  const supply = Math.min(needed + randInt(2, 4), SUPPLY_MAX)

  return { tier, order, prefilled, supply, boxSize: spec.boxSize, flash: null }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** Objets que l'enfant doit encore ajouter (commande − préposés). */
export function neededCount(item: BanItem): number {
  return item.order - item.prefilled
}

/**
 * Le compte est-il exact ? `count` = contenu TOTAL de la boîte
 * (préposés inclus) à la fermeture — ou le nombre tapé à T3.
 */
export function isExact(item: BanItem, count: number): boolean {
  return count === item.order
}

/** Objets manquants pour atteindre la commande (0 si assez). */
export function missingCount(item: BanItem, count: number): number {
  return Math.max(0, item.order - count)
}

/** Objets en trop par rapport à la commande (0 si pas trop). */
export function excessCount(item: BanItem, count: number): number {
  return Math.max(0, count - item.order)
}

// ------------------------------------------------------------
// Score & progression
// ------------------------------------------------------------

/** Étoiles d'une partie : seuls les PREMIERS essais comptent. */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface BanProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: BanProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: BanProgress, tier: TierId, stars: 1 | 2 | 3): BanProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
