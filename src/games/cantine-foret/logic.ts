// ============================================================
// La Cantine de la Forêt — logique PURE.
// Deux mécaniques de PRODUCTION (zéro QCM) :
//  • « nourrir » (T0/T1) : l'enfant sert à l'animal seulement ce
//    qu'il mange — les aliments-pièges (mauvaise famille) sont
//    refusés et expliqués, jamais comptés comme un choix correct.
//  • « trier » (T2/T3) : l'enfant range l'animal dans sa famille
//    (herbivore / carnivore [/ omnivore]).
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item
// généré est TOUJOURS résoluble (un animal nourrissable a au moins
// un bon aliment ET un piège sur le plateau ; un animal à trier a
// toujours sa famille parmi les bacs proposés).
// ============================================================

import { pick, shuffle } from '@/engine/rng'

export type Regime = 'herbivore' | 'carnivore' | 'omnivore'
/** Origine d'un aliment : `plante` (végétal) ou `viande` (origine animale). */
export type FoodKind = 'plante' | 'viande'

export interface Animal {
  id: string
  name: string
  emoji: string
  regime: Regime
}

export interface Food {
  id: string
  name: string
  emoji: string
  kind: FoodKind
}

// ------------------------------------------------------------
// Le bestiaire et le garde-manger (repris du jeu V1, étoffés).
// ------------------------------------------------------------

export const ANIMALS: readonly Animal[] = [
  // Herbivores
  { id: 'vache', name: 'Vache', emoji: '🐄', regime: 'herbivore' },
  { id: 'mouton', name: 'Mouton', emoji: '🐑', regime: 'herbivore' },
  { id: 'lapin', name: 'Lapin', emoji: '🐰', regime: 'herbivore' },
  { id: 'cheval', name: 'Cheval', emoji: '🐴', regime: 'herbivore' },
  { id: 'elephant', name: 'Éléphant', emoji: '🐘', regime: 'herbivore' },
  { id: 'tortue', name: 'Tortue', emoji: '🐢', regime: 'herbivore' },
  // Carnivores
  { id: 'loup', name: 'Loup', emoji: '🐺', regime: 'carnivore' },
  { id: 'lion', name: 'Lion', emoji: '🦁', regime: 'carnivore' },
  { id: 'chat', name: 'Chat', emoji: '🐱', regime: 'carnivore' },
  { id: 'renard', name: 'Renard', emoji: '🦊', regime: 'carnivore' },
  { id: 'aigle', name: 'Aigle', emoji: '🦅', regime: 'carnivore' },
  // Omnivores
  { id: 'ours', name: 'Ours', emoji: '🐻', regime: 'omnivore' },
  { id: 'cochon', name: 'Cochon', emoji: '🐷', regime: 'omnivore' },
  { id: 'poule', name: 'Poule', emoji: '🐔', regime: 'omnivore' },
  { id: 'singe', name: 'Singe', emoji: '🐵', regime: 'omnivore' },
  { id: 'souris', name: 'Souris', emoji: '🐭', regime: 'omnivore' },
]

export const FOODS: readonly Food[] = [
  { id: 'herbe', name: 'Herbe', emoji: '🌿', kind: 'plante' },
  { id: 'carotte', name: 'Carotte', emoji: '🥕', kind: 'plante' },
  { id: 'pomme', name: 'Pomme', emoji: '🍎', kind: 'plante' },
  { id: 'cereales', name: 'Céréales', emoji: '🌾', kind: 'plante' },
  { id: 'graines', name: 'Graines', emoji: '🌻', kind: 'plante' },
  { id: 'viande', name: 'Viande', emoji: '🥩', kind: 'viande' },
  { id: 'poisson', name: 'Poisson', emoji: '🐟', kind: 'viande' },
  { id: 'insecte', name: 'Insecte', emoji: '🐛', kind: 'viande' },
]

export const ANIMALS_BY_ID: ReadonlyMap<string, Animal> = new Map(
  ANIMALS.map((a) => [a.id, a]),
)
export const FOODS_BY_ID: ReadonlyMap<string, Food> = new Map(FOODS.map((f) => [f.id, f]))

const BY_REGIME: Readonly<Record<Regime, Animal[]>> = {
  herbivore: ANIMALS.filter((a) => a.regime === 'herbivore'),
  carnivore: ANIMALS.filter((a) => a.regime === 'carnivore'),
  omnivore: ANIMALS.filter((a) => a.regime === 'omnivore'),
}

// ------------------------------------------------------------
// Règles du vivant — la physique honnête de l'alimentation.
// ------------------------------------------------------------

export function regimeOf(animalId: string): Regime {
  const a = ANIMALS_BY_ID.get(animalId)
  if (!a) throw new Error(`animal inconnu : ${animalId}`)
  return a.regime
}

/** L'animal accepte-t-il cet aliment ? Herbivore→plante, carnivore→viande, omnivore→tout. */
export function accepts(animalId: string, foodId: string): boolean {
  const food = FOODS_BY_ID.get(foodId)
  if (!food) return false
  const regime = regimeOf(animalId)
  if (regime === 'omnivore') return true
  return regime === 'herbivore' ? food.kind === 'plante' : food.kind === 'viande'
}

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plateau resserré, 1 = plateau élargi. */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'mo.gs.vivant.regime',
  'mo.gs.vivant.regime',
  'mo.cp.vivant.classer',
  'mo.cp.vivant.classer',
] as const

/** T0/T1 = nourrir ; T2/T3 = trier. */
export function isFeedTier(tier: TierId): boolean {
  return tier <= 1
}

/** Bestiaire disponible par palier. */
export function animalsForTier(tier: TierId): readonly Animal[] {
  if (tier === 0) return BY_REGIME.herbivore
  if (tier === 1) return [...BY_REGIME.herbivore, ...BY_REGIME.carnivore]
  // T2 : tri à 2 bacs (pas d'omnivore, sinon insoluble). T3 : tout le monde.
  if (tier === 2) return [...BY_REGIME.herbivore, ...BY_REGIME.carnivore]
  return ANIMALS
}

/** Bacs de tri offerts par palier (T2 : 2 familles, T3 : 3 familles). */
export function zonesForTier(tier: TierId): readonly Regime[] {
  return tier === 3 ? ['herbivore', 'carnivore', 'omnivore'] : ['herbivore', 'carnivore']
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface FeedItem {
  kind: 'feed'
  tier: TierId
  animalId: string
  /** Aliments posés sur le plateau (mélangés) : bons + pièges. */
  tray: string[]
  /** Aliments du plateau que l'animal accepte (≥ 1, sert d'indice). */
  correctIds: string[]
}

export interface SortItem {
  kind: 'sort'
  tier: TierId
  animalId: string
  /** Bacs proposés ; la famille de l'animal en fait TOUJOURS partie. */
  zones: readonly Regime[]
}

export type CantineItem = FeedItem | SortItem

/** [bons, pièges] sur le plateau selon le niveau de Tuner. */
const TRAY_SPECS: ReadonlyArray<{ accept: number; refuse: number }> = [
  { accept: 2, refuse: 2 },
  { accept: 3, refuse: 3 },
]

function clampLevel(level: number): 0 | 1 {
  return (Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1)
}

/** Tire un animal du palier, en évitant `avoid` quand une alternative existe. */
function pickAnimal(tier: TierId, avoid?: string): Animal {
  const pool = animalsForTier(tier)
  const filtered = avoid === undefined ? pool : pool.filter((a) => a.id !== avoid)
  return pick(filtered.length > 0 ? filtered : pool)
}

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoid` évite de reproposer le même animal deux fois de suite.
 */
export function generateItem(tier: TierId, level: number, avoid?: string): CantineItem {
  const animal = pickAnimal(tier, avoid)

  if (isFeedTier(tier)) {
    const spec = TRAY_SPECS[clampLevel(level)]
    const accepted = FOODS.filter((f) => accepts(animal.id, f.id))
    const refused = FOODS.filter((f) => !accepts(animal.id, f.id))
    // Garde-fous : un animal nourrissable a toujours ≥1 bon et ≥1 piège.
    const good = shuffle(accepted).slice(0, Math.max(1, Math.min(spec.accept, accepted.length)))
    const bad = shuffle(refused).slice(0, Math.max(1, Math.min(spec.refuse, refused.length)))
    const tray = shuffle([...good, ...bad]).map((f) => f.id)
    return {
      kind: 'feed',
      tier,
      animalId: animal.id,
      tray,
      correctIds: good.map((f) => f.id),
    }
  }

  return { kind: 'sort', tier, animalId: animal.id, zones: zonesForTier(tier) }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** Le plateau est-il complet ? (tous les bons aliments servis) */
export function feedComplete(item: FeedItem, servedIds: readonly string[]): boolean {
  const served = new Set(servedIds)
  return item.correctIds.every((id) => served.has(id))
}

/** Le bac choisi est-il la bonne famille ? */
export function sortCorrect(item: SortItem, zone: Regime): boolean {
  return zone === regimeOf(item.animalId)
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

export interface CdfProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: CdfProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: CdfProgress, tier: TierId, stars: 1 | 2 | 3): CdfProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
