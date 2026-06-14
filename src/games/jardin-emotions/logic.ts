// ============================================================
// Le Jardin des Émotions — logique PURE (EMC, la sensibilité).
// Aucun import React/DOM. Trois mécaniques de PRODUCTION :
//  • T0/T1 « Reconnais l'émotion » : un visage exprime une émotion ;
//    l'enfant attrape la GRAINE de la bonne émotion parmi un
//    nuancier (cible + distracteurs). Une fleur pousse.
//  • T2 « La météo du cœur » : une mini-histoire est lue ; l'enfant
//    tape l'émotion ressentie par le personnage.
//  • T3 « Le chemin du calme » : un conflit/émotion forte est lu ;
//    l'enfant CONSTRUIT une réaction apaisée en posant dans l'ordre
//    les bonnes tuiles-actions, en évitant les tuiles-pièges.
//
// Garanti résoluble (prouvé par logic.test.ts) : chaque visage a
// une cible + au moins un distracteur, chaque histoire pointe vers
// une émotion connue, chaque scénario a ≥2 bonnes actions et ≥1
// piège disponibles. Contenu bienveillant, jamais culpabilisant.
// ============================================================

import { pick, shuffle } from '@/engine/rng'

// ------------------------------------------------------------
// Les 5 émotions de base (programme EMC : la sensibilité).
// ------------------------------------------------------------

export type EmotionId = 'joie' | 'tristesse' | 'colere' | 'peur' | 'surprise'

export interface Emotion {
  id: EmotionId
  label: string
  emoji: string
  /** Couleur d'encre associée (CSS hex), pour l'habillage visuel. */
  ink: string
}

export const EMOTIONS: readonly Emotion[] = [
  { id: 'joie', label: 'la joie', emoji: '😊', ink: '#f6c244' },
  { id: 'tristesse', label: 'la tristesse', emoji: '😢', ink: '#5b9bd5' },
  { id: 'colere', label: 'la colère', emoji: '😠', ink: '#e2603b' },
  { id: 'peur', label: 'la peur', emoji: '😨', ink: '#8a6fc0' },
  { id: 'surprise', label: 'la surprise', emoji: '😮', ink: '#3fae8e' },
]

export const EMOTIONS_BY_ID: ReadonlyMap<EmotionId, Emotion> = new Map(
  EMOTIONS.map((e) => [e.id, e]),
)

export function isEmotionId(id: string): id is EmotionId {
  return EMOTIONS_BY_ID.has(id as EmotionId)
}

// ------------------------------------------------------------
// Histoires (T2) : un texte (via clip) + l'émotion ressentie.
// Chaque émotion est couverte au moins deux fois.
// ------------------------------------------------------------

export interface Story {
  /** id de clip corpus (préfixe jde.story.*) ; aussi clé d'affichage. */
  id: string
  emotion: EmotionId
}

export const STORIES: readonly Story[] = [
  // joie
  { id: 'jde.story.cadeau', emotion: 'joie' },
  { id: 'jde.story.gateau', emotion: 'joie' },
  { id: 'jde.story.copain', emotion: 'joie' },
  // tristesse
  { id: 'jde.story.doudou', emotion: 'tristesse' },
  { id: 'jde.story.ballon', emotion: 'tristesse' },
  { id: 'jde.story.depart', emotion: 'tristesse' },
  // colère
  { id: 'jde.story.jouet', emotion: 'colere' },
  { id: 'jde.story.tour', emotion: 'colere' },
  { id: 'jde.story.dessin', emotion: 'colere' },
  // peur
  { id: 'jde.story.chien', emotion: 'peur' },
  { id: 'jde.story.orage', emotion: 'peur' },
  { id: 'jde.story.noir', emotion: 'peur' },
  // surprise
  { id: 'jde.story.anniv', emotion: 'surprise' },
  { id: 'jde.story.cachette', emotion: 'surprise' },
  { id: 'jde.story.arcenciel', emotion: 'surprise' },
]

// ------------------------------------------------------------
// Scénarios (T3) : un conflit/émotion forte lu, des actions
// apaisées à poser (good) et des pièges à éviter (bad).
// ------------------------------------------------------------

export type ActionId =
  | 'respire'
  | 'dire-ressenti'
  | 'demander'
  | 'attendre'
  | 'aide'
  | 'crier'
  | 'frapper'
  | 'casser'

export interface CalmAction {
  id: ActionId
  label: string
  emoji: string
  good: boolean
}

export const ACTIONS: readonly CalmAction[] = [
  { id: 'respire', label: 'Je respire', emoji: '🌬️', good: true },
  { id: 'dire-ressenti', label: 'Je dis ce que je ressens', emoji: '💬', good: true },
  { id: 'demander', label: 'Je demande gentiment', emoji: '🙏', good: true },
  { id: 'attendre', label: "J'attends mon tour", emoji: '⏳', good: true },
  { id: 'aide', label: "Je demande de l'aide", emoji: '🤝', good: true },
  { id: 'crier', label: 'Je crie', emoji: '📢', good: false },
  { id: 'frapper', label: 'Je frappe', emoji: '👊', good: false },
  { id: 'casser', label: 'Je casse tout', emoji: '💥', good: false },
]

export const ACTIONS_BY_ID: ReadonlyMap<ActionId, CalmAction> = new Map(
  ACTIONS.map((a) => [a.id, a]),
)

const BAD_ACTIONS: readonly ActionId[] = ACTIONS.filter((a) => !a.good).map((a) => a.id)

export interface Scenario {
  /** id de clip corpus (préfixe jde.scene.*). */
  id: string
  /** Actions apaisées attendues pour ce scénario (sous-ensemble des bonnes). */
  goodActions: ActionId[]
  /** Pièges plausibles pour ce scénario (sous-ensemble des mauvaises). */
  badActions: ActionId[]
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'jde.scene.jouet',
    goodActions: ['respire', 'dire-ressenti', 'demander'],
    badActions: ['crier', 'frapper'],
  },
  {
    id: 'jde.scene.file',
    goodActions: ['respire', 'attendre'],
    badActions: ['crier', 'frapper'],
  },
  {
    id: 'jde.scene.tour-cassee',
    goodActions: ['respire', 'dire-ressenti'],
    badActions: ['frapper', 'casser'],
  },
  {
    id: 'jde.scene.dispute',
    goodActions: ['respire', 'dire-ressenti', 'aide'],
    badActions: ['crier', 'casser'],
  },
  {
    id: 'jde.scene.crayon',
    goodActions: ['demander', 'attendre'],
    badActions: ['frapper', 'crier'],
  },
  {
    id: 'jde.scene.bousculade',
    goodActions: ['respire', 'dire-ressenti', 'demander'],
    badActions: ['frapper', 'casser'],
  },
]

// ------------------------------------------------------------
// Paliers
// ------------------------------------------------------------

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Tuner à 2 crans (0 = plus simple, 1 = plus de distracteurs/tuiles). */
export const MAX_TUNER_LEVEL = 1

/** Compétence travaillée par palier (doit refléter games.manifest, dédupliqué). */
export const TIER_SKILLS = [
  'emc.gs.emotions.nommer',
  'emc.gs.emotions.nommer',
  'emc.cp.emotions.reconnaitre',
  'emc.cp.conflit.reguler',
] as const

/** T0/T1 = reconnaître un visage ; T2 = météo du cœur ; T3 = chemin du calme. */
export function modeForTier(tier: TierId): 'face' | 'story' | 'calm' {
  if (tier <= 1) return 'face'
  return tier === 2 ? 'story' : 'calm'
}

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) === 0 ? 0 : 1
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface FaceItem {
  kind: 'face'
  tier: TierId
  /** Émotion exprimée par le visage (la bonne graine). */
  target: EmotionId
  /** Graines proposées (mélangées) : la cible + des distracteurs. */
  choices: EmotionId[]
  /** En T0 on affiche aussi le mot pour aider le non-lecteur. */
  withWord: boolean
}

export interface StoryItem {
  kind: 'story'
  tier: TierId
  storyId: string
  /** Émotion ressentie par le personnage (la bonne réponse). */
  target: EmotionId
  /** Graines-émotions proposées (les 5 émotions, mélangées). */
  choices: EmotionId[]
}

export interface CalmItem {
  kind: 'calm'
  tier: TierId
  scenarioId: string
  /** Actions à poser pour réussir (toutes bonnes). */
  goodActions: ActionId[]
  /** Pièges présents sur le plateau. */
  badActions: ActionId[]
  /** Toutes les tuiles offertes (bonnes + pièges), mélangées. */
  tiles: ActionId[]
}

export type EmotionGameItem = FaceItem | StoryItem | CalmItem

// ------------------------------------------------------------
// Génération procédurale
// ------------------------------------------------------------

/** Nombre de graines proposées pour un visage selon palier/niveau. */
function faceChoiceCount(tier: TierId, level: number): number {
  if (tier === 0) return 3
  return clampLevel(level) === 0 ? 4 : 5
}

/** Tire une émotion cible, en évitant `avoid` quand une alternative existe. */
function pickEmotion(avoid?: EmotionId): Emotion {
  const pool = avoid === undefined ? EMOTIONS : EMOTIONS.filter((e) => e.id !== avoid)
  return pick(pool.length > 0 ? pool : EMOTIONS)
}

/**
 * T0/T1 — un visage exprime une émotion ; renvoie la cible + des
 * distracteurs (autres émotions, sans doublon). Toujours résoluble :
 * la cible figure dans `choices` et il y a ≥1 distracteur.
 */
export function generateFaceItem(tier: TierId, level: number, avoid?: EmotionId): FaceItem {
  const target = pickEmotion(avoid)
  const count = Math.min(faceChoiceCount(tier, level), EMOTIONS.length)
  const distractors = shuffle(EMOTIONS.filter((e) => e.id !== target.id))
    .slice(0, count - 1)
    .map((e) => e.id)
  const choices = shuffle([target.id, ...distractors])
  return { kind: 'face', tier, target: target.id, choices, withWord: tier === 0 }
}

/**
 * T2 — une histoire lue ; l'enfant tape l'émotion ressentie. Les 5
 * émotions sont proposées (la bonne en fait toujours partie).
 */
export function generateStoryItem(level: number, avoid?: string): StoryItem {
  void level
  const pool = avoid === undefined ? STORIES : STORIES.filter((s) => s.id !== avoid)
  const story = pick(pool.length > 0 ? pool : STORIES)
  const choices = shuffle(EMOTIONS.map((e) => e.id))
  return { kind: 'story', tier: 2, storyId: story.id, target: story.emotion, choices }
}

/**
 * T3 — un scénario de conflit ; l'enfant pose les bonnes actions et
 * évite les pièges. Le plateau contient toutes les bonnes actions du
 * scénario (≥2) et tous ses pièges (≥1), mélangés. Niveau 1 = on
 * ajoute un piège supplémentaire issu du pool global pour corser.
 */
export function generateCalmItem(level: number, avoid?: string): CalmItem {
  const pool = avoid === undefined ? SCENARIOS : SCENARIOS.filter((s) => s.id !== avoid)
  const scenario = pick(pool.length > 0 ? pool : SCENARIOS)
  const good = [...scenario.goodActions]
  const bad = [...scenario.badActions]
  if (clampLevel(level) === 1) {
    const extra = shuffle(BAD_ACTIONS.filter((id) => !bad.includes(id)))[0]
    if (extra !== undefined) bad.push(extra)
  }
  const tiles = shuffle([...good, ...bad])
  return { kind: 'calm', tier: 3, scenarioId: scenario.id, goodActions: good, badActions: bad, tiles }
}

/** Façade unifiée (parité avec cantine-foret). */
export function generateItem(tier: TierId, level: number, avoid?: string): EmotionGameItem {
  const mode = modeForTier(tier)
  if (mode === 'face') return generateFaceItem(tier, level, avoid as EmotionId | undefined)
  if (mode === 'story') return generateStoryItem(level, avoid)
  return generateCalmItem(level, avoid)
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** Le visage : la graine tapée est-elle la bonne émotion ? */
export function faceCorrect(item: FaceItem, emotionId: EmotionId): boolean {
  return emotionId === item.target
}

/** L'histoire : l'émotion tapée est-elle celle ressentie ? */
export function storyCorrect(item: StoryItem, emotionId: EmotionId): boolean {
  return emotionId === item.target
}

/** Une tuile posée est-elle un piège ? */
export function isBadAction(item: CalmItem, actionId: ActionId): boolean {
  return item.badActions.includes(actionId)
}

/**
 * Le chemin du calme est-il réussi ? Toutes les bonnes actions du
 * scénario doivent être posées ET aucune action-piège.
 */
export function calmComplete(item: CalmItem, placed: readonly ActionId[]): boolean {
  const set = new Set(placed)
  if (placed.some((id) => isBadAction(item, id))) return false
  return item.goodActions.every((id) => set.has(id))
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

export interface JdeProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: JdeProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: JdeProgress, tier: TierId, stars: 1 | 2 | 3): JdeProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
