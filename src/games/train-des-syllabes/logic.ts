// ============================================================
// Train des Syllabes — logique PURE (zéro React, zéro DOM).
// Génération procédurale des items + validation + paliers.
//
// Paliers :
//   T0 scander   — taper le rythme du mot sur le tambour
//   T1 fusion    — mots de 2 syllabes, wagons + distracteurs
//   T2 décodage  — mots de 3 syllabes, pièges proches (cho/cha)
//   T3 magique   — mix pseudo-mots (fusion) et suppression de syllabe
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'
import {
  DISTRACTOR_CANDIDATES,
  LEXICON_KEYS,
  WORDS,
  sanitize,
  soundKey,
  type Syllable,
  type Word,
} from './words'

export type Tier = 0 | 1 | 2 | 3
export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8

export const SKILL_SCANDER = 'fr.gs.phono.scander'
export const SKILL_FUSION = 'fr.gs.phono.fusion'
export const SKILL_DECODAGE = 'fr.cp.decodage.syllabes'
export const SKILL_SUPPRESSION = 'fr.gs.phono.suppression'

// ---------- Items ----------

export interface ScanderItem {
  kind: 'scander'
  word: Word
  skillId: string
}

export interface FusionItem {
  kind: 'fusion'
  word: Word
  /** Syllabes à accrocher, dans l'ordre */
  answer: readonly Syllable[]
  /** Wagons proposés (réponse + distracteurs), mélangés */
  pool: readonly Syllable[]
  skillId: string
}

export interface PseudoItem {
  kind: 'pseudo'
  /** Concat des graphies — uniquement pour les tests et la clé d'unicité */
  label: string
  answer: readonly Syllable[]
  pool: readonly Syllable[]
  skillId: string
}

export interface SuppressionItem {
  kind: 'suppression'
  word: Word
  removed: Syllable
  /** 0 = syllabe initiale, sinon dernière syllabe */
  removedIndex: number
  answer: readonly Syllable[]
  pool: readonly Syllable[]
  skillId: string
}

export type Item = ScanderItem | FusionItem | PseudoItem | SuppressionItem

/** Clé d'unicité d'un item dans une partie (jamais deux fois le même mot). */
export function itemKey(item: Item): string {
  return item.kind === 'pseudo' ? `pseudo:${item.label}` : item.word.word
}

// ---------- Distracteurs ----------

/** Proximité d'un candidat avec les bonnes syllabes (piège « cho/cha »). */
function closeness(candidate: Syllable, answer: readonly Syllable[]): number {
  const c = sanitize(candidate.g)
  let best = 0
  for (const a of answer) {
    const s = sanitize(a.g)
    let score = 0
    if (c.slice(0, 2) === s.slice(0, 2)) score += 3
    else if (c[0] === s[0]) score += 2
    if (c.slice(-2) === s.slice(-2)) score += 1
    if (Math.abs(c.length - s.length) <= 1) score += 1
    if (score > best) best = score
  }
  return best
}

/**
 * Choisit `count` distracteurs proches des bonnes syllabes mais JAMAIS
 * identiques (ni en graphie, ni en SON — un homophone serait injuste).
 * `extraExcluded` : syllabes en plus à exclure (ex. la syllabe retirée,
 * déjà présente dans le pool comme piège volontaire).
 */
export function pickDistractors(
  answer: readonly Syllable[],
  count: number,
  extraExcluded: readonly Syllable[] = [],
): Syllable[] {
  const banned = [...answer, ...extraExcluded]
  const bannedG = new Set(banned.map((s) => s.g))
  const bannedSound = new Set(banned.map(soundKey))

  const candidates = DISTRACTOR_CANDIDATES.filter(
    (c) => !bannedG.has(c.g) && !bannedSound.has(soundKey(c)),
  )

  // Tri par proximité avec un peu de hasard, puis on évite les doublons de son.
  const scored = shuffle(candidates)
    .map((c) => ({ c, score: closeness(c, answer) + Math.random() * 1.5 }))
    .sort((x, y) => y.score - x.score)

  const out: Syllable[] = []
  const usedSound = new Set<string>()
  for (const { c } of scored) {
    if (out.length >= count) break
    const k = soundKey(c)
    if (usedSound.has(k)) continue
    usedSound.add(k)
    out.push(c)
  }
  return out
}

// ---------- Sélection de mots ----------

function wordChoices(nSyll: 2 | 3 | null, used: ReadonlySet<string>): readonly Word[] {
  const matching = WORDS.filter((w) => nSyll === null || w.syllables.length === nSyll)
  const fresh = matching.filter((w) => !used.has(w.word))
  return fresh.length > 0 ? fresh : matching
}

/** Mots dont toutes les syllabes sont distinctes (la suppression y a du sens). */
function suppressionChoices(used: ReadonlySet<string>): readonly Word[] {
  const ok = WORDS.filter((w) => new Set(w.syllables.map((s) => s.g)).size === w.syllables.length)
  const fresh = ok.filter((w) => !used.has(w.word))
  return fresh.length > 0 ? fresh : ok
}

// ---------- Générateurs par palier ----------

/** T0 — niveau 0 : mots de 2 syllabes ; niveau 1+ : mélange 2/3 syllabes. */
export function genScander(level: number, used: ReadonlySet<string>): ScanderItem {
  const nSyll: 2 | 3 | null = level <= 0 ? 2 : null
  return { kind: 'scander', word: pick(wordChoices(nSyll, used)), skillId: SKILL_SCANDER }
}

/** T1 — mots de 2 syllabes, 1 distracteur (niveau 0) ou 2 (niveau 1+). */
export function genFusion2(level: number, used: ReadonlySet<string>): FusionItem {
  const word = pick(wordChoices(2, used))
  const distractors = pickDistractors(word.syllables, level <= 0 ? 1 : 2)
  return {
    kind: 'fusion',
    word,
    answer: word.syllables,
    pool: shuffle([...word.syllables, ...distractors]),
    skillId: SKILL_FUSION,
  }
}

/** T2 — mots de 3 syllabes, 2 ou 3 distracteurs dont des pièges proches. */
export function genFusion3(level: number, used: ReadonlySet<string>): FusionItem {
  const word = pick(wordChoices(3, used))
  const distractors = pickDistractors(word.syllables, level <= 0 ? 2 : 3)
  return {
    kind: 'fusion',
    word,
    answer: word.syllables,
    pool: shuffle([...word.syllables, ...distractors]),
    skillId: SKILL_DECODAGE,
  }
}

const PSEUDO_MAX_TRIES = 100

/** T3a — pseudo-mot rigolo : 2-3 syllabes connues, jamais un vrai mot du lexique. */
export function genPseudo(used: ReadonlySet<string>): PseudoItem {
  for (let i = 0; i < PSEUDO_MAX_TRIES; i++) {
    const n = randInt(2, 3)
    const syls: Syllable[] = []
    const usedSound = new Set<string>()
    const candidates = shuffle(DISTRACTOR_CANDIDATES)
    for (const c of candidates) {
      if (syls.length >= n) break
      const k = soundKey(c)
      if (usedSound.has(k)) continue
      usedSound.add(k)
      syls.push(c)
    }
    const label = syls.map((s) => s.g).join('')
    if (LEXICON_KEYS.has(sanitize(label))) continue
    if (used.has(`pseudo:${label}`)) continue
    const distractors = pickDistractors(syls, 2)
    return {
      kind: 'pseudo',
      label,
      answer: syls,
      pool: shuffle([...syls, ...distractors]),
      skillId: SKILL_FUSION,
    }
  }
  // Inatteignable en pratique (espace de combinaisons énorme) — filet de sécurité.
  throw new Error('genPseudo: impossible de générer un pseudo-mot')
}

/** T3b — suppression : enlève la 1re ou la dernière syllabe, construis le reste. */
export function genSuppression(used: ReadonlySet<string>): SuppressionItem {
  const word = pick(suppressionChoices(used))
  const last = word.syllables.length - 1
  const removedIndex = pick([0, last])
  const removed = word.syllables[removedIndex]
  const answer = word.syllables.filter((_, i) => i !== removedIndex)
  // La syllabe retirée est le meilleur piège : elle est DANS le pool.
  const distractors = pickDistractors(answer, 1, [removed])
  return {
    kind: 'suppression',
    word,
    removed,
    removedIndex,
    answer,
    pool: shuffle([...answer, removed, ...distractors]),
    skillId: SKILL_SUPPRESSION,
  }
}

/** Ordre des sous-types d'items du palier T3 : moitié pseudo, moitié suppression. */
export function t3Kinds(count: number = ITEMS_PER_RUN): ('pseudo' | 'suppression')[] {
  const half = Math.floor(count / 2)
  const kinds: ('pseudo' | 'suppression')[] = [
    ...Array.from({ length: count - half }, (): 'pseudo' => 'pseudo'),
    ...Array.from({ length: half }, (): 'suppression' => 'suppression'),
  ]
  return shuffle(kinds)
}

/** Génère l'item suivant d'une partie. `t3Kind` : sous-type imposé au palier 3. */
export function genItem(
  tier: Tier,
  level: number,
  used: ReadonlySet<string>,
  t3Kind?: 'pseudo' | 'suppression',
): Item {
  switch (tier) {
    case 0:
      return genScander(level, used)
    case 1:
      return genFusion2(level, used)
    case 2:
      return genFusion3(level, used)
    case 3:
      return (t3Kind ?? pick(['pseudo', 'suppression'] as const)) === 'pseudo'
        ? genPseudo(used)
        : genSuppression(used)
  }
}

// ---------- Validation ----------

/** T0 : le compte de frappes est bon si = nombre de syllabes orales. */
export function validateScander(word: Word, taps: number): boolean {
  return taps === word.syllables.length
}

/** Wagons accrochés comparés à la réponse, position par position (graphies). */
export function validateBuild(
  answer: readonly Syllable[],
  built: ReadonlyArray<Pick<Syllable, 'g'>>,
): boolean {
  return built.length === answer.length && answer.every((s, i) => built[i].g === s.g)
}

// ---------- Étoiles + progression des paliers ----------

/** Étoiles d'une partie : ratio de PREMIERS essais (≥90 % → 3, ≥70 % → 2, sinon 1). */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface SaveState {
  /** Meilleures étoiles par palier (clé = tier en string, JSON oblige) */
  bestStars: Record<string, 0 | 1 | 2 | 3>
  /** Plus haut palier accessible (0..3) */
  unlockedTier: number
  runs: number
}

export const DEFAULT_SAVE: SaveState = {
  bestStars: { '0': 0, '1': 0, '2': 0, '3': 0 },
  unlockedTier: 0,
  runs: 0,
}

/** Applique le résultat d'une partie : meilleures étoiles, déblocage (≥2 ⭐), runs. */
export function applyRunToSave(save: SaveState, tier: Tier, stars: 1 | 2 | 3): SaveState {
  const key = String(tier)
  const best = Math.max(save.bestStars[key] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlocked =
    stars >= 2 ? Math.max(save.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : save.unlockedTier
  return {
    bestStars: { ...save.bestStars, [key]: best },
    unlockedTier: unlocked,
    runs: save.runs + 1,
  }
}
