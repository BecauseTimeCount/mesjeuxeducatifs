// ============================================================
// L'Atelier des Formes — logique PURE.
// Géométrie GS/CP, zéro QCM (l'enfant TROUVE / RANGE) :
//  • T0 « reconnaître une figure » : on nomme une figure plane, l'enfant
//    TAPE la bonne figure parmi des distracteurs (autres figures planes).
//  • T1 « trier par nombre de côtés » : on montre une figure, l'enfant la
//    RANGE dans le bon bac (3 côtés / 4 côtés / rond, 0 côté).
//  • T2 « reconnaître un solide » : on nomme un solide, l'enfant TAPE le
//    bon solide parmi des distracteurs (autres solides).
//  • T3 « ça roule ou pas » : on montre un solide, l'enfant le RANGE
//    selon qu'il roule (boule) ou non (cube / pavé / pyramide).
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item est
// TOUJOURS résoluble — en mode tap la cible est présente avec ≥1
// distracteur, en mode sort le bon bac est toujours proposé et chaque
// figure/solide a une catégorie unique.
// ============================================================

import { pick, shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// Les figures planes (dessinées en SVG côté index.tsx).
// ------------------------------------------------------------

/** Nature géométrique d'une figure plane, par nombre de côtés. */
export type ShapeKind = 'carre' | 'rectangle' | 'triangle' | 'cercle'

export interface PlaneShape {
  id: ShapeKind
  /** Libellé affiché côté enfant (avec article). */
  name: string
  /** Nombre de côtés : 3, 4, ou 0 (rond). */
  sides: 0 | 3 | 4
}

export const SHAPES: readonly PlaneShape[] = [
  { id: 'carre', name: 'le carré', sides: 4 },
  { id: 'rectangle', name: 'le rectangle', sides: 4 },
  { id: 'triangle', name: 'le triangle', sides: 3 },
  { id: 'cercle', name: 'le cercle', sides: 0 },
]

export const SHAPES_BY_ID: ReadonlyMap<ShapeKind, PlaneShape> = new Map(
  SHAPES.map((s) => [s.id, s]),
)

// ------------------------------------------------------------
// Les solides (emoji lisible + libellé côté index.tsx).
// ------------------------------------------------------------

export type SolidKind = 'cube' | 'boule' | 'pave' | 'pyramide'

export interface Solid {
  id: SolidKind
  name: string
  emoji: string
  /** Le solide roule-t-il ? (la boule roule, les autres non) */
  rolls: boolean
}

export const SOLIDS: readonly Solid[] = [
  { id: 'cube', name: 'le cube', emoji: '🧊', rolls: false },
  { id: 'boule', name: 'la boule', emoji: '⚽', rolls: true },
  { id: 'pave', name: 'le pavé', emoji: '📦', rolls: false },
  { id: 'pyramide', name: 'la pyramide', emoji: '🔺', rolls: false },
]

export const SOLIDS_BY_ID: ReadonlyMap<SolidKind, Solid> = new Map(
  SOLIDS.map((s) => [s.id, s]),
)

// ------------------------------------------------------------
// Bacs de tri.
// ------------------------------------------------------------

/** Bacs du tri par nombre de côtés (T1). */
export type SideBin = 's3' | 's4' | 's0'
/** Bacs du tri « ça roule / ça ne roule pas » (T3). */
export type RollBin = 'roule' | 'roule-pas'

export interface SideBinDef {
  id: SideBin
  label: string
  emoji: string
  sides: 0 | 3 | 4
}

export const SIDE_BINS: readonly SideBinDef[] = [
  { id: 's3', label: '3 côtés', emoji: '🔺', sides: 3 },
  { id: 's4', label: '4 côtés', emoji: '🟥', sides: 4 },
  { id: 's0', label: 'rond (0 côté)', emoji: '⭕', sides: 0 },
]

export const SIDE_BINS_BY_ID: ReadonlyMap<SideBin, SideBinDef> = new Map(
  SIDE_BINS.map((b) => [b.id, b]),
)

export interface RollBinDef {
  id: RollBin
  label: string
  emoji: string
  rolls: boolean
}

export const ROLL_BINS: readonly RollBinDef[] = [
  { id: 'roule', label: 'ça roule', emoji: '🟢', rolls: true },
  { id: 'roule-pas', label: 'ça ne roule pas', emoji: '🟥', rolls: false },
]

export const ROLL_BINS_BY_ID: ReadonlyMap<RollBin, RollBinDef> = new Map(
  ROLL_BINS.map((b) => [b.id, b]),
)

/** Bac « nombre de côtés » attendu pour une figure plane. */
export function sideBinFor(shapeId: ShapeKind): SideBin {
  const sides = SHAPES_BY_ID.get(shapeId)?.sides ?? 0
  return sides === 3 ? 's3' : sides === 4 ? 's4' : 's0'
}

/** Bac « ça roule / ça ne roule pas » attendu pour un solide. */
export function rollBinFor(solidId: SolidKind): RollBin {
  return SOLIDS_BY_ID.get(solidId)?.rolls ? 'roule' : 'roule-pas'
}

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Tuner des modes « taper » : 0 = 3 figures, 1 = 4 figures à l'écran. */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'ma.gs.geo.formes',
  'ma.gs.geo.formes',
  'ma.cp.geo.solides',
  'ma.cp.geo.solides',
] as const

/** T0 = taper une figure ; T1 = trier les figures par côtés ;
 *  T2 = taper un solide ; T3 = trier les solides (roule ou pas). */
export type Mode = 'tap-shape' | 'sort-sides' | 'tap-solid' | 'sort-roll'

export function modeForTier(tier: TierId): Mode {
  if (tier === 0) return 'tap-shape'
  if (tier === 1) return 'sort-sides'
  if (tier === 2) return 'tap-solid'
  return 'sort-roll'
}

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

/** Nombre de cibles à l'écran pour un mode tap (3 au cran 0, 4 au cran 1). */
export function optionCountFor(level: number): number {
  return 3 + clampLevel(level)
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface TapShapeItem {
  kind: 'tap-shape'
  tier: TierId
  /** Figure à trouver. */
  targetId: ShapeKind
  /** Figures affichées (cible incluse), déjà mélangées. */
  optionIds: ShapeKind[]
}

export interface SortSidesItem {
  kind: 'sort-sides'
  tier: TierId
  /** Figure montrée à ranger. */
  shapeId: ShapeKind
  /** Bacs proposés ; le bon bac en fait TOUJOURS partie. */
  bins: readonly SideBin[]
}

export interface TapSolidItem {
  kind: 'tap-solid'
  tier: TierId
  /** Solide à trouver. */
  targetId: SolidKind
  /** Solides affichés (cible incluse), déjà mélangés. */
  optionIds: SolidKind[]
}

export interface SortRollItem {
  kind: 'sort-roll'
  tier: TierId
  /** Solide montré à ranger. */
  solidId: SolidKind
  /** Bacs proposés ; le bon bac en fait TOUJOURS partie. */
  bins: readonly RollBin[]
}

export type FormeItem = TapShapeItem | SortSidesItem | TapSolidItem | SortRollItem

// ------------------------------------------------------------
// Génération procédurale
// ------------------------------------------------------------

/** Tire une figure cible, en évitant `avoid` quand une alternative existe. */
function pickShape(avoid?: ShapeKind): PlaneShape {
  const pool = avoid === undefined ? SHAPES : SHAPES.filter((s) => s.id !== avoid)
  return pick(pool.length > 0 ? pool : SHAPES)
}

/** Tire un solide cible, en évitant `avoid` quand une alternative existe. */
function pickSolid(avoid?: SolidKind): Solid {
  const pool = avoid === undefined ? SOLIDS : SOLIDS.filter((s) => s.id !== avoid)
  return pick(pool.length > 0 ? pool : SOLIDS)
}

/**
 * T0 — « Trouve le … » : la cible + des distracteurs (autres figures,
 * sans doublon). Toujours résoluble : la cible figure dans `optionIds`
 * et il y a ≥1 distracteur.
 */
export function generateTapShapeItem(level: number, avoid?: ShapeKind): TapShapeItem {
  const target = pickShape(avoid)
  const count = Math.min(optionCountFor(level), SHAPES.length)
  const distractors = shuffle(SHAPES.filter((s) => s.id !== target.id))
    .slice(0, count - 1)
    .map((s) => s.id)
  return {
    kind: 'tap-shape',
    tier: 0,
    targetId: target.id,
    optionIds: shuffle([target.id, ...distractors]),
  }
}

/**
 * T1 — trier une figure par son nombre de côtés. Les 3 bacs sont
 * toujours proposés (le bon en fait donc forcément partie).
 */
export function generateSortSidesItem(level: number, avoid?: ShapeKind): SortSidesItem {
  void level
  const shape = pickShape(avoid)
  return { kind: 'sort-sides', tier: 1, shapeId: shape.id, bins: SIDE_BINS.map((b) => b.id) }
}

/**
 * T2 — « Trouve le … » avec les solides : cible + distracteurs solides.
 * Toujours résoluble : cible présente + ≥1 distracteur.
 */
export function generateTapSolidItem(level: number, avoid?: SolidKind): TapSolidItem {
  const target = pickSolid(avoid)
  const count = Math.min(optionCountFor(level), SOLIDS.length)
  const distractors = shuffle(SOLIDS.filter((s) => s.id !== target.id))
    .slice(0, count - 1)
    .map((s) => s.id)
  return {
    kind: 'tap-solid',
    tier: 2,
    targetId: target.id,
    optionIds: shuffle([target.id, ...distractors]),
  }
}

/**
 * T3 — trier un solide selon qu'il roule. Les 2 bacs sont toujours
 * proposés (le bon en fait donc forcément partie).
 */
export function generateSortRollItem(level: number, avoid?: SolidKind): SortRollItem {
  void level
  const solid = pickSolid(avoid)
  return { kind: 'sort-roll', tier: 3, solidId: solid.id, bins: ROLL_BINS.map((b) => b.id) }
}

/** Façade unifiée (parité avec cantine-foret / jardin-emotions). */
export function generateItem(tier: TierId, level: number, avoid?: string): FormeItem {
  const mode = modeForTier(tier)
  if (mode === 'tap-shape') return generateTapShapeItem(level, avoid as ShapeKind | undefined)
  if (mode === 'sort-sides') return generateSortSidesItem(level, avoid as ShapeKind | undefined)
  if (mode === 'tap-solid') return generateTapSolidItem(level, avoid as SolidKind | undefined)
  return generateSortRollItem(level, avoid as SolidKind | undefined)
}

/** Identité de l'entité d'un item (pour passer `avoid` au tirage suivant). */
export function itemEntity(item: FormeItem): string {
  if (item.kind === 'tap-shape') return item.targetId
  if (item.kind === 'sort-sides') return item.shapeId
  if (item.kind === 'tap-solid') return item.targetId
  return item.solidId
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/**
 * Mode tap figure : la figure tapée est-elle une bonne réponse ?
 * Inclusion assumée : un carré EST un rectangle (cas particulier à 4 côtés
 * égaux), donc le carré est accepté quand on demande « le rectangle ».
 * L'inverse est faux : un rectangle allongé n'est pas un carré.
 */
export function tapShapeCorrect(item: TapShapeItem, shapeId: ShapeKind): boolean {
  if (shapeId === item.targetId) return true
  return item.targetId === 'rectangle' && shapeId === 'carre'
}

/** Mode tap solide : le solide tapé est-il la cible ? */
export function tapSolidCorrect(item: TapSolidItem, solidId: SolidKind): boolean {
  return solidId === item.targetId
}

/** Tri par côtés : le bac choisi est-il le bon ? */
export function sortSidesCorrect(item: SortSidesItem, bin: SideBin): boolean {
  return bin === sideBinFor(item.shapeId)
}

/** Tri « ça roule » : le bac choisi est-il le bon ? */
export function sortRollCorrect(item: SortRollItem, bin: RollBin): boolean {
  return bin === rollBinFor(item.solidId)
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

export interface AfoProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: AfoProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: AfoProgress, tier: TierId, stars: 1 | 2 | 3): AfoProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
