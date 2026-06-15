// ============================================================
// L'Atelier des Couleurs — logique PURE (aucun import React/DOM).
//
// Mécanique « le pot magique » (zéro QCM, PRODUCTION) : un grand
// pot central vide ; l'enfant TAPE des pots de peinture (sources)
// pour les y verser. Le pot se teinte du VRAI mélange courant.
// Quand le mélange == la couleur cible -> réussite. Un versement
// qui n'appartient pas à la recette ENSEIGNE (rendu + feedback).
//
// Prouvé par logic.test.ts : chaque item généré est TOUJOURS
// résoluble — mixResult(recipe) === targetId, la palette contient
// toute la recette + au moins un distracteur.
// ============================================================

import { pick, shuffle } from '@/engine/rng'

export interface Color {
  id: string
  /** Nom français (avec accents), côté enfant. */
  name: string
  /** Couleur de rendu (hex). */
  hex: string
}

// ------------------------------------------------------------
// La palette du peintre — sources et couleurs obtenues.
// ------------------------------------------------------------

export const COLORS: readonly Color[] = [
  // Primaires (sources)
  { id: 'rouge', name: 'rouge', hex: '#e23b3b' },
  { id: 'bleu', name: 'bleu', hex: '#3b6fe2' },
  { id: 'jaune', name: 'jaune', hex: '#f4d23b' },
  // Neutres (sources)
  { id: 'blanc', name: 'blanc', hex: '#ffffff' },
  { id: 'noir', name: 'noir', hex: '#2f2f2f' },
  // Secondaires & dérivées (obtenues par mélange)
  { id: 'violet', name: 'violet', hex: '#7e3ff2' },
  { id: 'orange', name: 'orange', hex: '#ef8a2b' },
  { id: 'vert', name: 'vert', hex: '#3fae5a' },
  { id: 'rose', name: 'rose', hex: '#f48fb1' },
  { id: 'gris', name: 'gris', hex: '#9aa0a6' },
  { id: 'marron', name: 'marron', hex: '#8d5a3b' },
]

export const COLORS_BY_ID: ReadonlyMap<string, Color> = new Map(COLORS.map((c) => [c.id, c]))

/** Les couleurs que l'enfant peut verser (pots de peinture sources). */
export const PRIMARIES: readonly string[] = ['rouge', 'bleu', 'jaune']
export const NEUTRALS: readonly string[] = ['blanc', 'noir']
export const SOURCES: readonly string[] = [...PRIMARIES, ...NEUTRALS]

// ------------------------------------------------------------
// Table des mélanges. Clé canonique = ids triés, joints par '+'.
// Un mélange = un multiset de sources -> une couleur obtenue.
// ------------------------------------------------------------

/** Clé canonique d'un multiset de sources (ordre indifférent, multiplicité conservée). */
export function mixKey(ids: readonly string[]): string {
  return [...ids].sort().join('+')
}

export const MIX_TABLE: ReadonlyMap<string, string> = new Map([
  [mixKey(['bleu', 'rouge']), 'violet'],
  [mixKey(['jaune', 'rouge']), 'orange'],
  [mixKey(['bleu', 'jaune']), 'vert'],
  [mixKey(['blanc', 'rouge']), 'rose'],
  [mixKey(['blanc', 'noir']), 'gris'],
  [mixKey(['bleu', 'jaune', 'rouge']), 'marron'],
])

/**
 * Couleur obtenue en versant ces sources.
 * - 0 source -> 'inconnu' (pot vide).
 * - 1 source qui EST une couleur -> cette couleur (le rouge versé donne du rouge).
 * - n sources -> la recette de MIX_TABLE, sinon 'inconnu'.
 */
export function mixResult(ids: readonly string[]): string {
  if (ids.length === 0) return 'inconnu'
  if (ids.length === 1) return COLORS_BY_ID.has(ids[0]) ? ids[0] : 'inconnu'
  return MIX_TABLE.get(mixKey(ids)) ?? 'inconnu'
}

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner a 2 crans : 0 = peu de distracteurs, 1 = palette plus fournie. */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'ar.gs.couleurs.primaires',
  'ar.gs.couleurs.melanges',
  'ar.cp.couleurs.obtenir',
  'ar.cp.couleurs.obtenir',
] as const

/** Couleurs-cibles proposées par palier (toutes sont produites par une recette). */
const TARGETS_BY_TIER: Readonly<Record<TierId, readonly string[]>> = {
  0: ['rouge', 'bleu', 'jaune'], // primaires : verser la bonne peinture
  1: ['violet', 'orange', 'vert'], // secondaires : 2 primaires
  2: ['violet', 'orange', 'vert', 'rose', 'gris'], // obtenir : secondaires + rose/gris
  3: ['rose', 'gris', 'marron'], // nuances : blanc/noir + marron (3 sources)
}

/** Recette canonique d'une couleur-cible (multiset de sources, toujours résoluble). */
export function recipeFor(targetId: string): string[] {
  // Cible primaire : on verse la peinture elle-même.
  if (PRIMARIES.includes(targetId)) return [targetId]
  // Cible obtenue : on retrouve le multiset dans la table.
  for (const [key, result] of MIX_TABLE) {
    if (result === targetId) return key.split('+')
  }
  return []
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface ColItem {
  tier: TierId
  /** La couleur que le peintre veut obtenir. */
  targetId: string
  /** Pots de peinture posés (sources) : recette + distracteurs, mélangés. */
  palette: string[]
  /** La solution : multiset exact de sources à verser. */
  recipe: string[]
}

/** Nombre de distracteurs sur la palette selon le cran du Tuner. */
const DISTRACTOR_SPECS: readonly number[] = [1, 2]

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

/** Tire une cible du palier en évitant `avoid` quand une alternative existe. */
function pickTarget(tier: TierId, avoid?: string): string {
  const pool = TARGETS_BY_TIER[tier]
  const filtered = avoid === undefined ? pool : pool.filter((t) => t !== avoid)
  return pick(filtered.length > 0 ? filtered : pool)
}

/**
 * Génère un item résoluble pour un palier et un cran de Tuner.
 * La palette contient TOUJOURS toutes les sources de la recette
 * (dédupliquées) + au moins un distracteur source absent de la recette.
 * `avoid` évite de reproposer la même cible deux fois de suite.
 */
export function generateItem(tier: TierId, level: number, avoid?: string): ColItem {
  const targetId = pickTarget(tier, avoid)
  const recipe = recipeFor(targetId)
  const needed = [...new Set(recipe)]

  const wantDistractors = DISTRACTOR_SPECS[clampLevel(level)]
  const candidates = shuffle(SOURCES.filter((s) => !needed.includes(s)))
  // Au moins un distracteur, jamais plus que les sources disponibles.
  const count = Math.max(1, Math.min(wantDistractors, candidates.length))
  const distractors = candidates.slice(0, count)

  const palette = shuffle([...needed, ...distractors])
  return { tier, targetId, palette, recipe }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** L'item est-il résolu ? (le multiset versé == le multiset de la recette) */
export function success(recipe: readonly string[], poured: readonly string[]): boolean {
  if (recipe.length !== poured.length) return false
  return mixKey(recipe) === mixKey(poured)
}

/**
 * Le dernier versement éloigne-t-il de la cible ?
 * Vrai si, en multiplicité, le pot versé contient une source qui n'est
 * pas (ou plus) attendue par la recette.
 */
export function isWrongPour(recipe: readonly string[], poured: readonly string[]): boolean {
  const remaining = new Map<string, number>()
  for (const id of recipe) remaining.set(id, (remaining.get(id) ?? 0) + 1)
  for (const id of poured) {
    const left = remaining.get(id) ?? 0
    if (left <= 0) return true
    remaining.set(id, left - 1)
  }
  return false
}

/** Une source isolée fait-elle partie (avec un budget restant) de la recette ? */
export function isSourceOf(recipe: readonly string[], poured: readonly string[], id: string): boolean {
  return !isWrongPour(recipe, [...poured, id])
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

export interface ColProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: ColProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: ColProgress, tier: TierId, stars: 1 | 2 | 3): ColProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}

// ------------------------------------------------------------
// Helpers d'affichage (purs)
// ------------------------------------------------------------

export function hexOf(id: string): string {
  return COLORS_BY_ID.get(id)?.hex ?? '#d8d2c4'
}

export function nameOf(id: string): string {
  return COLORS_BY_ID.get(id)?.name ?? id
}
