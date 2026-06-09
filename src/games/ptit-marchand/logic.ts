// ============================================================
// Le P'tit Marchand — logique PURE (aucun import React/DOM).
// Monnaie euro, génération procédurale GARANTIE PAYABLE,
// solveur de composition optimale (indice + tests).
//
// Tous les montants sont en CENTIMES (entiers).
// Granularité 10 c : aucune pièce de 1, 2 ou 5 centimes.
//
// Leçon n°1 de la V1 : le jeu d'origine avait une palette
// plafonnée à 4,40 € → items impayables. Ici, chaque prix est
// construit À PARTIR d'une combinaison de pièces de la palette,
// puis re-vérifié par le solveur dans logic.test.ts.
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'

// ---------- Monnaie ----------

export type Denom = 10 | 20 | 50 | 100 | 200 | 500 | 1000
export type Wallet = Record<Denom, number>
export type Tier = 0 | 1 | 2 | 3

/** Valeurs faciales, de la plus grande à la plus petite. */
export const DENOMS: readonly Denom[] = [1000, 500, 200, 100, 50, 20, 10]

/** Le tiroir-caisse complet : 1×10 €, 2×5 €, 4×2 €, 4×1 €, 4×50c, 4×20c, 4×10c = 35,20 €. */
export const DRAWER: Readonly<Wallet> = {
  1000: 1,
  500: 2,
  200: 4,
  100: 4,
  50: 4,
  20: 4,
  10: 4,
}

/** Palette de monnaie offerte à l'enfant selon le palier. */
export function paletteForTier(tier: Tier): Wallet {
  if (tier === 0) {
    // T0 : apprentissage — seulement les pièces de 1 € et 2 €.
    return { 1000: 0, 500: 0, 200: 4, 100: 4, 50: 0, 20: 0, 10: 0 }
  }
  return { ...DRAWER }
}

export function walletTotal(w: Wallet): number {
  return DENOMS.reduce((sum, d) => sum + d * w[d], 0)
}

export function walletCount(w: Wallet): number {
  return DENOMS.reduce((sum, d) => sum + w[d], 0)
}

export function coinsTotal(coins: readonly Denom[]): number {
  return coins.reduce((sum, d) => sum + d, 0)
}

/** Retire une liste de pièces d'un porte-monnaie. null si le stock est insuffisant. */
export function removeFromWallet(w: Wallet, coins: readonly Denom[]): Wallet | null {
  const out: Wallet = { ...w }
  for (const d of coins) {
    out[d] -= 1
    if (out[d] < 0) return null
  }
  return out
}

/**
 * Composition optimale (nombre minimal de pièces) d'un montant exact
 * avec le stock disponible. DP sac-à-dos 0/1 sur chaque pièce physique
 * (montants ≤ 10 €, ~23 pièces : trivial). null si impossible.
 */
export function minCoinsFor(amount: number, wallet: Wallet): Denom[] | null {
  if (!Number.isInteger(amount) || amount < 0 || amount % 10 !== 0) return null
  if (amount === 0) return []
  if (amount > walletTotal(wallet)) return null
  const units = amount / 10
  const best: (readonly Denom[] | null)[] = Array.from({ length: units + 1 }, () => null)
  best[0] = []
  for (const d of DENOMS) {
    const u = d / 10
    for (let k = 0; k < wallet[d]; k++) {
      // v décroissant : chaque pièce physique utilisée au plus une fois.
      for (let v = units; v >= u; v--) {
        const prev = best[v - u]
        if (prev === null) continue
        const cur = best[v]
        if (cur === null || prev.length + 1 < cur.length) {
          best[v] = [...prev, d]
        }
      }
    }
  }
  const res = best[units]
  return res === null ? null : [...res].sort((a, b) => b - a)
}

/** Le montant est-il composable exactement avec ce stock ? */
export function canPay(amount: number, wallet: Wallet): boolean {
  return minCoinsFor(amount, wallet) !== null
}

// ---------- Affichage ----------

/** Découpe un montant en euros entiers + centimes (0..90). */
export function splitPrice(cents: number): { euros: number; cents: number } {
  return { euros: Math.floor(cents / 100), cents: cents % 100 }
}

/** Étiquette de prix enfant : '3 €', '2 € 50', '50 c'. */
export function formatPrice(cents: number): string {
  const { euros, cents: c } = splitPrice(cents)
  if (c === 0) return `${euros} €`
  if (euros === 0) return `${c} c`
  return `${euros} € ${c}`
}

/** Nom parlé d'une valeur faciale (aria-labels). */
export function denomLabel(d: Denom): string {
  switch (d) {
    case 10: return '10 centimes'
    case 20: return '20 centimes'
    case 50: return '50 centimes'
    case 100: return '1 euro'
    case 200: return '2 euros'
    case 500: return 'billet de 5 euros'
    case 1000: return 'billet de 10 euros'
  }
}

// ---------- Catalogue : rayons et articles ----------

export interface Article {
  id: string
  /** Nom français avec article ('une pomme') — texte des clips ptm.art.<id>. */
  name: string
  emoji: string
}

export interface Shelf {
  id: string
  name: string
  emoji: string
  articles: readonly Article[]
}

/** Les rayons se débloquent un à un (récompense-monde) : index 0 dès le départ. */
export const SHELVES: readonly Shelf[] = [
  {
    id: 'fruits',
    name: 'Fruits',
    emoji: '🍎',
    articles: [
      { id: 'pomme', name: 'une pomme', emoji: '🍎' },
      { id: 'banane', name: 'une banane', emoji: '🍌' },
      { id: 'poire', name: 'une poire', emoji: '🍐' },
      { id: 'fraises', name: 'des fraises', emoji: '🍓' },
    ],
  },
  {
    id: 'boulangerie',
    name: 'Boulangerie',
    emoji: '🥖',
    articles: [
      { id: 'baguette', name: 'une baguette', emoji: '🥖' },
      { id: 'croissant', name: 'un croissant', emoji: '🥐' },
      { id: 'cookie', name: 'un cookie', emoji: '🍪' },
      { id: 'gateau', name: 'un petit gâteau', emoji: '🧁' },
    ],
  },
  {
    id: 'glaces',
    name: 'Glaces',
    emoji: '🍦',
    articles: [
      { id: 'glace', name: 'une glace', emoji: '🍦' },
      { id: 'sorbet', name: 'un sorbet', emoji: '🍧' },
      { id: 'coupe', name: 'une coupe glacée', emoji: '🍨' },
      { id: 'gaufre', name: 'une gaufre', emoji: '🧇' },
    ],
  },
  {
    id: 'jouets',
    name: 'Jouets',
    emoji: '🧸',
    articles: [
      { id: 'nounours', name: 'un nounours', emoji: '🧸' },
      { id: 'yoyo', name: 'un yoyo', emoji: '🪀' },
      { id: 'ballon', name: 'un ballon', emoji: '🎈' },
      { id: 'voiture', name: 'une petite voiture', emoji: '🚗' },
    ],
  },
  {
    id: 'fleurs',
    name: 'Fleurs',
    emoji: '🌻',
    articles: [
      { id: 'tournesol', name: 'un tournesol', emoji: '🌻' },
      { id: 'rose', name: 'une rose', emoji: '🌹' },
      { id: 'tulipe', name: 'une tulipe', emoji: '🌷' },
      { id: 'bouquet', name: 'un bouquet', emoji: '💐' },
    ],
  },
  {
    id: 'papeterie',
    name: 'Papeterie',
    emoji: '📚',
    articles: [
      { id: 'livre', name: 'un livre', emoji: '📕' },
      { id: 'crayon', name: 'un crayon', emoji: '✏️' },
      { id: 'cahier', name: 'un cahier', emoji: '📒' },
      { id: 'feutres', name: 'des feutres', emoji: '🖍️' },
    ],
  },
]

/** Compétence du skill-map exercée par chaque palier. */
export const TIER_SKILLS: readonly [string, string, string, string] = [
  'ma.cp.monnaie.pieces',
  'ma.cp.monnaie.payer',
  'ma.cp.monnaie.rendre',
  'ma.cp.add10',
]

// ---------- Items ----------

/** Le client achète : l'enfant compose le PRIX exact (1 article, ou 2 au T3). */
export interface PayItem {
  kind: 'pay'
  articles: readonly Article[]
  /** Prix en centimes, aligné sur articles. */
  prices: readonly number[]
  /** Montant à composer sur le plateau = somme des prix. */
  target: number
  /** T0 : le total du plateau est affiché. T1/T3 : masqué ('?'). */
  showTotal: boolean
}

/** Le client paie avec un billet : l'enfant compose la MONNAIE À RENDRE. */
export interface ChangeItem {
  kind: 'change'
  article: Article
  /** Prix de l'article en centimes. */
  price: number
  /** Billet posé sur le comptoir. */
  bill: 500 | 1000
  /** Montant à composer sur le plateau = bill - price. */
  target: number
}

export type Item = PayItem | ChangeItem

const MAX_TRIES = 200

function articlesPool(shelvesUnlocked: number): readonly Article[] {
  const n = Math.max(1, Math.min(shelvesUnlocked, SHELVES.length))
  return SHELVES.slice(0, n).flatMap((s) => s.articles)
}

function clampLevel(level: number): 1 | 2 | 3 {
  const l = Math.round(level)
  if (l <= 1) return 1
  if (l >= 3) return 3
  return 2
}

// Plafonds de difficulté par niveau du Tuner (1..3), en centimes.
const T0_CAP = [300, 400, 500] as const
const T1_CAP = [500, 700, 950] as const
const T3_CAP = [600, 800, 1000] as const

/** T0 : prix entier 1..5 €, tiré d'une combinaison de pièces 2 € / 1 €. */
function genT0(lvl: 1 | 2 | 3, pool: readonly Article[]): PayItem {
  let target = 300 // repli déterministe (2 € + 1 €), toujours payable
  for (let i = 0; i < MAX_TRIES; i++) {
    const t = 200 * randInt(0, 2) + 100 * randInt(0, 2)
    if (t >= 100 && t <= T0_CAP[lvl - 1]) {
      target = t
      break
    }
  }
  return { kind: 'pay', articles: [pick(pool)], prices: [target], target, showTotal: true }
}

/** T1 : prix en X € ou X € 50, de 1 € à 9 € 50, tiré de la palette complète. */
function genT1(lvl: 1 | 2 | 3, pool: readonly Article[]): PayItem {
  let target = 350 // repli : 2 € + 1 € + 50c
  for (let i = 0; i < MAX_TRIES; i++) {
    const t =
      500 * randInt(0, 1) +
      200 * randInt(0, 2) +
      100 * randInt(0, 2) +
      50 * randInt(0, 1)
    if (t >= 100 && t <= T1_CAP[lvl - 1]) {
      target = t
      break
    }
  }
  return { kind: 'pay', articles: [pick(pool)], prices: [target], target, showTotal: false }
}

/** T2 : la monnaie à rendre est tirée d'une combinaison de pièces 2 € / 1 € / 50c. */
function genT2(lvl: 1 | 2 | 3, pool: readonly Article[]): ChangeItem {
  const bill: 500 | 1000 = lvl === 1 ? 500 : pick([500, 1000] as const)
  let change = 150 // repli : 1 € + 50c
  for (let i = 0; i < MAX_TRIES; i++) {
    const c = 200 * randInt(0, 4) + 100 * randInt(0, 2) + 50 * randInt(0, 1)
    // L'article coûte au moins 1 € → la monnaie rendue est au plus bill - 100.
    if (c >= 50 && c <= bill - 100) {
      change = c
      break
    }
  }
  return { kind: 'change', article: pick(pool), price: bill - change, bill, target: change }
}

/** T3 : DEUX articles à prix entiers simples (1..5 €), somme ≤ 10 €. */
function genT3(lvl: 1 | 2 | 3, pool: readonly Article[]): PayItem {
  const [a1, a2] = shuffle(pool)
  let p1 = 200
  let p2 = 300
  for (let i = 0; i < MAX_TRIES; i++) {
    const c1 = 100 * randInt(1, 5)
    const c2 = 100 * randInt(1, 5)
    if (c1 + c2 <= T3_CAP[lvl - 1]) {
      p1 = c1
      p2 = c2
      break
    }
  }
  return {
    kind: 'pay',
    articles: [a1, a2],
    prices: [p1, p2],
    target: p1 + p2,
    showTotal: false,
  }
}

/**
 * Génère un item du palier donné. `level` = niveau du Tuner (1..3),
 * `shelvesUnlocked` = nombre de rayons débloqués (les articles viennent
 * uniquement des rayons ouverts). GARANTIE : target est composable avec
 * paletteForTier(tier) — prouvé par logic.test.ts (500 tirages/palier).
 */
export function genItem(tier: Tier, level: number, shelvesUnlocked: number = SHELVES.length): Item {
  const lvl = clampLevel(level)
  const pool = articlesPool(shelvesUnlocked)
  switch (tier) {
    case 0: return genT0(lvl, pool)
    case 1: return genT1(lvl, pool)
    case 2: return genT2(lvl, pool)
    case 3: return genT3(lvl, pool)
  }
}
