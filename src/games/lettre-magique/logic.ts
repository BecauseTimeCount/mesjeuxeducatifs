// ============================================================
// La Lettre Magique — logique PURE.
// Validation de tracé au doigt : rééchantillonnage par longueur
// d'arc, progression ordonnée le long du modèle, hors-piste,
// sens de rotation (le rond s'écrit en anti-horaire), paliers de
// guidage et progression persistée.
// Aucun import React / engine / DOM. Prouvé par logic.test.ts.
// ============================================================

export interface Pt {
  x: number
  y: number
}

// ------------------------------------------------------------
// Géométrie de base
// ------------------------------------------------------------

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Longueur totale d'une polyligne. */
export function pathLength(points: readonly Pt[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i])
  return len
}

/**
 * Rééchantillonnage par longueur d'arc : n points régulièrement espacés
 * le long de la polyligne. Les événements pointer sont irréguliers
 * (rafales puis trous) — sans ça, la couverture serait biaisée.
 * Cas dégénérés : moins de 2 points ou longueur nulle → répète le point.
 */
export function resample(points: readonly Pt[], n: number): Pt[] {
  if (n <= 0) return []
  const first = points[0] ?? { x: 0, y: 0 }
  if (points.length < 2 || n === 1) return Array.from({ length: n }, () => ({ ...first }))
  const total = pathLength(points)
  if (total <= 0) return Array.from({ length: n }, () => ({ ...first }))
  const step = total / (n - 1)
  const out: Pt[] = [{ ...first }]
  let acc = 0
  let i = 1
  let prev = first
  while (out.length < n - 1 && i < points.length) {
    const cur = points[i]
    const d = dist(prev, cur)
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d
      const p = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }
      out.push(p)
      prev = p
      acc = 0
    } else {
      acc += d
      prev = cur
      i++
    }
  }
  const last = points[points.length - 1]
  while (out.length < n) out.push({ ...last })
  return out
}

/**
 * Aire signée (shoelace) d'un tracé fermé. En coordonnées ÉCRAN (y vers
 * le bas), le sens de l'écriture du rond — anti-horaire visuellement —
 * donne une aire NÉGATIVE. C'est le critère testé sur les rondes.
 */
export function signedArea(points: readonly Pt[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Vrai si le tracé tourne dans le sens de l'écriture (anti-horaire à l'écran). */
export function isAntiClockwise(points: readonly Pt[]): boolean {
  return signedArea(points) < 0
}

/** Distance d'un point au segment [a, b]. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  if (lenSq <= 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq))
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t })
}

/** Distance d'un point à la polyligne entière (plus proche segment). */
export function distToPath(p: Pt, path: readonly Pt[]): number {
  if (path.length === 0) return Number.POSITIVE_INFINITY
  if (path.length === 1) return dist(p, path[0])
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < path.length; i++) {
    const d = distToSegment(p, path[i - 1], path[i])
    if (d < best) best = d
  }
  return best
}

// ------------------------------------------------------------
// Évaluation du tracé
// ------------------------------------------------------------

export interface TraceEval {
  ok: boolean
  /** Part des points du modèle visités DANS L'ORDRE par le tracé (0..1). */
  coverage: number
  wrongStart: boolean
  offTrack: boolean
}

/** Tolérance sur le point de départ (l'étoile est grosse, le doigt aussi). */
export const START_TOLERANCE = 12
/** Couverture ordonnée minimale du modèle. */
export const MIN_COVERAGE = 0.85
/** Proportion maximale de points dessinés hors piste. */
export const MAX_OFF_TRACK = 0.25
/** Nombre de points du tracé enfant après rééchantillonnage. */
const DRAWN_SAMPLES = 96

const FAILED: TraceEval = { ok: false, coverage: 0, wrongStart: true, offTrack: true }

/**
 * Évalue un tracé d'enfant contre un modèle.
 * 1. Départ : le premier point dessiné doit être proche du départ du modèle.
 * 2. Progression ordonnée : chaque point du modèle doit être « visité »
 *    dans l'ordre par le tracé (curseur monotone — un tracé à l'envers ou
 *    en zigzag ne couvre pas).
 * 3. Hors-piste : la part des points dessinés à plus de la tolérance du
 *    modèle doit rester faible (gribouillage exclu).
 */
export function evaluateTrace(
  model: readonly Pt[],
  drawn: readonly Pt[],
  tolerance = 12,
): TraceEval {
  if (model.length < 2 || drawn.length < 2 || pathLength(drawn) <= 0) return FAILED

  const d = resample(drawn, DRAWN_SAMPLES)
  const startTol = Math.max(tolerance, START_TOLERANCE)
  const wrongStart = dist(d[0], model[0]) > startTol

  // Progression ordonnée le long du modèle (curseur monotone sur le dessin).
  let cursor = 0
  let visited = 0
  for (const mp of model) {
    let found = -1
    for (let j = cursor; j < d.length; j++) {
      if (dist(d[j], mp) <= tolerance) {
        found = j
        break
      }
    }
    if (found >= 0) {
      visited++
      cursor = found
    }
  }
  const coverage = visited / model.length

  // Hors-piste : points dessinés loin de TOUT le modèle.
  let off = 0
  for (const p of d) {
    if (distToPath(p, model) > tolerance) off++
  }
  const offTrack = off / d.length > MAX_OFF_TRACK

  return {
    ok: !wrongStart && coverage >= MIN_COVERAGE && !offTrack,
    coverage,
    wrongStart,
    offTrack,
  }
}

// ------------------------------------------------------------
// Paliers de guidage & tolérances
// ------------------------------------------------------------

/** 2 = « Suis les pointillés », 3 = « Toute seule ! » (le palier 1, la
 *  démonstration de la fée, n'attend aucun tracé). */
export type Palier = 2 | 3

export const MAX_TUNER_LEVEL = 2
export const TRACES_PER_RUN = 6

/** Tolérance (coordonnées 0-100) : le palier 3 est PLUS tolérant (tracé de
 *  mémoire), et la tolérance se resserre quand le Tuner monte — jamais
 *  l'inverse. */
const TOLERANCES: Readonly<Record<Palier, readonly [number, number, number]>> = {
  2: [14, 12, 10],
  3: [16, 14, 12],
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

export function toleranceFor(palier: Palier, level: number): number {
  return TOLERANCES[palier][clampLevel(level)]
}

/**
 * Machine à états d'UN tracé : démonstration (palier 1, gérée par l'UI),
 * puis 2 réussites au palier 2 → palier 3 ; réussir le palier 3 = acquis.
 * 2 échecs consécutifs au palier 3 → retour au palier 2 (1 seule réussite
 * exigée pour remonter — l'indice automatique de la loi n° 2).
 */
export interface TraceFlow {
  palier: Palier
  /** Réussites exigées au palier 2 avant de passer au palier 3. */
  p2Target: number
  p2Done: number
  p3Fails: number
  /** Au moins un retour au guidage supérieur. */
  fellBack: boolean
  /** Au moins un échec au palier 3. */
  failedP3: boolean
  done: boolean
}

export function initialFlow(): TraceFlow {
  return { palier: 2, p2Target: 2, p2Done: 0, p3Fails: 0, fellBack: false, failedP3: false, done: false }
}

export function applyTraceResult(f: TraceFlow, ok: boolean): TraceFlow {
  if (f.done) return f
  if (f.palier === 2) {
    if (!ok) return { ...f, p2Done: 0 }
    const p2Done = f.p2Done + 1
    if (p2Done >= f.p2Target) return { ...f, p2Done, palier: 3, p3Fails: 0 }
    return { ...f, p2Done }
  }
  // Palier 3
  if (ok) return { ...f, done: true }
  const p3Fails = f.p3Fails + 1
  if (p3Fails >= 2) {
    return { ...f, palier: 2, p2Target: 1, p2Done: 0, p3Fails: 0, fellBack: true, failedP3: true }
  }
  return { ...f, p3Fails, failedP3: true }
}

/** Premier essai « honnête » : palier 3 réussi sans AUCUN échec au palier 3
 *  ni retour au guidage. */
export function isFirstTry(f: TraceFlow): boolean {
  return f.done && !f.fellBack && !f.failedP3
}

// ------------------------------------------------------------
// Composition d'une session
// ------------------------------------------------------------

/**
 * Tire `n` tracés dans un pool d'ids : si le pool est plus petit que `n`
 * (la famille « boucles » n'a que 2 lettres), on enchaîne des copies
 * mélangées du pool en évitant deux fois le même tracé d'affilée quand
 * une alternative existe. `rand` est injectable pour les tests.
 */
export function pickSessionStrokes(
  pool: readonly string[],
  n: number,
  rand: () => number = Math.random,
): string[] {
  if (pool.length === 0 || n <= 0) return []
  const shuffled = (): string[] => {
    const a = [...pool]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const out: string[] = []
  while (out.length < n) {
    const batch = shuffled()
    if (out.length > 0 && batch.length > 1 && batch[0] === out[out.length - 1]) {
      ;[batch[0], batch[1]] = [batch[1], batch[0]]
    }
    for (const id of batch) {
      if (out.length < n) out.push(id)
    }
  }
  return out
}

// ------------------------------------------------------------
// Score & progression persistée
// ------------------------------------------------------------

/** Étoiles d'une partie : seuls les PREMIERS essais comptent. */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export type Atelier = 'formes' | 'lettres'

export interface LmaProgress {
  bestStars: 0 | 1 | 2 | 3
  /** Index de la plus haute famille de lettres déverrouillée. */
  unlockedFamily: number
  runs: number
  /** Tracés acquis (palier 3 réussi au moins une fois). */
  acquired: Record<string, true>
}

export const FRESH_PROGRESS: LmaProgress = {
  bestStars: 0,
  unlockedFamily: 0,
  runs: 0,
  acquired: {},
}

/**
 * Applique le résultat d'une partie : meilleur score, tracés acquis,
 * et déblocage de la famille suivante à 2 étoiles sur la famille jouée
 * la plus haute (`familyCount` borne l'index — jamais reverrouillé).
 */
export function applyRun(
  p: LmaProgress,
  atelier: Atelier,
  familyIndex: number,
  stars: 1 | 2 | 3,
  acquiredIds: readonly string[],
  familyCount: number,
): LmaProgress {
  const acquired = { ...p.acquired }
  for (const id of acquiredIds) acquired[id] = true
  let unlockedFamily = p.unlockedFamily
  if (atelier === 'lettres' && stars >= 2 && familyIndex >= p.unlockedFamily) {
    unlockedFamily = Math.min(familyIndex + 1, familyCount - 1)
  }
  return {
    bestStars: Math.max(p.bestStars, stars) as 0 | 1 | 2 | 3,
    unlockedFamily,
    runs: p.runs + 1,
    acquired,
  }
}
