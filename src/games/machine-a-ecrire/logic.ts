// ============================================================
// La Machine à Écrire Magique — logique PURE (zéro React/DOM).
// - Claviers de graphèmes par palier (le grapheme est l'unité,
//   pas la lettre : une touche « ou » écrit « ou » d'un coup)
// - Banques de cibles VALIDES par palier (mots transparents :
//   chaque grapheme s'entend), décomposition canonique testée
// - Génération procédurale d'une partie (révision d'abord,
//   jamais deux fois le même item d'affilée)
// - Validation par SÉQUENCE de graphèmes (taper m-a-t-i-n ne
//   vaut pas m-a-t-in : le son « in » est une seule touche)
// - File de répétition espacée interne (mots ratés réinjectés)
// ============================================================

import { pick, shuffle } from '@/engine/rng'

export type MaeTier = 0 | 1 | 2 | 3
export type MaeKind = 'voyelle' | 'syllabe' | 'mot'

export interface MaeTarget {
  /** Forme écrite complète — TOUJOURS la concaténation exacte des graphèmes */
  word: string
  /** Décomposition canonique en graphèmes : l'unité pédagogique */
  graphemes: readonly string[]
  kind: MaeKind
  /** Indice de sens (affiché au palier 3, tampon de réussite partout) */
  emoji?: string
}

export interface MaeRun {
  items: MaeTarget[]
  /** Les `reviewCount` premiers items sont des révisions de la file */
  reviewCount: number
}

export const RUN_LENGTH = 8
export const REVIEW_MAX = 3
export const REVIEW_QUEUE_CAP = 8

// ------------------------------------------------------------
// Claviers par palier
// ------------------------------------------------------------

export const VOWELS = ['a', 'e', 'i', 'o', 'u', 'é'] as const
export const CONSONANTS = ['l', 'r', 's', 'm', 't', 'p', 'n', 'f', 'v'] as const
export const DIGRAPHS = ['ou', 'on', 'an', 'in', 'ch'] as const

export const KEYBOARDS: Record<MaeTier, readonly string[]> = {
  0: VOWELS,
  1: [...VOWELS, ...CONSONANTS],
  2: [...VOWELS, ...CONSONANTS, ...DIGRAPHS],
  3: [...VOWELS, ...CONSONANTS, ...DIGRAPHS],
}

/** Rangées du clavier pour l'affichage (voyelles / consonnes / digraphes). */
export function keyboardRows(tier: MaeTier): readonly (readonly string[])[] {
  if (tier === 0) return [VOWELS]
  if (tier === 1) return [VOWELS, CONSONANTS]
  return [VOWELS, CONSONANTS, DIGRAPHS]
}

const VOWEL_SET: ReadonlySet<string> = new Set(VOWELS)

export function isVowelKey(g: string): boolean {
  return VOWEL_SET.has(g)
}

export function isDigraphKey(g: string): boolean {
  return g.length > 1
}

// ------------------------------------------------------------
// Compétences exercées par palier (ids du SKILL_MAP)
// ------------------------------------------------------------

export const TIER_SKILLS: Record<MaeTier, readonly string[]> = {
  0: ['fr.cp.cgp.voyelles'],
  1: ['fr.cp.cgp.consonnes1', 'fr.cp.encodage.syllabes'],
  2: ['fr.cp.cgp.digraphes1', 'fr.cp.encodage.syllabes'],
  3: ['fr.cp.encodage.mots'],
}

export const TIER_INFO: Record<MaeTier, { name: string; sample: string; emoji: string }> = {
  0: { name: 'Les voyelles', sample: 'a · o · é', emoji: '🅰️' },
  1: { name: 'Les syllabes', sample: 'ma · ri · lo', emoji: '🧩' },
  2: { name: 'Les sons magiques', sample: 'ou · on · ch', emoji: '✨' },
  3: { name: 'Les mots entiers', sample: 'mouton · lapin', emoji: '📜' },
}

// ------------------------------------------------------------
// Banques de cibles — uniquement des formes TRANSPARENTES
// (chaque grapheme s'entend) composables sur le clavier du palier
// ------------------------------------------------------------

const T0_TARGETS: readonly MaeTarget[] = VOWELS.map((v) => ({
  word: v,
  graphemes: [v],
  kind: 'voyelle',
}))

/** Syllabes CV simples du palier 1 : consonne + voyelle, toutes prononçables. */
const T1_SYLLABLES = [
  'ma', 'mi', 'mo',
  'la', 'li', 'lo', 'lu',
  'ra', 'ri', 'ro',
  'sa', 'si', 'so',
  'ta', 'ti', 'to',
  'pa', 'pi', 'po',
  'na', 'ni',
  'fa', 'fi',
  'va', 'vo',
  'ré',
] as const

const T1_TARGETS: readonly MaeTarget[] = T1_SYLLABLES.map((s) => ({
  word: s,
  graphemes: [s.charAt(0), s.slice(1)],
  kind: 'syllabe',
}))

function syl(word: string, graphemes: readonly string[]): MaeTarget {
  return { word, graphemes, kind: 'syllabe' }
}

function mot(word: string, graphemes: readonly string[], emoji: string): MaeTarget {
  return { word, graphemes, kind: 'mot', emoji }
}

/** Palier 2 : syllabes à digraphe + petits mots réguliers (2 à 4 graphèmes). */
const T2_TARGETS: readonly MaeTarget[] = [
  syl('chou', ['ch', 'ou']),
  syl('cha', ['ch', 'a']),
  syl('chi', ['ch', 'i']),
  syl('mou', ['m', 'ou']),
  syl('fou', ['f', 'ou']),
  syl('sou', ['s', 'ou']),
  syl('ton', ['t', 'on']),
  syl('mon', ['m', 'on']),
  syl('son', ['s', 'on']),
  syl('pan', ['p', 'an']),
  syl('fan', ['f', 'an']),
  syl('lin', ['l', 'in']),
  syl('pin', ['p', 'in']),
  syl('fin', ['f', 'in']),
  syl('vin', ['v', 'in']),
  mot('moto', ['m', 'o', 't', 'o'], '🛵'),
  mot('lune', ['l', 'u', 'n', 'e'], '🌙'),
  mot('vélo', ['v', 'é', 'l', 'o'], '🚲'),
  mot('ami', ['a', 'm', 'i'], '🤗'),
  mot('pile', ['p', 'i', 'l', 'e'], '🔋'),
]

/** Palier 3 : mots de 3 à 6 graphèmes, chacun avec au moins un digraphe. */
const T3_TARGETS: readonly MaeTarget[] = [
  mot('mouton', ['m', 'ou', 't', 'on'], '🐑'),
  mot('chaton', ['ch', 'a', 't', 'on'], '🐱'),
  mot('lapin', ['l', 'a', 'p', 'in'], '🐰'),
  mot('sapin', ['s', 'a', 'p', 'in'], '🌲'),
  mot('savon', ['s', 'a', 'v', 'on'], '🧼'),
  mot('vache', ['v', 'a', 'ch', 'e'], '🐄'),
  mot('mouche', ['m', 'ou', 'ch', 'e'], '🪰'),
  mot('fourmi', ['f', 'ou', 'r', 'm', 'i'], '🐜'),
  mot('moufle', ['m', 'ou', 'f', 'l', 'e'], '🧤'),
  mot('patin', ['p', 'a', 't', 'in'], '⛸️'),
  mot('matin', ['m', 'a', 't', 'in'], '🌅'),
  mot('ourson', ['ou', 'r', 's', 'on'], '🧸'),
  mot('melon', ['m', 'e', 'l', 'on'], '🍈'),
  mot('salon', ['s', 'a', 'l', 'on'], '🛋️'),
  mot('avion', ['a', 'v', 'i', 'on'], '✈️'),
  mot('chemin', ['ch', 'e', 'm', 'in'], '🛤️'),
  mot('pantalon', ['p', 'an', 't', 'a', 'l', 'on'], '👖'),
  mot('chanson', ['ch', 'an', 's', 'on'], '🎵'),
  mot('fanfare', ['f', 'an', 'f', 'a', 'r', 'e'], '🎺'),
  mot('pinson', ['p', 'in', 's', 'on'], '🐦'),
]

export const TARGETS: Record<MaeTier, readonly MaeTarget[]> = {
  0: T0_TARGETS,
  1: T1_TARGETS,
  2: T2_TARGETS,
  3: T3_TARGETS,
}

export function findTarget(tier: MaeTier, word: string): MaeTarget | undefined {
  return TARGETS[tier].find((t) => t.word === word)
}

// ------------------------------------------------------------
// Ids de clips audio (é interdit dans les ids → « ee »)
// ------------------------------------------------------------

/** Slug id-safe d'un grapheme : é → ee (les ids n'acceptent que [a-z0-9.-]). */
export function graphemeSlug(g: string): string {
  return g.replaceAll('é', 'ee')
}

export function wordSlug(word: string): string {
  return word.replaceAll('é', 'ee')
}

/** Clip joué quand on tape la touche (son du grapheme isolé). */
export function keyClipId(g: string): string {
  return `mae.touche.${graphemeSlug(g)}`
}

/** Clip du stimulus à encoder (voyelle, syllabe ou mot). */
export function targetClipId(t: MaeTarget): string {
  return `mae.cible.${wordSlug(t.word)}`
}

// ------------------------------------------------------------
// Validation — sur la SÉQUENCE de graphèmes, pas la chaîne :
// taper i puis n n'est pas taper la touche « in ».
// ------------------------------------------------------------

/** Longueur du préfixe de graphèmes correctement placés. */
export function correctPrefixLen(typed: readonly string[], target: MaeTarget): number {
  let n = 0
  while (n < typed.length && n < target.graphemes.length && typed[n] === target.graphemes[n]) {
    n++
  }
  return n
}

/** true si tout ce qui est tapé est un début correct de la cible. */
export function isPrefix(typed: readonly string[], target: MaeTarget): boolean {
  return correctPrefixLen(typed, target) === typed.length
}

export function validate(typed: readonly string[], target: MaeTarget): boolean {
  return typed.length === target.graphemes.length && isPrefix(typed, target)
}

/**
 * Grapheme attendu ensuite (pour l'indice : la touche qui pulse).
 * null si la frappe a dévié (il faut effacer) ou si la cible est complète.
 */
export function nextExpected(typed: readonly string[], target: MaeTarget): string | null {
  if (!isPrefix(typed, target)) return null
  return target.graphemes[typed.length] ?? null
}

// ------------------------------------------------------------
// Génération d'une partie
// ------------------------------------------------------------

/**
 * Génère les items d'une partie : d'abord les révisions (mots de la file
 * appartenant à la banque du palier, max 3, dédupliqués), puis des items
 * frais sans doublon tant que la banque le permet. Jamais deux items
 * identiques d'affilée.
 */
export function generateRun(tier: MaeTier, review: readonly string[] = []): MaeRun {
  const bank = TARGETS[tier]
  const items: MaeTarget[] = []

  for (const word of review) {
    if (items.length >= REVIEW_MAX) break
    const target = findTarget(tier, word)
    if (target && !items.some((i) => i.word === word)) items.push(target)
  }
  const reviewCount = items.length

  const fresh = shuffle(bank.filter((t) => !items.some((i) => i.word === t.word)))
  for (const target of fresh) {
    if (items.length >= RUN_LENGTH) break
    items.push(target)
  }

  // Banque plus petite que la partie (palier 0) : on complète en évitant
  // seulement la répétition immédiate.
  while (items.length < RUN_LENGTH) {
    const last = items[items.length - 1]
    const pool = bank.filter((t) => t.word !== last?.word)
    items.push(pick(pool.length > 0 ? pool : bank))
  }

  return { items, reviewCount }
}

// ------------------------------------------------------------
// File de répétition espacée interne
// ------------------------------------------------------------

/** Ajoute un mot raté en fin de file (dédoublonné, plafonné). */
export function pushReview(
  queue: readonly string[],
  word: string,
  cap: number = REVIEW_QUEUE_CAP,
): string[] {
  return [...queue.filter((w) => w !== word), word].slice(-cap)
}

/** Prélève jusqu'à `max` mots en tête de file pour la prochaine partie. */
export function takeReview(
  queue: readonly string[],
  max: number = REVIEW_MAX,
): { now: string[]; rest: string[] } {
  return { now: queue.slice(0, max), rest: queue.slice(max) }
}

// ------------------------------------------------------------
// Étoiles (premiers essais uniquement)
// ------------------------------------------------------------

export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}
