// ============================================================
// My Body & Food — logique PURE (English Island, Pre-A1).
// Aucun import React/DOM. Seul import moteur autorisé : rng.
//
// Trois mécaniques de PRODUCTION / repérage (zéro QCM pur) :
//  • T0/T1 « body » : on entend une partie du corps en anglais
//    (« Head, Shoulders, Knees and Toes ») ; l'enfant TROUVE et
//    tape la bonne carte parmi des cartes de même catégorie.
//    T0 = 4 cartes, T1 = 6 cartes.
//  • T2 « food » : on entend un aliment en anglais ; l'enfant
//    tape la bonne carte-aliment parmi des distracteurs de la
//    même famille (nourriture).
//  • T3 « tastes » : un personnage dit « I like [food] » ou
//    « I don't like [food] » ; l'enfant RANGE l'aliment dans le
//    bac « I like » 😋 ou « I don't like » 😖. La phrase entendue
//    dicte la colonne SANS AMBIGUÏTÉ (ce n'est pas un goût subjectif).
//
// Garanti résoluble (prouvé par logic.test.ts) : pour chaque
// palier ET chaque niveau de Tuner, la cible est toujours présente,
// il y a ≥1 distracteur quand il y a un choix, aucun doublon ;
// pour T3 la phrase détermine toujours une colonne unique.
// ============================================================

import { pick, shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// Lexique fixe (imagier) — clips anglais en voix sonia.
// Le mot anglais est écrit sous l'emoji (info jamais portée par
// la couleur seule).
// ------------------------------------------------------------

export interface BodyPart {
  id: string
  /** Mot anglais affiché. */
  word: string
  emoji: string
}

export interface FoodWord {
  id: string
  word: string
  emoji: string
}

/** 8 parties du corps (T0 pioche dans les 4 premières, T1 dans les 6). */
export const BODY_PARTS: readonly BodyPart[] = [
  { id: 'head', word: 'Head', emoji: '🧒' },
  { id: 'shoulders', word: 'Shoulders', emoji: '🙆' },
  { id: 'knees', word: 'Knees', emoji: '🦵' },
  { id: 'toes', word: 'Toes', emoji: '🦶' },
  { id: 'eyes', word: 'Eyes', emoji: '👀' },
  { id: 'ears', word: 'Ears', emoji: '👂' },
  { id: 'mouth', word: 'Mouth', emoji: '👄' },
  { id: 'nose', word: 'Nose', emoji: '👃' },
]

/** 10 aliments courants (T2 = tap, T3 = tri par goût). */
export const FOODS: readonly FoodWord[] = [
  { id: 'apple', word: 'Apple', emoji: '🍎' },
  { id: 'banana', word: 'Banana', emoji: '🍌' },
  { id: 'bread', word: 'Bread', emoji: '🍞' },
  { id: 'milk', word: 'Milk', emoji: '🥛' },
  { id: 'egg', word: 'Egg', emoji: '🥚' },
  { id: 'fish', word: 'Fish', emoji: '🐟' },
  { id: 'cake', word: 'Cake', emoji: '🍰' },
  { id: 'water', word: 'Water', emoji: '💧' },
  { id: 'carrot', word: 'Carrot', emoji: '🥕' },
  { id: 'cheese', word: 'Cheese', emoji: '🧀' },
]

export const BODY_BY_ID: ReadonlyMap<string, BodyPart> = new Map(BODY_PARTS.map((b) => [b.id, b]))
export const FOODS_BY_ID: ReadonlyMap<string, FoodWord> = new Map(FOODS.map((f) => [f.id, f]))

/** Id du clip anglais (voix sonia) d'une partie du corps. */
export function bodyClip(id: string): string {
  return `mbf.body.${id}`
}

/** Id du clip anglais (voix sonia) d'un aliment. */
export function foodClip(id: string): string {
  return `mbf.food.${id}`
}

/** Id du clip anglais (voix sonia) « I like / I don't like [food] ». */
export function tasteClip(foodId: string, like: boolean): string {
  return `mbf.taste.${like ? 'like' : 'dislike'}.${foodId}`
}

// ------------------------------------------------------------
// Paliers, compétences, structure d'une partie
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Tuner des paliers tap (T0/T1/T2) : 0..2 → +0/+1/+2 distracteurs. */
export const MAX_TUNER_LEVEL = 2

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = ['en.cp.body', 'en.cp.body', 'en.cp.food', 'en.cp.tastes'] as const

/** T0/T1 = parties du corps ; T2 = aliments ; T3 = goûts (tri). */
export type TapCategory = 'body' | 'food'

/** Catégorie d'imagier d'un palier tap (T0/T1 corps, T2 aliments). */
export function categoryForTier(tier: TierId): TapCategory {
  return tier === 2 ? 'food' : 'body'
}

/** Pool de cartes pour un palier tap (T0 = 4 corps, T1 = 6 corps, T2 = aliments). */
export function poolForTier(tier: TierId): readonly { id: string }[] {
  if (tier === 0) return BODY_PARTS.slice(0, 4)
  if (tier === 1) return BODY_PARTS.slice(0, 6)
  return FOODS
}

function clampLevel(level: number): 0 | 1 | 2 {
  const n = Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
  return n === 0 ? 0 : n === 1 ? 1 : 2
}

/** Nombre de cartes à l'écran pour un palier tap selon le niveau de Tuner. */
export function optionCountFor(tier: TierId, level: number): number {
  // Base : 3 cartes au plus simple, +1 par cran de Tuner, plafonné au pool.
  const base = 3 + clampLevel(level)
  return Math.min(base, poolForTier(tier).length)
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface TapItem {
  kind: 'tap'
  tier: TierId
  category: TapCategory
  /** Id de la carte à trouver (entendue en anglais). */
  targetId: string
  /** Ids affichés à l'écran (cible incluse), déjà mélangés. */
  optionIds: string[]
}

export interface SortItem {
  kind: 'sort'
  tier: TierId
  /** Aliment énoncé (entendu en anglais). */
  foodId: string
  /** Vrai si « I like » (bac 😋), faux si « I don't like » (bac 😖). */
  like: boolean
}

export type MbfItem = TapItem | SortItem

export type SortColumn = 'like' | 'dislike'

/** Tire un id de cible dans le pool du palier, en évitant `avoid` si possible. */
function pickTarget(pool: readonly { id: string }[], avoid?: string): string {
  const filtered = avoid === undefined ? pool : pool.filter((c) => c.id !== avoid)
  return pick((filtered.length > 0 ? filtered : pool).map((c) => c.id))
}

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoid` évite de reproposer le même item (cible/aliment) deux fois de suite.
 *  - T0/T1/T2 : un tap (cible + ≥1 distracteur de même catégorie).
 *  - T3 : un tri (l'aliment + le sens like/dislike dicté par la phrase).
 */
export function generateItem(tier: TierId, level: number, avoid?: string): MbfItem {
  if (tier === 3) {
    const foodId = pickTarget(FOODS, avoid)
    // Le sens est tiré aléatoirement : la PHRASE entendue le dicte sans ambiguïté.
    const like = Math.random() < 0.5
    return { kind: 'sort', tier, foodId, like }
  }

  const pool = poolForTier(tier)
  const category = categoryForTier(tier)
  const targetId = pickTarget(pool, avoid)
  const count = optionCountFor(tier, level)
  const distractors = shuffle(pool.filter((c) => c.id !== targetId).map((c) => c.id)).slice(
    0,
    Math.max(1, count - 1),
  )
  return {
    kind: 'tap',
    tier,
    category,
    targetId,
    optionIds: shuffle([targetId, ...distractors]),
  }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** Le tap : la carte tapée est-elle la cible entendue ? */
export function tapCorrect(item: TapItem, tappedId: string): boolean {
  return tappedId === item.targetId
}

/** La colonne correcte d'un tri, dictée par la phrase entendue. */
export function correctColumn(item: SortItem): SortColumn {
  return item.like ? 'like' : 'dislike'
}

/** Le tri : la colonne choisie est-elle celle dictée par la phrase ? */
export function sortCorrect(item: SortItem, column: SortColumn): boolean {
  return column === correctColumn(item)
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

export interface MbfProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: MbfProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: MbfProgress, tier: TierId, stars: 1 | 2 | 3): MbfProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
