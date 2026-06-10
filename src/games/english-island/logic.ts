// ============================================================
// English Island — logique PURE.
// Compréhension orale de l'anglais : imagier (lexique fixe),
// tirages sans répétition, distracteurs jamais ambigus,
// chaînes « Simon says » et validateur de séquence.
// Aucun import React/DOM/engine. Prouvé par logic.test.ts.
// ============================================================

export type ThemeId = 'colours' | 'numbers' | 'animals'
/** 0 = imagier, 1 = ballons couleurs, 2 = ballons nombres, 3 = animaux, 4 = Simon. */
export type TierId = 0 | 1 | 2 | 3 | 4

export interface Word {
  id: string
  /** Mot anglais affiché (l'imagier montre le mot écrit). */
  word: string
  emoji: string
}

export interface ColourWord extends Word {
  /** Couleur CSS du ballon. */
  hex: string
}

export interface NumberWord extends Word {
  value: number
}

// ------------------------------------------------------------
// Lexique fixe (c'est un imagier) — clips corpus préfixe eng.
// ------------------------------------------------------------

export const COLOURS: readonly ColourWord[] = [
  { id: 'red', word: 'Red', emoji: '🔴', hex: '#e53935' },
  { id: 'blue', word: 'Blue', emoji: '🔵', hex: '#1e88e5' },
  { id: 'green', word: 'Green', emoji: '🟢', hex: '#43a047' },
  { id: 'yellow', word: 'Yellow', emoji: '🟡', hex: '#fbc02d' },
  { id: 'orange', word: 'Orange', emoji: '🟠', hex: '#fb8c00' },
  { id: 'purple', word: 'Purple', emoji: '🟣', hex: '#8e24aa' },
  { id: 'pink', word: 'Pink', emoji: '🩷', hex: '#ec407a' },
  { id: 'black', word: 'Black', emoji: '⚫', hex: '#263238' },
]

export const NUMBERS: readonly NumberWord[] = [
  { id: '1', word: 'One', emoji: '1️⃣', value: 1 },
  { id: '2', word: 'Two', emoji: '2️⃣', value: 2 },
  { id: '3', word: 'Three', emoji: '3️⃣', value: 3 },
  { id: '4', word: 'Four', emoji: '4️⃣', value: 4 },
  { id: '5', word: 'Five', emoji: '5️⃣', value: 5 },
  { id: '6', word: 'Six', emoji: '6️⃣', value: 6 },
  { id: '7', word: 'Seven', emoji: '7️⃣', value: 7 },
  { id: '8', word: 'Eight', emoji: '8️⃣', value: 8 },
  { id: '9', word: 'Nine', emoji: '9️⃣', value: 9 },
  { id: '10', word: 'Ten', emoji: '🔟', value: 10 },
]

export const ANIMALS: readonly Word[] = [
  { id: 'cat', word: 'Cat', emoji: '🐱' },
  { id: 'dog', word: 'Dog', emoji: '🐶' },
  { id: 'monkey', word: 'Monkey', emoji: '🐵' },
  { id: 'bird', word: 'Bird', emoji: '🐦' },
  { id: 'fish', word: 'Fish', emoji: '🐟' },
  { id: 'rabbit', word: 'Rabbit', emoji: '🐰' },
  { id: 'horse', word: 'Horse', emoji: '🐴' },
  { id: 'cow', word: 'Cow', emoji: '🐮' },
  { id: 'pig', word: 'Pig', emoji: '🐷' },
  { id: 'duck', word: 'Duck', emoji: '🦆' },
]

export const ACTIONS: readonly Word[] = [
  { id: 'jump', word: 'Jump', emoji: '🦘' },
  { id: 'clap', word: 'Clap', emoji: '👏' },
  { id: 'sleep', word: 'Sleep', emoji: '😴' },
  { id: 'dance', word: 'Dance', emoji: '💃' },
  { id: 'eat', word: 'Eat', emoji: '🍽️' },
  { id: 'wave', word: 'Wave', emoji: '👋' },
]

/** La carte-piège du vrai Jacques a dit : on ne bouge pas ! */
export const DONT_MOVE: Word = { id: 'dont-move', word: "Don't move!", emoji: '🙅' }

export function themeWords(theme: ThemeId): readonly Word[] {
  if (theme === 'colours') return COLOURS
  if (theme === 'numbers') return NUMBERS
  return ANIMALS
}

/** Id du clip anglais (voix sonia) d'un mot de l'imagier. */
export function wordClip(theme: ThemeId, id: string): string {
  return theme === 'numbers' ? `eng.num.${id}` : `eng.mot.${id}`
}

/** Id du clip anglais d'une carte-action (Simon Says). */
export function actionClip(id: string): string {
  return id === DONT_MOVE.id ? 'eng.dontmove' : `eng.mot.${id}`
}

// ------------------------------------------------------------
// Paliers (modes), skills, structure d'une partie
// ------------------------------------------------------------

export const TIER_COUNT = 5
export const ITEMS_PER_RUN = 8
/** Tuner des modes tap : 0..2 → 4 à 6 cibles à l'écran. */
export const MAX_TAP_LEVEL = 2
/** Tuner de Simon : longueur de la chaîne, 1 à 4 actions. */
export const MIN_CHAIN = 1
export const MAX_CHAIN = 4
export const SIMON_PROB = 0.7

/** Compétence travaillée par palier (le palier 0, l'imagier, n'est pas noté). */
export const TIER_SKILLS = [
  '',
  'en.cp.colours',
  'en.cp.numbers',
  'en.cp.animals',
  'en.cp.consignes',
] as const

/** Thème d'imagier requis pour jouer chaque palier (null : pas de prérequis). */
export const TIER_THEMES: readonly (ThemeId | null)[] = [
  null,
  'colours',
  'numbers',
  'animals',
  null,
]

// ------------------------------------------------------------
// Aléa local (logique pure : zéro import engine), rng injectable
// ------------------------------------------------------------

export type Rng = () => number

function pickWith<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]
}

function shuffleWith<T>(arr: readonly T[], rng: Rng): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ------------------------------------------------------------
// Distracteurs — couleurs proches JAMAIS ensemble à l'écran
// ------------------------------------------------------------

/** Paires de couleurs visuellement confusables (relation symétrique). */
export const CONFUSABLE: Readonly<Record<string, readonly string[]>> = {
  red: ['orange', 'pink'],
  orange: ['red', 'yellow'],
  yellow: ['orange'],
  pink: ['red', 'purple'],
  purple: ['pink', 'blue'],
  blue: ['purple'],
  green: [],
  black: [],
}

/** Nombre de cibles à l'écran pour un niveau de Tuner (4, 5 ou 6). */
export function optionCountFor(level: number): number {
  return 4 + Math.max(0, Math.min(MAX_TAP_LEVEL, Math.floor(level)))
}

// ------------------------------------------------------------
// Rounds — modes tap (ballons, animaux)
// ------------------------------------------------------------

export interface TapRound {
  kind: 'tap'
  tier: 1 | 2 | 3
  theme: ThemeId
  targetId: string
  /** Ids affichés à l'écran (cible incluse), déjà mélangés. */
  optionIds: string[]
}

/**
 * Génère un round tap : cible jamais dans `avoid` (sauf pool épuisé),
 * distracteurs uniques, et pour les couleurs aucun distracteur
 * confusable avec la cible (l'écran n'est jamais ambigu).
 */
export function generateTapRound(
  tier: 1 | 2 | 3,
  level: number,
  avoid: readonly string[] = [],
  rng: Rng = Math.random,
): TapRound {
  const theme = TIER_THEMES[tier] as ThemeId
  const pool = themeWords(theme).map((w) => w.id)
  const avoidSet = new Set(avoid)
  const fresh = pool.filter((id) => !avoidSet.has(id))
  const targetId = pickWith(fresh.length > 0 ? fresh : pool, rng)

  const banned = new Set(theme === 'colours' ? (CONFUSABLE[targetId] ?? []) : [])
  const candidates = pool.filter((id) => id !== targetId && !banned.has(id))
  const count = Math.min(optionCountFor(level), candidates.length + 1)
  const distractors = shuffleWith(candidates, rng).slice(0, count - 1)
  return {
    kind: 'tap',
    tier,
    theme,
    targetId,
    optionIds: shuffleWith([targetId, ...distractors], rng),
  }
}

// ------------------------------------------------------------
// Placement procédural des ballons / animaux
// ------------------------------------------------------------

export interface Slot {
  /** Position en % du conteneur. */
  left: number
  top: number
  /** Décalage et durée d'animation flottante, en secondes. */
  delay: number
  dur: number
}

const BASE_SLOTS: ReadonlyArray<{ left: number; top: number }> = [
  { left: 6, top: 6 },
  { left: 38, top: 2 },
  { left: 68, top: 8 },
  { left: 8, top: 38 },
  { left: 42, top: 34 },
  { left: 72, top: 40 },
  { left: 24, top: 62 },
  { left: 56, top: 60 },
]

export const MAX_SLOTS = BASE_SLOTS.length

/** Tire `count` emplacements distincts, avec un léger jitter procédural. */
export function layoutSlots(count: number, rng: Rng = Math.random): Slot[] {
  const n = Math.max(0, Math.min(MAX_SLOTS, Math.floor(count)))
  return shuffleWith(BASE_SLOTS, rng)
    .slice(0, n)
    .map((s) => ({
      left: s.left + rng() * 8 - 4,
      top: s.top + rng() * 6 - 3,
      delay: rng() * 1.6,
      dur: 3 + rng() * 1.5,
    }))
}

// ------------------------------------------------------------
// Simon Says — chaînes aléatoires + validateur de séquence
// ------------------------------------------------------------

export interface SimonChain {
  /** Actions énoncées, dans l'ordre (sans répétition). */
  actions: string[]
  /** La consigne commence-t-elle par « Simon says » ? */
  simonSays: boolean
}

export interface SimonRound {
  kind: 'simon'
  chain: SimonChain
  /** Séquence de cartes à taper, dans l'ordre. */
  expected: string[]
}

/** Longueur de chaîne pour un niveau de Tuner, bornée à 1..4. */
export function chainLengthFor(level: number): number {
  return Math.max(MIN_CHAIN, Math.min(MAX_CHAIN, Math.floor(level)))
}

/** Chaîne aléatoire : actions sans répétition, « Simon says » à 70 %. */
export function generateSimonChain(length: number, rng: Rng = Math.random): SimonChain {
  const n = Math.max(MIN_CHAIN, Math.min(ACTIONS.length, Math.floor(length)))
  return {
    actions: shuffleWith(
      ACTIONS.map((a) => a.id),
      rng,
    ).slice(0, n),
    simonSays: rng() < SIMON_PROB,
  }
}

/** Ce qu'il faut taper : la chaîne… ou « Don't move! » si pas de Simon says. */
export function expectedTaps(chain: SimonChain): string[] {
  return chain.simonSays ? [...chain.actions] : [DONT_MOVE.id]
}

export function generateSimonRound(level: number, rng: Rng = Math.random): SimonRound {
  const chain = generateSimonChain(chainLengthFor(level), rng)
  return { kind: 'simon', chain, expected: expectedTaps(chain) }
}

export type StepOutcome = 'progress' | 'complete' | 'wrong'

/** Valide le tap n° `index` d'une séquence (production, pas de QCM). */
export function stepOutcome(
  expected: readonly string[],
  index: number,
  tappedId: string,
): StepOutcome {
  if (index < 0 || index >= expected.length || expected[index] !== tappedId) return 'wrong'
  return index === expected.length - 1 ? 'complete' : 'progress'
}

export type Round = TapRound | SimonRound

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

export interface EngProgress {
  /** Thèmes de l'imagier entièrement écoutés (débloquent les quiz). */
  explored: Partial<Record<ThemeId, boolean>>
  /** Mots déjà écoutés dans l'imagier, par thème. */
  listened: Partial<Record<ThemeId, string[]>>
  bestStars: Record<number, 0 | 1 | 2 | 3>
  /** Plus haut palier débloqué par les étoiles (l'imagier 0 est toujours ouvert). */
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: EngProgress = {
  explored: {},
  listened: {},
  bestStars: {},
  unlockedTier: 1,
  runs: 0,
}

/** Écoute d'un mot dans l'imagier ; marque le thème exploré quand tout est écouté. */
export function recordListen(p: EngProgress, theme: ThemeId, wordId: string): EngProgress {
  const ids = themeWords(theme).map((w) => w.id)
  if (!ids.includes(wordId)) return p
  const prev = p.listened[theme] ?? []
  const next = prev.includes(wordId) ? prev : [...prev, wordId]
  const explored = ids.every((id) => next.includes(id))
  return {
    ...p,
    listened: { ...p.listened, [theme]: next },
    explored: explored ? { ...p.explored, [theme]: true } : p.explored,
  }
}

export function isThemeExplored(p: EngProgress, theme: ThemeId): boolean {
  return p.explored[theme] === true
}

/** Pourquoi un palier est verrouillé (null : jouable). */
export function lockReason(p: EngProgress, tier: TierId): 'stars' | 'explore' | null {
  if (tier === 0) return null
  if (tier > p.unlockedTier) return 'stars'
  const theme = TIER_THEMES[tier]
  if (theme !== null && !isThemeExplored(p, theme)) return 'explore'
  return null
}

export function tierPlayable(p: EngProgress, tier: TierId): boolean {
  return lockReason(p, tier) === null
}

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: EngProgress, tier: 1 | 2 | 3 | 4, stars: 1 | 2 | 3): EngProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    ...p,
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
