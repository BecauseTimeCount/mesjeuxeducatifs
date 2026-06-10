// ============================================================
// L'Orchestre des Animaux — logique PURE.
// Génération de séquences musicales (Simon sonore), validation
// pas-à-pas d'une saisie, helpers du séquenceur (grille 6×8,
// compositions sauvegardées), score & progression.
// Aucun import React / engine. Prouvé par logic.test.ts.
// ============================================================

export type TierId = 0 | 1 | 2 | 3

export type AnimalId = 'grenouille' | 'oiseau' | 'elephant' | 'chat' | 'singe' | 'canard'

export interface AnimalDef {
  id: AnimalId
  emoji: string
  /** Libellé enfant, en français (sert aussi d'aria-label) */
  label: string
}

/** Les 6 animaux-musiciens, dans l'ordre des pads ET des rangées du séquenceur. */
export const ANIMALS: readonly AnimalDef[] = [
  { id: 'grenouille', emoji: '🐸', label: 'La grenouille' },
  { id: 'oiseau', emoji: '🐦', label: 'L’oiseau' },
  { id: 'elephant', emoji: '🐘', label: 'L’éléphant' },
  { id: 'chat', emoji: '🐱', label: 'Le chat' },
  { id: 'singe', emoji: '🐒', label: 'Le singe au tambour' },
  { id: 'canard', emoji: '🦆', label: 'Le canard' },
] as const

export const ANIMAL_COUNT = ANIMALS.length // 6

export const TIER_COUNT = 4
export const SEQUENCES_PER_RUN = 8
/** Le Tuner a 5 crans : longueur de séquence 2 (cran 0) → 6 (cran 4). */
export const MAX_TUNER_LEVEL = 4
export const MIN_SEQ_LENGTH = 2
export const MAX_SEQ_LENGTH = 6
/** Jusqu'à cette longueur incluse : jamais deux fois le même pad d'affilée. */
export const NO_REPEAT_MAX_LENGTH = 4

export const REPRODUCE_SKILL = 'ar.gs.rythme.reproduire'
export const COMPOSE_SKILL = 'ar.gs.rythme.composer'

// ------------------------------------------------------------
// Paliers — combien de musiciens, à quel tempo
// ------------------------------------------------------------

const TIER_PADS: Readonly<Record<TierId, number>> = { 0: 3, 1: 4, 2: 6, 3: 6 }
/** Durée d'un temps (ms) pendant la lecture de la séquence. */
const TIER_TEMPO: Readonly<Record<TierId, number>> = { 0: 700, 1: 700, 2: 700, 3: 460 }

/** Nombre de pads-musiciens disponibles à un palier. */
export function padsForTier(tier: TierId): number {
  return TIER_PADS[tier]
}

/** Tempo (ms par note) de la lecture de la séquence à un palier. */
export function tempoForTier(tier: TierId): number {
  return TIER_TEMPO[tier]
}

/** Facteur de ralentissement de la réécoute après une erreur (l'erreur enseigne). */
export const TEACH_TEMPO_FACTOR = 1.7

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

/** Longueur de séquence pour un cran du Tuner : 2 → 6, jamais au-delà. */
export function lengthFor(level: number): number {
  return Math.min(MAX_SEQ_LENGTH, MIN_SEQ_LENGTH + clampLevel(level))
}

// ------------------------------------------------------------
// Génération procédurale des séquences
// ------------------------------------------------------------

/**
 * Tire une séquence de `length` pads parmi `padCount` musiciens.
 * Invariants (prouvés par les tests) :
 * - chaque pad ∈ [0, padCount-1] ;
 * - longueurs courtes (≤ NO_REPEAT_MAX_LENGTH) : jamais deux pads
 *   identiques d'affilée ;
 * - longueurs longues : les répétitions immédiates sont permises
 *   (c'est musical) mais jamais TROIS fois le même pad d'affilée ;
 * - toute séquence de longueur ≥ 2 utilise au moins 2 pads distincts.
 * `rand` est injectable pour les tests (défaut Math.random, [0, 1)).
 */
export function generateSequence(
  length: number,
  padCount: number,
  rand: () => number = Math.random,
): number[] {
  const n = Math.max(2, Math.min(ANIMAL_COUNT, Math.floor(padCount)))
  const len = Math.max(1, Math.min(MAX_SEQ_LENGTH, Math.floor(length)))
  const noRepeat = len <= NO_REPEAT_MAX_LENGTH
  const out: number[] = []
  for (let i = 0; i < len; i++) {
    let candidate = Math.floor(rand() * n) % n
    const prev = out[i - 1]
    const isBanned =
      prev !== undefined &&
      candidate === prev &&
      (noRepeat || out[i - 2] === prev) // jamais 3 identiques d'affilée
    if (isBanned) {
      // Décale vers n'importe quel AUTRE pad (couvre tous les pads ≠ prev)
      candidate = (candidate + 1 + (Math.floor(rand() * (n - 1)) % (n - 1))) % n
    }
    out.push(candidate)
  }
  // Variété garantie : une séquence monotone n'apprend rien
  if (len >= 2 && out.every((v) => v === out[0])) {
    out[len - 1] = (out[0] + 1) % n
  }
  return out
}

// ------------------------------------------------------------
// Validation pas-à-pas de la saisie (pour illuminer en live)
// ------------------------------------------------------------

export type Verdict = 'progress' | 'complete' | 'mistake'

/**
 * Compare la saisie (préfixe) à la séquence attendue.
 * - un pad faux N'IMPORTE OÙ → 'mistake' (le jeu enseigne aussitôt) ;
 * - préfixe correct incomplet → 'progress' ;
 * - séquence entièrement rejouée → 'complete'.
 */
export function verdict(sequence: readonly number[], input: readonly number[]): Verdict {
  if (input.length > sequence.length) return 'mistake'
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== sequence[i]) return 'mistake'
  }
  return input.length === sequence.length ? 'complete' : 'progress'
}

// ------------------------------------------------------------
// Le séquenceur de la baguette magique — grille 6 animaux × 8 pas
// ------------------------------------------------------------

export const GRID_STEPS = 8
/** Tempos de la boucle (ms par pas) : [escargot, lapin]. */
export const COMPOSE_TEMPOS = [320, 190] as const

/** Grille du séquenceur : ANIMAL_COUNT rangées × GRID_STEPS pas. */
export type Grid = boolean[][]

export function emptyGrid(): Grid {
  return Array.from({ length: ANIMAL_COUNT }, () => Array.from({ length: GRID_STEPS }, () => false))
}

/** Pose/retire un animal sur une case. Immutable ; hors bornes → grille inchangée. */
export function toggleCell(grid: Grid, animal: number, step: number): Grid {
  if (animal < 0 || animal >= ANIMAL_COUNT || step < 0 || step >= GRID_STEPS) return grid
  if (!Number.isInteger(animal) || !Number.isInteger(step)) return grid
  return grid.map((row, a) => (a === animal ? row.map((c, s) => (s === step ? !c : c)) : row))
}

/** Nombre d'animaux DIFFÉRENTS utilisés (rangées avec au moins une case). */
export function activeAnimals(grid: Grid): number {
  return grid.filter((row) => row.some(Boolean)).length
}

/** Nombre total de cases posées. */
export function filledCells(grid: Grid): number {
  return grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
}

/** Une composition « compte » : au moins une mesure avec ≥ 2 animaux différents. */
export function isComposeValid(grid: Grid): boolean {
  return activeAnimals(grid) >= 2
}

// ---------- Sérialisation des compositions ----------

export interface SavedCompo {
  name: string
  /** Grille sérialisée par serializeGrid */
  grid: string
  createdAt: number
}

export const MAX_COMPOS = 10

/** '010...0|...' : une ligne de GRID_STEPS caractères 0/1 par animal, séparées par |. */
export function serializeGrid(grid: Grid): string {
  return grid.map((row) => row.map((c) => (c ? '1' : '0')).join('')).join('|')
}

/** Inverse de serializeGrid. Données invalides/corrompues → null (jamais de crash). */
export function deserializeGrid(s: string): Grid | null {
  const rows = s.split('|')
  if (rows.length !== ANIMAL_COUNT) return null
  const grid: Grid = []
  for (const row of rows) {
    if (!new RegExp(`^[01]{${GRID_STEPS}}$`).test(row)) return null
    grid.push([...row].map((c) => c === '1'))
  }
  return grid
}

/** Petit nom automatique : « Ma musique N », plus petit N libre. */
export function nextCompoName(existing: readonly SavedCompo[]): string {
  const used = new Set<number>()
  for (const c of existing) {
    const m = /^Ma musique (\d+)$/.exec(c.name)
    if (m) used.add(Number(m[1]))
  }
  let n = 1
  while (used.has(n)) n += 1
  return `Ma musique ${n}`
}

/** Ajoute une compo à la galerie (immutable). Galerie pleine → liste inchangée. */
export function addCompo(list: readonly SavedCompo[], compo: SavedCompo): SavedCompo[] {
  if (list.length >= MAX_COMPOS) return [...list]
  return [...list, compo]
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

export interface OdaProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: OdaProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: OdaProgress, tier: TierId, stars: 1 | 2 | 3): OdaProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
