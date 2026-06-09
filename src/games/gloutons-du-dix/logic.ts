// ============================================================
// Les Gloutons du Dix — logique PURE.
// Génération procédurale des items + validation des sommes.
// Aucun import React/DOM. Prouvé par logic.test.ts :
// chaque item généré est TOUJOURS résoluble.
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'

export type TierId = 0 | 1 | 2 | 3

export interface GdxToken {
  /** id stable = position d'affichage (0..n-1) */
  id: number
  /** valeur en baies (≥ 1) */
  value: number
}

export interface GdxItem {
  tier: TierId
  /** total exact que veulent le(s) glouton(s) */
  target: number
  /** T2 : valeur déjà avalée, visible dans le ventre (0 sinon) */
  prefilled: number
  /** T3 : jumeaux — CHAQUE jeton donné est mangé par CHACUN des deux */
  gloutons: 1 | 2
  tokens: GdxToken[]
  /** ids d'UNE solution exacte — sert à l'indice après 2 échecs */
  solutionIds: number[]
}

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'ma.gs.decompo5',
  'ma.gs.decompo10',
  'ma.cp.complements10',
  'ma.cp.doubles',
] as const

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plage resserrée, 1 = plage élargie. */
export const MAX_TUNER_LEVEL = 1

/** Représentation des nombres selon le palier (cible ET jetons). */
export type NumberStyle = 'dots' | 'dots-digit' | 'digit'

export function numberStyle(tier: TierId): NumberStyle {
  if (tier === 0) return 'dots'
  if (tier === 1) return 'dots-digit'
  return 'digit'
}

export interface TierSpec {
  /** [min, max] de la cible, par niveau de Tuner (index = niveau) */
  targetRanges: ReadonlyArray<readonly [number, number]>
  valueMin: number
  valueMax: number
  tokenCount: number
}

export const TIER_SPECS: Readonly<Record<TierId, TierSpec>> = {
  0: { targetRanges: [[3, 4], [3, 5]], valueMin: 1, valueMax: 4, tokenCount: 6 },
  1: { targetRanges: [[6, 8], [6, 10]], valueMin: 1, valueMax: 9, tokenCount: 7 },
  2: { targetRanges: [[10, 10], [10, 10]], valueMin: 1, valueMax: 9, tokenCount: 6 },
  3: { targetRanges: [[2, 12], [2, 20]], valueMin: 1, valueMax: 10, tokenCount: 6 },
}

/** T2 : plage du jeton déjà avalé, par niveau de Tuner. */
export const PREFILLED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [1, 9],
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

/** Paires (a ≤ b) de valeurs autorisées dont la somme vaut target. */
export function pairsFor(
  target: number,
  valueMin: number,
  valueMax: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let a = valueMin; a <= Math.min(valueMax, Math.floor(target / 2)); a++) {
    const b = target - a
    if (b >= a && b <= valueMax) out.push([a, b])
  }
  return out
}

/**
 * Assemble les jetons : la solution, des jetons imposés (piège T2),
 * jusqu'à 2 distracteurs « plausibles » (valeurs voisines), puis
 * complément aléatoire. Retourne les ids de la solution après mélange.
 */
function buildTokens(
  solution: readonly number[],
  forced: readonly number[],
  count: number,
  valueMin: number,
  valueMax: number,
  isForbidden: (v: number) => boolean,
  preferred: readonly number[],
): { tokens: GdxToken[]; solutionIds: number[] } {
  const values: number[] = [...solution]
  for (const v of forced) if (values.length < count) values.push(v)
  const plausible = shuffle(
    preferred.filter((v) => v >= valueMin && v <= valueMax && !isForbidden(v)),
  ).slice(0, 2)
  for (const v of plausible) if (values.length < count) values.push(v)
  let guard = 0
  while (values.length < count) {
    const v = randInt(valueMin, valueMax)
    if (!isForbidden(v)) values.push(v)
    if (++guard > 999) throw new Error('génération de distracteurs impossible')
  }
  const tokens = shuffle(values).map((value, id): GdxToken => ({ id, value }))
  const used = new Set<number>()
  const solutionIds = solution.map((v) => {
    const tok = tokens.find((t) => t.value === v && !used.has(t.id))
    if (!tok) throw new Error('solution introuvable dans les jetons générés')
    used.add(tok.id)
    return tok.id
  })
  return { tokens, solutionIds }
}

// ------------------------------------------------------------
// Génération d'items
// ------------------------------------------------------------

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoid` évite de reproposer le même puzzle deux fois de suite :
 * la cible précédente (T0/T1/T3) ou le jeton déjà avalé (T2).
 */
export function generateItem(tier: TierId, level: number, avoid?: number): GdxItem {
  const lvl = clampLevel(level)
  const spec = TIER_SPECS[tier]
  const [lo, hi] = spec.targetRanges[lvl]

  if (tier === 2) {
    // Compléments à 10 : la cible est TOUJOURS 10, un jeton est déjà avalé.
    const [plo, phi] = PREFILLED_RANGES[lvl]
    const prefilled = pickAvoiding(rangeValues(plo, phi), avoid)
    const complement = 10 - prefilled
    const { tokens, solutionIds } = buildTokens(
      [complement],
      [prefilled], // piège plausible : redonner ce qu'il a déjà
      spec.tokenCount,
      spec.valueMin,
      spec.valueMax,
      () => false,
      [complement - 1, complement + 1],
    )
    return { tier, target: 10, prefilled, gloutons: 1, tokens, solutionIds }
  }

  if (tier === 3) {
    // Doubles : cible paire, chaque jumeau mange le même jeton.
    const targets = rangeValues(lo, hi).filter((t) => t % 2 === 0)
    const target = pickAvoiding(targets, avoid)
    const half = target / 2
    const { tokens, solutionIds } = buildTokens(
      [half],
      [],
      spec.tokenCount,
      spec.valueMin,
      spec.valueMax,
      () => false,
      [half - 1, half + 1],
    )
    return { tier, target, prefilled: 0, gloutons: 2, tokens, solutionIds }
  }

  // T0 / T1 : décomposition en une paire exacte.
  const target = pickAvoiding(rangeValues(lo, hi), avoid)
  const pairs = pairsFor(target, spec.valueMin, spec.valueMax)
  if (pairs.length === 0) throw new Error(`aucune paire possible pour la cible ${target}`)
  const [a, b] = pick(pairs)
  const { tokens, solutionIds } = buildTokens(
    [a, b],
    [],
    spec.tokenCount,
    spec.valueMin,
    spec.valueMax,
    // Jamais de jeton = cible : l'enfant doit DÉCOMPOSER, pas recopier.
    (v) => v === target,
    [a - 1, a + 1, b - 1, b + 1],
  )
  return { tier, target, prefilled: 0, gloutons: 1, tokens, solutionIds }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** Somme brute des jetons sélectionnés (ids inconnus ignorés). */
export function sumSelected(item: GdxItem, ids: readonly number[]): number {
  const byId = new Map(item.tokens.map((t) => [t.id, t.value]))
  return ids.reduce((s, id) => s + (byId.get(id) ?? 0), 0)
}

/** Total dans le(s) ventre(s) : déjà avalé + chaque jumeau mange chaque jeton. */
export function bellyTotal(item: GdxItem, ids: readonly number[]): number {
  return item.prefilled + item.gloutons * sumSelected(item, ids)
}

/** Le compte est-il exact ? (au moins un jeton donné, somme stricte) */
export function isExact(item: GdxItem, ids: readonly number[]): boolean {
  return ids.length > 0 && bellyTotal(item, ids) === item.target
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

export interface GdxProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: GdxProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: GdxProgress, tier: TierId, stars: 1 | 2 | 3): GdxProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
