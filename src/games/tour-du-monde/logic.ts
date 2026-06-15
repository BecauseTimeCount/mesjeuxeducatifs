// ============================================================
// Le Tour du Monde — logique PURE.
// Deux mécaniques de PRODUCTION / TROUVER (zéro QCM) :
//  • « trouver le paysage » (T0/T1) : une consigne nomme un paysage ;
//    l'enfant TROUVE et tape la bonne carte parmi des distracteurs de
//    même catégorie (d'autres paysages). L'erreur coûte (compté raté
//    au premier essai) et la voix nomme le paysage tapé.
//  • « ranger la Terre » (T2/T3) : un élément du globe est montré ;
//    l'enfant le range dans « Terre » ou « Eau » (tri 2 bacs). Chaque
//    élément a une catégorie terre/eau UNIQUE.
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item
// généré est TOUJOURS résoluble (la cible figure dans les choix avec
// ≥1 distracteur ; un élément à ranger a toujours sa catégorie parmi
// les deux bacs proposés).
// ============================================================

import { pick, shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// T0/T1 — les paysages (programme : reconnaître des paysages).
// ------------------------------------------------------------

export interface Landscape {
  id: string
  /** Libellé français AVEC article (pour la consigne « Trouve … »). */
  name: string
  emoji: string
}

export const LANDSCAPES: readonly Landscape[] = [
  { id: 'mer', name: 'la mer', emoji: '🏖️' },
  { id: 'montagne', name: 'la montagne', emoji: '⛰️' },
  { id: 'ville', name: 'la ville', emoji: '🏙️' },
  { id: 'campagne', name: 'la campagne', emoji: '🌾' },
  { id: 'foret', name: 'la forêt', emoji: '🌲' },
  { id: 'desert', name: 'le désert', emoji: '🏜️' },
]

export const LANDSCAPES_BY_ID: ReadonlyMap<string, Landscape> = new Map(
  LANDSCAPES.map((l) => [l.id, l]),
)

// ------------------------------------------------------------
// T2/T3 — la Terre vue de loin (programme : distinguer terres et océans).
// ------------------------------------------------------------

export type GlobeKind = 'terre' | 'eau'

export interface GlobeElement {
  id: string
  /** Libellé français AVEC article. */
  name: string
  emoji: string
  kind: GlobeKind
}

export const GLOBE_ELEMENTS: readonly GlobeElement[] = [
  { id: 'montagne', name: 'la montagne', emoji: '⛰️', kind: 'terre' },
  { id: 'ocean', name: "l'océan", emoji: '🌊', kind: 'eau' },
  { id: 'foret', name: 'la forêt', emoji: '🌲', kind: 'terre' },
  { id: 'riviere', name: 'la rivière', emoji: '🏞️', kind: 'eau' },
  { id: 'desert', name: 'le désert', emoji: '🏜️', kind: 'terre' },
  { id: 'ile', name: "l'île", emoji: '🏝️', kind: 'terre' },
  { id: 'banquise', name: 'la banquise', emoji: '🧊', kind: 'eau' },
  { id: 'champ', name: 'le champ', emoji: '🌾', kind: 'terre' },
  { id: 'mer', name: 'la mer', emoji: '🌊', kind: 'eau' },
]

export const GLOBE_ELEMENTS_BY_ID: ReadonlyMap<string, GlobeElement> = new Map(
  GLOBE_ELEMENTS.map((e) => [e.id, e]),
)

/** Les deux bacs du tri — la catégorie d'un élément en fait TOUJOURS partie. */
export const GLOBE_ZONES: readonly GlobeKind[] = ['terre', 'eau']

export function kindOf(elementId: string): GlobeKind {
  const e = GLOBE_ELEMENTS_BY_ID.get(elementId)
  if (!e) throw new Error(`élément inconnu : ${elementId}`)
  return e.kind
}

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a qu'un seul cran réel ici (les paysages : 4 ou 6 cartes). */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'mo.gs.geo.paysages',
  'mo.gs.geo.paysages',
  'mo.cp.geo.monde',
  'mo.cp.geo.monde',
] as const

/** T0/T1 = trouver le paysage ; T2/T3 = ranger Terre / Eau. */
export function isFindTier(tier: TierId): boolean {
  return tier <= 1
}

/** Nombre de cartes-paysages à l'écran selon le palier (T0 = 4, T1 = 6). */
export function landscapeCountFor(tier: TierId): number {
  return tier === 0 ? 4 : 6
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface FindItem {
  kind: 'find'
  tier: TierId
  /** Paysage à trouver (la bonne carte). */
  targetId: string
  /** Cartes proposées (mélangées) : la cible + des distracteurs paysages. */
  choices: string[]
}

export interface SortItem {
  kind: 'sort'
  tier: TierId
  /** Élément du globe à ranger. */
  elementId: string
  /** Bacs proposés ; la catégorie de l'élément en fait TOUJOURS partie. */
  zones: readonly GlobeKind[]
}

export type TdmItem = FindItem | SortItem

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

/** Tire un paysage cible, en évitant `avoid` quand une alternative existe. */
function pickLandscape(avoid?: string): Landscape {
  const pool = avoid === undefined ? LANDSCAPES : LANDSCAPES.filter((l) => l.id !== avoid)
  return pick(pool.length > 0 ? pool : LANDSCAPES)
}

/** Tire un élément de globe, en évitant `avoid` quand une alternative existe. */
function pickElement(avoid?: string): GlobeElement {
  const pool = avoid === undefined ? GLOBE_ELEMENTS : GLOBE_ELEMENTS.filter((e) => e.id !== avoid)
  return pick(pool.length > 0 ? pool : GLOBE_ELEMENTS)
}

/**
 * T0/T1 — « Trouve [le paysage] ! ». Renvoie la cible + des distracteurs
 * (autres paysages, sans doublon). Toujours résoluble : la cible figure
 * dans `choices` et il y a ≥1 distracteur de même catégorie.
 */
export function generateFindItem(tier: TierId, _level: number, avoid?: string): FindItem {
  void _level
  const target = pickLandscape(avoid)
  const count = Math.min(landscapeCountFor(tier), LANDSCAPES.length)
  const distractors = shuffle(LANDSCAPES.filter((l) => l.id !== target.id))
    .slice(0, count - 1)
    .map((l) => l.id)
  const choices = shuffle([target.id, ...distractors])
  return { kind: 'find', tier, targetId: target.id, choices }
}

/**
 * T2/T3 — un élément du globe à ranger en « Terre » ou « Eau ». La
 * catégorie de l'élément fait toujours partie des deux bacs offerts.
 * Le niveau de Tuner n'influe pas (les 2 bacs sont fixes).
 */
export function generateSortItem(tier: TierId, _level: number, avoid?: string): SortItem {
  void _level
  const element = pickElement(avoid)
  return { kind: 'sort', tier, elementId: element.id, zones: GLOBE_ZONES }
}

/**
 * Façade unifiée (parité avec cantine-foret) : génère un item résoluble
 * pour un palier et un niveau de Tuner. `avoid` évite de reproposer le
 * même élément/paysage deux fois de suite.
 */
export function generateItem(tier: TierId, level: number, avoid?: string): TdmItem {
  void clampLevel(level)
  if (isFindTier(tier)) return generateFindItem(tier, level, avoid)
  return generateSortItem(tier, level, avoid)
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** La carte tapée est-elle le bon paysage ? */
export function findCorrect(item: FindItem, landscapeId: string): boolean {
  return landscapeId === item.targetId
}

/** Le bac choisi est-il la bonne catégorie terre/eau ? */
export function sortCorrect(item: SortItem, zone: GlobeKind): boolean {
  return zone === kindOf(item.elementId)
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

export interface TdmProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: TdmProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: TdmProgress, tier: TierId, stars: 1 | 2 | 3): TdmProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
