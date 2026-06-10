// ============================================================
// La Rivière aux Lucioles — logique PURE.
// Estimation sur la droite numérique : conversion position ↔ valeur,
// tolérances par palier, snap, génération des cibles sans répétition.
// Aucun import React/DOM. Prouvé par logic.test.ts :
// chaque cible générée est TOUJOURS atteignable.
// ============================================================

import { pick } from '@/engine/rng'

export type TierId = 0 | 1 | 2 | 3

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'ma.gs.droite10',
  'ma.gs.droite10',
  'ma.cp.num.droite',
  'ma.cp.num.droite',
] as const

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner a 3 crans : 0 = tolérance large, 2 = tolérance serrée. */
export const MAX_TUNER_LEVEL = 2

/** Borne droite de la rivière (le rocher de fin) par palier. */
export function maxFor(tier: TierId): number {
  if (tier === 0) return 10
  if (tier === 1) return 20
  return 100
}

// ------------------------------------------------------------
// Tolérances — ne s'élargissent JAMAIS quand le niveau monte.
// ------------------------------------------------------------

const TOLERANCES: Readonly<Record<TierId, readonly [number, number, number]>> = {
  0: [1, 0, 0], // ±1 puis exacte (le snap rend l'exactitude accessible)
  1: [1, 1, 1], // snap entier, ±1 constant
  2: [8, 6, 5], // estimation continue sur 0..100
  3: [12, 10, 8], // la grande estimation : presque sans repères
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

/** Tolérance (en unités de la droite) pour un palier et un niveau de Tuner. */
export function toleranceFor(tier: TierId, level: number): number {
  return TOLERANCES[tier][clampLevel(level)]
}

/** Pas d'aimantation : T0/T1 s'aimantent à la graduation entière, T2/T3 jamais. */
export function snapFor(tier: TierId): number | null {
  return tier <= 1 ? 1 : null
}

// ------------------------------------------------------------
// Position ↔ valeur
// ------------------------------------------------------------

/** Valeur (continue) correspondant à une abscisse en pixels sur la rivière. */
export function positionToValue(x: number, width: number, max: number): number {
  if (width <= 0 || max <= 0) return 0
  const clamped = Math.min(Math.max(x, 0), width)
  return (clamped / width) * max
}

/** Abscisse en pixels correspondant à une valeur sur la rivière. */
export function valueToPosition(value: number, width: number, max: number): number {
  if (width <= 0 || max <= 0) return 0
  const clamped = Math.min(Math.max(value, 0), max)
  return (clamped / max) * width
}

/**
 * Valeur retenue pour un tap : toujours un entier.
 * T0/T1 : c'est l'aimantation à la graduation la plus proche.
 * T2/T3 : estimation continue, l'arrondi (< 0,5 unité) est négligeable
 * devant la tolérance — la luciole reste visuellement où l'enfant a tapé.
 */
export function guessFromPosition(x: number, width: number, tier: TierId): number {
  return Math.round(positionToValue(x, width, maxFor(tier)))
}

/** L'essai est-il assez proche ? Bornes ±tolerance INCLUSES. */
export function isHit(target: number, guess: number, tolerance: number): boolean {
  return Math.abs(target - guess) <= tolerance
}

/**
 * Zone d'indice [lo, hi] affichée après 2 échecs : couvre toujours
 * [target − tolerance, target + tolerance], avec une largeur MINIMALE
 * (4 % de la droite) pour rester visible même quand la tolérance est
 * exacte (T0 au niveau 1+ du Tuner). Bornes clampées à [0, max].
 */
export function hintZone(
  target: number,
  tolerance: number,
  max: number,
): readonly [number, number] {
  const half = Math.max(tolerance, max * 0.04)
  return [Math.max(0, target - half), Math.min(max, target + half)]
}

// ------------------------------------------------------------
// Graduations (données pures pour le rendu)
// ------------------------------------------------------------

export interface Tick {
  value: number
  labeled: boolean
}

const TICK_SPECS: Readonly<Record<TierId, { step: number; labelStep: number }>> = {
  0: { step: 1, labelStep: 5 }, // toutes les graduations, étiquettes 0/5/10
  1: { step: 1, labelStep: 10 }, // toutes les graduations, étiquettes 0/10/20
  2: { step: 10, labelStep: 10 }, // graduations tous les 10, toutes étiquetées
  3: { step: 50, labelStep: 50 }, // seuls 0, 50 et 100 sont marqués
}

/** Galets-graduations de la rivière pour un palier. */
export function tickValues(tier: TierId): Tick[] {
  const max = maxFor(tier)
  const { step, labelStep } = TICK_SPECS[tier]
  const out: Tick[] = []
  for (let v = 0; v <= max; v += step) {
    out.push({ value: v, labeled: v % labelStep === 0 })
  }
  return out
}

/** Nombres-clés allumés pendant l'enseignement après un essai trop loin. */
export function teachingMarks(tier: TierId): number[] {
  const max = maxFor(tier)
  const step = tier <= 1 ? 5 : 10
  const out: number[] = []
  for (let v = 0; v <= max; v += step) out.push(v)
  return out
}

// ------------------------------------------------------------
// Génération des cibles
// ------------------------------------------------------------

/** Ancre triviale : une position déjà donnée par la scène, interdite en cible. */
export function isTrivialAnchor(tier: TierId, value: number): boolean {
  if (value <= 0 || value >= maxFor(tier)) return true // les rochers 0 et max
  if (tier === 2) return value % 10 === 0 // toutes les graduations sont étiquetées
  if (tier === 3) return Math.abs(value - 50) <= 4 || value <= 4 || value >= 96
  return false
}

/** Nombre « intéressant » : franchement entre deux dizaines (biais T2/T3). */
export function isInteresting(value: number): boolean {
  const d = value % 10
  return d >= 3 && d <= 7
}

/** Cibles candidates d'un palier (uniques, ancres triviales exclues). */
export function targetPool(tier: TierId): number[] {
  const out: number[] = []
  for (let v = 1; v < maxFor(tier); v++) {
    if (!isTrivialAnchor(tier, v)) out.push(v)
  }
  return out
}

/**
 * Tire une cible pour un palier en évitant celles déjà jouées dans la partie.
 * À T2/T3, biaise vers les nombres « intéressants » (loin des dizaines).
 * Si `avoid` couvre tout le pool, retombe sur le pool complet (jamais bloqué).
 */
export function generateTarget(tier: TierId, avoid: readonly number[] = []): number {
  const pool = targetPool(tier)
  const avoidSet = new Set(avoid)
  const candidates = pool.filter((v) => !avoidSet.has(v))
  const usable = candidates.length > 0 ? candidates : pool
  if (tier <= 1) return pick(usable)
  // Biais : les nombres intéressants comptent double dans le tirage.
  return pick([...usable, ...usable.filter(isInteresting)])
}

export interface RluItem {
  tier: TierId
  target: number
  max: number
}

/** Génère l'item suivant d'une partie (cible jamais répétée via avoid). */
export function generateItem(tier: TierId, avoid: readonly number[] = []): RluItem {
  return { tier, target: generateTarget(tier, avoid), max: maxFor(tier) }
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

export interface RluProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: RluProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: RluProgress, tier: TierId, stars: 1 | 2 | 3): RluProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
