// ============================================================
// L'École de Plume — logique PURE (aucun import React/DOM).
// Plan d'école sur grille 5×5. Trois mécaniques de PRODUCTION
// (zéro QCM) :
//  • « trouver » (T0) : l'enfant localise et tape la salle nommée.
//  • « voisin »  (T1) : l'enfant tape la case voisine de Plume dans
//    la direction demandée (gauche/droite/au-dessus/en-dessous).
//  • « guider »  (T2/T3) : l'enfant compose un itinéraire de flèches ;
//    Plume avance d'une case par flèche dans les couloirs jusqu'à la
//    salle cible.
//
// Le plan est fixe et cohérent : 8 salles reliées par un réseau de
// couloirs connexe (prouvé par logic.test.ts via BFS). Toute partie
// « guider » est TOUJOURS résoluble : un chemin praticable existe.
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// Géométrie de la grille
// ------------------------------------------------------------

export const GRID = 5
export const CELL_COUNT = GRID * GRID

export type Dir = 'up' | 'down' | 'left' | 'right'
export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right']

const DELTA: Readonly<Record<Dir, { dx: number; dy: number }>> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

export function rowOf(idx: number): number {
  return Math.floor(idx / GRID)
}
export function colOf(idx: number): number {
  return idx % GRID
}

/** Case voisine dans une direction, ou null si hors grille. */
export function neighbor(idx: number, dir: Dir): number | null {
  const x = colOf(idx) + DELTA[dir].dx
  const y = rowOf(idx) + DELTA[dir].dy
  if (x < 0 || x >= GRID || y < 0 || y >= GRID) return null
  return y * GRID + x
}

// ------------------------------------------------------------
// Le plan de l'école — 8 salles, couloirs connexes, murs.
//   ligne 0 : Entrée  · couloir · Classe  · couloir · Biblio
//   ligne 1 :  mur    · couloir ·  mur    · couloir ·  mur
//   ligne 2 : Cantine · couloir · couloir · couloir · Sport
//   ligne 3 :  mur    · couloir ·  mur    · couloir ·  mur
//   ligne 4 :  Cour   · couloir · Musique · couloir · Arts
// Tout couloir est praticable ; toute salle borde au moins un couloir.
// ------------------------------------------------------------

export type CellKind = 'wall' | 'corridor' | 'room'

export interface Room {
  id: string
  name: string
  emoji: string
}

export interface Cell {
  idx: number
  kind: CellKind
  /** roomId présent si et seulement si kind === 'room'. */
  roomId?: string
}

export const ROOMS: readonly Room[] = [
  { id: 'entree', name: 'Entrée', emoji: '🚪' },
  { id: 'classe', name: 'Classe', emoji: '🔤' },
  { id: 'biblio', name: 'Bibliothèque', emoji: '📚' },
  { id: 'cantine', name: 'Cantine', emoji: '🍽️' },
  { id: 'sport', name: 'Salle de sport', emoji: '🤸' },
  { id: 'cour', name: 'Cour', emoji: '🌳' },
  { id: 'musique', name: 'Salle de musique', emoji: '🎵' },
  { id: 'arts', name: 'Salle des arts', emoji: '🎨' },
]

export const ROOMS_BY_ID: ReadonlyMap<string, Room> = new Map(ROOMS.map((r) => [r.id, r]))

/** roomId à chaque case du plan (sinon 'mur' ou '' pour couloir). */
const PLAN_LAYOUT: readonly string[] = [
  // ligne 0
  'entree', '', 'classe', '', 'biblio',
  // ligne 1
  '#', '', '#', '', '#',
  // ligne 2
  'cantine', '', '', '', 'sport',
  // ligne 3
  '#', '', '#', '', '#',
  // ligne 4
  'cour', '', 'musique', '', 'arts',
]

function buildPlan(): readonly Cell[] {
  return PLAN_LAYOUT.map((token, idx): Cell => {
    if (token === '#') return { idx, kind: 'wall' }
    if (token === '') return { idx, kind: 'corridor' }
    return { idx, kind: 'room', roomId: token }
  })
}

export const PLAN: readonly Cell[] = buildPlan()

export const ROOM_INDEX: ReadonlyMap<string, number> = new Map(
  PLAN.flatMap((c) => (c.kind === 'room' && c.roomId ? [[c.roomId, c.idx] as [string, number]] : [])),
)

/** Case praticable : couloir ou salle (jamais un mur). */
export function walkable(idx: number): boolean {
  const c = PLAN[idx]
  return c !== undefined && c.kind !== 'wall'
}

export function roomIdAt(idx: number): string | null {
  const c = PLAN[idx]
  return c?.kind === 'room' ? (c.roomId ?? null) : null
}

// ------------------------------------------------------------
// Déplacement & BFS
// ------------------------------------------------------------

/** Avance d'une case si la cible est praticable, sinon reste sur place (mur/bord). */
export function step(idx: number, dir: Dir): number {
  const n = neighbor(idx, dir)
  if (n === null || !walkable(n)) return idx
  return n
}

export function reached(idx: number, targetIdx: number): boolean {
  return idx === targetIdx
}

/** Plus court chemin praticable entre deux cases (BFS), [] si impossible. */
export function shortestPath(fromIdx: number, toIdx: number): number[] {
  if (fromIdx === toIdx) return []
  const prev = new Map<number, number>()
  const seen = new Set<number>([fromIdx])
  const queue: number[] = [fromIdx]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    for (const dir of DIRS) {
      const n = neighbor(cur, dir)
      if (n === null || !walkable(n) || seen.has(n)) continue
      seen.add(n)
      prev.set(n, cur)
      if (n === toIdx) {
        const path: number[] = []
        let c = toIdx
        while (c !== fromIdx) {
          path.push(c)
          const p = prev.get(c)
          if (p === undefined) return []
          c = p
        }
        return path.reverse()
      }
      queue.push(n)
    }
  }
  return []
}

/** Direction du premier pas du plus court chemin vers la cible (indice), ou null. */
export function nextHint(idx: number, targetIdx: number): Dir | null {
  if (idx === targetIdx) return null
  const path = shortestPath(idx, targetIdx)
  if (path.length === 0) return null
  const next = path[0]
  for (const dir of DIRS) {
    if (neighbor(idx, dir) === next) return dir
  }
  return null
}

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Tuner à 2 crans : 0 = base, 1 = élargi (chemin plus long en mode guider). */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'mo.gs.espace.reperer',
  'mo.gs.espace.reperer',
  'mo.cp.espace.itineraire',
  'mo.cp.espace.itineraire',
] as const

export type Mode = 'find' | 'adjacent' | 'guide'

/** Mode de jeu d'un palier : T0 trouver, T1 voisin, T2/T3 guider. */
export function modeForTier(tier: TierId): Mode {
  if (tier === 0) return 'find'
  if (tier === 1) return 'adjacent'
  return 'guide'
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface FindItem {
  mode: 'find'
  tier: TierId
  roomId: string
  /** Index de la case-salle à taper. */
  answerIdx: number
}

export interface AdjacentItem {
  mode: 'adjacent'
  tier: TierId
  /** Case où Plume est posée. */
  plumeIdx: number
  dir: Dir
  /** Case voisine attendue (toujours dans la grille). */
  answerIdx: number
}

export interface GuideItem {
  mode: 'guide'
  tier: TierId
  /** Départ de Plume (couloir ou salle). */
  startIdx: number
  /** Salle cible. */
  targetIdx: number
  /** Chemin praticable garanti (BFS), longueur ≥ 1. */
  path: number[]
}

export type PlumeItem = FindItem | AdjacentItem | GuideItem

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

/** Indices des salles, en évitant `avoid` quand une alternative existe. */
function pickRoomIdx(avoid?: number): number {
  const all = ROOMS.map((r) => ROOM_INDEX.get(r.id)).filter((i): i is number => i !== undefined)
  const filtered = avoid === undefined ? all : all.filter((i) => i !== avoid)
  return pick(filtered.length > 0 ? filtered : all)
}

// ---------- T0 : trouver la salle ----------

export function generateFind(_level: number, avoid?: number): FindItem {
  const answerIdx = pickRoomIdx(avoid)
  const roomId = roomIdAt(answerIdx) ?? ROOMS[0].id
  return { mode: 'find', tier: 0, roomId, answerIdx }
}

// ---------- T1 : qui est à côté ? ----------

/** Cases praticables ayant au moins un voisin dans la grille (toutes, en pratique). */
const ADJ_SPOTS: readonly number[] = PLAN.filter(
  (c) => c.kind !== 'wall' && DIRS.some((d) => neighbor(c.idx, d) !== null),
).map((c) => c.idx)

export function generateAdjacent(_level: number, avoid?: number): AdjacentItem {
  // On veut une question dont la réponse (case voisine) est dans la grille.
  // Toute case du plan a au moins un voisin valide ; on tire jusqu'à trouver
  // un couple (case, direction) avec voisin existant — borné, toujours trouvé.
  const pool = ADJ_SPOTS
  for (let attempt = 0; attempt < 64; attempt++) {
    const plumeIdx = pool[randInt(0, pool.length - 1)]
    if (avoid !== undefined && plumeIdx === avoid && pool.length > 1) continue
    const dir = pick(shuffle(DIRS))
    const n = neighbor(plumeIdx, dir)
    if (n === null) continue
    return { mode: 'adjacent', tier: 1, plumeIdx, dir, answerIdx: n }
  }
  // Filet déterministe : centre du plan, voisin garanti.
  const center = 12
  for (const dir of DIRS) {
    const n = neighbor(center, dir)
    if (n !== null) return { mode: 'adjacent', tier: 1, plumeIdx: center, dir, answerIdx: n }
  }
  // Inatteignable (le centre a 4 voisins).
  return { mode: 'adjacent', tier: 1, plumeIdx: center, dir: 'right', answerIdx: 13 }
}

// ---------- T2/T3 : guider Plume ----------

/** Cases de départ praticables (couloirs + salles). */
const GUIDE_STARTS: readonly number[] = PLAN.filter((c) => c.kind !== 'wall').map((c) => c.idx)

/** Bornes INCLUSES de la longueur du chemin par palier × niveau de Tuner. */
const GUIDE_LEN: Readonly<Record<2 | 3, readonly [readonly [number, number], readonly [number, number]]>> =
  {
    2: [
      [2, 3],
      [3, 4],
    ],
    3: [
      [4, 6],
      [5, 7],
    ],
  }

export function generateGuide(tier: TierId, level: number, avoid?: number): GuideItem {
  const t: 2 | 3 = tier === 3 ? 3 : 2
  const [minLen, maxLen] = GUIDE_LEN[t][clampLevel(level)]
  const roomIndices = new Set(
    ROOMS.map((r) => ROOM_INDEX.get(r.id)).filter((i): i is number => i !== undefined),
  )

  const candidates: GuideItem[] = []
  for (const startIdx of GUIDE_STARTS) {
    for (const targetIdx of roomIndices) {
      if (targetIdx === startIdx) continue
      const path = shortestPath(startIdx, targetIdx)
      if (path.length < minLen || path.length > maxLen) continue
      candidates.push({ mode: 'guide', tier, startIdx, targetIdx, path })
    }
  }

  // Filet de sécurité : si les bornes sont trop serrées (ne devrait pas arriver),
  // on retombe sur n'importe quel trajet salle→salle non trivial.
  const pool = candidates.length > 0 ? candidates : buildAnyGuide(tier)
  const avoiding =
    avoid === undefined ? pool : pool.filter((c) => c.targetIdx !== avoid)
  const final = avoiding.length > 0 ? avoiding : pool
  return final[randInt(0, final.length - 1)]
}

function buildAnyGuide(tier: TierId): GuideItem[] {
  const out: GuideItem[] = []
  const roomIndices = ROOMS.map((r) => ROOM_INDEX.get(r.id)).filter(
    (i): i is number => i !== undefined,
  )
  for (const startIdx of GUIDE_STARTS) {
    for (const targetIdx of roomIndices) {
      if (targetIdx === startIdx) continue
      const path = shortestPath(startIdx, targetIdx)
      if (path.length >= 1) out.push({ mode: 'guide', tier, startIdx, targetIdx, path })
    }
  }
  return out
}

/** Aiguillage commun de génération. */
export function generateItem(tier: TierId, level: number, avoid?: number): PlumeItem {
  const mode = modeForTier(tier)
  if (mode === 'find') return generateFind(level, avoid)
  if (mode === 'adjacent') return generateAdjacent(level, avoid)
  return generateGuide(tier, level, avoid)
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

export function findCorrect(item: FindItem, idx: number): boolean {
  return idx === item.answerIdx
}

export function adjacentCorrect(item: AdjacentItem, idx: number): boolean {
  return idx === item.answerIdx
}

/** Simule l'itinéraire (suite de flèches) depuis le départ ; renvoie la case finale. */
export function runGuide(item: GuideItem, dirs: readonly Dir[]): number {
  let cur = item.startIdx
  for (const dir of dirs) cur = step(cur, dir)
  return cur
}

/** L'itinéraire amène-t-il Plume jusqu'à la salle cible ? */
export function guideReaches(item: GuideItem, dirs: readonly Dir[]): boolean {
  return reached(runGuide(item, dirs), item.targetIdx)
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

export interface PlumeProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: PlumeProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: PlumeProgress, tier: TierId, stars: 1 | 2 | 3): PlumeProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
