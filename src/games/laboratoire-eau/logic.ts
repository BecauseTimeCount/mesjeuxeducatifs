// ============================================================
// Le Laboratoire de l'Eau — logique PURE.
// Machine à états de l'eau (lac / ciel / sommet), générateur de
// missions atteignables (solveur BFS), classification des actions
// (utile / contre-productive / gag), position de Goutte.
// Aucun import React/DOM. Prouvé par logic.test.ts : depuis tout
// état atteignable, chaque mission générée est TOUJOURS résoluble.
// ============================================================

import { pick } from '@/engine/rng'

// ------------------------------------------------------------
// États & actions
// ------------------------------------------------------------

export type LakeState = 'liquide' | 'glace'
export type SkyState = 'vide' | 'vapeur' | 'nuage' | 'pluie' | 'neige'
export type PeakState = 'sec' | 'neige' | 'ruisseau'

export interface WaterState {
  lac: LakeState
  ciel: SkyState
  sommet: PeakState
}

export type Zone = 'lac' | 'ciel' | 'sommet'
export type Tool = 'chauffer' | 'refroidir'

export interface Action {
  tool: Tool
  zone: Zone
}

export const ZONES: readonly Zone[] = ['lac', 'ciel', 'sommet']
export const TOOLS: readonly Tool[] = ['chauffer', 'refroidir']

/** Les 6 actions possibles (outil × zone), dans un ordre déterministe. */
export const ACTIONS: readonly Action[] = TOOLS.flatMap((tool) =>
  ZONES.map((zone): Action => ({ tool, zone })),
)

export const INITIAL_STATE: WaterState = { lac: 'liquide', ciel: 'vide', sommet: 'sec' }

// ------------------------------------------------------------
// Transitions — la physique honnête.
// Chaque transformation porte un EffectId (clip lde.etat.<id>),
// chaque action impossible un GagId (clip lde.gag.<id>), sans pénalité.
// ------------------------------------------------------------

export type EffectId =
  | 'fonte-lac' // chauffer le lac gelé → liquide
  | 'evaporation' // chauffer le lac → la vapeur monte
  | 'nuage-forme' // chauffer encore : la vapeur s'assemble en nuage
  | 'dissipation' // chauffer le nuage → il redevient vapeur
  | 'eclaircie' // chauffer la pluie → le soleil l'arrête, ciel vide
  | 'flocons-fondent' // chauffer la neige qui tombe → pluie
  | 'fonte-neige' // chauffer la neige du sommet → ruisseau vers le lac
  | 'ruisseau-fini' // chauffer le ruisseau → toute l'eau est rentrée au lac
  | 'gel' // refroidir le lac → patinoire
  | 'condensation' // refroidir la vapeur → nuage
  | 'pluie' // refroidir le nuage → il pleut
  | 'neige' // refroidir la pluie (2e froid !) → neige, le sommet blanchit

export type GagId =
  | 'ciel-vide' // chauffer un ciel vide
  | 'ciel-plein' // chauffer le lac quand le ciel est déjà plein
  | 'vapeur-chaude' // chauffer la vapeur
  | 'sommet-sec' // chauffer la montagne sèche
  | 'deja-glace' // refroidir le lac gelé
  | 'ciel-vide-froid' // refroidir un ciel vide
  | 'deja-neige' // refroidir la neige qui tombe
  | 'sommet-froid' // refroidir la montagne sèche
  | 'sommet-deja-neige' // refroidir la neige du sommet
  | 'ruisseau-froid' // refroidir le ruisseau

export type ApplyResult =
  | { kind: 'transition'; state: WaterState; effect: EffectId }
  | { kind: 'gag'; state: WaterState; gag: GagId }

function transition(state: WaterState, effect: EffectId): ApplyResult {
  return { kind: 'transition', state, effect }
}

function gag(state: WaterState, id: GagId): ApplyResult {
  return { kind: 'gag', state, gag: id }
}

/**
 * Applique un outil sur une zone. PURE : ne mute jamais `state`.
 * Toute action rend soit une transformation physique (effect),
 * soit un gag (état inchangé, jamais de pénalité).
 */
export function applyTool(state: WaterState, tool: Tool, zone: Zone): ApplyResult {
  if (tool === 'chauffer') {
    if (zone === 'lac') {
      if (state.lac === 'glace') return transition({ ...state, lac: 'liquide' }, 'fonte-lac')
      if (state.ciel === 'vide') return transition({ ...state, ciel: 'vapeur' }, 'evaporation')
      if (state.ciel === 'vapeur') return transition({ ...state, ciel: 'nuage' }, 'nuage-forme')
      return gag(state, 'ciel-plein')
    }
    if (zone === 'ciel') {
      switch (state.ciel) {
        case 'vide':
          return gag(state, 'ciel-vide')
        case 'vapeur':
          return gag(state, 'vapeur-chaude')
        case 'nuage':
          return transition({ ...state, ciel: 'vapeur' }, 'dissipation')
        case 'pluie':
          return transition({ ...state, ciel: 'vide' }, 'eclaircie')
        case 'neige':
          return transition({ ...state, ciel: 'pluie' }, 'flocons-fondent')
      }
    }
    // sommet
    if (state.sommet === 'sec') return gag(state, 'sommet-sec')
    if (state.sommet === 'neige') return transition({ ...state, sommet: 'ruisseau' }, 'fonte-neige')
    return transition({ ...state, sommet: 'sec' }, 'ruisseau-fini')
  }

  // refroidir
  if (zone === 'lac') {
    if (state.lac === 'liquide') return transition({ ...state, lac: 'glace' }, 'gel')
    return gag(state, 'deja-glace')
  }
  if (zone === 'ciel') {
    switch (state.ciel) {
      case 'vide':
        return gag(state, 'ciel-vide-froid')
      case 'vapeur':
        return transition({ ...state, ciel: 'nuage' }, 'condensation')
      case 'nuage':
        return transition({ ...state, ciel: 'pluie' }, 'pluie')
      case 'pluie':
        // Refroidir une 2e fois : la pluie devient neige ET blanchit le sommet.
        return transition({ ...state, ciel: 'neige', sommet: 'neige' }, 'neige')
      case 'neige':
        return gag(state, 'deja-neige')
    }
  }
  // sommet
  if (state.sommet === 'sec') return gag(state, 'sommet-froid')
  if (state.sommet === 'neige') return gag(state, 'sommet-deja-neige')
  return gag(state, 'ruisseau-froid')
}

// ------------------------------------------------------------
// Exploration de l'espace d'états (30 états max — BFS triviaux)
// ------------------------------------------------------------

export function stateKey(s: WaterState): string {
  return `${s.lac}|${s.ciel}|${s.sommet}`
}

/** Tous les états atteignables depuis `from` (défaut : l'état initial). */
export function reachableStates(from: WaterState = INITIAL_STATE): WaterState[] {
  const seen = new Map<string, WaterState>([[stateKey(from), from]])
  const queue: WaterState[] = [from]
  while (queue.length > 0) {
    const s = queue.shift() as WaterState
    for (const a of ACTIONS) {
      const r = applyTool(s, a.tool, a.zone)
      if (r.kind !== 'transition') continue
      const k = stateKey(r.state)
      if (!seen.has(k)) {
        seen.set(k, r.state)
        queue.push(r.state)
      }
    }
  }
  return [...seen.values()]
}

// ------------------------------------------------------------
// Missions — objectifs nommés + solveur garantissant l'atteignabilité
// ------------------------------------------------------------

export type GoalId =
  | 'lac-glace'
  | 'lac-liquide'
  | 'vapeur'
  | 'nuage'
  | 'pluie'
  | 'neige-sommet'
  | 'ruisseau'

export const GOAL_IDS: readonly GoalId[] = [
  'lac-glace',
  'lac-liquide',
  'vapeur',
  'nuage',
  'pluie',
  'neige-sommet',
  'ruisseau',
]

/** Prédicat de réussite de chaque objectif. */
export const GOALS: Readonly<Record<GoalId, (s: WaterState) => boolean>> = {
  'lac-glace': (s) => s.lac === 'glace',
  'lac-liquide': (s) => s.lac === 'liquide',
  vapeur: (s) => s.ciel === 'vapeur',
  nuage: (s) => s.ciel === 'nuage',
  pluie: (s) => s.ciel === 'pluie',
  'neige-sommet': (s) => s.sommet === 'neige',
  ruisseau: (s) => s.sommet === 'ruisseau',
}

/**
 * Plus court chemin d'actions (gags exclus) menant à l'objectif.
 * `[]` si déjà atteint, `null` si inatteignable (n'arrive jamais
 * depuis un état atteignable — prouvé par les tests).
 */
export function solve(start: WaterState, goalId: GoalId, maxDepth = 12): Action[] | null {
  const check = GOALS[goalId]
  if (check(start)) return []
  const seen = new Set<string>([stateKey(start)])
  let frontier: Array<{ s: WaterState; path: Action[] }> = [{ s: start, path: [] }]
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: typeof frontier = []
    for (const { s, path } of frontier) {
      for (const a of ACTIONS) {
        const r = applyTool(s, a.tool, a.zone)
        if (r.kind !== 'transition') continue
        const k = stateKey(r.state)
        if (seen.has(k)) continue
        seen.add(k)
        const p = [...path, a]
        if (check(r.state)) return p
        next.push({ s: r.state, path: p })
      }
    }
    frontier = next
  }
  return null
}

/** Nombre minimal d'actions pour atteindre l'objectif (null si impossible). */
export function minSteps(start: WaterState, goalId: GoalId): number | null {
  const path = solve(start, goalId)
  return path === null ? null : path.length
}

/** Première action d'un plus court chemin — sert d'indice après 2 erreurs. */
export function nextStep(start: WaterState, goalId: GoalId): Action | null {
  const path = solve(start, goalId)
  return path !== null && path.length > 0 ? path[0] : null
}

// ------------------------------------------------------------
// Générateur de missions
// ------------------------------------------------------------

export interface Mission {
  goalId: GoalId
  /** Nombre minimal d'actions au moment de la génération. */
  steps: number
}

/**
 * Tire une mission depuis l'état courant : objectif NON déjà satisfait,
 * toujours atteignable, de difficulté la plus proche de `desiredSteps`.
 * `avoid` écarte les objectifs récents quand une alternative existe.
 * `choose` est injectable pour des tests déterministes.
 */
export function generateMission(
  state: WaterState,
  desiredSteps: number,
  avoid: readonly GoalId[] = [],
  choose: <T>(arr: readonly T[]) => T = pick,
): Mission {
  const all = GOAL_IDS.map((id) => ({ id, steps: minSteps(state, id) })).filter(
    (c): c is { id: GoalId; steps: number } => c.steps !== null && c.steps > 0,
  )
  // Jamais vide : lac-glace et lac-liquide sont mutuellement exclusifs,
  // donc au moins un objectif reste à accomplir (prouvé par les tests).
  const fresh = all.filter((c) => !avoid.includes(c.id))
  const candidates = fresh.length > 0 ? fresh : all
  const best = Math.min(...candidates.map((c) => Math.abs(c.steps - desiredSteps)))
  const pool = candidates.filter((c) => Math.abs(c.steps - desiredSteps) === best)
  const chosen = choose(pool)
  return { goalId: chosen.id, steps: chosen.steps }
}

// ------------------------------------------------------------
// Classification d'une action pendant une mission
// ------------------------------------------------------------

export type ActionClass = 'utile' | 'contre' | 'gag'

/**
 * Une action est `utile` si elle rapproche de l'objectif (ou l'atteint),
 * `gag` si elle est impossible (jamais comptée contre l'enfant),
 * `contre` sinon — la physique se fait quand même, Goutte explique.
 */
export function classifyAction(
  state: WaterState,
  goalId: GoalId,
  tool: Tool,
  zone: Zone,
): ActionClass {
  const r = applyTool(state, tool, zone)
  if (r.kind === 'gag') return 'gag'
  if (GOALS[goalId](r.state)) return 'utile'
  const before = minSteps(state, goalId)
  const after = minSteps(r.state, goalId)
  if (before === null || after === null) return 'contre'
  return after < before ? 'utile' : 'contre'
}

// ------------------------------------------------------------
// Goutte — où est la mascotte ?
// ------------------------------------------------------------

export type GoutteSpot =
  | 'lac'
  | 'glace'
  | 'vapeur'
  | 'nuage'
  | 'pluie'
  | 'neige'
  | 'sommet'
  | 'ruisseau'

/**
 * Position dérivée de l'état, par priorité « où ça bouge » :
 * ruisseau > pluie > neige qui tombe > nuage > vapeur > neige posée >
 * glace > lac. Déterministe et testable (pas d'historique d'actions).
 */
export function gouttePos(s: WaterState): GoutteSpot {
  if (s.sommet === 'ruisseau') return 'ruisseau'
  if (s.ciel === 'pluie') return 'pluie'
  if (s.ciel === 'neige') return 'neige'
  if (s.ciel === 'nuage') return 'nuage'
  if (s.ciel === 'vapeur') return 'vapeur'
  if (s.sommet === 'neige') return 'sommet'
  if (s.lac === 'glace') return 'glace'
  return 'lac'
}

// ------------------------------------------------------------
// Paliers, Tuner et score
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const MISSIONS_PER_RUN = 8
/** Le Tuner a 3 crans : au cran 2, les missions gagnent une étape. */
export const MAX_TUNER_LEVEL = 2

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'mo.gs.eau.etats',
  'mo.gs.eau.etats',
  'mo.cp.eau.cycle',
  'mo.cp.eau.cycle',
] as const

const TIER_BASE_STEPS: Readonly<Record<TierId, number>> = { 0: 1, 1: 2, 2: 3, 3: 4 }
/** Au-delà : aucun objectif n'existe (le cycle complet fait 5 étapes). */
export const MAX_MISSION_STEPS = 5

/** Difficulté visée (en étapes) pour un palier et un niveau de Tuner. */
export function stepsForTier(tier: TierId, level: number): number {
  const l = Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
  return Math.min(MAX_MISSION_STEPS, TIER_BASE_STEPS[tier] + (l >= MAX_TUNER_LEVEL ? 1 : 0))
}

/** Étoiles d'une partie : seuls les PREMIERS essais comptent. */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

// ------------------------------------------------------------
// Progression persistée (pattern de référence)
// ------------------------------------------------------------

export interface LdeProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: LdeProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: LdeProgress, tier: TierId, stars: 1 | 2 | 3): LdeProgress {
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
// Souvenirs du bac à eau (photos de la scène, max 8)
// ------------------------------------------------------------

export const MAX_SOUVENIRS = 8

/** Ajoute une photo (copie) à l'album : les plus anciennes sortent au-delà de 8. */
export function addSouvenir(
  album: readonly WaterState[],
  state: WaterState,
): WaterState[] {
  const next = [...album, { ...state }]
  return next.length > MAX_SOUVENIRS ? next.slice(next.length - MAX_SOUVENIRS) : next
}

/** Résumé emoji d'une photo : [ciel, sommet, lac] — pour l'album du bac à eau. */
export function stateEmojis(s: WaterState): [string, string, string] {
  const ciel: Record<SkyState, string> = {
    vide: '☀️',
    vapeur: '💨',
    nuage: '☁️',
    pluie: '🌧️',
    neige: '🌨️',
  }
  const sommet: Record<PeakState, string> = { sec: '⛰️', neige: '🏔️', ruisseau: '🏞️' }
  const lac: Record<LakeState, string> = { liquide: '🌊', glace: '🧊' }
  return [ciel[s.ciel], sommet[s.sommet], lac[s.lac]]
}
