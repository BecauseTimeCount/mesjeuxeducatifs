// ============================================================
// La Machine à Remonter le Temps — logique PURE.
// « Se situer dans le temps » (Questionner le monde, CP).
// Deux mécaniques de PRODUCTION (zéro QCM) :
//  • « trier » (T0/T1) : un objet daté est montré ; l'enfant le
//    range dans le bon bac « Autrefois » 🕰️ ou « Aujourd'hui » ✨
//    (tri 2 bacs, comme cantine-foret sort). Chaque objet a une
//    époque UNIQUE → toujours résoluble.
//  • « ordonner » (T2/T3) : l'enfant range les générations DANS
//    L'ORDRE (du plus jeune au plus âgé) en les tapant l'une après
//    l'autre (séquence / stepOutcome, comme english-island Simon).
//    L'ordre attendu est la sous-suite ordonnée correcte.
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item
// est TOUJOURS résoluble, et appliquer la bonne réponse le résout.
// ============================================================

import { pick, shuffle, randInt } from '@/engine/rng'

// ------------------------------------------------------------
// Les objets datés (paires autrefois / aujourd'hui)
// ------------------------------------------------------------

export type Era = 'autrefois' | 'aujourdhui'

export interface TimeObject {
  id: string
  name: string
  emoji: string
  era: Era
  /** Paire thématique : chaque objet « autrefois » a son équivalent moderne. */
  pair: string
  /** T0 : couples très contrastés (les plus lisibles pour débuter). */
  contrast: boolean
}

export const OBJECTS: readonly TimeObject[] = [
  // bougie (autrefois) / ampoule (aujourd'hui) — éclairage : très contrasté
  { id: 'bougie', name: 'La bougie', emoji: '🕯️', era: 'autrefois', pair: 'eclairage', contrast: true },
  { id: 'ampoule', name: "L'ampoule", emoji: '💡', era: 'aujourdhui', pair: 'eclairage', contrast: true },
  // cheval (autrefois) / voiture (aujourd'hui) — transport : très contrasté
  { id: 'cheval', name: 'Le cheval', emoji: '🐴', era: 'autrefois', pair: 'transport', contrast: true },
  { id: 'voiture', name: 'La voiture', emoji: '🚗', era: 'aujourdhui', pair: 'transport', contrast: true },
  // lettre (autrefois) / téléphone (aujourd'hui) — communiquer : très contrasté
  { id: 'lettre', name: 'La lettre', emoji: '✉️', era: 'autrefois', pair: 'communiquer', contrast: true },
  { id: 'telephone', name: 'Le téléphone', emoji: '📱', era: 'aujourdhui', pair: 'communiquer', contrast: true },
  // plume d'oie (autrefois) / stylo (aujourd'hui) — écrire
  { id: 'plume', name: "La plume d'oie", emoji: '🪶', era: 'autrefois', pair: 'ecrire', contrast: false },
  { id: 'stylo', name: 'Le stylo', emoji: '🖊️', era: 'aujourdhui', pair: 'ecrire', contrast: false },
  // lavoir (autrefois) / machine à laver (aujourd'hui) — laver le linge
  { id: 'lavoir', name: 'Le lavoir', emoji: '🧺', era: 'autrefois', pair: 'laver', contrast: false },
  { id: 'machine', name: 'La machine à laver', emoji: '🌀', era: 'aujourdhui', pair: 'laver', contrast: false },
  // train à vapeur (autrefois) / avion (aujourd'hui) — voyager loin
  { id: 'train', name: 'Le train à vapeur', emoji: '🚂', era: 'autrefois', pair: 'voyager', contrast: false },
  { id: 'avion', name: "L'avion", emoji: '✈️', era: 'aujourdhui', pair: 'voyager', contrast: false },
]

export const OBJECTS_BY_ID: ReadonlyMap<string, TimeObject> = new Map(OBJECTS.map((o) => [o.id, o]))

const CONTRAST_OBJECTS: readonly TimeObject[] = OBJECTS.filter((o) => o.contrast)

/** Bac d'une époque : on associe un emoji + un libellé (jamais la couleur seule). */
export const ERA_INFO: Readonly<Record<Era, { label: string; emoji: string }>> = {
  autrefois: { label: 'Autrefois', emoji: '🕰️' },
  aujourdhui: { label: "Aujourd'hui", emoji: '✨' },
}

export function eraOf(objectId: string): Era {
  const o = OBJECTS_BY_ID.get(objectId)
  if (!o) throw new Error(`objet inconnu : ${objectId}`)
  return o.era
}

// ------------------------------------------------------------
// Les générations (T2/T3) — du plus jeune au plus âgé
// ------------------------------------------------------------

export interface Generation {
  id: string
  name: string
  emoji: string
  /** Rang chronologique : 0 = bébé (le plus jeune) … 3 = grand-parent. */
  rank: number
}

export const GENERATIONS: readonly Generation[] = [
  { id: 'bebe', name: 'le bébé', emoji: '👶', rank: 0 },
  { id: 'enfant', name: "l'enfant", emoji: '🧒', rank: 1 },
  { id: 'parent', name: 'le parent', emoji: '🧑', rank: 2 },
  { id: 'grand-parent', name: 'le grand-parent', emoji: '👴', rank: 3 },
]

export const GENERATIONS_BY_ID: ReadonlyMap<string, Generation> = new Map(
  GENERATIONS.map((g) => [g.id, g]),
)

/** Ordre attendu (ids) d'une sélection de générations : du plus jeune au plus âgé. */
export function orderedByAge(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const ra = GENERATIONS_BY_ID.get(a)?.rank ?? 0
    const rb = GENERATIONS_BY_ID.get(b)?.rank ?? 0
    return ra - rb
  })
}

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plus simple, 1 = plus corsé. */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'mo.cp.histoire.avant',
  'mo.cp.histoire.avant',
  'mo.cp.histoire.generations',
  'mo.cp.histoire.generations',
] as const

/** T0/T1 = trier l'objet ; T2/T3 = ordonner les générations. */
export function isSortTier(tier: TierId): boolean {
  return tier <= 1
}

/** Objets disponibles par palier (T0 : couples très contrastés ; T1 : tous). */
export function objectsForTier(tier: TierId): readonly TimeObject[] {
  return tier === 0 ? CONTRAST_OBJECTS : OBJECTS
}

/** Nombre de générations à ordonner par palier (T2 : 3 consécutives, T3 : les 4). */
export function chainLengthForTier(tier: TierId): number {
  return tier === 3 ? 4 : 3
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface SortItem {
  kind: 'sort'
  tier: TierId
  objectId: string
  /** Bacs proposés ; l'époque de l'objet en fait TOUJOURS partie (les deux époques). */
  eras: readonly Era[]
}

export interface OrderItem {
  kind: 'order'
  tier: TierId
  /** Générations offertes à l'écran (mélangées). */
  tiles: string[]
  /** Ordre attendu (du plus jeune au plus âgé), sous-suite ordonnée correcte. */
  expected: string[]
}

export type TimeItem = SortItem | OrderItem

/** Tire un objet du palier, en évitant `avoid` quand une alternative existe. */
function pickObject(tier: TierId, avoid?: string): TimeObject {
  const pool = objectsForTier(tier)
  const filtered = avoid === undefined ? pool : pool.filter((o) => o.id !== avoid)
  return pick(filtered.length > 0 ? filtered : pool)
}

/**
 * Génère une sélection de générations consécutives à ordonner.
 * T2 (3 générations) : on choisit une fenêtre de 3 rangs consécutifs
 * (bébé→parent ou enfant→grand-parent) pour que l'ordre reste limpide.
 * T3 : les 4 générations. Le niveau de Tuner ne change pas la longueur,
 * il sert d'aléa de placement côté UI ; la solution reste unique.
 */
function pickGenerations(tier: TierId, level: number, avoid?: string): string[] {
  void level
  const n = chainLengthForTier(tier)
  if (n >= GENERATIONS.length) return GENERATIONS.map((g) => g.id)
  // Fenêtres de rangs consécutifs possibles (longueur n).
  const windows: string[][] = []
  for (let start = 0; start + n <= GENERATIONS.length; start++) {
    windows.push(GENERATIONS.slice(start, start + n).map((g) => g.id))
  }
  const key = (ids: string[]): string => orderedByAge(ids).join('-')
  const filtered = avoid === undefined ? windows : windows.filter((w) => key(w) !== avoid)
  return pick(filtered.length > 0 ? filtered : windows)
}

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoid` évite de reproposer le même item deux fois de suite
 * (objet trié en T0/T1 ; sélection ordonnée de générations en T2/T3).
 */
export function generateItem(tier: TierId, level: number, avoid?: string): TimeItem {
  if (isSortTier(tier)) {
    // Le tri n'a que 2 bacs, toujours montrés : le niveau de Tuner n'y change rien.
    void level
    const object = pickObject(tier, avoid)
    return { kind: 'sort', tier, objectId: object.id, eras: ['autrefois', 'aujourdhui'] }
  }
  const ids = pickGenerations(tier, level, avoid)
  const expected = orderedByAge(ids)
  // Mélange du plateau, garanti différent de l'ordre attendu quand n > 1.
  let tiles = shuffle(ids)
  let guard = 0
  while (tiles.join('-') === expected.join('-') && guard < 8) {
    tiles = shuffle(ids)
    guard += 1
  }
  if (tiles.join('-') === expected.join('-')) {
    // Dernier recours déterministe : on permute les deux premières tuiles.
    tiles = [...expected]
    const swap = randInt(1, tiles.length - 1)
    ;[tiles[0], tiles[swap]] = [tiles[swap], tiles[0]]
  }
  return { kind: 'order', tier, tiles, expected }
}

/** Clé stable d'un item pour le paramètre `avoid` (objet trié / sélection ordonnée). */
export function avoidKey(item: TimeItem): string {
  return item.kind === 'sort' ? item.objectId : item.expected.join('-')
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** Le bac choisi est-il la bonne époque ? */
export function sortCorrect(item: SortItem, era: Era): boolean {
  return era === eraOf(item.objectId)
}

export type StepOutcome = 'progress' | 'complete' | 'wrong'

/** Valide le tap n° `index` d'une séquence (production, pas de QCM). */
export function stepOutcome(
  expected: readonly string[],
  index: number,
  tappedId: string,
): StepOutcome {
  if (index < 0 || index >= expected.length || expected[index] !== tappedId) return 'wrong'
  return index === expected.length - 1 ? 'complete' : 'progress'
}

// ------------------------------------------------------------
// Score & progression (pattern de référence)
// ------------------------------------------------------------

/** Étoiles d'une partie : seuls les PREMIERS essais comptent. */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface MdtProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: MdtProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: MdtProgress, tier: TierId, stars: 1 | 2 | 3): MdtProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
