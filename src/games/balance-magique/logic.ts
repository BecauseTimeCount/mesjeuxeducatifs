// ============================================================
// La Balance Magique — logique PURE.
// Génération procédurale des pesées + validation de l'équilibre.
// L'égalité comme équivalence : le plateau gauche est donné,
// l'enfant charge le plateau droit avec le stock du magicien.
// Aucun import React/DOM. Prouvé par logic.test.ts :
// le stock permet TOUJOURS l'équilibre exact.
// ============================================================

import { pick, randInt } from '@/engine/rng'

export type TierId = 0 | 1 | 2 | 3

export type TokenKind = 'fruit' | 'weight' | 'bar' | 'cube'

export interface BmaToken {
  /** id unique dans TOUT l'item (gauche, pré-posés et stock confondus) */
  id: number
  kind: TokenKind
  /** poids en unités */
  value: number
  /** emoji affiché (les poids/barres/cubes sont rendus en CSS) */
  emoji: string
  /** libellé français pour l'accessibilité (« pomme », « barre de dix »…) */
  label: string
}

export interface ExchangeRule {
  /** sert à construire l'id de clip : bma.regle.<pairId>.<rate> */
  pairId: string
  big: { emoji: string; label: string }
  small: { emoji: string; label: string }
  /** 1 gros objet pèse comme `rate` petits objets */
  rate: 2 | 3
}

export type Challenge = 'no-bars' | 'only-bars'

export interface BmaItem {
  tier: TierId
  /** plateau GAUCHE : chargé par le magicien, non interactif */
  left: BmaToken[]
  /** plateau DROIT : jetons déjà posés, FIXES (T1) */
  rightPrefilled: BmaToken[]
  /** stock : chaque jeton est utilisable UNE seule fois */
  stock: BmaToken[]
  /** T2 : règle d'échange affichée ET dite */
  rule?: ExchangeRule
  /** T3 : variante du défi */
  challenge?: Challenge
  /** ids du stock formant UNE solution exacte — sert à l'indice */
  solutionIds: number[]
}

export type Tilt = 'left' | 'right' | 'level'

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'ma.gs.comparer',
  'ma.cp.complements10',
  'ma.cp.egalite',
  'ma.cp.num.echange',
] as const

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = plage resserrée, 1 = plage élargie. */
export const MAX_TUNER_LEVEL = 1

// ------------------------------------------------------------
// Plages de génération par palier × niveau de Tuner
// ------------------------------------------------------------

/** T0 : nombre de fruits identiques sur le plateau gauche. */
export const T0_COUNT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [2, 5],
  [3, 8],
]

/** T1 : valeur du gros poids chiffré (la cible). */
export const T1_TARGET_RANGES: ReadonlyArray<readonly [number, number]> = [
  [6, 8],
  [8, 10],
]

/** T1 : taille du complément à poser (le « ? » de k + ? = N). */
export const T1_COMPLEMENT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [1, 3],
  [2, 5],
]

/** T2 : taux d'échange autorisés par niveau. */
export const T2_RATES: ReadonlyArray<ReadonlyArray<2 | 3>> = [[2], [2, 3]]

/** T2 : nombre de gros objets sur le plateau gauche. */
export const T2_BIG_RANGES: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, 3],
]

/** T3 « plus de barres » : cubes unité du plateau gauche (cible = 10 + u). */
export const T3_NOBARS_UNIT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [2, 4],
  [0, 8],
]

/** Fruits unité des paliers T0/T1 (un seul fruit par item). */
export const FRUITS = [
  { emoji: '🍎', label: 'pomme' },
  { emoji: '🍊', label: 'orange' },
  { emoji: '🍓', label: 'fraise' },
  { emoji: '🍐', label: 'poire' },
  { emoji: '🍇', label: 'grappe de raisin' },
] as const

/** Paires d'objets du palier T2 — chaque paire a ses clips .2 et .3. */
export const EXCHANGE_PAIRS = [
  { pairId: 'melon-pomme', big: { emoji: '🍈', label: 'melon' }, small: { emoji: '🍎', label: 'pomme' } },
  { pairId: 'citrouille-poire', big: { emoji: '🎃', label: 'citrouille' }, small: { emoji: '🍐', label: 'poire' } },
  { pairId: 'ananas-fraise', big: { emoji: '🍍', label: 'ananas' }, small: { emoji: '🍓', label: 'fraise' } },
] as const

const BAR = { kind: 'bar', value: 10, emoji: '🟦', label: 'barre de dix' } as const
const CUBE = { kind: 'cube', value: 1, emoji: '🟧', label: 'cube' } as const

/** T3 « que des barres » : cibles possibles (t barres + u cubes à poser). */
export function onlyBarsTargets(level: number): number[] {
  if (clampLevel(level) === 0) return rangeValues(11, 15)
  // 1 barre + 0..9 cubes, ou 2 barres + 0..5 cubes (le plateau reste lisible)
  return [...rangeValues(10, 19), ...rangeValues(20, 25)]
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

/** Fabrique de jetons à ids uniques pour UN item. */
interface TokenFactory {
  make(proto: Omit<BmaToken, 'id'>, count: number): BmaToken[]
}

function tokenFactory(): TokenFactory {
  let nextId = 0
  return {
    make(proto, count) {
      return Array.from({ length: count }, (): BmaToken => ({ ...proto, id: nextId++ }))
    },
  }
}

// ------------------------------------------------------------
// Génération d'items
// ------------------------------------------------------------

/** T0 « Pareil ! » : N fruits identiques à gauche, le même nombre à poser. */
function genT0(level: number, avoid?: number): BmaItem {
  const [lo, hi] = T0_COUNT_RANGES[level]
  const count = pickAvoiding(rangeValues(lo, hi), avoid)
  const fruit = pick(FRUITS)
  const proto = { kind: 'fruit', value: 1, emoji: fruit.emoji, label: fruit.label } as const
  const f = tokenFactory()
  const left = f.make(proto, count)
  const stock = f.make(proto, Math.min(count + randInt(2, 3), 10))
  return {
    tier: 0,
    left,
    rightPrefilled: [],
    stock,
    solutionIds: stock.slice(0, count).map((t) => t.id),
  }
}

/** T1 « Complète ! » : gros poids chiffré N à gauche, k fruits fixes + ? à droite. */
function genT1(level: number, avoid?: number): BmaItem {
  const [lo, hi] = T1_TARGET_RANGES[level]
  const target = pickAvoiding(rangeValues(lo, hi), avoid)
  const [clo, chi] = T1_COMPLEMENT_RANGES[level]
  const complement = randInt(clo, Math.min(chi, target - 1))
  const fruit = pick(FRUITS)
  const proto = { kind: 'fruit', value: 1, emoji: fruit.emoji, label: fruit.label } as const
  const f = tokenFactory()
  const left = f.make({ kind: 'weight', value: target, emoji: '🪨', label: `poids de ${target}` }, 1)
  const rightPrefilled = f.make(proto, target - complement)
  const stock = f.make(proto, complement + randInt(2, 3))
  return {
    tier: 1,
    left,
    rightPrefilled,
    stock,
    solutionIds: stock.slice(0, complement).map((t) => t.id),
  }
}

/** T2 « Les échanges » : des gros objets à gauche, que des petits à droite. */
function genT2(level: number, avoid?: number): BmaItem {
  const rate = pick(T2_RATES[level])
  const pair = pick(EXCHANGE_PAIRS)
  const [blo, bhi] = T2_BIG_RANGES[level]
  const extras = level === 0 ? [0] : [0, 1]
  const combos: Array<{ big: number; extra: number }> = []
  for (let b = blo; b <= bhi; b++) for (const e of extras) combos.push({ big: b, extra: e })
  const targets = [...new Set(combos.map((c) => c.big * rate + c.extra))]
  const target = pickAvoiding(targets, avoid)
  const { big, extra } = pick(combos.filter((c) => c.big * rate + c.extra === target))
  const bigProto = { kind: 'fruit', value: rate, emoji: pair.big.emoji, label: pair.big.label } as const
  const smallProto = { kind: 'fruit', value: 1, emoji: pair.small.emoji, label: pair.small.label } as const
  const f = tokenFactory()
  const left = [...f.make(bigProto, big), ...f.make(smallProto, extra)]
  const stock = f.make(smallProto, target + randInt(2, 3))
  return {
    tier: 2,
    left,
    rightPrefilled: [],
    stock,
    rule: { pairId: pair.pairId, big: pair.big, small: pair.small, rate },
    solutionIds: stock.slice(0, target).map((t) => t.id),
  }
}

/** T3 « Barres et cubes » : le stock impose l'échange 1 barre ↔ 10 cubes. */
function genT3(level: number, avoid?: number): BmaItem {
  const f = tokenFactory()
  if (pick(['no-bars', 'only-bars'] as const) === 'no-bars') {
    // Gauche : 1 barre + u cubes — droite : plus AUCUNE barre en stock.
    const [ulo, uhi] = T3_NOBARS_UNIT_RANGES[level]
    const target = pickAvoiding(rangeValues(10 + ulo, 10 + uhi), avoid)
    const left = [...f.make(BAR, 1), ...f.make(CUBE, target - 10)]
    const stock = f.make(CUBE, target + randInt(2, 4))
    return {
      tier: 3,
      left,
      rightPrefilled: [],
      stock,
      challenge: 'no-bars',
      solutionIds: stock.slice(0, target).map((t) => t.id),
    }
  }
  // Gauche : que des cubes — droite : trop peu de cubes, il FAUT des barres.
  const target = pickAvoiding(onlyBarsTargets(level), avoid)
  const tens = Math.floor(target / 10)
  const units = target % 10
  const left = f.make(CUBE, target)
  const bars = f.make(BAR, tens + 1)
  const cubes = f.make(CUBE, units + randInt(2, 3))
  return {
    tier: 3,
    left,
    rightPrefilled: [],
    stock: [...bars, ...cubes],
    challenge: 'only-bars',
    solutionIds: [...bars.slice(0, tens), ...cubes.slice(0, units)].map((t) => t.id),
  }
}

/**
 * Génère un item résoluble pour un palier et un niveau de Tuner.
 * `avoid` = signature de l'item précédent (itemSignature) : on ne
 * repropose jamais deux fois de suite le même poids à équilibrer.
 */
export function generateItem(tier: TierId, level: number, avoid?: number): BmaItem {
  const lvl = clampLevel(level)
  if (tier === 0) return genT0(lvl, avoid)
  if (tier === 1) return genT1(lvl, avoid)
  if (tier === 2) return genT2(lvl, avoid)
  return genT3(lvl, avoid)
}

/** Signature anti-répétition d'un item : le poids du plateau gauche. */
export function itemSignature(item: BmaItem): number {
  return leftWeight(item)
}

// ------------------------------------------------------------
// Pesée / validation
// ------------------------------------------------------------

export function weightOf(tokens: readonly BmaToken[]): number {
  return tokens.reduce((s, t) => s + t.value, 0)
}

export function leftWeight(item: BmaItem): number {
  return weightOf(item.left)
}

/** Poids du plateau droit : pré-posés + jetons du stock posés (ids inconnus ignorés). */
export function rightWeight(item: BmaItem, placedIds: readonly number[]): number {
  const byId = new Map(item.stock.map((t) => [t.id, t.value]))
  return weightOf(item.rightPrefilled) + placedIds.reduce((s, id) => s + (byId.get(id) ?? 0), 0)
}

export function isBalanced(item: BmaItem, placedIds: readonly number[]): boolean {
  return rightWeight(item, placedIds) === leftWeight(item)
}

/** Côté qui DESCEND (le plus lourd) : 'left' = magicien, 'right' = enfant. */
export function tiltDirection(item: BmaItem, placedIds: readonly number[]): Tilt {
  const l = leftWeight(item)
  const r = rightWeight(item, placedIds)
  if (l === r) return 'level'
  return l > r ? 'left' : 'right'
}

// ------------------------------------------------------------
// Groupes de jetons (le stock et les plateaux se manipulent par sorte)
// ------------------------------------------------------------

/** Clé de regroupement : les jetons d'une même sorte sont interchangeables. */
export function groupKey(t: BmaToken): string {
  return `${t.kind}:${t.emoji}:${t.value}`
}

/** Premier jeton du stock de cette sorte encore disponible (pour POSER). */
export function nextStockId(
  item: BmaItem,
  placedIds: readonly number[],
  key: string,
): number | undefined {
  const used = new Set(placedIds)
  return item.stock.find((t) => groupKey(t) === key && !used.has(t.id))?.id
}

/** Dernier jeton posé de cette sorte (pour RETIRER — toujours possible). */
export function lastPlacedId(
  item: BmaItem,
  placedIds: readonly number[],
  key: string,
): number | undefined {
  const byId = new Map(item.stock.map((t) => [t.id, t]))
  for (let i = placedIds.length - 1; i >= 0; i--) {
    const t = byId.get(placedIds[i])
    if (t && groupKey(t) === key) return t.id
  }
  return undefined
}

export interface GroupDelta {
  key: string
  kind: TokenKind
  emoji: string
  value: number
  label: string
  /** > 0 : il en manque (scintille dans le stock) — < 0 : il y en a trop */
  delta: number
}

/** Écart par sorte entre LA solution et la pose actuelle — base de l'indice. */
export function hintDeltas(item: BmaItem, placedIds: readonly number[]): GroupDelta[] {
  const byId = new Map(item.stock.map((t) => [t.id, t]))
  const acc = new Map<string, GroupDelta>()
  const bump = (t: BmaToken, d: number): void => {
    const key = groupKey(t)
    const cur = acc.get(key) ?? {
      key,
      kind: t.kind,
      emoji: t.emoji,
      value: t.value,
      label: t.label,
      delta: 0,
    }
    cur.delta += d
    acc.set(key, cur)
  }
  for (const sid of item.solutionIds) {
    const t = byId.get(sid)
    if (t) bump(t, +1)
  }
  for (const pid of placedIds) {
    const t = byId.get(pid)
    if (t) bump(t, -1)
  }
  return [...acc.values()].filter((g) => g.delta !== 0)
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

export interface BmaProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: BmaProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: BmaProgress, tier: TierId, stars: 1 | 2 | 3): BmaProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
