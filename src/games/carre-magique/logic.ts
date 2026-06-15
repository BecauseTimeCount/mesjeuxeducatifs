// ============================================================
// Le Carré Magique des Robots — logique PURE (aucun import React/DOM).
//
// Sudoku 4x4 : carré latin de symboles 0..3 sur 4 lignes, 4 colonnes
// et 4 régions 2x2. L'enfant PRODUIT la grille en posant un symbole
// (une pièce de robot) sur une case vide. Une pose qui viole une
// contrainte (ligne / colonne / région) est REFUSÉE et expliquée —
// jamais comptée comme correcte.
//
// Prouvé par logic.test.ts : chaque grille générée a une solution
// UNIQUE (countSolutions === 1), les indices donnés sont un sous-
// ensemble de la solution, et toute case vide a au moins un candidat.
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'
import type { SkillId } from '@/engine/types'

// ------------------------------------------------------------
// Constantes de grille
// ------------------------------------------------------------

/** Côté de la grille (4x4). */
export const SIZE = 4
/** Nombre de symboles distincts (= côté). */
export const SYMBOLS = 4
/** Nombre de cases (16). */
export const CELLS = SIZE * SIZE
/** Case vide. */
export const EMPTY = -1

/** Tous les symboles valides 0..3. */
export const ALL_SYMBOLS: readonly number[] = [0, 1, 2, 3]

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
/** 5 grilles par partie (pas 8). */
export const ITEMS_PER_RUN = 5
/** Le Tuner n'a que 2 crans : 0 et 1 (resserre / élargit le retrait). */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'lo.gs.quadrillage',
  'lo.gs.deduction.contrainte',
  'lo.gs.deduction.contrainte',
  'lo.gs.deduction.contrainte',
] as const satisfies readonly SkillId[]

// ------------------------------------------------------------
// Géométrie de la grille (index linéaire 0..15)
// ------------------------------------------------------------

export function rowOf(idx: number): number {
  return Math.floor(idx / SIZE)
}

export function colOf(idx: number): number {
  return idx % SIZE
}

/** Index de la région 2x2 (0..3) d'une case. */
export function regionOf(idx: number): number {
  const r = rowOf(idx)
  const c = colOf(idx)
  return Math.floor(r / 2) * 2 + Math.floor(c / 2)
}

/** Tous les index d'une grille (0..15). */
export function allIndices(): number[] {
  return Array.from({ length: CELLS }, (_, i) => i)
}

// ------------------------------------------------------------
// Contraintes du sudoku (le cœur honnête)
// ------------------------------------------------------------

/**
 * `sym` peut-il être posé en `idx` sans violer ligne / colonne / région ?
 * La case `idx` elle-même est ignorée (on teste un placement, pas l'existant).
 */
export function isValidPlacement(grid: readonly number[], idx: number, sym: number): boolean {
  const r = rowOf(idx)
  const c = colOf(idx)
  const reg = regionOf(idx)
  for (let i = 0; i < CELLS; i++) {
    if (i === idx) continue
    if (grid[i] !== sym) continue
    if (rowOf(i) === r || colOf(i) === c || regionOf(i) === reg) return false
  }
  return true
}

/**
 * Cases déjà occupées par `sym` qui rentrent en conflit avec une pose en `idx`
 * (même ligne, colonne OU région). Sert au surlignage de l'erreur.
 */
export function conflictCells(grid: readonly number[], idx: number, sym: number): number[] {
  const r = rowOf(idx)
  const c = colOf(idx)
  const reg = regionOf(idx)
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) {
    if (i === idx) continue
    if (grid[i] !== sym) continue
    if (rowOf(i) === r || colOf(i) === c || regionOf(i) === reg) out.push(i)
  }
  return out
}

/** Symboles 0..3 posables sur une case vide (pour l'indice par élimination). */
export function candidates(grid: readonly number[], idx: number): number[] {
  if (grid[idx] !== EMPTY) return []
  const out: number[] = []
  for (const sym of ALL_SYMBOLS) {
    if (isValidPlacement(grid, idx, sym)) out.push(sym)
  }
  return out
}

/** La grille est-elle entièrement remplie (aucune case vide) ? */
export function isComplete(grid: readonly number[]): boolean {
  return grid.every((v) => v !== EMPTY)
}

/** La grille est-elle remplie ET valide (vrai sudoku résolu) ? */
export function isSolved(grid: readonly number[]): boolean {
  if (!isComplete(grid)) return false
  for (let i = 0; i < CELLS; i++) {
    if (!isValidPlacement(grid, i, grid[i])) return false
  }
  return true
}

// ------------------------------------------------------------
// Génération d'une grille solution (carré latin 4x4 sudoku-valide)
// ------------------------------------------------------------

/**
 * Patron de base : un sudoku 4x4 valide canonique. Les lignes sont
 * groupées par bandes [0,1] et [2,3], les colonnes par piles [0,1] et
 * [2,3] — l'échange À L'INTÉRIEUR d'une bande/pile préserve les régions.
 */
const BASE: readonly number[] = [
  0, 1, 2, 3,
  2, 3, 0, 1,
  1, 0, 3, 2,
  3, 2, 1, 0,
]

function swapRows(grid: number[], a: number, b: number): void {
  for (let c = 0; c < SIZE; c++) {
    const ia = a * SIZE + c
    const ib = b * SIZE + c
    const tmp = grid[ia]
    grid[ia] = grid[ib]
    grid[ib] = tmp
  }
}

function swapCols(grid: number[], a: number, b: number): void {
  for (let r = 0; r < SIZE; r++) {
    const ia = r * SIZE + a
    const ib = r * SIZE + b
    const tmp = grid[ia]
    grid[ia] = grid[ib]
    grid[ib] = tmp
  }
}

/**
 * Génère une grille solution aléatoire : permutation des symboles +
 * échanges de lignes/colonnes intra-bande et de bandes/piles entières.
 * Toutes ces transformations préservent la validité sudoku → la grille
 * reste un carré latin valide avec régions 2x2.
 */
export function solvedGrid(): number[] {
  const perm = shuffle(ALL_SYMBOLS)
  const grid = BASE.map((v) => perm[v])

  // Échanger les deux lignes à l'intérieur de chaque bande (0<->1, 2<->3).
  if (randInt(0, 1) === 1) swapRows(grid, 0, 1)
  if (randInt(0, 1) === 1) swapRows(grid, 2, 3)
  // Échanger les deux bandes entières (lignes 0,1 <-> 2,3).
  if (randInt(0, 1) === 1) {
    swapRows(grid, 0, 2)
    swapRows(grid, 1, 3)
  }
  // Échanger les deux colonnes à l'intérieur de chaque pile (0<->1, 2<->3).
  if (randInt(0, 1) === 1) swapCols(grid, 0, 1)
  if (randInt(0, 1) === 1) swapCols(grid, 2, 3)
  // Échanger les deux piles entières (colonnes 0,1 <-> 2,3).
  if (randInt(0, 1) === 1) {
    swapCols(grid, 0, 2)
    swapCols(grid, 1, 3)
  }

  return grid
}

// ------------------------------------------------------------
// Comptage des solutions (backtracking) → unicité
// ------------------------------------------------------------

/**
 * Compte les solutions d'une grille partielle, en s'arrêtant dès que
 * `cap` est atteint (on n'a besoin que de distinguer 1 de « ≥ 2 »).
 * Choisit la case vide la plus contrainte (MRV) pour rester rapide.
 */
export function countSolutions(grid: readonly number[], cap = 2): number {
  const work = [...grid]

  function solve(): number {
    // Case vide avec le moins de candidats (MRV).
    let bestIdx = -1
    let bestCands: number[] = []
    for (let i = 0; i < CELLS; i++) {
      if (work[i] !== EMPTY) continue
      const cands = candidates(work, i)
      if (cands.length === 0) return 0 // impasse
      if (bestIdx === -1 || cands.length < bestCands.length) {
        bestIdx = i
        bestCands = cands
        if (cands.length === 1) break // singleton : on ne fera pas mieux
      }
    }
    if (bestIdx === -1) return 1 // plus de case vide → une solution complète

    let total = 0
    for (const sym of bestCands) {
      work[bestIdx] = sym
      total += solve()
      work[bestIdx] = EMPTY
      if (total >= cap) break
    }
    return total
  }

  return solve()
}

/** La grille partielle a-t-elle exactement une solution ? */
export function hasUniqueSolution(grid: readonly number[]): boolean {
  return countSolutions(grid, 2) === 1
}

// ------------------------------------------------------------
// Item = une grille à compléter
// ------------------------------------------------------------

export interface PuzzleItem {
  tier: TierId
  /** Grille de départ : symboles donnés + EMPTY pour les cases à remplir. */
  given: number[]
  /** Solution complète (unique). */
  solution: number[]
}

/** Nombre de cases à RETIRER selon le palier et le niveau de Tuner. */
export function blanksFor(tier: TierId, level: number): number {
  const lvl = clampLevel(level)
  // T0 : 2 trous ; T1 : 3 (lvl 0) ou 4 (lvl 1) ; T2 : 5 ; T3 : 6.
  if (tier === 0) return 2
  if (tier === 1) return 3 + lvl
  if (tier === 2) return 5
  return 6
}

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

/**
 * Retire des cases d'une solution tant que l'unicité est préservée, en
 * visant `target` retraits. Retourne la grille trouée (avec EMPTY).
 * Procédure gloutonne sur un ordre aléatoire : chaque retrait est annulé
 * s'il casse l'unicité, garantissant `hasUniqueSolution(given)`.
 */
function carveUnique(solution: readonly number[], target: number): number[] {
  const given = [...solution]
  let removed = 0
  for (const idx of shuffle(allIndices())) {
    if (removed >= target) break
    const saved = given[idx]
    given[idx] = EMPTY
    if (hasUniqueSolution(given)) {
      removed += 1
    } else {
      given[idx] = saved // ce retrait ouvrirait une seconde solution
    }
  }
  return given
}

/**
 * Génère une grille jouable RÉSOLUBLE et à solution UNIQUE pour un palier.
 * `avoid` : signature de grille à ne pas reproduire à l'identique (évite
 * deux grilles successives jumelles).
 *
 * Garanties (prouvées par les tests) :
 *  - `hasUniqueSolution(given)` est vrai,
 *  - `given` ⊂ `solution` (chaque case donnée porte la valeur solution),
 *  - au moins une case est vide (un puzzle à remplir).
 */
export function makePuzzle(tier: TierId, level: number, avoid?: string): PuzzleItem {
  const target = blanksFor(tier, level)
  let best: PuzzleItem | null = null

  for (let attempt = 0; attempt < 40; attempt++) {
    const solution = solvedGrid()
    const given = carveUnique(solution, target)
    const blanks = given.filter((v) => v === EMPTY).length
    if (blanks === 0) continue
    const candidate: PuzzleItem = { tier, given, solution }
    // On préfère une grille atteignant le nombre de trous visé et différente
    // de `avoid` ; à défaut on garde la meilleure (plus de trous) rencontrée.
    const fresh = avoid === undefined || gridKey(given) !== avoid
    if (blanks >= target && fresh) return candidate
    if (best === null || blanks > best.given.filter((v) => v === EMPTY).length) {
      best = candidate
    }
  }

  // Filet de sécurité : la dernière grille générée a toujours ≥ 1 trou car
  // retirer une seule case d'un sudoku 4x4 plein laisse toujours l'unicité.
  return best ?? fallbackPuzzle(tier)
}

/** Signature stable d'une grille (pour `avoid`). */
export function gridKey(grid: readonly number[]): string {
  return grid.join(',')
}

/** Filet déterministe : grille solution avec une seule case retirée. */
function fallbackPuzzle(tier: TierId): PuzzleItem {
  const solution = solvedGrid()
  const given = [...solution]
  given[0] = EMPTY
  return { tier, given, solution }
}

/** Alias conforme au gabarit (generateItem) — délègue à makePuzzle. */
export function generateItem(tier: TierId, level: number, avoid?: string): PuzzleItem {
  return makePuzzle(tier, level, avoid)
}

// ------------------------------------------------------------
// Pose d'un symbole (interaction commune)
// ------------------------------------------------------------

/**
 * Pose `sym` sur la case `idx` si elle est vide et que c'est valide.
 * Retourne la nouvelle grille (copie) ou `null` si le placement est
 * refusé (case déjà occupée, ou contrainte violée).
 */
export function place(grid: readonly number[], idx: number, sym: number): number[] | null {
  if (idx < 0 || idx >= CELLS || grid[idx] !== EMPTY) return null
  if (!isValidPlacement(grid, idx, sym)) return null
  const out = [...grid]
  out[idx] = sym
  return out
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

export interface CrmProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: CrmProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: CrmProgress, tier: TierId, stars: 1 | 2 | 3): CrmProgress {
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
// Pièces de robot (4 symboles distincts par FORME + couleur)
// ------------------------------------------------------------

export interface RobotPiece {
  /** Symbole 0..3. */
  sym: number
  /** id stable pour les clips audio : crm.piece.<id>. */
  id: string
  /** Emoji distinct (forme différente, pas seulement la couleur). */
  emoji: string
  /** Libellé français (aria / parents). */
  name: string
  /** Couleur d'accent CSS du symbole. */
  accent: string
}

export const PIECES: readonly RobotPiece[] = [
  { sym: 0, id: 'robot', emoji: '🤖', name: 'le robot', accent: '#5c6bc0' },
  { sym: 1, id: 'rouage', emoji: '⚙️', name: 'le rouage', accent: '#ef6c00' },
  { sym: 2, id: 'pile', emoji: '🔋', name: 'la pile', accent: '#2e7d32' },
  { sym: 3, id: 'ampoule', emoji: '💡', name: "l'ampoule", accent: '#fbc02d' },
]

export const PIECE_BY_SYM: ReadonlyMap<number, RobotPiece> = new Map(
  PIECES.map((p) => [p.sym, p]),
)

/** Une pièce au hasard (pour l'écran d'accueil, purement décoratif). */
export function randomPiece(): RobotPiece {
  return pick(PIECES)
}
