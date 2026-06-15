// ============================================================
// Le Mètre Magique — logique PURE.
// Deux mécaniques de PRODUCTION (zéro QCM) :
//  • « comparer » (T0/T1) : 2 (T0) ou 3 (T1) objets de longueurs
//    TOUTES DISTINCTES sont posés ; l'enfant trouve le PLUS LONG
//    ou le PLUS COURT en tapant le bon objet. Un seul extremum.
//  • « mesurer » (T2/T3) : un objet est posé le long d'une règle
//    de petits cubes alignés ; l'enfant compte les cubes et tape
//    le bon nombre parmi des cartes-nombres (cible + distracteurs
//    ±1/±2, tous ≥ 1).
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item
// généré est TOUJOURS résoluble (longueurs distinctes → extremum
// unique ; le nombre cible figure parmi les choix avec ≥1
// distracteur ; appliquer la bonne réponse résout l'item).
// ============================================================

import { pick, shuffle, randInt } from '@/engine/rng'

// ------------------------------------------------------------
// Le bestiaire d'objets-barres : chaque objet est dessiné comme
// une barre (largeur = longueur) terminée par une tête emoji.
// ------------------------------------------------------------

export interface LongObject {
  id: string
  name: string
  emoji: string
}

export const OBJECTS: readonly LongObject[] = [
  { id: 'serpent', name: 'le serpent', emoji: '🐍' },
  { id: 'train', name: 'le train', emoji: '🚂' },
  { id: 'baguette', name: 'la baguette', emoji: '🥖' },
  { id: 'crayon', name: 'le crayon', emoji: '✏️' },
  { id: 'ver', name: 'le ver', emoji: '🪱' },
  { id: 'ruban', name: 'le ruban', emoji: '🎀' },
]

export const OBJECTS_BY_ID: ReadonlyMap<string, LongObject> = new Map(
  OBJECTS.map((o) => [o.id, o]),
)

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plus simple, 1 = plus corsé. */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'ma.gs.mesure.comparer',
  'ma.gs.mesure.comparer',
  'ma.cp.mesure.longueurs',
  'ma.cp.mesure.longueurs',
] as const

/** T0/T1 = comparer ; T2/T3 = mesurer par report. */
export function isCompareTier(tier: TierId): boolean {
  return tier <= 1
}

/** Quel extremum cherche-t-on : le plus long ou le plus court. */
export type Extreme = 'long' | 'short'

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

/** Un objet posé sur la table avec sa longueur en unités (cubes). */
export interface PlacedObject {
  id: string
  /** Longueur en unités ; toutes distinctes au sein d'un même item. */
  length: number
}

export interface CompareItem {
  kind: 'compare'
  tier: TierId
  /** Cherche-t-on le plus long ou le plus court ? */
  extreme: Extreme
  /** Objets posés (longueurs TOUTES distinctes), déjà mélangés. */
  objects: PlacedObject[]
  /** Id de l'objet à taper (extremum unique). */
  targetId: string
}

export interface MeasureItem {
  kind: 'measure'
  tier: TierId
  /** L'objet mesuré. */
  objectId: string
  /** Longueur réelle en cubes (la bonne réponse). */
  cubes: number
  /** Cartes-nombres proposées (la cible + distracteurs ±1/±2, ≥1), mélangées. */
  choices: number[]
}

export type MetreItem = CompareItem | MeasureItem

// ------------------------------------------------------------
// Bornes de longueurs
// ------------------------------------------------------------

/** Combien d'objets à comparer pour un palier. */
function compareObjectCount(tier: TierId): 2 | 3 {
  return tier === 0 ? 2 : 3
}

/** Plage de longueurs (cubes) pour le mode mesurer selon le palier. */
function cubeRange(tier: TierId): { min: number; max: number } {
  return tier === 2 ? { min: 2, max: 5 } : { min: 3, max: 9 }
}

// ------------------------------------------------------------
// Génération procédurale
// ------------------------------------------------------------

/** Tire `n` longueurs entières DISTINCTES dans [min, max]. */
function distinctLengths(n: number, min: number, max: number): number[] {
  const range: number[] = []
  for (let v = min; v <= max; v++) range.push(v)
  return shuffle(range).slice(0, n)
}

/**
 * T0/T1 — pose 2 (T0) ou 3 (T1) objets de longueurs TOUTES distinctes.
 * On cherche le plus long ou le plus court ; l'extremum est donc unique.
 * `avoid` évite de reproposer le même couple (cible + extremum) deux
 * fois de suite quand c'est possible.
 */
export function generateCompareItem(tier: TierId, level: number, avoid?: string): CompareItem {
  const count = compareObjectCount(tier)
  // Plage de longueurs : assez large pour des écarts lisibles ; le
  // niveau 1 resserre l'écart (plus subtil) tout en restant distinct.
  const span = clampLevel(level) === 0 ? 6 : 4
  const min = 2
  const lengths = distinctLengths(count, min, min + span)
  const ids = shuffle(OBJECTS.map((o) => o.id)).slice(0, count)
  const objects: PlacedObject[] = ids.map((id, i) => ({ id, length: lengths[i] }))

  const extreme: Extreme = randInt(0, 1) === 0 ? 'long' : 'short'
  const targetId = extremeTarget(objects, extreme)

  const item: CompareItem = { kind: 'compare', tier, extreme, objects: shuffle(objects), targetId }
  // Évite de reproposer exactement le même objet-cible + même extremum.
  if (avoid !== undefined && compareKey(item) === avoid) {
    return generateCompareItem(tier, level, avoid)
  }
  return item
}

/** L'objet extremum (plus long / plus court). Les longueurs étant toutes
 *  distinctes, il est unique. */
export function extremeTarget(objects: readonly PlacedObject[], extreme: Extreme): string {
  let best = objects[0]
  for (const o of objects) {
    if (extreme === 'long' ? o.length > best.length : o.length < best.length) best = o
  }
  return best.id
}

/** Clé d'unicité d'un item « comparer » (cible + extremum), pour `avoid`. */
export function compareKey(item: CompareItem): string {
  return `${item.extreme}:${item.targetId}`
}

/**
 * T2/T3 — un objet posé le long d'une règle de cubes. L'enfant compte
 * et tape le bon nombre. Les distracteurs sont ±1/±2 autour de la
 * cible, tous ≥ 1, jamais égaux à la cible. La cible figure TOUJOURS
 * parmi les choix, et il y a ≥ 1 distracteur. `avoid` évite de
 * reproposer le même couple (objet, nombre) deux fois de suite.
 */
export function generateMeasureItem(tier: TierId, level: number, avoid?: string): MeasureItem {
  const { min, max } = cubeRange(tier)
  const cubes = randInt(min, max)
  const objectId = pick(OBJECTS.map((o) => o.id))

  // Distracteurs candidats : ±1 et ±2, bornés à ≥ 1, sans la cible.
  const candidates = shuffle(
    [-1, 1, -2, 2].map((d) => cubes + d).filter((v) => v >= 1 && v !== cubes),
  )
  // 3 distracteurs si possible (4 cartes), sinon au moins 1 (garde-fou).
  const wantedDistractors = clampLevel(level) === 0 ? 2 : 3
  const uniqueCandidates = Array.from(new Set(candidates))
  const distractors = uniqueCandidates.slice(0, Math.max(1, Math.min(wantedDistractors, uniqueCandidates.length)))
  const choices = shuffle([cubes, ...distractors])

  const item: MeasureItem = { kind: 'measure', tier, objectId, cubes, choices }
  if (avoid !== undefined && measureKey(item) === avoid) {
    return generateMeasureItem(tier, level, avoid)
  }
  return item
}

/** Clé d'unicité d'un item « mesurer » (objet + nombre), pour `avoid`. */
export function measureKey(item: MeasureItem): string {
  return `${item.objectId}:${item.cubes}`
}

/** Façade unifiée (parité avec cantine-foret). `avoid` = clé de l'item précédent. */
export function generateItem(tier: TierId, level: number, avoid?: string): MetreItem {
  if (isCompareTier(tier)) return generateCompareItem(tier, level, avoid)
  return generateMeasureItem(tier, level, avoid)
}

/** Clé d'unicité d'un item, quel que soit son type (pour `avoid`). */
export function itemKey(item: MetreItem): string {
  return item.kind === 'compare' ? compareKey(item) : measureKey(item)
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** L'objet tapé est-il bien l'extremum demandé ? */
export function compareCorrect(item: CompareItem, objectId: string): boolean {
  return objectId === item.targetId
}

/** Le nombre tapé est-il bien le nombre de cubes ? */
export function measureCorrect(item: MeasureItem, n: number): boolean {
  return n === item.cubes
}

// ------------------------------------------------------------
// Score & progression (pattern de référence cantine-foret)
// ------------------------------------------------------------

/** Étoiles d'une partie : seuls les PREMIERS essais comptent. */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface MmgProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: MmgProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: MmgProgress, tier: TierId, stars: 1 | 2 | 3): MmgProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
