// ============================================================
// Le Collier de Perles — logique PURE.
// Génération procédurale de motifs périodiques (AB, AAB, ABC…) :
// choix de l'unité, des perles (sans ambiguïté visuelle), des trous
// résolubles de façon UNIQUE, des intrus de palette, et transcription
// perles ↔ symboles (le « code secret », tier 3).
// Aucun import React / engine. Prouvé par logic.test.ts.
// ============================================================

export type TierId = 0 | 1 | 2 | 3
export type CdpMode = 'continue' | 'code' | 'decode'

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner a 3 crans : 0 = doux (moins de trous/intrus), 2 = corsé. */
export const MAX_TUNER_LEVEL = 2

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'lo.gs.motifs.suite',
  'lo.gs.motifs.suite',
  'lo.gs.motifs.suite',
  'lo.gs.motifs.creer',
] as const

// ------------------------------------------------------------
// Perles, formes et symboles
// ------------------------------------------------------------

export type BeadKind = string

export const COLOR_KINDS = ['rouge', 'bleu', 'jaune', 'vert', 'violet', 'orange'] as const
export const SHAPE_KINDS = ['etoile', 'papillon', 'coquillage'] as const
export const SYMBOL_KINDS = ['sym-triangle', 'sym-rond', 'sym-carre', 'sym-losange'] as const

/** Paires visuellement proches : jamais ensemble dans une même unité. */
const CONFUSABLE: ReadonlyArray<readonly [string, string]> = [
  ['rouge', 'orange'],
  ['bleu', 'violet'],
]

export function areConfusable(a: BeadKind, b: BeadKind): boolean {
  return CONFUSABLE.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
}

// ------------------------------------------------------------
// Aléa local (logique pure : aucune dépendance moteur)
// ------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickFrom<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]
}

function shuffleArr<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

// ------------------------------------------------------------
// Motifs : unités, répétitions, périodicité
// ------------------------------------------------------------

const TIER_PATTERNS: Readonly<Record<TierId, readonly string[]>> = {
  0: ['AB'],
  1: ['AAB', 'ABB', 'AABB'],
  2: ['ABC', 'AABC'],
  3: ['AB', 'AAB', 'ABB'],
}

export function patternsFor(tier: TierId): readonly string[] {
  return TIER_PATTERNS[tier]
}

/** Répétitions de l'unité : colliers de 8 ou 9 perles, jamais plus. */
export function repsFor(unitLen: number): number {
  if (unitLen === 2) return 4 // 8 perles
  if (unitLen === 3) return 3 // 9 perles
  return 2 // unité de 4 → 8 perles
}

export function distinctLetters(pattern: string): string[] {
  return [...new Set(pattern.split(''))]
}

/** Instancie un patron abstrait ('AAB') avec des perles concrètes. */
export function buildUnit(pattern: string, kinds: readonly BeadKind[]): BeadKind[] {
  const letters = distinctLetters(pattern)
  return pattern.split('').map((ch) => kinds[letters.indexOf(ch)])
}

export function buildSequence(unit: readonly BeadKind[], reps: number): BeadKind[] {
  const out: BeadKind[] = []
  for (let r = 0; r < reps; r++) out.push(...unit)
  return out
}

/** Période maximale considérée par le vérificateur (= unité la plus longue). */
export const MAX_PERIOD = 4

/** Périodique d'unité p : p divise la longueur, unité non constante, s[i] = s[i % p]. */
export function isPeriodicWith(seq: readonly BeadKind[], p: number): boolean {
  if (p < 2 || p > seq.length || seq.length % p !== 0) return false
  const unit = seq.slice(0, p)
  if (new Set(unit).size < 2) return false
  return seq.every((k, i) => k === unit[i % p])
}

/** Toutes les périodes valides (2..MAX_PERIOD) d'une séquence complète. */
export function validPeriods(seq: readonly BeadKind[]): number[] {
  const out: number[] = []
  for (let p = 2; p <= MAX_PERIOD; p++) {
    if (isPeriodicWith(seq, p)) out.push(p)
  }
  return out
}

// ------------------------------------------------------------
// Résolubilité UNIQUE : un seul remplissage des trous (avec les
// perles de la palette) rend le collier périodique.
// ------------------------------------------------------------

/**
 * Compte les remplissages des trous (palette^trous, force brute ≤ 6^4)
 * qui rendent le collier ENTIER périodique. La solution vraie en fait
 * toujours partie ; le collier est résoluble de façon unique ssi 1.
 */
export function countSolutions(
  solution: readonly BeadKind[],
  holes: readonly number[],
  palette: readonly BeadKind[],
): number {
  const kinds = [...new Set(palette)]
  const work = [...solution]
  let count = 0
  const fillAt = (h: number): void => {
    if (h >= holes.length) {
      if (validPeriods(work).length > 0) count += 1
      return
    }
    const idx = holes[h]
    for (const k of kinds) {
      work[idx] = k
      fillAt(h + 1)
    }
    work[idx] = solution[idx]
  }
  fillAt(0)
  return count
}

export function isUniquelySolvable(
  solution: readonly BeadKind[],
  holes: readonly number[],
  palette: readonly BeadKind[],
): boolean {
  return validPeriods(solution).length > 0 && countSolutions(solution, holes, palette) === 1
}

// ------------------------------------------------------------
// Difficulté (réglée par le Tuner)
// ------------------------------------------------------------

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

/** Nombre de trous — ne descend JAMAIS sous le plancher du palier. */
export function holesCountFor(tier: TierId, level: number): number {
  if (tier === 0) return 2
  if (tier === 2) return clampLevel(level) >= 1 ? 4 : 3
  return 3
}

/** Intrus de palette : perles ABSENTES du motif (vraies distractrices). */
export function intruderCountFor(tier: TierId, level: number): number {
  if (tier === 0) return clampLevel(level) >= 2 ? 2 : 1
  return clampLevel(level) >= 1 ? 2 : 1
}

// ------------------------------------------------------------
// Item de jeu
// ------------------------------------------------------------

export interface CdpItem {
  tier: TierId
  mode: CdpMode
  /** Unité du motif, en perles (même au tier 3) */
  unit: BeadKind[]
  /** Rangée RÉPONSE complète (perles, ou symboles en mode 'code') */
  sequence: BeadKind[]
  /** Tier 3 : rangée donnée en entier (perles si 'code', symboles si 'decode') */
  reference: BeadKind[] | null
  /** Indices à remplir dans `sequence` — jamais dans la première période */
  holes: number[]
  /** Perles/symboles proposés (nécessaires + intrus), mélangés */
  palette: BeadKind[]
  /** Tier 3 : perle → symbole */
  symbolMap: Readonly<Record<BeadKind, BeadKind>> | null
}

export function itemSignature(item: Pick<CdpItem, 'mode' | 'unit'>): string {
  return `${item.mode}:${item.unit.join('-')}`
}

// ------------------------------------------------------------
// Tirages élémentaires
// ------------------------------------------------------------

/**
 * Tire n perles distinctes, jamais confusables entre elles.
 * Tier 2 : mélange formes + couleurs (au moins une de chaque).
 */
function drawUnitKinds(tier: TierId, n: number): BeadKind[] {
  for (;;) {
    let kinds: BeadKind[]
    if (tier === 2) {
      const shapeCount = Math.min(randInt(1, 2), n - 1)
      const shapes = shuffleArr(SHAPE_KINDS).slice(0, shapeCount)
      const colors = shuffleArr(COLOR_KINDS).slice(0, n - shapeCount)
      kinds = shuffleArr([...shapes, ...colors])
    } else {
      kinds = shuffleArr(COLOR_KINDS).slice(0, n)
    }
    const clash = kinds.some((a, i) => kinds.some((b, j) => j > i && areConfusable(a, b)))
    if (!clash) return kinds
  }
}

function drawIntruders(
  unitKinds: readonly BeadKind[],
  count: number,
  pool: readonly BeadKind[],
): BeadKind[] {
  const candidates = shuffleArr(pool.filter((k) => !unitKinds.includes(k)))
  return candidates.slice(0, Math.min(count, candidates.length))
}

function middleRange(len: number, unitLen: number): number[] {
  const out: number[] = []
  for (let i = unitLen; i <= len - 3; i++) out.push(i)
  return out
}

/**
 * Positions des trous (mode continue). La première période n'est JAMAIS
 * trouée (le motif amorcé reste lisible). T0 : les 2 dernières perles.
 * T1 : 3 trous, parfois un au MILIEU. T2 : 3-4 trous dont au moins un milieu.
 */
function pickHoles(tier: TierId, len: number, unitLen: number, count: number): number[] {
  if (tier === 0) return [len - 2, len - 1]
  const holes = new Set<number>([len - 1, len - 2])
  const wantMiddle = tier === 2 ? count - 2 : Math.random() < 0.5 ? count - 2 : 0
  for (const i of shuffleArr(middleRange(len, unitLen))) {
    if (holes.size - 2 >= wantMiddle) break
    holes.add(i)
  }
  for (let i = len - 3; holes.size < count && i >= unitLen; i--) holes.add(i)
  return [...holes].sort((a, b) => a - b)
}

// ------------------------------------------------------------
// Génération — mode continue (tiers 0-2)
// ------------------------------------------------------------

const GENERATION_ATTEMPTS = 150

function buildContinueCandidate(tier: TierId, level: number): CdpItem | null {
  const pattern = pickFrom(patternsFor(tier))
  const kinds = drawUnitKinds(tier, distinctLetters(pattern).length)
  const unit = buildUnit(pattern, kinds)
  const sequence = buildSequence(unit, repsFor(unit.length))
  const pool = tier === 2 ? [...COLOR_KINDS, ...SHAPE_KINDS] : [...COLOR_KINDS]
  const palette = shuffleArr([
    ...new Set(unit),
    ...drawIntruders(kinds, intruderCountFor(tier, level), pool),
  ])
  const holes = pickHoles(tier, sequence.length, unit.length, holesCountFor(tier, level))
  if (!isUniquelySolvable(sequence, holes, palette)) return null
  return { tier, mode: 'continue', unit, sequence, reference: null, holes, palette, symbolMap: null }
}

/** Filet de sécurité prouvé : motif AB, trous en fin (toujours unique). */
function provenFallback(tier: TierId): CdpItem {
  const kinds = drawUnitKinds(0, 2)
  const unit = buildUnit('AB', kinds)
  const sequence = buildSequence(unit, 4)
  const palette = shuffleArr([...new Set(unit), ...drawIntruders(kinds, 1, [...COLOR_KINDS])])
  return {
    tier,
    mode: 'continue',
    unit,
    sequence,
    reference: null,
    holes: [sequence.length - 2, sequence.length - 1],
    palette,
    symbolMap: null,
  }
}

// ------------------------------------------------------------
// Génération — le code secret (tier 3)
// ------------------------------------------------------------

/** Trous du tier 3 : 3 positions hors première période (la correspondance
 *  perle ↔ symbole y reste visible : l'unité contient toutes les perles). */
function pickCodeHoles(len: number, unitLen: number): number[] {
  const candidates: number[] = []
  for (let i = unitLen; i < len; i++) candidates.push(i)
  return shuffleArr(candidates)
    .slice(0, 3)
    .sort((a, b) => a - b)
}

function buildCodeItem(): CdpItem {
  const mode: CdpMode = Math.random() < 0.5 ? 'code' : 'decode'
  const pattern = pickFrom(patternsFor(3))
  const beadKinds = drawUnitKinds(3, distinctLetters(pattern).length)
  const unit = buildUnit(pattern, beadKinds)
  const beads = buildSequence(unit, repsFor(unit.length))
  const symbols = shuffleArr(SYMBOL_KINDS).slice(0, beadKinds.length)
  const symbolMap: Record<BeadKind, BeadKind> = {}
  beadKinds.forEach((k, i) => {
    symbolMap[k] = symbols[i]
  })
  const symbolSeq = beads.map((k) => symbolMap[k])
  const sequence = mode === 'code' ? symbolSeq : beads
  const reference = mode === 'code' ? beads : symbolSeq
  const intruders =
    mode === 'code'
      ? drawIntruders(symbols, 1, [...SYMBOL_KINDS])
      : drawIntruders(beadKinds, 1, [...COLOR_KINDS])
  const palette = shuffleArr([...new Set(sequence), ...intruders])
  const holes = pickCodeHoles(beads.length, unit.length)
  return { tier: 3, mode, unit, sequence, reference, holes, palette, symbolMap }
}

// ------------------------------------------------------------
// Génération — point d'entrée
// ------------------------------------------------------------

/**
 * Génère l'item suivant. `avoid` : signatures déjà jouées dans la partie
 * (jamais bloquant : au pire on accepte une répétition). `level` : cran
 * du Tuner (trous/intrus supplémentaires).
 */
export function generateItem(tier: TierId, avoid: readonly string[] = [], level = 0): CdpItem {
  const avoidSet = new Set(avoid)
  let fallback: CdpItem | null = null
  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    const item = tier === 3 ? buildCodeItem() : buildContinueCandidate(tier, level)
    if (!item) continue
    if (!avoidSet.has(itemSignature(item))) return item
    fallback ??= item
  }
  if (fallback) return fallback
  return tier === 3 ? buildCodeItem() : provenFallback(tier)
}

// ------------------------------------------------------------
// Validation d'un remplissage
// ------------------------------------------------------------

export interface FillCheck {
  ok: boolean
  /** Trous dont la perle posée n'est pas la bonne (ou manquante) */
  wrongHoles: number[]
}

export function isFillComplete(
  item: Pick<CdpItem, 'holes'>,
  fill: Readonly<Record<number, BeadKind>>,
): boolean {
  return item.holes.every((i) => fill[i] !== undefined)
}

export function checkFill(
  item: Pick<CdpItem, 'holes' | 'sequence'>,
  fill: Readonly<Record<number, BeadKind>>,
): FillCheck {
  const wrongHoles = item.holes.filter((i) => fill[i] !== item.sequence[i])
  return { ok: wrongHoles.length === 0, wrongHoles }
}

/** Groupe de période d'une perle (pour l'indice « le motif par groupes »). */
export function periodGroup(index: number, unitLen: number): number {
  return unitLen > 0 ? Math.floor(index / unitLen) : 0
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

export interface CdpProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: CdpProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: CdpProgress, tier: TierId, stars: 1 | 2 | 3): CdpProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
