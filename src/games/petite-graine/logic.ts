// ============================================================
// La Petite Graine — logique PURE (« Questionner le monde » du
// vivant végétal). Deux mécaniques de PRODUCTION (zéro QCM) :
//  • « nourrir » (T0/T1) : l'enfant donne à la plante seulement ce
//    dont elle a besoin (eau, lumière, air, bonne terre) — les
//    cartes-pièges (bonbon, jouet, télé, chaussure) sont refusées
//    et expliquées, jamais comptées comme un choix correct. C'est
//    EXACTEMENT la mécanique « feed » de la Cantine de la Forêt.
//  • « ordre » (T2/T3) : l'enfant remet les étapes du cycle de vie
//    DANS L'ORDRE en les tapant successivement (production de
//    séquence, validateur stepOutcome). Une mauvaise étape ré-illumine
//    la séquence depuis le début (l'erreur enseigne).
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item
// généré est TOUJOURS résoluble (un plateau « nourrir » a au moins
// un besoin ET au moins un piège ; une séquence à ordonner est une
// sous-suite ordonnée correcte du cycle).
// ============================================================

import { shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// Les besoins de la plante et les cartes-pièges (drôles).
// ------------------------------------------------------------

/** Une carte du plateau « nourrir » : un besoin vital ou un piège. */
export interface NeedCard {
  id: string
  name: string
  emoji: string
  /** Vrai si la plante en a réellement besoin. */
  isNeed: boolean
}

export const NEEDS: readonly NeedCard[] = [
  { id: 'eau', name: 'De l’eau', emoji: '💧', isNeed: true },
  { id: 'soleil', name: 'La lumière du soleil', emoji: '☀️', isNeed: true },
  { id: 'air', name: 'De l’air', emoji: '💨', isNeed: true },
  { id: 'terre', name: 'De la bonne terre', emoji: '🟤', isNeed: true },
  { id: 'bonbon', name: 'Un bonbon', emoji: '🍬', isNeed: false },
  { id: 'jouet', name: 'Un jouet', emoji: '🧸', isNeed: false },
  { id: 'tele', name: 'La télé', emoji: '📺', isNeed: false },
  { id: 'chaussure', name: 'Une chaussure', emoji: '👟', isNeed: false },
]

export const NEEDS_BY_ID: ReadonlyMap<string, NeedCard> = new Map(NEEDS.map((n) => [n.id, n]))

const REAL_NEEDS: readonly NeedCard[] = NEEDS.filter((n) => n.isNeed)
const TRAPS: readonly NeedCard[] = NEEDS.filter((n) => !n.isNeed)

/** Cette carte est-elle un vrai besoin de la plante ? */
export function isNeed(cardId: string): boolean {
  return NEEDS_BY_ID.get(cardId)?.isNeed === true
}

// ------------------------------------------------------------
// Le cycle de vie d'une plante (étapes ORDONNÉES).
// ------------------------------------------------------------

export type StageId = 'graine' | 'germe' | 'pousse' | 'fleur' | 'fruit'

export interface Stage {
  id: StageId
  name: string
  emoji: string
}

/** Les 5 étapes, dans l'ordre canonique du cycle. */
export const CYCLE: readonly Stage[] = [
  { id: 'graine', name: 'La graine', emoji: '🌰' },
  { id: 'germe', name: 'Le germe', emoji: '🌱' },
  { id: 'pousse', name: 'La pousse', emoji: '🌿' },
  { id: 'fleur', name: 'La fleur', emoji: '🌸' },
  { id: 'fruit', name: 'Le fruit', emoji: '🍅' },
]

export const STAGES_BY_ID: ReadonlyMap<StageId, Stage> = new Map(CYCLE.map((s) => [s.id, s]))

const CYCLE_ORDER: readonly StageId[] = CYCLE.map((s) => s.id)

/** Rang d'une étape dans le cycle (0 = graine … 4 = fruit). */
export function stageRank(id: StageId): number {
  return CYCLE_ORDER.indexOf(id)
}

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plateau resserré, 1 = plateau élargi. */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'mo.gs.vivant.besoins',
  'mo.gs.vivant.besoins',
  'mo.cp.vivant.cycle',
  'mo.cp.vivant.cycle',
] as const

/** T0/T1 = nourrir ; T2/T3 = remettre le cycle dans l'ordre. */
export function isFeedTier(tier: TierId): boolean {
  return tier <= 1
}

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface FeedItem {
  kind: 'feed'
  tier: TierId
  /** Cartes posées sur le plateau (mélangées) : besoins + pièges. */
  tray: string[]
  /** Cartes du plateau qui sont de vrais besoins (≥ 1, sert d'indice). */
  correctIds: string[]
}

export interface OrderItem {
  kind: 'order'
  tier: TierId
  /** Cartes-étapes affichées, mélangées (le joueur doit les ordonner). */
  cards: StageId[]
  /** Séquence attendue : les mêmes étapes, dans l'ordre du cycle. */
  expected: StageId[]
}

export type SeedItem = FeedItem | OrderItem

/** Nombre de besoins / pièges sur le plateau selon palier et niveau. */
const TRAY_SPECS: Readonly<Record<0 | 1, { need: number; trap: number }>> = {
  // T0 : 1 besoin + 2 pièges. T1 : 2 besoins + 3 pièges.
  0: { need: 1, trap: 2 },
  1: { need: 2, trap: 3 },
}

/** Nombre d'étapes du cycle à ordonner selon le palier. */
function cycleLengthForTier(tier: TierId): number {
  // T2 : les 4 premières étapes. T3 : les 5.
  return tier === 2 ? 4 : 5
}

/**
 * Génère le plateau « nourrir » d'un palier feed.
 * Garanti : ≥ 1 besoin ET ≥ 1 piège présents (résolubilité + l'erreur a un sens).
 */
function generateFeedItem(tier: TierId, level: number): FeedItem {
  const spec = TRAY_SPECS[clampLevel(level)]
  const needs = shuffle(REAL_NEEDS).slice(0, Math.max(1, Math.min(spec.need, REAL_NEEDS.length)))
  const traps = shuffle(TRAPS).slice(0, Math.max(1, Math.min(spec.trap, TRAPS.length)))
  const tray = shuffle([...needs, ...traps]).map((c) => c.id)
  return {
    kind: 'feed',
    tier,
    tray,
    correctIds: needs.map((c) => c.id),
  }
}

/**
 * Génère une carte à ordonner pour un palier cycle.
 * `expected` est une sous-suite ordonnée du cycle (les `length` premières
 * étapes). `cards` est exactement ces étapes, mélangées.
 */
function generateOrderItem(tier: TierId): OrderItem {
  const length = cycleLengthForTier(tier)
  const expected = CYCLE_ORDER.slice(0, length)
  return {
    kind: 'order',
    tier,
    cards: shuffle(expected),
    expected: [...expected],
  }
}

/**
 * Façade unifiée (parité avec cantine-foret). Génère un item résoluble pour
 * un palier et un niveau de Tuner. `avoid` évite de reproposer le même item
 * deux fois de suite (par sa signature : ordre des cartes affichées).
 */
export function generateItem(tier: TierId, level: number, avoid?: string): SeedItem {
  const make = (): SeedItem =>
    isFeedTier(tier) ? generateFeedItem(tier, level) : generateOrderItem(tier)
  let item = make()
  // Anti-répétition : on retire jusqu'à ce que la disposition diffère de la
  // précédente. Le contenu reste toujours résoluble (signature ≠ contenu).
  for (let tries = 0; tries < 12 && avoid !== undefined && itemSignature(item) === avoid; tries++) {
    item = make()
  }
  return item
}

/** Signature stable d'un item (sert au paramètre `avoid`). */
export function itemSignature(item: SeedItem): string {
  return item.kind === 'feed' ? `feed:${item.tray.join(',')}` : `order:${item.cards.join(',')}`
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** Le plateau est-il complet ? (tous les vrais besoins donnés) */
export function feedComplete(item: FeedItem, givenIds: readonly string[]): boolean {
  const given = new Set(givenIds)
  return item.correctIds.every((id) => given.has(id))
}

export type StepOutcome = 'progress' | 'complete' | 'wrong'

/**
 * Valide le tap n° `index` d'une séquence à ordonner (production, pas de QCM).
 * Mauvaise étape → 'wrong' (on ré-illumine depuis le début côté UI).
 */
export function stepOutcome(
  expected: readonly StageId[],
  index: number,
  tappedId: StageId,
): StepOutcome {
  if (index < 0 || index >= expected.length || expected[index] !== tappedId) return 'wrong'
  return index === expected.length - 1 ? 'complete' : 'progress'
}

// ------------------------------------------------------------
// Score & progression (pattern de référence cantine-foret)
// ------------------------------------------------------------

/** Étoiles d'une partie : seuls les PREMIERS essais comptent. */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface PgrProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: PgrProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: PgrProgress, tier: TierId, stars: 1 | 2 | 3): PgrProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
