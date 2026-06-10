// ============================================================
// Calcul Aventure — logique PURE.
// Génération procédurale des calculs + validation de la réponse
// tapée au NumPad. Aucun import React/DOM. Prouvé par
// logic.test.ts : jamais de résultat négatif, T2 franchit
// toujours la dizaine, mapping de compétence exact à T3.
// ============================================================

import { pick, randInt } from '@/engine/rng'

export type TierId = 0 | 1 | 2 | 3
export type Op = 'add' | 'sub'

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'ma.cp.add10',
  'ma.cp.sous10',
  'ma.cp.add20',
  'ma.cp.sous20',
] as const

export type TierSkill = (typeof TIER_SKILLS)[number]

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plage resserrée, 1 = plage pleine. */
export const MAX_TUNER_LEVEL = 1

export interface CavItem {
  tier: TierId
  op: Op
  /** Opérande gauche : 1er groupe d'objets (add) ou panier de départ (sub). */
  a: number
  /** Opérande droite : 2e groupe d'objets (add) ou nombre chipé (sub). */
  b: number
  /** Le résultat exact à taper au NumPad. */
  answer: number
  /** « Grand nombre » du calcul : la somme (add) ou le diminuende (sub).
   *  Sert à l'anti-répétition (`avoid`) et au mapping de compétence. */
  main: number
  /** Compétence enregistrée à la résolution de l'item. */
  skill: TierSkill
}

export interface TierSpec {
  /** [min, max] du « grand nombre » par niveau de Tuner (index = niveau). */
  mainRanges: ReadonlyArray<readonly [number, number]>
}

export const TIER_SPECS: Readonly<Record<TierId, TierSpec>> = {
  // T0 « Les paniers » : additions ≤ 10 (niveau 0 : sommes ≤ 6)
  0: { mainRanges: [[3, 6], [4, 10]] },
  // T1 « Le singe chapardeur » : soustractions ≤ 10
  1: { mainRanges: [[3, 6], [4, 10]] },
  // T2 « La boîte de dix » : a + b entre 11 et 20, passage de la dizaine
  2: { mainRanges: [[11, 14], [11, 20]] },
  // T3 « Le calcul de tête » : mixte add/sous ≤ 20 (niveau 0 : ≤ 14)
  3: { mainRanges: [[3, 14], [3, 20]] },
}

// ------------------------------------------------------------
// Helpers internes
// ------------------------------------------------------------

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

function rangeValues(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let v = lo; v <= hi; v++) out.push(v)
  return out
}

/** Tire dans candidates en évitant `avoid` quand une alternative existe. */
function pickAvoiding(candidates: readonly number[], avoid?: number): number {
  const filtered = avoid === undefined ? candidates : candidates.filter((v) => v !== avoid)
  return pick(filtered.length > 0 ? filtered : candidates)
}

/** Décompose une somme ≥ 11 en a + b avec a, b ∈ [1..10] : passage de dix garanti. */
function splitCrossingTen(sum: number): [number, number] {
  const a = randInt(Math.max(1, sum - 10), Math.min(10, sum - 1))
  return [a, sum - a]
}

// ------------------------------------------------------------
// Génération d'items
// ------------------------------------------------------------

/**
 * Génère un calcul résoluble pour un palier et un niveau de Tuner.
 * `avoid` évite de reproposer le même calcul deux fois de suite
 * (on évite le « grand nombre » de l'item précédent : item.main).
 * Invariants : a ≥ 1, b ≥ 1, answer ≥ 1 (jamais de résultat négatif),
 * en soustraction le diminuende est TOUJOURS > au soustracteur.
 */
export function generateItem(tier: TierId, level: number, avoid?: number): CavItem {
  const lvl = clampLevel(level)
  const [lo, hi] = TIER_SPECS[tier].mainRanges[lvl]
  const main = pickAvoiding(rangeValues(lo, hi), avoid)

  if (tier === 0) {
    // Additions ≤ 10, CONCRET : deux groupes d'objets à mettre au panier.
    const a = randInt(1, main - 1)
    return { tier, op: 'add', a, b: main - a, answer: main, main, skill: 'ma.cp.add10' }
  }

  if (tier === 1) {
    // Soustractions ≤ 10 : le panier démarre plein, le singe en chipe b.
    const b = randInt(1, main - 1)
    return { tier, op: 'sub', a: main, b, answer: main - b, main, skill: 'ma.cp.sous10' }
  }

  if (tier === 2) {
    // Additions 11..20, IMAGÉ : a, b ≤ 10 et a + b ≥ 11 → la boîte de dix
    // se scelle TOUJOURS en cours de remplissage.
    const [a, b] = splitCrossingTen(main)
    return { tier, op: 'add', a, b, answer: main, main, skill: 'ma.cp.add20' }
  }

  // T3, ABSTRAIT : mixte additions/soustractions ≤ 20, calcul de tête.
  const op = pick<Op>(['add', 'sub'])
  if (op === 'add') {
    // Opérandes ≤ 10 (mêmes familles de calcul que T0/T2).
    const a = main <= 10 ? randInt(1, main - 1) : splitCrossingTen(main)[0]
    const b = main - a
    return { tier, op, a, b, answer: main, main, skill: main > 10 ? 'ma.cp.add20' : 'ma.cp.add10' }
  }
  // Soustracteur ≤ 9 (pratique CP : 13 − 5, pas 17 − 14).
  const b = randInt(1, Math.min(9, main - 1))
  return {
    tier,
    op,
    a: main,
    b,
    answer: main - b,
    main,
    skill: main > 10 ? 'ma.cp.sous20' : 'ma.cp.sous10',
  }
}

// ------------------------------------------------------------
// Manipulation & validation
// ------------------------------------------------------------

/** Nombre d'objets à déplacer avant que le NumPad ne s'active. */
export function neededPlacements(item: CavItem): number {
  if (item.tier === 3) return 0
  return item.op === 'add' ? item.a + item.b : item.b
}

/** La réponse tapée au NumPad est-elle exacte ? ('07' compte comme 7). */
export function checkAnswer(item: CavItem, value: string): boolean {
  if (!/^\d+$/.test(value)) return false
  return Number.parseInt(value, 10) === item.answer
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

export interface CavProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: CavProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: CavProgress, tier: TierId, stars: 1 | 2 | 3): CavProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
