// ============================================================
// Hello Friends! — logique PURE.
// Compréhension orale de l'anglais (Pré-A1) : on entend une
// formule / un mot anglais (voix sonia) et l'enfant TAPE la bonne
// image parmi des choix. Distracteurs TOUJOURS de la même
// catégorie et jamais confusables ; l'écran n'est jamais ambigu.
//  • T0/T1 (greetings)  : Hello, Goodbye, Thank you, Please.
//  • T2   (feelings)    : happy, sad, tired, OK (+ angry, scared).
//  • T3   (self)        : deux sous-types — « I am [number] » (âge)
//    et « My favourite colour is [colour] » (couleur).
//
// Aucun import React/DOM. Seul import moteur : rng. Chaque round
// généré est TOUJOURS résoluble (cible présente + ≥1 distracteur
// non confusable) — prouvé par logic.test.ts.
// ============================================================

import { pick, shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// Cartes (imagier fixe) — clips anglais préfixe hef.en.
// ------------------------------------------------------------

export interface Card {
  id: string
  /** Texte anglais affiché sous l'emoji (mot/phrase entendu). */
  en: string
  emoji: string
}

/** Formules de politesse / salutation (T0/T1). */
export const GREETINGS: readonly Card[] = [
  { id: 'hello', en: 'Hello', emoji: '👋' },
  { id: 'goodbye', en: 'Goodbye', emoji: '🙋' },
  { id: 'thankyou', en: 'Thank you', emoji: '🙏' },
  { id: 'please', en: 'Please', emoji: '🤲' },
]

/** Émotions / états (T2). */
export const FEELINGS: readonly Card[] = [
  { id: 'happy', en: 'Happy', emoji: '😄' },
  { id: 'sad', en: 'Sad', emoji: '😢' },
  { id: 'tired', en: 'Tired', emoji: '😴' },
  { id: 'ok', en: 'OK', emoji: '🙂' },
  { id: 'angry', en: 'Angry', emoji: '😠' },
  { id: 'scared', en: 'Scared', emoji: '😨' },
]

export interface ColourCard extends Card {
  /** Couleur CSS pour la pastille (jamais la SEULE info : emoji + mot aussi). */
  hex: string
}

/** Couleurs préférées (T3, sous-type colour). */
export const COLOURS: readonly ColourCard[] = [
  { id: 'red', en: 'Red', emoji: '🔴', hex: '#e53935' },
  { id: 'blue', en: 'Blue', emoji: '🔵', hex: '#1e88e5' },
  { id: 'green', en: 'Green', emoji: '🟢', hex: '#43a047' },
  { id: 'yellow', en: 'Yellow', emoji: '🟡', hex: '#fbc02d' },
]

export interface AgeCard extends Card {
  value: number
}

/** Âges possibles (T3, sous-type age) : « I am [1..6] ». */
export const AGES: readonly AgeCard[] = [
  { id: 'age-1', en: 'One', emoji: '1️⃣', value: 1 },
  { id: 'age-2', en: 'Two', emoji: '2️⃣', value: 2 },
  { id: 'age-3', en: 'Three', emoji: '3️⃣', value: 3 },
  { id: 'age-4', en: 'Four', emoji: '4️⃣', value: 4 },
  { id: 'age-5', en: 'Five', emoji: '5️⃣', value: 5 },
  { id: 'age-6', en: 'Six', emoji: '6️⃣', value: 6 },
]

export const GREETINGS_BY_ID: ReadonlyMap<string, Card> = new Map(GREETINGS.map((c) => [c.id, c]))
export const FEELINGS_BY_ID: ReadonlyMap<string, Card> = new Map(FEELINGS.map((c) => [c.id, c]))
export const COLOURS_BY_ID: ReadonlyMap<string, ColourCard> = new Map(COLOURS.map((c) => [c.id, c]))
export const AGES_BY_ID: ReadonlyMap<string, AgeCard> = new Map(AGES.map((c) => [c.id, c]))

/** Toutes les cartes confondues, pour retrouver une carte par id (affichage). */
export const CARDS_BY_ID: ReadonlyMap<string, Card> = new Map<string, Card>([
  ...GREETINGS.map((c): [string, Card] => [c.id, c]),
  ...FEELINGS.map((c): [string, Card] => [c.id, c]),
  ...COLOURS.map((c): [string, Card] => [c.id, c]),
  ...AGES.map((c): [string, Card] => [c.id, c]),
])

/** Id du clip anglais (voix sonia) du mot d'une carte. */
export function cardClip(id: string): string {
  return `hef.en.${id}`
}

// ------------------------------------------------------------
// Paliers, skills, structure d'une partie
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Tuner : 0..2 → 4 à 6 cibles à l'écran (comme English Island). */
export const MAX_TUNER_LEVEL = 2

/** Catégorie travaillée par palier. */
export type Category = 'greetings' | 'feelings' | 'self'

export const TIER_CATEGORY: readonly Category[] = ['greetings', 'greetings', 'feelings', 'self']

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'en.cp.greetings',
  'en.cp.greetings',
  'en.cp.feelings',
  'en.cp.self',
] as const

/** Sous-type d'un round « self » (T3). */
export type SelfKind = 'age' | 'colour'

// ------------------------------------------------------------
// Nombre de cibles à l'écran selon le niveau de Tuner (4, 5 ou 6).
// ------------------------------------------------------------

export function optionCountFor(level: number): number {
  return 4 + Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

// ------------------------------------------------------------
// Round — « écoute l'anglais, tape la bonne image »
// ------------------------------------------------------------

export interface Round {
  tier: TierId
  category: Category
  /** Pour T3 uniquement : 'age' (chiffre) ou 'colour' (couleur). */
  kind: SelfKind | null
  /** Id de la carte à taper. */
  targetId: string
  /** Ids affichés à l'écran (cible incluse), déjà mélangés. */
  optionIds: string[]
}

/** Pool de cartes (ids) pour une catégorie / sous-type donné. */
function poolFor(category: Category, kind: SelfKind | null): readonly string[] {
  if (category === 'greetings') return GREETINGS.map((c) => c.id)
  if (category === 'feelings') return FEELINGS.map((c) => c.id)
  return (kind === 'age' ? AGES : COLOURS).map((c) => c.id)
}

/**
 * Génère un round résoluble : cible jamais dans `avoid` (sauf pool
 * épuisé), distracteurs UNIQUES de la même catégorie, et au moins un
 * distracteur (donc ≥ 2 options). La cible est toujours présente.
 * Pour T3, le sous-type (age/colour) est tiré au hasard : tous les
 * distracteurs partagent ce sous-type, donc jamais d'ambiguïté
 * (un chiffre n'apparaît pas face à des couleurs).
 */
export function generateItem(tier: TierId, level: number, avoid?: string): Round {
  const category = TIER_CATEGORY[tier]
  const kind: SelfKind | null = category === 'self' ? pick(['age', 'colour'] as const) : null

  const pool = poolFor(category, kind)
  const fresh = avoid === undefined ? pool : pool.filter((id) => id !== avoid)
  const targetId = pick(fresh.length > 0 ? fresh : pool)

  const candidates = pool.filter((id) => id !== targetId)
  // Au moins 1 distracteur ; jamais plus que le pool ne le permet.
  const count = Math.min(optionCountFor(level), candidates.length + 1)
  const distractors = shuffle(candidates).slice(0, Math.max(1, count - 1))
  return {
    tier,
    category,
    kind,
    targetId,
    optionIds: shuffle([targetId, ...distractors]),
  }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** La carte tapée est-elle la bonne ? */
export function isCorrect(round: Round, tappedId: string): boolean {
  return tappedId === round.targetId
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

export interface HefProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: HefProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: HefProgress, tier: TierId, stars: 1 | 2 | 3): HefProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
