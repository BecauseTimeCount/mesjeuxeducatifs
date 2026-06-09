// ============================================================
// Robo-Pilote — logique PURE (aucun import React/DOM).
// Génération procédurale de puzzles sur quadrillage : BFS pour
// garantir la solvabilité et calculer le chemin optimal,
// compression des lignes droites en blocs « répéter »,
// simulation pas à pas d'un programme.
// ============================================================

import { randInt, shuffle } from '@/engine/rng'
import type { SkillId } from '@/engine/types'

// ---------- Types ----------

export type Dir = 'up' | 'down' | 'left' | 'right'

export interface Cell {
  x: number
  y: number
}

/** Bloc de programme : déplacement simple ou boucle « répéter ». */
export type Block =
  | { kind: 'move'; dir: Dir }
  | { kind: 'repeat'; dir: Dir; times: number }

export interface Puzzle {
  /** Palier 0..3, ou -1 pour un labyrinthe construit dans l'atelier. */
  tier: number
  size: number
  robot: Cell
  treasure: Cell
  obstacles: Cell[]
  /** Chemin optimal (BFS), redressé pour favoriser les lignes droites. */
  optimalPath: Dir[]
  /** Nombre d'emplacements de programme disponibles. */
  budget: number
}

export interface TierParams {
  grid: number
  /** Bornes INCLUSES du nombre d'obstacles. */
  obstacles: readonly [number, number]
  /** Bornes INCLUSES de la longueur du chemin optimal. */
  pathLen: readonly [number, number]
  skill: SkillId
  /** Palier avec blocs « répéter » et budget serré qui force la boucle. */
  loops: boolean
}

/** Un bloc « répéter » répète sa direction entre 2 et 5 fois. */
export const REPEAT_MIN = 2
export const REPEAT_MAX = 5

/** Longueur minimale du segment rectiligne garanti au palier boucles. */
export const MIN_STRAIGHT_RUN_T3 = 3

export const TIERS: readonly TierParams[] = [
  { grid: 5, obstacles: [0, 1], pathLen: [2, 4], skill: 'lo.gs.directions', loops: false },
  { grid: 5, obstacles: [2, 4], pathLen: [4, 7], skill: 'lo.cp.code.sequence', loops: false },
  { grid: 6, obstacles: [4, 7], pathLen: [6, 10], skill: 'lo.cp.code.sequence', loops: false },
  { grid: 6, obstacles: [3, 6], pathLen: [6, 10], skill: 'lo.cp.code.boucles', loops: true },
]

export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right']

const VECTORS: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

// ---------- Géométrie ----------

export function cellKey(c: Cell): string {
  return `${c.x},${c.y}`
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y
}

export function moveCell(c: Cell, dir: Dir): Cell {
  const v = VECTORS[dir]
  return { x: c.x + v.x, y: c.y + v.y }
}

export function inBounds(c: Cell, size: number): boolean {
  return c.x >= 0 && c.x < size && c.y >= 0 && c.y < size
}

/** Cases visitées en suivant `dirs` depuis `from` (une case par pas, départ exclu). */
export function tracePath(from: Cell, dirs: readonly Dir[]): Cell[] {
  const cells: Cell[] = []
  let cur = from
  for (const dir of dirs) {
    cur = moveCell(cur, dir)
    cells.push(cur)
  }
  return cells
}

// ---------- Compression (blocs « répéter ») ----------

/** Longueurs des suites de pas identiques consécutifs. */
export function runLengths(dirs: readonly Dir[]): number[] {
  const runs: number[] = []
  for (let i = 0; i < dirs.length; ) {
    let len = 1
    while (i + len < dirs.length && dirs[i + len] === dirs[i]) len += 1
    runs.push(len)
    i += len
  }
  return runs
}

export function maxRunLength(dirs: readonly Dir[]): number {
  return runLengths(dirs).reduce((max, len) => Math.max(max, len), 0)
}

/**
 * Nombre d'emplacements nécessaires quand chaque suite de pas identiques
 * est codée au mieux (blocs « répéter » de 5 max, pas isolés en flèches).
 */
export function compressedLength(dirs: readonly Dir[]): number {
  return runLengths(dirs).reduce((acc, len) => acc + Math.ceil(len / REPEAT_MAX), 0)
}

/**
 * Compresse un chemin en blocs : suites ≥ 2 en « répéter » (5 max par bloc),
 * pas isolés en flèches simples. `blocks.length === compressedLength(dirs)`.
 */
export function compressToBlocks(dirs: readonly Dir[]): Block[] {
  const blocks: Block[] = []
  for (let i = 0; i < dirs.length; ) {
    const dir = dirs[i]
    let len = 1
    while (i + len < dirs.length && dirs[i + len] === dir) len += 1
    i += len
    while (len > 0) {
      const chunk = Math.min(len, REPEAT_MAX)
      blocks.push(chunk === 1 ? { kind: 'move', dir } : { kind: 'repeat', dir, times: chunk })
      len -= chunk
    }
  }
  return blocks
}

/** Déroule un programme en pas élémentaires. */
export function expandProgram(blocks: readonly Block[]): Dir[] {
  const dirs: Dir[] = []
  for (const b of blocks) {
    const n = b.kind === 'repeat' ? b.times : 1
    for (let i = 0; i < n; i++) dirs.push(b.dir)
  }
  return dirs
}

// ---------- Simulation ----------

export type Outcome = 'treasure' | 'rock' | 'wall' | 'short'

export interface SimStep {
  dir: Dir
  /** Case visée (obstacle ou hors grille si ok = false). */
  to: Cell
  ok: boolean
}

export interface SimResult {
  steps: SimStep[]
  outcome: Outcome
  /** Position finale du robot (avant le pas raté éventuel). */
  end: Cell
  /** Case percutée : obstacle (outcome 'rock') ou case hors grille ('wall'). */
  failCell?: Cell
}

/**
 * Exécute un programme pas à pas. S'arrête au premier pas bloqué
 * (obstacle ou bord) ou dès que le trésor est atteint — les blocs
 * restants sont alors ignorés (gentil pour les 5 ans).
 */
export function simulate(puzzle: Puzzle, program: readonly Block[]): SimResult {
  const blocked = new Set(puzzle.obstacles.map(cellKey))
  const steps: SimStep[] = []
  let cur = puzzle.robot
  for (const dir of expandProgram(program)) {
    const to = moveCell(cur, dir)
    if (!inBounds(to, puzzle.size)) {
      steps.push({ dir, to, ok: false })
      return { steps, outcome: 'wall', end: cur, failCell: to }
    }
    if (blocked.has(cellKey(to))) {
      steps.push({ dir, to, ok: false })
      return { steps, outcome: 'rock', end: cur, failCell: to }
    }
    cur = to
    steps.push({ dir, to, ok: true })
    if (sameCell(cur, puzzle.treasure)) {
      return { steps, outcome: 'treasure', end: cur }
    }
  }
  return { steps, outcome: 'short', end: cur }
}

// ---------- BFS ----------

function bfsDistances(size: number, blocked: ReadonlySet<string>, from: Cell): Map<string, number> {
  const dist = new Map<string, number>()
  dist.set(cellKey(from), 0)
  const queue: Cell[] = [from]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    const d = dist.get(cellKey(cur)) ?? 0
    for (const dir of DIRS) {
      const n = moveCell(cur, dir)
      const k = cellKey(n)
      if (!inBounds(n, size) || blocked.has(k) || dist.has(k)) continue
      dist.set(k, d + 1)
      queue.push(n)
    }
  }
  return dist
}

/**
 * Reconstruit un chemin optimal en remontant le gradient de distances
 * depuis `target`, en privilégiant les lignes droites (le pas précédent
 * est réessayé en premier) — utile pour les blocs « répéter ».
 */
function straightenedPath(
  size: number,
  blocked: ReadonlySet<string>,
  dist: ReadonlyMap<string, number>,
  target: Cell,
): Dir[] {
  let d = dist.get(cellKey(target))
  if (d === undefined) return []
  const back: Dir[] = []
  let cur = target
  let last: Dir | null = null
  while (d > 0) {
    const order: Dir[] = last !== null ? [last, ...DIRS.filter((x) => x !== last)] : [...DIRS]
    let chosen: Dir | null = null
    for (const dir of order) {
      const n = moveCell(cur, dir)
      if (!inBounds(n, size) || blocked.has(cellKey(n))) continue
      if (dist.get(cellKey(n)) === d - 1) {
        chosen = dir
        break
      }
    }
    if (chosen === null) return [] // théoriquement impossible (gradient BFS)
    back.push(chosen)
    cur = moveCell(cur, chosen)
    last = chosen
    d -= 1
  }
  return back.reverse().map((dir) => OPPOSITE[dir])
}

// ---------- Génération procédurale ----------

const MAX_ATTEMPTS = 400

function allCells(size: number): Cell[] {
  const cells: Cell[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) cells.push({ x, y })
  }
  return cells
}

function budgetFor(params: TierParams, path: readonly Dir[]): number {
  if (!params.loops) return path.length + 2
  // Palier boucles : budget STRICTEMENT inférieur au chemin à plat, mais
  // toujours suffisant en codant les lignes droites en « répéter ».
  // Le segment rectiligne ≥ 3 garantit compressedLength ≤ longueur - 2.
  return Math.min(path.length - 1, compressedLength(path) + 1)
}

function tryGenerate(tier: number, params: TierParams, targetLen?: number): Puzzle | null {
  const size = params.grid
  const nObstacles = randInt(params.obstacles[0], params.obstacles[1])
  const cells = shuffle(allCells(size))
  const obstacles = cells.slice(0, nObstacles)
  const free = cells.slice(nObstacles)
  const robot = free[0]
  const blocked = new Set(obstacles.map(cellKey))
  const dist = bfsDistances(size, blocked, robot)
  const [minLen, maxLen] = params.pathLen

  const candidates: { treasure: Cell; path: Dir[] }[] = []
  for (const c of free.slice(1)) {
    const d = dist.get(cellKey(c))
    if (d === undefined || d < minLen || d > maxLen) continue
    const path = straightenedPath(size, blocked, dist, c)
    if (path.length !== d) continue
    if (params.loops && maxRunLength(path) < MIN_STRAIGHT_RUN_T3) continue
    candidates.push({ treasure: c, path })
  }
  if (candidates.length === 0) return null

  // Si une longueur cible est demandée (montée en difficulté au fil de la
  // partie), on garde les candidats les plus proches de la cible.
  let pool = candidates
  if (targetLen !== undefined) {
    let best = Infinity
    for (const c of candidates) best = Math.min(best, Math.abs(c.path.length - targetLen))
    pool = candidates.filter((c) => Math.abs(c.path.length - targetLen) === best)
  }
  const choice = pool[randInt(0, pool.length - 1)]
  return {
    tier,
    size,
    robot,
    treasure: choice.treasure,
    obstacles,
    optimalPath: choice.path,
    budget: budgetFor(params, choice.path),
  }
}

/** Filet de sécurité déterministe (quasi inatteignable) : couloir simple. */
function fallbackPuzzle(tier: number, params: TierParams): Puzzle {
  const size = params.grid
  const y = Math.floor(size / 2)
  const len = params.pathLen[0]
  const rights = Math.min(size - 1, len)
  const downs = len - rights
  const path: Dir[] = [
    ...Array.from({ length: rights }, (): Dir => 'right'),
    ...Array.from({ length: downs }, (): Dir => 'down'),
  ]
  return {
    tier,
    size,
    robot: { x: 0, y },
    treasure: { x: rights, y: y + downs },
    // Rangée du haut, jamais sur le chemin (qui vit sur la ligne y ≥ 2).
    obstacles: Array.from({ length: params.obstacles[0] }, (_, i) => ({ x: i, y: 0 })),
    optimalPath: path,
    budget: budgetFor(params, path),
  }
}

/**
 * Génère un puzzle RÉSOLUBLE pour le palier demandé : obstacles posés au
 * hasard, robot sur une case libre, trésor choisi par BFS parmi les cases
 * à la bonne distance (donc un chemin existe toujours). `targetLen` oriente
 * la longueur du chemin à l'intérieur des bornes du palier.
 */
export function generatePuzzle(tier: number, targetLen?: number): Puzzle {
  const t = Math.max(0, Math.min(TIERS.length - 1, Math.floor(tier)))
  const params = TIERS[t]
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const p = tryGenerate(t, params, targetLen)
    if (p !== null) return p
  }
  return fallbackPuzzle(t, params)
}

// ---------- Atelier (« Construis ton labyrinthe ») ----------

/**
 * Chemin optimal robot → trésor sur une grille construite à la main.
 * Renvoie [] si le trésor est inatteignable (ou configuration invalide).
 */
export function solvePath(
  size: number,
  obstacles: readonly Cell[],
  robot: Cell,
  treasure: Cell,
): Dir[] {
  if (sameCell(robot, treasure)) return []
  if (!inBounds(robot, size) || !inBounds(treasure, size)) return []
  const blocked = new Set(obstacles.map(cellKey))
  if (blocked.has(cellKey(robot)) || blocked.has(cellKey(treasure))) return []
  const dist = bfsDistances(size, blocked, robot)
  return straightenedPath(size, blocked, dist, treasure)
}

/** Budget généreux pour un labyrinthe de l'atelier (toujours résoluble). */
export function customBudget(path: readonly Dir[]): number {
  return Math.max(compressedLength(path) + 2, Math.min(path.length + 2, 12))
}

/** Construit le puzzle de l'atelier, ou null si le labyrinthe est insoluble. */
export function makeCustomPuzzle(
  robot: Cell,
  treasure: Cell,
  obstacles: readonly Cell[],
  size: number,
): Puzzle | null {
  const path = solvePath(size, obstacles, robot, treasure)
  if (path.length === 0) return null
  return {
    tier: -1,
    size,
    robot,
    treasure,
    obstacles: [...obstacles],
    optimalPath: path,
    budget: customBudget(path),
  }
}
