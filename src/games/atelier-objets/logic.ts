// ============================================================
// L'Atelier des Objets — logique PURE.
// Une mécanique « associe » (zéro QCM par production de réponse :
// l'enfant TROUVE l'objet-cible parmi des objets) :
//  • T0/T1 (besoin → objet) : une consigne énonce un BESOIN
//    (« Tu as froid… »), l'enfant tape l'objet qui répond au
//    besoin (le pull). T0 = 3 objets, T1 = 4-5 objets à l'écran.
//  • T2/T3 (matière → objet) : une consigne énonce une MATIÈRE
//    première (« Avec le bois… »), l'enfant tape l'objet fabriqué
//    (la chaise). T2 = 3 objets, T3 = 4-5 objets.
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item
// généré est TOUJOURS résoluble (la cible est toujours présente,
// il y a ≥1 distracteur, et AUCUN distracteur n'est lui-même une
// bonne réponse à la consigne en cours).
// ============================================================

import { pick, shuffle } from '@/engine/rng'

/** Un objet de l'atelier : emoji + nom français. */
export interface Item {
  id: string
  name: string
  emoji: string
}

/** Une consigne : une source (besoin ou matière) → un objet-cible. */
export interface Prompt {
  id: string
  /** Famille de la consigne (sert à choisir le gabarit audio). */
  kind: PromptKind
  /** Texte court de la source (besoin ressenti, ou matière première). */
  source: string
  /** Emoji illustrant la source (besoin ou matière). */
  sourceEmoji: string
  /** Id de l'objet qui répond à la consigne. */
  targetId: string
}

export type PromptKind = 'besoin' | 'matiere'

// ------------------------------------------------------------
// Le catalogue d'objets de l'atelier.
// ------------------------------------------------------------

export const ITEMS: readonly Item[] = [
  { id: 'pull', name: 'Pull', emoji: '🧥' },
  { id: 'pain', name: 'Pain', emoji: '🍞' },
  { id: 'verre', name: "Verre d'eau", emoji: '🥛' },
  { id: 'lampe', name: 'Lampe', emoji: '💡' },
  { id: 'stylo', name: 'Stylo', emoji: '🖊️' },
  { id: 'velo', name: 'Vélo', emoji: '🚲' },
  { id: 'montre', name: 'Montre', emoji: '⌚' },
  { id: 'parapluie', name: 'Parapluie', emoji: '☂️' },
  { id: 'chaise', name: 'Chaise', emoji: '🪑' },
  { id: 'fromage', name: 'Fromage', emoji: '🧀' },
  { id: 'fenetre', name: 'Fenêtre', emoji: '🪟' },
  { id: 'chaussures', name: 'Chaussures', emoji: '👞' },
  { id: 'teeshirt', name: 'Tee-shirt', emoji: '👕' },
  { id: 'pot', name: 'Pot', emoji: '🏺' },
]

export const ITEMS_BY_ID: ReadonlyMap<string, Item> = new Map(ITEMS.map((it) => [it.id, it]))

// ------------------------------------------------------------
// Les consignes. Une consigne pointe vers UN objet-cible ; tout
// autre objet est un distracteur sûr (jamais une bonne réponse à
// cette consigne). Deux objets (pull, pain) répondent à un besoin
// ET sont fabriqués à partir d'une matière — c'est volontaire et
// reste résoluble, car une consigne ne vise qu'un objet à la fois.
// ------------------------------------------------------------

export const BESOIN_PROMPTS: readonly Prompt[] = [
  { id: 'froid', kind: 'besoin', source: 'Tu as froid', sourceEmoji: '🥶', targetId: 'pull' },
  { id: 'faim', kind: 'besoin', source: 'Tu as faim', sourceEmoji: '😋', targetId: 'pain' },
  { id: 'soif', kind: 'besoin', source: 'Tu as soif', sourceEmoji: '😓', targetId: 'verre' },
  { id: 'nuit', kind: 'besoin', source: 'Tu veux voir la nuit', sourceEmoji: '🌙', targetId: 'lampe' },
  { id: 'ecrire', kind: 'besoin', source: 'Tu veux écrire', sourceEmoji: '✍️', targetId: 'stylo' },
  { id: 'deplacer', kind: 'besoin', source: 'Tu veux te déplacer', sourceEmoji: '🏃', targetId: 'velo' },
  { id: 'heure', kind: 'besoin', source: "Tu veux savoir l'heure", sourceEmoji: '🕒', targetId: 'montre' },
  { id: 'pluie', kind: 'besoin', source: 'Il pleut', sourceEmoji: '🌧️', targetId: 'parapluie' },
]

export const MATIERE_PROMPTS: readonly Prompt[] = [
  { id: 'bois', kind: 'matiere', source: 'le bois', sourceEmoji: '🪵', targetId: 'chaise' },
  { id: 'laine', kind: 'matiere', source: 'la laine', sourceEmoji: '🐑', targetId: 'pull' },
  { id: 'ble', kind: 'matiere', source: 'le blé', sourceEmoji: '🌾', targetId: 'pain' },
  { id: 'lait', kind: 'matiere', source: 'le lait', sourceEmoji: '🥛', targetId: 'fromage' },
  { id: 'sable', kind: 'matiere', source: 'le sable', sourceEmoji: '🏖️', targetId: 'fenetre' },
  { id: 'cuir', kind: 'matiere', source: 'le cuir', sourceEmoji: '🟫', targetId: 'chaussures' },
  { id: 'coton', kind: 'matiere', source: 'le coton', sourceEmoji: '🌱', targetId: 'teeshirt' },
  { id: 'argile', kind: 'matiere', source: "l'argile", sourceEmoji: '🟤', targetId: 'pot' },
]

export const PROMPTS_BY_ID: ReadonlyMap<string, Prompt> = new Map(
  [...BESOIN_PROMPTS, ...MATIERE_PROMPTS].map((p) => [p.id, p]),
)

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
  'mo.cp.objets.besoin',
  'mo.cp.objets.besoin',
  'mo.cp.objets.matiere',
  'mo.cp.objets.matiere',
] as const

/** T0/T1 = besoin → objet ; T2/T3 = matière → objet. */
export function promptKindForTier(tier: TierId): PromptKind {
  return tier <= 1 ? 'besoin' : 'matiere'
}

/** Les consignes disponibles pour un palier. */
export function promptsForTier(tier: TierId): readonly Prompt[] {
  return promptKindForTier(tier) === 'besoin' ? BESOIN_PROMPTS : MATIERE_PROMPTS
}

// ------------------------------------------------------------
// Items (un round d'association : trouver l'objet dans une grille)
// ------------------------------------------------------------

export interface AssocItem {
  tier: TierId
  promptId: string
  /** Id de l'objet à trouver. */
  targetId: string
  /** Objets affichés à l'écran (cible incluse), déjà mélangés. */
  optionIds: string[]
}

/** Nombre d'objets à l'écran selon palier + Tuner. T0/T2 : 3. T1/T3 : 4 ou 5. */
export function optionCountFor(tier: TierId, level: number): number {
  const lvl = Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
  if (tier === 0 || tier === 2) return 3
  return 4 + lvl // T1/T3 : niveau 0 → 4, niveau 1 → 5
}

/** Tire une consigne du palier, en évitant `avoid` quand une alternative existe. */
function pickPrompt(tier: TierId, avoid?: string): Prompt {
  const pool = promptsForTier(tier)
  const filtered = avoid === undefined ? pool : pool.filter((p) => p.id !== avoid)
  return pick(filtered.length > 0 ? filtered : pool)
}

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoid` (id de consigne) évite de reproposer la même consigne deux
 * fois de suite. La cible est toujours présente, il y a toujours ≥1
 * distracteur, et un distracteur n'est JAMAIS l'objet-cible.
 */
export function generateItem(tier: TierId, level: number, avoid?: string): AssocItem {
  const prompt = pickPrompt(tier, avoid)
  const wanted = optionCountFor(tier, level)

  // Distracteurs : tous les objets sauf la cible. Aucun n'est une bonne
  // réponse à CETTE consigne (la consigne ne vise que `targetId`).
  const others = ITEMS.filter((it) => it.id !== prompt.targetId).map((it) => it.id)
  // Garde-fou : au moins 2 objets à l'écran (1 cible + ≥1 distracteur).
  const distractorCount = Math.max(1, Math.min(wanted - 1, others.length))
  const distractors = shuffle(others).slice(0, distractorCount)

  return {
    tier,
    promptId: prompt.id,
    targetId: prompt.targetId,
    optionIds: shuffle([prompt.targetId, ...distractors]),
  }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** L'objet tapé est-il celui que la consigne demande ? */
export function isCorrect(item: AssocItem, itemId: string): boolean {
  return itemId === item.targetId
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

export interface AobProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: AobProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: AobProgress, tier: TierId, stars: 1 | 2 | 3): AobProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
