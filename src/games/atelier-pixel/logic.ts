// ============================================================
// L'Atelier Pixel — logique PURE.
// Génération procédurale de grilles (motifs figuratifs paramétrés,
// motifs symétriques aléatoires), puzzles miroir, dictées de
// coordonnées, validation cellule à cellule, score, galerie.
// Aucun import React / engine / DOM. Prouvé par logic.test.ts.
// ============================================================

export type ModeId = 'copie' | 'miroir' | 'memoire' | 'dictee' | 'libre'

/** 0 = case vide, 1..n = index (1-based) dans COLORS. */
export type Cell = number

/** Source d'aléa injectable (tests) — défaut Math.random. */
export type Rng = () => number

// ------------------------------------------------------------
// Palette
// ------------------------------------------------------------

export interface PaletteColor {
  /** id stable utilisé dans les clips audio : apx.couleur.<id> */
  id: string
  /** Libellé français (affiché aux parents / aria) */
  name: string
  hex: string
}

export const COLORS: readonly PaletteColor[] = [
  { id: 'rouge', name: 'rouge', hex: '#e53935' },
  { id: 'bleu', name: 'bleu', hex: '#1e88e5' },
  { id: 'vert', name: 'vert', hex: '#43a047' },
  { id: 'jaune', name: 'jaune', hex: '#fdd835' },
  { id: 'orange', name: 'orange', hex: '#fb8c00' },
  { id: 'violet', name: 'violet', hex: '#8e24aa' },
  { id: 'rose', name: 'rose', hex: '#ec407a' },
  { id: 'noir', name: 'noir', hex: '#37474f' },
] as const

/** Id du clip audio d'une couleur (valeur de case 1-based). */
export function colorClipId(value: Cell): string {
  const color = COLORS[value - 1]
  if (!color) throw new Error(`colorClipId: valeur de case invalide ${value}`)
  return `apx.couleur.${color.id}`
}

// ------------------------------------------------------------
// Modes, compétences, constantes de partie
// ------------------------------------------------------------

export type ObjectiveMode = Exclude<ModeId, 'libre'>

export const MODE_SKILLS: Readonly<Record<ObjectiveMode, string>> = {
  copie: 'lo.gs.quadrillage',
  miroir: 'lo.cp.symetrie',
  memoire: 'lo.gs.quadrillage',
  dictee: 'lo.cp.coordonnees',
}

export const GRIDS_PER_RUN = 6
export const DICTEE_GRIDS_PER_RUN = 3
export const DICTEE_CALLS_PER_GRID = 8
export const DICTEE_SIZE = 6
export const FREE_SIZE = 10
export const FREE_COLORS = 8
export const MAX_GALLERY = 12
/** Le Tuner a 3 crans : 0 = facile, 2 = costaud. */
export const MAX_TUNER_LEVEL = 2

/** Nombre de grilles d'une partie selon le mode. */
export function gridsFor(mode: ObjectiveMode): number {
  return mode === 'dictee' ? DICTEE_GRIDS_PER_RUN : GRIDS_PER_RUN
}

/** Taille de grille (copie / mémoire) selon le niveau du Tuner. */
export function gridSizeFor(level: number): number {
  const sizes = [5, 6, 8] as const
  return sizes[clampLevel(level)] ?? 5
}

/** Taille de grille du mode miroir : toujours paire (axe entre deux colonnes). */
export function mirrorSizeFor(level: number): number {
  const sizes = [6, 6, 8] as const
  return sizes[clampLevel(level)] ?? 6
}

/** Nombre de couleurs de la palette selon le niveau du Tuner. */
export function colorCountFor(level: number): number {
  const counts = [2, 3, 4] as const
  return counts[clampLevel(level)] ?? 2
}

export type Axis = 'vertical' | 'horizontal' | 'both'

/** Axe de symétrie du mode miroir selon le niveau du Tuner. */
export function axisForLevel(level: number): Axis {
  const axes = ['vertical', 'horizontal', 'both'] as const
  return axes[clampLevel(level)] ?? 'vertical'
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

// ------------------------------------------------------------
// Aléa local (zéro import engine — la logique reste 100 % pure)
// ------------------------------------------------------------

function randIntWith(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function pickWith<T>(rng: Rng, arr: readonly T[]): T {
  const v = arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]
  if (v === undefined) throw new Error('pickWith: tableau vide')
  return v
}

function shuffleWith<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

// ------------------------------------------------------------
// Formes figuratives paramétrées (cœur, flèche, maison)
// Chaque générateur rend des points (ligne, colonne) relatifs,
// normalisés à partir de (0, 0) — JAMAIS un bitmap figé.
// ------------------------------------------------------------

export type Pt = readonly [row: number, col: number]

/**
 * Cœur en pixels de largeur impaire w (≥ 5) : deux bosses, une ligne
 * pleine, puis un cône qui s'affine jusqu'à la pointe.
 * Hauteur = (w − 1) / 2 + 2.
 */
export function heartCells(w: number): Pt[] {
  if (w < 5 || w % 2 === 0) throw new Error(`heartCells: largeur invalide ${w}`)
  const half = (w - 1) / 2
  const out: Pt[] = []
  // Bosses : toute la première ligne sauf les coins et le creux central
  for (let c = 1; c < w - 1; c++) {
    if (c !== half) out.push([0, c])
  }
  // Ligne pleine
  for (let c = 0; c < w; c++) out.push([1, c])
  // Cône : à chaque ligne, une case de moins de chaque côté
  for (let t = 1; t <= half; t++) {
    for (let c = t; c <= w - 1 - t; c++) out.push([1 + t, c])
  }
  return out
}

export type ArrowDir = 'up' | 'down' | 'left' | 'right'

/**
 * Flèche : pointe triangulaire de hauteur `head` + tige de longueur `len`.
 * Construite vers le haut puis tournée. Largeur de base = 2·head − 1.
 */
export function arrowCells(len: number, head: number, dir: ArrowDir): Pt[] {
  if (len < 1 || head < 2) throw new Error(`arrowCells: paramètres invalides ${len}/${head}`)
  const mid = head - 1
  const up: Pt[] = []
  for (let t = 0; t < head; t++) {
    for (let c = mid - t; c <= mid + t; c++) up.push([t, c])
  }
  for (let r = head; r < head + len; r++) up.push([r, mid])
  const height = head + len
  if (dir === 'up') return up
  if (dir === 'down') return up.map(([r, c]) => [height - 1 - r, c] as const)
  if (dir === 'left') return up.map(([r, c]) => [c, r] as const)
  return up.map(([r, c]) => [c, height - 1 - r] as const) // right
}

export interface HouseParts {
  roof: Pt[]
  body: Pt[]
  door: Pt[]
}

/**
 * Maison : toit triangulaire (hauteur (w−1)/2 + 1), corps rectangulaire
 * de hauteur bodyH, porte centrée d'une ou deux cases.
 */
export function houseCells(w: number, bodyH: number): HouseParts {
  if (w < 3 || w % 2 === 0 || bodyH < 2) {
    throw new Error(`houseCells: paramètres invalides ${w}/${bodyH}`)
  }
  const half = (w - 1) / 2
  const roof: Pt[] = []
  for (let t = 0; t <= half; t++) {
    for (let c = half - t; c <= half + t; c++) roof.push([t, c])
  }
  const body: Pt[] = []
  const top = half + 1
  for (let r = top; r < top + bodyH; r++) {
    for (let c = 0; c < w; c++) body.push([r, c])
  }
  const doorH = Math.min(2, bodyH)
  const door: Pt[] = []
  for (let r = top + bodyH - doorH; r < top + bodyH; r++) door.push([r, half])
  return { roof, body, door }
}

/** Encombrement (hauteur, largeur) d'un nuage de points relatifs. */
export function shapeBounds(cells: readonly Pt[]): { rows: number; cols: number } {
  let rows = 0
  let cols = 0
  for (const [r, c] of cells) {
    rows = Math.max(rows, r + 1)
    cols = Math.max(cols, c + 1)
  }
  return { rows, cols }
}

// ------------------------------------------------------------
// Modèles (grilles cibles)
// ------------------------------------------------------------

export interface Model {
  rows: number
  cols: number
  cells: Cell[]
}

export function emptyCells(rows: number, cols: number): Cell[] {
  return new Array<Cell>(rows * cols).fill(0)
}

export function paintedCount(cells: readonly Cell[]): number {
  return cells.reduce<number>((n, v) => (v !== 0 ? n + 1 : n), 0)
}

function blankModel(size: number): Model {
  return { rows: size, cols: size, cells: emptyCells(size, size) }
}

function stamp(model: Model, pts: readonly Pt[], dr: number, dc: number, color: Cell): void {
  for (const [r, c] of pts) {
    const rr = r + dr
    const cc = c + dc
    if (rr >= 0 && rr < model.rows && cc >= 0 && cc < model.cols) {
      model.cells[rr * model.cols + cc] = color
    }
  }
}

export type FigKind = 'coeur' | 'fleche' | 'maison'

/**
 * Modèle figuratif : forme paramétrée (taille, direction, hauteur…),
 * couleurs tirées dans la palette, position aléatoire dans la grille.
 */
export function generateFigurativeModel(
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
  kind?: FigKind,
): Model {
  const model = blankModel(size)
  const palette = shuffleWith(
    rng,
    Array.from({ length: Math.max(1, Math.min(colorCount, COLORS.length)) }, (_, i) => i + 1),
  )
  const c1 = palette[0] ?? 1
  const c2 = palette[1] ?? c1
  const c3 = palette[2] ?? c1
  const chosen: FigKind = kind ?? pickWith(rng, ['coeur', 'fleche', 'maison'] as const)

  if (chosen === 'coeur') {
    // Largeurs impaires dont la hauteur ((w−1)/2 + 2) tient dans la grille
    const widths = [5, 7].filter((w) => w <= size && (w - 1) / 2 + 2 <= size)
    const w = widths.length > 0 ? pickWith(rng, widths) : 5
    const pts = heartCells(w)
    const { rows, cols } = shapeBounds(pts)
    stamp(model, pts, randIntWith(rng, 0, size - rows), randIntWith(rng, 0, size - cols), c1)
    return model
  }

  if (chosen === 'fleche') {
    const head = size >= 7 ? pickWith(rng, [2, 3] as const) : 2
    const len = randIntWith(rng, 2, Math.max(2, size - head))
    const dir = pickWith(rng, ['up', 'down', 'left', 'right'] as const)
    const pts = arrowCells(len, head, dir)
    const { rows, cols } = shapeBounds(pts)
    stamp(model, pts, randIntWith(rng, 0, size - rows), randIntWith(rng, 0, size - cols), c1)
    return model
  }

  // Maison : toit et porte d'une autre couleur si la palette le permet
  const widths = [3, 5].filter((w) => w <= size && (w - 1) / 2 + 1 + 2 <= size)
  const w = widths.length > 0 ? pickWith(rng, widths) : 3
  const roofH = (w - 1) / 2 + 1
  const bodyH = randIntWith(rng, 2, Math.max(2, size - roofH))
  const parts = houseCells(w, bodyH)
  const all = [...parts.roof, ...parts.body, ...parts.door]
  const { rows, cols } = shapeBounds(all)
  const dr = randIntWith(rng, 0, size - rows)
  const dc = randIntWith(rng, 0, size - cols)
  stamp(model, parts.body, dr, dc, c1)
  stamp(model, parts.roof, dr, dc, c2)
  stamp(model, parts.door, dr, dc, c3)
  return model
}

/**
 * Modèle symétrique aléatoire : on peint k cases de la moitié gauche
 * puis on les reflète sur la moitié droite — toujours joli, jamais figé.
 */
export function generateSymmetricModel(
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): Model {
  const model = blankModel(size)
  const halfCols = Math.ceil(size / 2)
  const halfIndices: number[] = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < halfCols; c++) halfIndices.push(r * size + c)
  }
  const min = Math.max(4, Math.floor(halfIndices.length * 0.25))
  const max = Math.max(min, Math.floor(halfIndices.length * 0.55))
  const k = randIntWith(rng, min, max)
  const chosen = shuffleWith(rng, halfIndices).slice(0, k)
  for (const i of chosen) {
    const color = randIntWith(rng, 1, Math.max(1, Math.min(colorCount, COLORS.length)))
    const r = Math.floor(i / size)
    const c = i % size
    model.cells[i] = color
    model.cells[r * size + (size - 1 - c)] = color
  }
  return model
}

/** Une grille cible doit avoir de la matière sans être un mur plein. */
export function isUsableModel(model: Model): boolean {
  const n = paintedCount(model.cells)
  return n >= 4 && n < model.rows * model.cols
}

/**
 * Modèle du mode copie / mémoire : symétrique ou figuratif, au hasard.
 * Garantie : toujours utilisable (≥ 4 cases peintes, jamais plein).
 */
export function generateCopyModel(
  size: number,
  colorCount: number,
  rng: Rng = Math.random,
): Model {
  for (let attempt = 0; attempt < 20; attempt++) {
    const model =
      rng() < 0.5
        ? generateSymmetricModel(size, colorCount, rng)
        : generateFigurativeModel(size, colorCount, rng)
    if (isUsableModel(model)) return model
  }
  // Filet de sécurité déterministe : un cœur centré est toujours utilisable
  return generateFigurativeModel(size, colorCount, rng, 'coeur')
}

// ------------------------------------------------------------
// Reflets (indices linéaires, grille rows × cols)
// ------------------------------------------------------------

export function reflectV(index: number, cols: number): number {
  const r = Math.floor(index / cols)
  const c = index % cols
  return r * cols + (cols - 1 - c)
}

export function reflectH(index: number, rows: number, cols: number): number {
  const r = Math.floor(index / cols)
  const c = index % cols
  return (rows - 1 - r) * cols + c
}

// ------------------------------------------------------------
// Puzzle unifié des modes copie / miroir / mémoire
// ------------------------------------------------------------

export interface Puzzle {
  rows: number
  cols: number
  /** Grille cible complète. */
  target: Cell[]
  /** Cases pré-peintes données à l'enfant. */
  start: Cell[]
  /** Cases verrouillées (la moitié source du miroir) — non modifiables. */
  locked: boolean[]
  /** Nombre de couleurs de la palette proposée. */
  colorCount: number
  /** Axe de symétrie (mode miroir uniquement). */
  axis?: Axis
}

export function copyPuzzle(model: Model, colorCount: number): Puzzle {
  return {
    rows: model.rows,
    cols: model.cols,
    target: [...model.cells],
    start: emptyCells(model.rows, model.cols),
    locked: new Array<boolean>(model.rows * model.cols).fill(false),
    colorCount,
  }
}

/** La case appartient-elle à la région source (donnée) d'un axe ? */
export function inSourceRegion(index: number, size: number, axis: Axis): boolean {
  const r = Math.floor(index / size)
  const c = index % size
  const half = size / 2
  if (axis === 'vertical') return c < half
  if (axis === 'horizontal') return r < half
  return r < half && c < half
}

/**
 * Puzzle miroir : on peint la région source, la cible est son reflet
 * (vertical, horizontal, ou mandala 4 quadrants). La région source
 * entière est verrouillée — l'enfant ne complète QUE le reflet.
 */
export function generateMirrorPuzzle(
  size: number,
  colorCount: number,
  axis: Axis,
  rng: Rng = Math.random,
): Puzzle {
  if (size % 2 !== 0) throw new Error(`generateMirrorPuzzle: taille impaire ${size}`)
  const total = size * size
  const sourceIndices: number[] = []
  for (let i = 0; i < total; i++) {
    if (inSourceRegion(i, size, axis)) sourceIndices.push(i)
  }
  const min = Math.max(3, Math.floor(sourceIndices.length * 0.3))
  const max = Math.max(min, Math.floor(sourceIndices.length * 0.6))
  const k = randIntWith(rng, min, max)
  const chosen = shuffleWith(rng, sourceIndices).slice(0, k)

  const target = emptyCells(size, size)
  for (const i of chosen) {
    const color = randIntWith(rng, 1, Math.max(1, Math.min(colorCount, COLORS.length)))
    target[i] = color
    if (axis === 'vertical' || axis === 'both') target[reflectV(i, size)] = color
    if (axis === 'horizontal' || axis === 'both') target[reflectH(i, size, size)] = color
    if (axis === 'both') target[reflectH(reflectV(i, size), size, size)] = color
  }

  const locked = Array.from({ length: total }, (_, i) => inSourceRegion(i, size, axis))
  const start = target.map((v, i) => ((locked[i] ?? false) ? v : 0))
  return { rows: size, cols: size, target, start, locked, colorCount, axis }
}

// ------------------------------------------------------------
// Validation cellule à cellule (l'erreur enseigne)
// ------------------------------------------------------------

export interface Verdict {
  ok: boolean
  /** Cases peintes de la mauvaise couleur (ou en trop) — elles pulsent. */
  wrong: number[]
  /** Cases attendues encore vides — elles clignotent en pointillés. */
  missing: number[]
}

export function checkGrid(
  painted: readonly Cell[],
  target: readonly Cell[],
  locked?: readonly boolean[],
): Verdict {
  const wrong: number[] = []
  const missing: number[] = []
  for (let i = 0; i < target.length; i++) {
    if (locked?.[i]) continue
    const p = painted[i] ?? 0
    const t = target[i] ?? 0
    if (p !== 0 && p !== t) wrong.push(i)
    else if (p === 0 && t !== 0) missing.push(i)
  }
  return { ok: wrong.length === 0 && missing.length === 0, wrong, missing }
}

/** Case corrigée en exemple après 2 échecs (une fautive d'abord, sinon une manquante). */
export function hintCell(verdict: Verdict): number | null {
  return verdict.wrong[0] ?? verdict.missing[0] ?? null
}

// ------------------------------------------------------------
// Dictée de coordonnées (A-F × 1-6)
// ------------------------------------------------------------

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

/** Étiquette d'une case : colonne = lettre (A…), ligne = nombre (1…). */
export function coordLabel(row: number, col: number): string {
  const letter = LETTERS[col]
  if (!letter || row < 0 || row >= DICTEE_SIZE) {
    throw new Error(`coordLabel: case hors grille ${row}/${col}`)
  }
  return `${letter.toUpperCase()}${row + 1}`
}

/** Id du clip audio de la lettre d'une colonne. */
export function letterClipId(col: number): string {
  const letter = LETTERS[col]
  if (!letter) throw new Error(`letterClipId: colonne hors grille ${col}`)
  return `apx.lettre.${letter}`
}

export interface DicteeCall {
  index: number
  row: number
  col: number
  color: Cell
}

export interface DicteePuzzle {
  rows: number
  cols: number
  /** La fresque surprise complète (révélée à la fin). */
  target: Cell[]
  /** Les cases dictées, toutes peintes dans la fresque. */
  calls: DicteeCall[]
  colorCount: number
}

/**
 * Dictée : un dessin surprise est généré, puis 8 de ses cases peintes
 * sont dictées. À la fin, la fresque entière se révèle.
 */
export function generateDictee(colorCount: number, rng: Rng = Math.random): DicteePuzzle {
  let model: Model | null = null
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateFigurativeModel(DICTEE_SIZE, colorCount, rng)
    if (paintedCount(candidate.cells) >= DICTEE_CALLS_PER_GRID) {
      model = candidate
      break
    }
  }
  if (!model) model = generateFigurativeModel(DICTEE_SIZE, colorCount, rng, 'coeur')

  const paintedIndices: number[] = []
  for (let i = 0; i < model.cells.length; i++) {
    if ((model.cells[i] ?? 0) !== 0) paintedIndices.push(i)
  }
  const calls = shuffleWith(rng, paintedIndices)
    .slice(0, DICTEE_CALLS_PER_GRID)
    .map((index) => ({
      index,
      row: Math.floor(index / DICTEE_SIZE),
      col: index % DICTEE_SIZE,
      color: model.cells[index] ?? 1,
    }))
  return { rows: DICTEE_SIZE, cols: DICTEE_SIZE, target: [...model.cells], calls, colorCount }
}

// ------------------------------------------------------------
// Peindre une case (interaction commune)
// ------------------------------------------------------------

/**
 * Tap sur une case : si elle porte déjà la couleur choisie, on l'efface ;
 * sinon on la peint. Les cases verrouillées sont intouchables.
 */
export function paintCell(
  cells: readonly Cell[],
  index: number,
  color: Cell,
  locked?: readonly boolean[],
): Cell[] {
  if (index < 0 || index >= cells.length || locked?.[index]) return [...cells]
  const out = [...cells]
  out[index] = cells[index] === color ? 0 : color
  return out
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

export interface ApxProgress {
  bestStars: Partial<Record<ObjectiveMode, 1 | 2 | 3>>
  runs: number
}

export const FRESH_PROGRESS: ApxProgress = { bestStars: {}, runs: 0 }

/** Applique le résultat d'une partie : meilleur score par mode, jamais de régression. */
export function applyRun(p: ApxProgress, mode: ObjectiveMode, stars: 1 | 2 | 3): ApxProgress {
  const best = Math.max(p.bestStars[mode] ?? 0, stars) as 1 | 2 | 3
  return { bestStars: { ...p.bestStars, [mode]: best }, runs: p.runs + 1 }
}

// ------------------------------------------------------------
// Galerie du mode libre
// ------------------------------------------------------------

export interface SavedArt {
  rows: number
  cols: number
  cells: Cell[]
  ts: number
}

/** Ajoute une œuvre en tête de galerie, plafond MAX_GALLERY (les plus anciennes sortent). */
export function addToGallery(gallery: readonly SavedArt[], art: SavedArt): SavedArt[] {
  return [art, ...gallery].slice(0, MAX_GALLERY)
}
