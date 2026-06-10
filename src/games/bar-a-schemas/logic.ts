// ============================================================
// Le Bar à Schémas — logique PURE.
// Problèmes en barres (modèle de Singapour) : templates à
// personnages et objets FIXES (pour limiter les clips audio),
// nombres procéduraux pilotés par palier + Tuner, schémas
// typés, validation du placement et du calcul.
// Aucun import React/DOM. Prouvé par logic.test.ts :
// chaque item généré est TOUJOURS résoluble.
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'

export type TierId = 0 | 1 | 2 | 3

export type ProblemType =
  | 'parties-tout' // T0 : parties a et b connues → tout ? (a + b)
  | 'transfo-gain' // T1 : départ a, il en gagne b → arrivée ? (a + b)
  | 'transfo-perte' // T1 : départ a, il en perd b → arrivée ? (a − b)
  | 'partie-cachee' // T2 : tout a et partie b connus → partie cachée ? (a − b)
  | 'compare-diff' // T3 : a contre b → différence ? (a − b)
  | 'compare-plus' // T3 DISCORDANT : a, « b de plus que l'autre » → l'autre ? (a − b)
  | 'compare-moins' // T3 DISCORDANT : a, « b de moins que l'autre » → l'autre ? (a + b)

/** Fragment d'énoncé : un clip pré-généré, ou un nombre dit via nombre.<n>. */
export type Fragment = { clip: string } | { num: 'a' | 'b' | 'answer' }

export interface Template {
  id: string
  tier: TierId
  type: ProblemType
  /** L'histoire, lue dans l'ordre (clips + nombres). */
  fragments: readonly Fragment[]
  /** La question posée à l'enfant. */
  question: readonly Fragment[]
  /** La phrase-réponse de la phase RACONTER. */
  answer: readonly Fragment[]
  /** Personnage et objet fixes ; rival = 2ᵉ personnage des comparaisons. */
  emoji: { hero: string; object: string; rival?: string }
}

// ---------- Emplacements du schéma ----------

export type SlotRole =
  | 'whole' // le tout (grande barre du haut)
  | 'part1' // une partie (barre du bas)
  | 'part2' // l'autre partie (barre du bas)
  | 'start' // transformation : la barre « avant »
  | 'change' // transformation : le badge sur la flèche
  | 'end' // transformation : la barre « après »
  | 'heroBar' // comparaison : la barre du héros
  | 'rivalBar' // comparaison : la barre de l'autre personnage
  | 'diff' // comparaison : l'accolade « différence »

export interface SchemaSlot {
  role: SlotRole
  /** Valeur attendue dans cet emplacement, ou null pour l'inconnue « ? ». */
  value: number | null
  /** Les emplacements d'un même groupe acceptent leurs valeurs dans les deux ordres. */
  group?: 'parts'
}

export interface BscItem {
  tier: TierId
  template: Template
  /** Les deux nombres ENTENDUS dans l'énoncé. */
  a: number
  b: number
  /** La valeur de l'emplacement « ? ». */
  answer: number
  slots: readonly SchemaSlot[]
  /** Les tuiles proposées = exactement les nombres connus, mélangés. */
  tiles: readonly number[]
}

// ---------- Constantes de partie ----------

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'ma.cp.pb.partiestout',
  'ma.cp.pb.transfo',
  'ma.cp.pb.partie',
  'ma.cp.pb.compare',
] as const

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plages resserrées, 1 = plages élargies. */
export const MAX_TUNER_LEVEL = 1
/** Au-delà, le comptage du feedback n'est plus dit nombre par nombre. */
export const COUNT_ALOUD_MAX = 12

/** Plafond du « tout » par palier (spec pédagogique). */
export const TIER_TOTAL_CAP: Readonly<Record<TierId, number>> = { 0: 10, 1: 12, 2: 15, 3: 20 }

/** Types de problème autorisés par palier. */
export const TIER_TYPES: Readonly<Record<TierId, readonly ProblemType[]>> = {
  0: ['parties-tout'],
  1: ['transfo-gain', 'transfo-perte'],
  2: ['partie-cachee'],
  3: ['compare-diff', 'compare-plus', 'compare-moins'],
}

// ---------- Templates (personnages + objets fixes) ----------

const c = (clip: string): Fragment => ({ clip })
const n = (num: 'a' | 'b' | 'answer'): Fragment => ({ num })

export const TEMPLATES: readonly Template[] = [
  // ===== T0 — Réunir (parties-tout, cherche le tout) =====
  {
    id: 't0-billes',
    tier: 0,
    type: 'parties-tout',
    fragments: [c('bsc.t0-billes.s1'), n('a'), c('bsc.t0-billes.s2'), n('b'), c('bsc.t0-billes.s3')],
    question: [c('bsc.t0-billes.q')],
    answer: [c('bsc.t0-billes.r1'), n('answer'), c('bsc.t0-billes.r2')],
    emoji: { hero: '👦', object: '🔵' },
  },
  {
    id: 't0-fraises',
    tier: 0,
    type: 'parties-tout',
    fragments: [c('bsc.t0-fraises.s1'), n('a'), c('bsc.t0-fraises.s2'), n('b'), c('bsc.t0-fraises.s3')],
    question: [c('bsc.t0-fraises.q')],
    answer: [c('bsc.t0-fraises.r1'), n('answer'), c('bsc.t0-fraises.r2')],
    emoji: { hero: '👧', object: '🍓' },
  },
  {
    id: 't0-noisettes',
    tier: 0,
    type: 'parties-tout',
    fragments: [c('bsc.t0-noisettes.s1'), n('a'), c('bsc.t0-noisettes.s2'), n('b'), c('bsc.t0-noisettes.s3')],
    question: [c('bsc.t0-noisettes.q')],
    answer: [c('bsc.t0-noisettes.r1'), n('answer'), c('bsc.t0-noisettes.r2')],
    emoji: { hero: '🐿️', object: '🌰' },
  },
  {
    id: 't0-coquillages',
    tier: 0,
    type: 'parties-tout',
    fragments: [c('bsc.t0-coquillages.s1'), n('a'), c('bsc.t0-coquillages.s2'), n('b'), c('bsc.t0-coquillages.s3')],
    question: [c('bsc.t0-coquillages.q')],
    answer: [c('bsc.t0-coquillages.r1'), n('answer'), c('bsc.t0-coquillages.r2')],
    emoji: { hero: '👴', object: '🐚' },
  },
  {
    id: 't0-poissons',
    tier: 0,
    type: 'parties-tout',
    fragments: [c('bsc.t0-poissons.s1'), n('a'), c('bsc.t0-poissons.s2'), n('b'), c('bsc.t0-poissons.s3')],
    question: [c('bsc.t0-poissons.q')],
    answer: [c('bsc.t0-poissons.r1'), n('answer'), c('bsc.t0-poissons.r2')],
    emoji: { hero: '🦜', object: '🐟' },
  },

  // ===== T1 — Gagner ou perdre (transformation) =====
  {
    id: 't1-billes',
    tier: 1,
    type: 'transfo-gain',
    fragments: [c('bsc.t1-billes.s1'), n('a'), c('bsc.t1-billes.s2'), n('b')],
    question: [c('bsc.t1-billes.q')],
    answer: [c('bsc.t1-billes.r1'), n('answer'), c('bsc.t1-billes.r2')],
    emoji: { hero: '👦', object: '🔵' },
  },
  {
    id: 't1-autocollants',
    tier: 1,
    type: 'transfo-gain',
    fragments: [c('bsc.t1-autocollants.s1'), n('a'), c('bsc.t1-autocollants.s2'), n('b')],
    question: [c('bsc.t1-autocollants.q')],
    answer: [c('bsc.t1-autocollants.r1'), n('answer'), c('bsc.t1-autocollants.r2')],
    emoji: { hero: '👧', object: '⭐' },
  },
  {
    id: 't1-carottes',
    tier: 1,
    type: 'transfo-gain',
    fragments: [c('bsc.t1-carottes.s1'), n('a'), c('bsc.t1-carottes.s2'), n('b')],
    question: [c('bsc.t1-carottes.q')],
    answer: [c('bsc.t1-carottes.r1'), n('answer'), c('bsc.t1-carottes.r2')],
    emoji: { hero: '🐰', object: '🥕' },
  },
  {
    id: 't1-graines',
    tier: 1,
    type: 'transfo-perte',
    fragments: [c('bsc.t1-graines.s1'), n('a'), c('bsc.t1-graines.s2'), n('b')],
    question: [c('bsc.t1-graines.q')],
    answer: [c('bsc.t1-graines.r1'), n('answer'), c('bsc.t1-graines.r2')],
    emoji: { hero: '🦜', object: '🌻' },
  },
  {
    id: 't1-ballons',
    tier: 1,
    type: 'transfo-perte',
    fragments: [c('bsc.t1-ballons.s1'), n('a'), c('bsc.t1-ballons.s2'), n('b')],
    question: [c('bsc.t1-ballons.q')],
    answer: [c('bsc.t1-ballons.r1'), n('answer'), c('bsc.t1-ballons.r2')],
    emoji: { hero: '👴', object: '🎈' },
  },

  // ===== T2 — La partie cachée (recherche d'une partie) =====
  {
    id: 't2-billes',
    tier: 2,
    type: 'partie-cachee',
    fragments: [c('bsc.t2-billes.s1'), n('a'), c('bsc.t2-billes.s2'), n('b'), c('bsc.t2-billes.s3')],
    question: [c('bsc.t2-billes.q')],
    answer: [c('bsc.t2-billes.r1'), n('answer'), c('bsc.t2-billes.r2')],
    emoji: { hero: '👦', object: '🔵' },
  },
  {
    id: 't2-bonbons',
    tier: 2,
    type: 'partie-cachee',
    fragments: [c('bsc.t2-bonbons.s1'), n('a'), c('bsc.t2-bonbons.s2'), n('b'), c('bsc.t2-bonbons.s3')],
    question: [c('bsc.t2-bonbons.q')],
    answer: [c('bsc.t2-bonbons.r1'), n('answer'), c('bsc.t2-bonbons.r2')],
    emoji: { hero: '👧', object: '🍬' },
  },
  {
    id: 't2-fleurs',
    tier: 2,
    type: 'partie-cachee',
    fragments: [c('bsc.t2-fleurs.s1'), n('a'), c('bsc.t2-fleurs.s2'), n('b'), c('bsc.t2-fleurs.s3')],
    question: [c('bsc.t2-fleurs.q')],
    answer: [c('bsc.t2-fleurs.r1'), n('answer'), c('bsc.t2-fleurs.r2')],
    emoji: { hero: '👴', object: '🌼' },
  },
  {
    id: 't2-papillons',
    tier: 2,
    type: 'partie-cachee',
    fragments: [c('bsc.t2-papillons.s1'), n('a'), c('bsc.t2-papillons.s2'), n('b'), c('bsc.t2-papillons.s3')],
    question: [c('bsc.t2-papillons.q')],
    answer: [c('bsc.t2-papillons.r1'), n('answer'), c('bsc.t2-papillons.r2')],
    emoji: { hero: '🦜', object: '🦋' },
  },
  {
    id: 't2-noisettes',
    tier: 2,
    type: 'partie-cachee',
    fragments: [c('bsc.t2-noisettes.s1'), n('a'), c('bsc.t2-noisettes.s2'), n('b'), c('bsc.t2-noisettes.s3')],
    question: [c('bsc.t2-noisettes.q')],
    answer: [c('bsc.t2-noisettes.r1'), n('answer'), c('bsc.t2-noisettes.r2')],
    emoji: { hero: '🐿️', object: '🌰' },
  },

  // ===== T3 — Comparer (différence, avec énoncés discordants) =====
  {
    id: 't3-cerises',
    tier: 3,
    type: 'compare-diff',
    fragments: [c('bsc.t3-cerises.s1'), n('a'), c('bsc.t3-cerises.s2'), n('b')],
    question: [c('bsc.t3-cerises.q')],
    answer: [c('bsc.t3-cerises.r1'), n('answer'), c('bsc.t3-cerises.r2')],
    emoji: { hero: '👴', object: '🍒', rival: '🦜' },
  },
  {
    id: 't3-papillons',
    tier: 3,
    type: 'compare-diff',
    fragments: [c('bsc.t3-papillons.s1'), n('a'), c('bsc.t3-papillons.s2'), n('b')],
    question: [c('bsc.t3-papillons.q')],
    answer: [c('bsc.t3-papillons.r1'), n('answer'), c('bsc.t3-papillons.r2')],
    emoji: { hero: '👧', object: '🦋', rival: '👦' },
  },
  {
    id: 't3-coquillages',
    tier: 3,
    type: 'compare-plus',
    fragments: [c('bsc.t3-coquillages.s1'), n('a'), c('bsc.t3-coquillages.s2'), n('b'), c('bsc.t3-coquillages.s3')],
    question: [c('bsc.t3-coquillages.q')],
    answer: [c('bsc.t3-coquillages.r1'), n('answer'), c('bsc.t3-coquillages.r2')],
    emoji: { hero: '👦', object: '🐚', rival: '👧' },
  },
  {
    id: 't3-fraises',
    tier: 3,
    type: 'compare-plus',
    fragments: [c('bsc.t3-fraises.s1'), n('a'), c('bsc.t3-fraises.s2'), n('b'), c('bsc.t3-fraises.s3')],
    question: [c('bsc.t3-fraises.q')],
    answer: [c('bsc.t3-fraises.r1'), n('answer'), c('bsc.t3-fraises.r2')],
    emoji: { hero: '🐰', object: '🍓', rival: '🐢' },
  },
  {
    id: 't3-noisettes',
    tier: 3,
    type: 'compare-moins',
    fragments: [c('bsc.t3-noisettes.s1'), n('a'), c('bsc.t3-noisettes.s2'), n('b'), c('bsc.t3-noisettes.s3')],
    question: [c('bsc.t3-noisettes.q')],
    answer: [c('bsc.t3-noisettes.r1'), n('answer'), c('bsc.t3-noisettes.r2')],
    emoji: { hero: '🐿️', object: '🌰', rival: '🦜' },
  },
]

export const TEMPLATES_BY_TIER: Readonly<Record<TierId, readonly Template[]>> = {
  0: TEMPLATES.filter((t) => t.tier === 0),
  1: TEMPLATES.filter((t) => t.tier === 1),
  2: TEMPLATES.filter((t) => t.tier === 2),
  3: TEMPLATES.filter((t) => t.tier === 3),
}

// ------------------------------------------------------------
// Arithmétique des types de problème
// ------------------------------------------------------------

/** La valeur de l'inconnue « ? » selon le type. */
export function computeAnswer(type: ProblemType, a: number, b: number): number {
  switch (type) {
    case 'parties-tout':
    case 'transfo-gain':
    case 'compare-moins':
      return a + b
    case 'transfo-perte':
    case 'partie-cachee':
    case 'compare-diff':
    case 'compare-plus':
      return a - b
  }
}

/**
 * L'opération « naïve » dictée par le mot-clé entendu (« de plus » → addition,
 * « de moins » → soustraction). null pour les types non discordants.
 * Sert aux tests : la bonne réponse ne doit JAMAIS être cette opération.
 */
export function naiveKeywordAnswer(type: ProblemType, a: number, b: number): number | null {
  if (type === 'compare-plus') return a + b
  if (type === 'compare-moins') return a - b
  return null
}

/** Construit les emplacements du schéma : l'inconnue porte value=null. */
export function buildSlots(type: ProblemType, a: number, b: number): SchemaSlot[] {
  switch (type) {
    case 'parties-tout':
      return [
        { role: 'whole', value: null },
        { role: 'part1', value: a, group: 'parts' },
        { role: 'part2', value: b, group: 'parts' },
      ]
    case 'transfo-gain':
    case 'transfo-perte':
      return [
        { role: 'start', value: a },
        { role: 'change', value: b },
        { role: 'end', value: null },
      ]
    case 'partie-cachee':
      return [
        { role: 'whole', value: a },
        { role: 'part1', value: b, group: 'parts' },
        { role: 'part2', value: null, group: 'parts' },
      ]
    case 'compare-diff':
      return [
        { role: 'heroBar', value: a },
        { role: 'rivalBar', value: b },
        { role: 'diff', value: null },
      ]
    case 'compare-plus':
    case 'compare-moins':
      return [
        { role: 'heroBar', value: a },
        { role: 'rivalBar', value: null },
        { role: 'diff', value: b },
      ]
  }
}

// ------------------------------------------------------------
// Tirage des nombres (palier + niveau de Tuner)
// ------------------------------------------------------------

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

/**
 * Tire (a, b) pour un type donné. Garantit a, b ≥ 2 ET answer ≥ 2 : le clip
 * nu « nombre.1 » (« un ») casserait genre et accords dans l'audio assemblé
 * (« un billes », « un sont dans sa poche »…). Plafonds par palier.
 */
export function drawNumbers(type: ProblemType, level: number): { a: number; b: number } {
  const wide = clampLevel(level) >= 1
  switch (type) {
    case 'parties-tout': {
      // T0 : tout ≤ 10 (niveau 0 : tout ≤ 8)
      if (!wide) return { a: randInt(2, 4), b: randInt(2, 4) }
      const a = randInt(2, 8)
      return { a, b: randInt(2, Math.min(8, 10 - a)) }
    }
    case 'transfo-gain': {
      // T1 : arrivée ≤ 12 (niveau 0 : ≤ 10)
      if (!wide) {
        const a = randInt(2, 6)
        return { a, b: randInt(2, Math.min(4, 10 - a)) }
      }
      const a = randInt(3, 8)
      return { a, b: randInt(2, Math.min(5, 12 - a)) }
    }
    case 'transfo-perte': {
      // T1 : départ ≤ 12, il en reste toujours au moins 2
      if (!wide) {
        const a = randInt(4, 8)
        return { a, b: randInt(2, Math.min(4, a - 2)) }
      }
      const a = randInt(6, 12)
      return { a, b: randInt(2, Math.min(5, a - 2)) }
    }
    case 'partie-cachee': {
      // T2 : tout ≤ 15 (niveau 0 : ≤ 10), partie cachée ≥ 2
      if (!wide) {
        const a = randInt(5, 10)
        return { a, b: randInt(2, a - 2) }
      }
      const a = randInt(8, 15)
      return { a, b: randInt(2, a - 2) }
    }
    case 'compare-diff': {
      // T3 : collections ≤ 20, écart 2..6, la petite collection ≥ 2
      if (!wide) {
        const a = randInt(5, 10)
        return { a, b: a - randInt(2, Math.min(4, a - 2)) }
      }
      const a = randInt(8, 20)
      return { a, b: a - randInt(2, 6) }
    }
    case 'compare-plus': {
      // Discordant : le héros a « b de plus » → l'autre en a a − b (≥ 2)
      if (!wide) {
        const a = randInt(5, 10)
        return { a, b: randInt(2, Math.min(4, a - 2)) }
      }
      const a = randInt(8, 20)
      return { a, b: randInt(2, 6) }
    }
    case 'compare-moins': {
      // Discordant : le héros a « b de moins » → l'autre en a a + b (≤ 20)
      if (!wide) {
        const a = randInt(3, 8)
        return { a, b: randInt(2, 4) }
      }
      const a = randInt(5, 14)
      return { a, b: randInt(2, Math.min(6, 20 - a)) }
    }
  }
}

// ------------------------------------------------------------
// Génération d'items
// ------------------------------------------------------------

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoidTemplate` évite de reproposer le même template deux fois de suite.
 */
export function generateItem(tier: TierId, level: number, avoidTemplate?: string): BscItem {
  const candidates = TEMPLATES_BY_TIER[tier]
  const filtered =
    avoidTemplate === undefined ? candidates : candidates.filter((t) => t.id !== avoidTemplate)
  const template = pick(filtered.length > 0 ? filtered : candidates)
  const { a, b } = drawNumbers(template.type, level)
  return {
    tier,
    template,
    a,
    b,
    answer: computeAnswer(template.type, a, b),
    slots: buildSlots(template.type, a, b),
    tiles: shuffle([a, b]),
  }
}

// ------------------------------------------------------------
// Validation — phase MODÉLISER (placement des tuiles)
// ------------------------------------------------------------

export type Placement = Readonly<Partial<Record<SlotRole, number>>>

/**
 * Peut-on poser `value` dans l'emplacement `role` ?
 * - jamais sur l'inconnue « ? » ni sur un emplacement déjà rempli ;
 * - emplacement libre : la valeur doit être celle attendue ;
 * - groupe 'parts' : les deux parties sont interchangeables (multiset).
 */
export function isPlacementValid(
  item: BscItem,
  role: SlotRole,
  value: number,
  placed: Placement,
): boolean {
  const slot = item.slots.find((s) => s.role === role)
  if (!slot || slot.value === null) return false
  if (placed[role] !== undefined) return false
  if (!slot.group) return slot.value === value
  // Multiset des valeurs attendues du groupe, moins celles déjà posées.
  const expected = item.slots
    .filter((s) => s.group === slot.group && s.value !== null)
    .map((s) => s.value as number)
  for (const s of item.slots) {
    if (s.group !== slot.group) continue
    const v = placed[s.role]
    if (v === undefined) continue
    const i = expected.indexOf(v)
    if (i !== -1) expected.splice(i, 1)
  }
  return expected.includes(value)
}

/** Emplacements encore libres où `value` est correcte (indice + illumination). */
export function correctRolesFor(item: BscItem, value: number, placed: Placement): SlotRole[] {
  return item.slots
    .filter((s) => s.value !== null && placed[s.role] === undefined)
    .filter((s) => isPlacementValid(item, s.role, value, placed))
    .map((s) => s.role)
}

/** Le schéma est-il complet ? (tous les emplacements connus sont remplis) */
export function isModelComplete(item: BscItem, placed: Placement): boolean {
  return item.slots.every((s) => s.value === null || placed[s.role] !== undefined)
}

/** Le rôle de l'emplacement inconnu « ? ». */
export function unknownRole(item: BscItem): SlotRole {
  const slot = item.slots.find((s) => s.value === null)
  if (!slot) throw new Error('schéma sans inconnue')
  return slot.role
}

// ------------------------------------------------------------
// Validation — phase CALCULER
// ------------------------------------------------------------

export function isAnswerCorrect(item: BscItem, n: number): boolean {
  return n === item.answer
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

export interface BscProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: BscProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: BscProgress, tier: TierId, stars: 1 | 2 | 3): BscProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
