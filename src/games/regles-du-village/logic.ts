// ============================================================
// Les Règles du Village — logique PURE (EMC : le droit, la règle,
// l'engagement). Une seule mécanique de PRODUCTION, bienveillante
// (calquée sur jardin-emotions, mode situationnel) :
//
//  • Une situation de vie de classe/cour est lue (clip). L'enfant
//    TROUVE la bonne attitude (respecter la règle / aider l'autre)
//    parmi des cartes-gestes : la bonne + des pièges PLAUSIBLES de
//    la même catégorie. L'erreur explique gentiment pourquoi une
//    autre attitude est meilleure — jamais « faux », jamais de
//    jugement dur, jamais de game over.
//
//  - T0/T1 « les règles de vie » : 1 bonne attitude (T0 : +1 piège ;
//    T1 : +2 pièges).
//  - T2/T3 « l'entraide » : 1 bonne attitude (T2 : +2 pièges ;
//    T3 : +3 pièges).
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item
// généré est TOUJOURS résoluble (la bonne carte est présente, il y
// a ≥1 piège de la même catégorie, aucun doublon, et taper la bonne
// carte résout l'item).
// ============================================================

import { pick, shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// Les cartes-gestes (la bonne attitude OU un piège). Deux familles
// thématiques : « regle » (vivre ensemble) et « entraide » (aider).
// ------------------------------------------------------------

export type Kind = 'regle' | 'entraide'

export interface Gesture {
  id: string
  label: string
  emoji: string
  kind: Kind
  /** true : geste valorisé ; false : piège plausible (jamais montré comme « faux »). */
  good: boolean
}

export const GESTURES: readonly Gesture[] = [
  // --- Règles de vie (bonnes attitudes) ---
  { id: 'lever-la-main', label: 'Lever la main', emoji: '🙋', kind: 'regle', good: true },
  { id: 'ranger', label: 'Ranger les jeux', emoji: '🧸', kind: 'regle', good: true },
  { id: 'attendre', label: 'Attendre son tour', emoji: '⏳', kind: 'regle', good: true },
  { id: 'dire-bonjour', label: 'Dire bonjour', emoji: '👋', kind: 'regle', good: true },
  { id: 'debarrasser', label: 'Débarrasser', emoji: '🍽️', kind: 'regle', good: true },
  // --- Règles de vie (pièges plausibles) ---
  { id: 'crier', label: 'Crier', emoji: '📢', kind: 'regle', good: false },
  { id: 'pousser', label: 'Pousser', emoji: '💥', kind: 'regle', good: false },
  { id: 'jeter', label: 'Jeter par terre', emoji: '🗑️', kind: 'regle', good: false },
  { id: 'passer-devant', label: 'Passer devant', emoji: '🏃', kind: 'regle', good: false },

  // --- Entraide (bonnes attitudes) ---
  { id: 'relever', label: 'Aider à se relever', emoji: '🤝', kind: 'entraide', good: true },
  { id: 'consoler', label: 'Consoler', emoji: '🫂', kind: 'entraide', good: true },
  { id: 'partager', label: 'Partager', emoji: '🍎', kind: 'entraide', good: true },
  { id: 'expliquer', label: 'Aider à comprendre', emoji: '💬', kind: 'entraide', good: true },
  { id: 'ensemble', label: 'Faire ensemble', emoji: '👫', kind: 'entraide', good: true },
  // --- Entraide (pièges plausibles) ---
  { id: 'se-moquer', label: 'Se moquer', emoji: '😜', kind: 'entraide', good: false },
  { id: 'ignorer', label: 'Ignorer', emoji: '🙈', kind: 'entraide', good: false },
  { id: 'rire', label: 'Rire de lui', emoji: '😂', kind: 'entraide', good: false },
]

export const GESTURES_BY_ID: ReadonlyMap<string, Gesture> = new Map(
  GESTURES.map((g) => [g.id, g]),
)

export function gestureOf(id: string): Gesture {
  const g = GESTURES_BY_ID.get(id)
  if (!g) throw new Error(`geste inconnu : ${id}`)
  return g
}

/** Pièges disponibles pour une famille (gestes `good: false` de ce `kind`). */
const TRAPS_BY_KIND: Readonly<Record<Kind, readonly string[]>> = {
  regle: GESTURES.filter((g) => g.kind === 'regle' && !g.good).map((g) => g.id),
  entraide: GESTURES.filter((g) => g.kind === 'entraide' && !g.good).map((g) => g.id),
}

// ------------------------------------------------------------
// Situations : un texte (via clip) qui pointe une bonne attitude.
// Chaque situation déclare ses pièges les plus PLAUSIBLES en premier
// (la liste est complétée par le pool global de la même famille si
// le palier demande plus de distracteurs).
// ------------------------------------------------------------

export interface Situation {
  /** id de clip corpus (préfixe rdv.sit.*) ; aussi clé d'affichage. */
  id: string
  kind: Kind
  /** La bonne attitude attendue (toujours un geste `good: true`). */
  answer: string
  /** Pièges privilégiés pour cette situation (sous-ensemble des mauvais du `kind`). */
  traps: string[]
}

export const SITUATIONS: readonly Situation[] = [
  // --- Règles de vie (T0/T1) ---
  { id: 'rdv.sit.parler', kind: 'regle', answer: 'lever-la-main', traps: ['crier', 'pousser'] },
  { id: 'rdv.sit.ranger', kind: 'regle', answer: 'ranger', traps: ['jeter', 'crier'] },
  { id: 'rdv.sit.queue', kind: 'regle', answer: 'attendre', traps: ['passer-devant', 'pousser'] },
  { id: 'rdv.sit.matin', kind: 'regle', answer: 'dire-bonjour', traps: ['crier', 'passer-devant'] },
  { id: 'rdv.sit.repas', kind: 'regle', answer: 'debarrasser', traps: ['jeter', 'pousser'] },

  // --- Entraide (T2/T3) ---
  { id: 'rdv.sit.tombe', kind: 'entraide', answer: 'relever', traps: ['rire', 'ignorer', 'se-moquer'] },
  { id: 'rdv.sit.pleure', kind: 'entraide', answer: 'consoler', traps: ['se-moquer', 'ignorer', 'rire'] },
  { id: 'rdv.sit.gouter', kind: 'entraide', answer: 'partager', traps: ['ignorer', 'se-moquer', 'rire'] },
  { id: 'rdv.sit.comprend', kind: 'entraide', answer: 'expliquer', traps: ['se-moquer', 'ignorer', 'rire'] },
  { id: 'rdv.sit.rangement', kind: 'entraide', answer: 'ensemble', traps: ['ignorer', 'se-moquer', 'rire'] },
]

export const SITUATIONS_BY_ID: ReadonlyMap<string, Situation> = new Map(
  SITUATIONS.map((s) => [s.id, s]),
)

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Tuner à 2 crans (0 = nombre de pièges nominal du palier, 1 = +1 piège). */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'emc.cp.regles',
  'emc.cp.regles',
  'emc.cp.entraide',
  'emc.cp.entraide',
] as const

/** Famille thématique d'un palier : T0/T1 = règles de vie, T2/T3 = entraide. */
export function kindForTier(tier: TierId): Kind {
  return tier <= 1 ? 'regle' : 'entraide'
}

/** Nombre de pièges (en plus de la bonne carte) au niveau 0 d'un palier. */
export function baseTrapsForTier(tier: TierId): number {
  // T0 : 1 piège ; T1 : 2 ; T2 : 2 ; T3 : 3.
  if (tier === 0) return 1
  if (tier === 1) return 2
  if (tier === 2) return 2
  return 3
}

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

/** Situations disponibles pour un palier (selon sa famille). */
export function situationsForTier(tier: TierId): readonly Situation[] {
  const kind = kindForTier(tier)
  return SITUATIONS.filter((s) => s.kind === kind)
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface VillageItem {
  kind: 'situation'
  tier: TierId
  /** Famille thématique (règle / entraide). */
  family: Kind
  /** id de clip/situation lue à l'enfant. */
  situationId: string
  /** La bonne attitude (toujours présente dans `choices`). */
  answer: string
  /** Cartes-gestes proposées (mélangées) : la bonne + des pièges. */
  choices: string[]
}

/**
 * Nombre EFFECTIF de pièges pour un palier + un niveau de Tuner.
 * = base du palier + le cran du Tuner, plafonné au stock de pièges de
 * la famille (l'entraide n'a que 3 pièges : T3 reste à 3, le +1 ne
 * peut pas dépasser le stock). Toujours ≥ 1.
 */
export function trapCount(tier: TierId, level: number): number {
  const wanted = baseTrapsForTier(tier) + clampLevel(level)
  const stock = TRAPS_BY_KIND[kindForTier(tier)].length
  return Math.max(1, Math.min(wanted, stock))
}

/** Tire une situation du palier, en évitant `avoid` quand une alternative existe. */
function pickSituation(tier: TierId, avoid?: string): Situation {
  const pool = situationsForTier(tier)
  const filtered = avoid === undefined ? pool : pool.filter((s) => s.id !== avoid)
  return pick(filtered.length > 0 ? filtered : pool)
}

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoid` évite de reproposer la même situation deux fois de suite.
 * Les pièges privilégiés de la situation passent d'abord, complétés
 * par le pool global de la même famille si besoin de plus de cartes.
 */
export function generateItem(tier: TierId, level: number, avoid?: string): VillageItem {
  const situation = pickSituation(tier, avoid)
  const family = situation.kind

  // Pièges candidats : ceux de la situation d'abord, puis le reste de la famille.
  const preferred = situation.traps.filter((id) => id !== situation.answer)
  const rest = TRAPS_BY_KIND[family].filter((id) => !preferred.includes(id))
  const trapPool = [...preferred, ...shuffle(rest)]

  // trapCount est déjà plafonné au stock de la famille ; second garde-fou
  // au cas où le pool serait plus court (ne devrait pas arriver).
  const n = Math.min(trapCount(tier, level), trapPool.length)
  const traps = trapPool.slice(0, n)

  const choices = shuffle([situation.answer, ...traps])
  return {
    kind: 'situation',
    tier,
    family,
    situationId: situation.id,
    answer: situation.answer,
    choices,
  }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** La carte tapée est-elle la bonne attitude pour cette situation ? */
export function isCorrect(item: VillageItem, gestureId: string): boolean {
  return gestureId === item.answer
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

export interface RdvProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: RdvProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: RdvProgress, tier: TierId, stars: 1 | 2 | 3): RdvProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
