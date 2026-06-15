// ============================================================
// Le Corps Humain — logique PURE.
// Mécanique unique « écoute, trouve la bonne carte » sur les 4
// paliers (tap-parmi-choix avec distracteurs INTELLIGENTS de même
// catégorie ; l'erreur COÛTE : l'item est compté raté au 1er essai,
// et la carte touchée se NOMME pour enseigner) :
//   • T0/T1 « les parties » : grille de cartes (emoji + libellé),
//     consigne « Montre la tête ! » — taper la bonne partie.
//     T0 = 4 cartes, T1 = 6 cartes.
//   • T2 « les sens » : 5 cartes-organes ; consigne « Avec quoi
//     est-ce qu'on voit/entend/sent/goûte/touche ? » — taper le bon
//     organe.
//   • T3 « l'hygiène » : une situation lue ; options = le bon geste
//     + 1 à 2 distracteurs (autre bon geste OU piège). Taper le bon
//     geste ; un piège touché s'explique gentiment.
//
// Aucun import React/DOM. Prouvé par logic.test.ts : chaque item
// généré est TOUJOURS résoluble (la bonne carte est présente + ≥1
// distracteur, aucune ambiguïté, et appliquer la bonne réponse
// résout l'item).
// ============================================================

import { pick, shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// Parties du corps (T0/T1) — clips corpus préfixe cor.partie.*
// ------------------------------------------------------------

export interface BodyPart {
  id: string
  /** Libellé avec article (« la tête », « le bras »…). */
  label: string
  emoji: string
}

export const BODY_PARTS: readonly BodyPart[] = [
  { id: 'tete', label: 'la tête', emoji: '👦' },
  { id: 'bras', label: 'le bras', emoji: '💪' },
  { id: 'jambe', label: 'la jambe', emoji: '🦵' },
  { id: 'main', label: 'la main', emoji: '✋' },
  { id: 'pied', label: 'le pied', emoji: '🦶' },
  { id: 'oeil', label: "l'œil", emoji: '👁️' },
  { id: 'oreille', label: "l'oreille", emoji: '👂' },
  { id: 'nez', label: 'le nez', emoji: '👃' },
  { id: 'bouche', label: 'la bouche', emoji: '👄' },
  { id: 'dent', label: 'la dent', emoji: '🦷' },
]

export const BODY_PARTS_BY_ID: ReadonlyMap<string, BodyPart> = new Map(
  BODY_PARTS.map((p) => [p.id, p]),
)

// ------------------------------------------------------------
// Les 5 sens (T2) — un sens, son organe. Clips préfixe cor.sens.*
// ------------------------------------------------------------

export interface Sense {
  id: string
  /** Le sens nommé (« la vue », « l'ouïe »…). */
  label: string
  /** Verbe de la consigne (« voit », « entend »…). */
  verb: string
  /** Organe associé (toujours présent dans BODY_PARTS… ou langue). */
  organId: string
  organLabel: string
  organEmoji: string
}

export const SENSES: readonly Sense[] = [
  { id: 'vue', label: 'la vue', verb: 'voit', organId: 'oeil', organLabel: "l'œil", organEmoji: '👁️' },
  {
    id: 'ouie',
    label: "l'ouïe",
    verb: 'entend',
    organId: 'oreille',
    organLabel: "l'oreille",
    organEmoji: '👂',
  },
  { id: 'odorat', label: "l'odorat", verb: 'sent', organId: 'nez', organLabel: 'le nez', organEmoji: '👃' },
  { id: 'gout', label: 'le goût', verb: 'goûte', organId: 'langue', organLabel: 'la langue', organEmoji: '👅' },
  {
    id: 'toucher',
    label: 'le toucher',
    verb: 'touche',
    organId: 'main',
    organLabel: 'la main',
    organEmoji: '✋',
  },
]

export const SENSES_BY_ID: ReadonlyMap<string, Sense> = new Map(SENSES.map((s) => [s.id, s]))
export const SENSE_BY_ORGAN: ReadonlyMap<string, Sense> = new Map(
  SENSES.map((s) => [s.organId, s]),
)

/** Une carte-organe affichée au palier des sens. */
export interface Organ {
  id: string
  label: string
  emoji: string
}

export const SENSE_ORGANS: readonly Organ[] = SENSES.map((s) => ({
  id: s.organId,
  label: s.organLabel,
  emoji: s.organEmoji,
}))

export const ORGANS_BY_ID: ReadonlyMap<string, Organ> = new Map(SENSE_ORGANS.map((o) => [o.id, o]))

// ------------------------------------------------------------
// Hygiène / santé (T3) — une situation, un bon geste, des pièges.
// Clips préfixe cor.geste.* (gestes) et cor.situation.* (situations).
// ------------------------------------------------------------

export interface Habit {
  id: string
  label: string
  emoji: string
  /** Geste sain (true) ou piège (false). */
  good: boolean
}

export const HABITS: readonly Habit[] = [
  // Bons gestes
  { id: 'mains', label: 'Se laver les mains', emoji: '🧼', good: true },
  { id: 'dents', label: 'Se brosser les dents', emoji: '🪥', good: true },
  { id: 'dormir', label: 'Bien dormir', emoji: '😴', good: true },
  { id: 'legumes', label: 'Manger des légumes', emoji: '🥦', good: true },
  { id: 'laver', label: 'Se laver', emoji: '🛁', good: true },
  { id: 'bouger', label: 'Bouger', emoji: '🤸', good: true },
  // Pièges
  { id: 'bonbons', label: 'Trop de bonbons', emoji: '🍬', good: false },
  { id: 'ecran', label: "Rester devant l'écran", emoji: '📺', good: false },
  { id: 'tard', label: 'Se coucher très tard', emoji: '🌙', good: false },
]

export const HABITS_BY_ID: ReadonlyMap<string, Habit> = new Map(HABITS.map((h) => [h.id, h]))

const GOOD_HABITS: readonly string[] = HABITS.filter((h) => h.good).map((h) => h.id)
const BAD_HABITS: readonly string[] = HABITS.filter((h) => !h.good).map((h) => h.id)

/**
 * Situations d'hygiène : chacune a UN bon geste attendu et des
 * pièges plausibles. Les distracteurs « autre bon geste » sont
 * choisis dynamiquement parmi les bons gestes ≠ du bon geste.
 */
export interface Situation {
  /** id de clip corpus (préfixe cor.situation.*). */
  id: string
  /** Geste sain attendu pour cette situation. */
  answerId: string
  /** Pièges particulièrement plausibles pour cette situation. */
  trapIds: string[]
}

export const SITUATIONS: readonly Situation[] = [
  { id: 'avant-manger', answerId: 'mains', trapIds: ['bonbons'] },
  { id: 'belles-dents', answerId: 'dents', trapIds: ['bonbons'] },
  { id: 'en-forme', answerId: 'dormir', trapIds: ['tard', 'ecran'] },
  { id: 'bien-grandir', answerId: 'legumes', trapIds: ['bonbons'] },
  { id: 'propre', answerId: 'laver', trapIds: ['ecran'] },
  { id: 'energie', answerId: 'bouger', trapIds: ['ecran', 'tard'] },
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
/** Tuner à 2 crans (0 = moins de distracteurs, 1 = plus). */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'mo.gs.corps.parties',
  'mo.gs.corps.parties',
  'mo.cp.corps.sens',
  'mo.cp.corps.hygiene',
] as const

/** Mode de jeu d'un palier. */
export function modeForTier(tier: TierId): 'part' | 'sense' | 'habit' {
  if (tier <= 1) return 'part'
  return tier === 2 ? 'sense' : 'habit'
}

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface PartItem {
  kind: 'part'
  tier: TierId
  /** Partie du corps à trouver. */
  targetId: string
  /** Cartes affichées (cible + distracteurs), mélangées. */
  choices: string[]
}

export interface SenseItem {
  kind: 'sense'
  tier: TierId
  /** Sens demandé par la consigne. */
  senseId: string
  /** Organe à taper (la bonne réponse). */
  targetOrganId: string
  /** Organes affichés (les 5 organes), mélangés. */
  choices: string[]
}

export interface HabitItem {
  kind: 'habit'
  tier: TierId
  /** Situation lue. */
  situationId: string
  /** Bon geste attendu. */
  answerId: string
  /** Gestes affichés (le bon + 1 à 2 distracteurs), mélangés. */
  choices: string[]
}

export type CorpsItem = PartItem | SenseItem | HabitItem

// ------------------------------------------------------------
// Génération procédurale
// ------------------------------------------------------------

/** Nombre de cartes affichées au palier des parties (T0 = 4, T1 = 6). */
export function partCardCount(tier: TierId): number {
  return tier === 0 ? 4 : 6
}

/** Tire une partie cible, en évitant `avoid` quand une alternative existe. */
function pickPart(avoid?: string): BodyPart {
  const pool = avoid === undefined ? BODY_PARTS : BODY_PARTS.filter((p) => p.id !== avoid)
  return pick(pool.length > 0 ? pool : BODY_PARTS)
}

/**
 * T0/T1 — une partie du corps à trouver ; renvoie la cible + des
 * distracteurs (autres parties, sans doublon). Toujours résoluble :
 * la cible figure dans `choices` et il y a ≥1 distracteur.
 */
export function generatePartItem(tier: TierId, _level: number, avoid?: string): PartItem {
  void _level
  const target = pickPart(avoid)
  const count = Math.min(partCardCount(tier), BODY_PARTS.length)
  const distractors = shuffle(BODY_PARTS.filter((p) => p.id !== target.id))
    .slice(0, count - 1)
    .map((p) => p.id)
  const choices = shuffle([target.id, ...distractors])
  return { kind: 'part', tier, targetId: target.id, choices }
}

/** Tire un sens cible, en évitant `avoid` quand une alternative existe. */
function pickSense(avoid?: string): Sense {
  const pool = avoid === undefined ? SENSES : SENSES.filter((s) => s.id !== avoid)
  return pick(pool.length > 0 ? pool : SENSES)
}

/**
 * T2 — un sens demandé ; l'enfant tape l'organe associé. Les 5
 * organes sont proposés (le bon en fait toujours partie).
 */
export function generateSenseItem(_level: number, avoid?: string): SenseItem {
  void _level
  const sense = pickSense(avoid)
  const choices = shuffle(SENSE_ORGANS.map((o) => o.id))
  return { kind: 'sense', tier: 2, senseId: sense.id, targetOrganId: sense.organId, choices }
}

/** Tire une situation, en évitant `avoid` quand une alternative existe. */
function pickSituation(avoid?: string): Situation {
  const pool = avoid === undefined ? SITUATIONS : SITUATIONS.filter((s) => s.id !== avoid)
  return pick(pool.length > 0 ? pool : SITUATIONS)
}

/**
 * T3 — une situation d'hygiène ; l'enfant tape le bon geste parmi le
 * bon geste + 1 à 2 distracteurs. Niveau 0 = 1 distracteur (un piège
 * de la situation, sinon un autre bon geste). Niveau 1 = 2 distracteurs
 * (les pièges de la situation puis un autre bon geste si besoin).
 * Toujours résoluble : le bon geste figure dans `choices` et il y a
 * ≥1 distracteur de même nature (un geste).
 */
export function generateHabitItem(level: number, avoid?: string): HabitItem {
  const situation = pickSituation(avoid)
  const wantDistractors = clampLevel(level) === 0 ? 1 : 2

  // Distracteurs : d'abord les pièges propres à la situation, puis on
  // complète avec d'autres bons gestes (≠ réponse) pour atteindre le
  // nombre voulu. Tout reste un « geste » de la même catégorie.
  const traps = shuffle(situation.trapIds)
  const otherGoods = shuffle(GOOD_HABITS.filter((id) => id !== situation.answerId))
  const otherTraps = shuffle(BAD_HABITS.filter((id) => !situation.trapIds.includes(id)))
  const pool = [...traps, ...otherGoods, ...otherTraps]

  const distractors: string[] = []
  for (const id of pool) {
    if (distractors.length >= wantDistractors) break
    if (id !== situation.answerId && !distractors.includes(id)) distractors.push(id)
  }

  const choices = shuffle([situation.answerId, ...distractors])
  return { kind: 'habit', tier: 3, situationId: situation.id, answerId: situation.answerId, choices }
}

/** Façade unifiée (parité avec cantine-foret / jardin-emotions). */
export function generateItem(tier: TierId, level: number, avoid?: string): CorpsItem {
  const mode = modeForTier(tier)
  if (mode === 'part') return generatePartItem(tier, level, avoid)
  if (mode === 'sense') return generateSenseItem(level, avoid)
  return generateHabitItem(level, avoid)
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** La carte-partie tapée est-elle la bonne ? */
export function partCorrect(item: PartItem, partId: string): boolean {
  return partId === item.targetId
}

/** L'organe tapé est-il celui du sens demandé ? */
export function senseCorrect(item: SenseItem, organId: string): boolean {
  return organId === item.targetOrganId
}

/** Le geste tapé est-il le bon pour cette situation ? */
export function habitCorrect(item: HabitItem, habitId: string): boolean {
  return habitId === item.answerId
}

/** Le geste tapé est-il un piège (geste non sain) ? */
export function isTrapHabit(habitId: string): boolean {
  return HABITS_BY_ID.get(habitId)?.good === false
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

export interface CorpsProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: CorpsProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: CorpsProgress, tier: TierId, stars: 1 | 2 | 3): CorpsProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
