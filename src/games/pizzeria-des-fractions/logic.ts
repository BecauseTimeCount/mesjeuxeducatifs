// ============================================================
// La Pizzeria des Fractions — logique PURE.
// Fractions précoces du CE1 (moitié, tiers, quart, programme 2025) :
// partage en parts égales (pizza ronde = diamètres, gâteau = lignes),
// service d'une fraction d'un découpage (équivalences 2/4 = 1/2),
// lecture de la notation fractionnaire (tickets + distracteurs).
// Aucun import React/DOM. Prouvé par logic.test.ts.
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'

export type TierId = 0 | 1 | 2
export type Support = 'pizza' | 'gateau'

export interface Frac {
  num: number
  den: number
}

export const TIER_COUNT = 3
export const ITEMS_PER_RUN = 8
/** Le Tuner a 3 crans : 0 = commandes simples, 2 = tout le menu. */
export const MAX_TUNER_LEVEL = 2

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'ma.ce1.fractions.parts',
  'ma.ce1.fractions.parts',
  'ma.ce1.fractions.lire',
] as const

/** Les clients-animaux de la pizzeria. */
export const CLIENTS = ['🐰', '🦊', '🐻', '🐱', '🐶', '🐭'] as const

export const SUPPORTS: readonly Support[] = ['pizza', 'gateau']

// ------------------------------------------------------------
// Fractions — comparaison en valeur et étiquettes
// ------------------------------------------------------------

/** Égalité EN VALEUR (2/4 est égal à 1/2) — produit en croix. */
export function fracEquals(a: Frac, b: Frac): boolean {
  return a.num * b.den === b.num * a.den
}

/** Étiquette du ticket : « 1/2 », « 3/4 »… */
export function fracLabel(f: Frac): string {
  return `${f.num}/${f.den}`
}

const FRAC_TEXTS: Readonly<Record<string, string>> = {
  '1/2': 'la moitié',
  '1/3': 'un tiers',
  '2/3': 'deux tiers',
  '1/4': 'un quart',
  '3/4': 'trois quarts',
}

/** Texte français de la commande (bulle du client). */
export function fracText(f: Frac): string {
  if (f.num === f.den) return 'tout entier !'
  return FRAC_TEXTS[fracLabel(f)] ?? fracLabel(f)
}

const FRAC_CLIPS: Readonly<Record<string, string>> = {
  '1/2': 'pzf.frac.moitie',
  '1/3': 'pzf.frac.un-tiers',
  '2/3': 'pzf.frac.deux-tiers',
  '1/4': 'pzf.frac.un-quart',
  '3/4': 'pzf.frac.trois-quarts',
}

const LU_CLIPS: Readonly<Record<string, string>> = {
  '1/2': 'pzf.lu.un-demi',
  '1/3': 'pzf.lu.un-tiers',
  '2/3': 'pzf.lu.deux-tiers',
  '1/4': 'pzf.lu.un-quart',
  '3/4': 'pzf.lu.trois-quarts',
}

/** Clip audio de la fraction : voix client (tier 1) ou lecture (tier 2). */
export function fracClipId(f: Frac, written: boolean): string {
  if (f.num === f.den) return 'pzf.frac.tout'
  const key = fracLabel(f)
  return (written ? LU_CLIPS[key] : FRAC_CLIPS[key]) ?? 'pzf.frac.tout'
}

// ------------------------------------------------------------
// Pizza ronde — coupes = diamètres (0°, 45°, 90°, 135°)
// ------------------------------------------------------------

/** Diamètres possibles de la ronde (8 encoches = 4 diamètres). */
export const PIZZA_DIAMETERS = [0, 45, 90, 135] as const

/** Ramène un angle d'encoche (0..359, voire négatif) à son diamètre 0..179. */
export function normalizeDiameter(angle: number): number {
  return ((angle % 180) + 180) % 180
}

/** Rayons de coupe triés (chaque diamètre donne 2 rayons opposés). */
export function pizzaRays(diameters: readonly number[]): number[] {
  const set = new Set<number>()
  for (const d of diameters) {
    const a = normalizeDiameter(d)
    set.add(a)
    set.add(a + 180)
  }
  return [...set].sort((x, y) => x - y)
}

/** Tailles (en degrés) des parts obtenues. Sans coupe : une part de 360°. */
export function pizzaSectors(diameters: readonly number[]): number[] {
  const rays = pizzaRays(diameters)
  if (rays.length === 0) return [360]
  return rays.map((a, i) => {
    const next = i + 1 < rays.length ? rays[i + 1] : rays[0] + 360
    return next - a
  })
}

// ------------------------------------------------------------
// Gâteau rectangulaire — coupes = lignes verticales (en douzièmes)
// ------------------------------------------------------------

/** Largeur du gâteau en douzièmes (12 = PPCM de 2, 3, 4). */
export const GATEAU_UNITS = 12

/** Les 5 encoches : 1/4, 1/3, 1/2, 2/3, 3/4 de la largeur. */
export const GATEAU_NOTCHES = [3, 4, 6, 8, 9] as const

/** Bornes des morceaux : [0, coupes triées dédoublonnées, 12]. */
export function gateauBoundaries(cuts: readonly number[]): number[] {
  const inner = [...new Set(cuts)]
    .filter((c) => c > 0 && c < GATEAU_UNITS)
    .sort((a, b) => a - b)
  return [0, ...inner, GATEAU_UNITS]
}

/** Tailles (en douzièmes) des morceaux obtenus. Sans coupe : [12]. */
export function gateauSegments(cuts: readonly number[]): number[] {
  const b = gateauBoundaries(cuts)
  return b.slice(1).map((v, i) => v - b[i])
}

// ------------------------------------------------------------
// Validation d'un partage (tier 0)
// ------------------------------------------------------------

export type CutReason = 'ok' | 'count' | 'unequal'

export interface CutCheck {
  ok: boolean
  /** Nombre de parts obtenues */
  parts: number
  /** Tailles des parts, dans l'ordre du rendu */
  sizes: number[]
  reason: CutReason
}

/** Le partage donne-t-il exactement `targetParts` parts ÉGALES ? */
export function checkCuts(
  support: Support,
  cuts: readonly number[],
  targetParts: number,
): CutCheck {
  const sizes = support === 'pizza' ? pizzaSectors(cuts) : gateauSegments(cuts)
  const equal = sizes.every((s) => s === sizes[0])
  if (!equal) return { ok: false, parts: sizes.length, sizes, reason: 'unequal' }
  if (sizes.length !== targetParts) {
    return { ok: false, parts: sizes.length, sizes, reason: 'count' }
  }
  return { ok: true, parts: sizes.length, sizes, reason: 'ok' }
}

/**
 * Un partage correct canonique (pour l'indice : les encoches qui pulsent).
 * La ronde ne sait faire que 2 et 4 (diamètres) — la génération garantit
 * qu'on ne demande jamais une ronde en 3.
 */
export function correctCuts(support: Support, parts: number): number[] {
  if (support === 'pizza') {
    if (parts === 2) return [90]
    if (parts === 4) return [0, 90]
    return []
  }
  if (parts === 2) return [6]
  if (parts === 3) return [4, 8]
  if (parts === 4) return [3, 6, 9]
  return []
}

// ------------------------------------------------------------
// Service d'une fraction (tiers 1 et 2)
// ------------------------------------------------------------

/** Nombre de parts à servir pour une cible et un découpage. null si impossible. */
export function neededParts(target: Frac, totalParts: number): number | null {
  const raw = (target.num * totalParts) / target.den
  return Number.isInteger(raw) ? raw : null
}

/** Le service est-il exact ? selected/totalParts === num/den (produit en croix). */
export function servedFraction(selected: number, totalParts: number, target: Frac): boolean {
  return selected * target.den === target.num * totalParts
}

// ------------------------------------------------------------
// Étiquettes (tier 2) — distracteurs JAMAIS égaux en valeur
// ------------------------------------------------------------

/**
 * Deux distracteurs pour un ticket : numérateur ±1, fraction inversée,
 * dénominateur voisin en secours. Garanties prouvées par les tests :
 * jamais égaux EN VALEUR à la cible (1/2 n'a jamais 2/4 en distracteur),
 * jamais égaux entre eux, étiquettes toutes distinctes.
 */
export function distractorsFor(target: Frac): [Frac, Frac] {
  const candidates: Frac[] = []
  if (target.num + 1 <= target.den) candidates.push({ num: target.num + 1, den: target.den })
  if (target.num - 1 >= 1) candidates.push({ num: target.num - 1, den: target.den })
  if (target.num !== target.den) candidates.push({ num: target.den, den: target.num })
  candidates.push({ num: target.num, den: target.den + 1 })
  if (target.den - 1 >= 1) candidates.push({ num: target.num, den: target.den - 1 })

  const out: Frac[] = []
  for (const c of candidates) {
    if (c.num < 1 || c.den < 1) continue
    if (fracEquals(c, target)) continue
    if (out.some((o) => fracEquals(o, c) || fracLabel(o) === fracLabel(c))) continue
    out.push(c)
    if (out.length === 2) break
  }
  return [out[0], out[1]]
}

/** Les 3 tickets mélangés : la cible + 2 distracteurs. */
export function labelChoices(target: Frac): Frac[] {
  return shuffle([target, ...distractorsFor(target)])
}

// ------------------------------------------------------------
// Items — génération procédurale
// ------------------------------------------------------------

export interface CutItem {
  kind: 'cut'
  support: Support
  parts: 2 | 3 | 4
  client: string
}

export interface ServeItem {
  kind: 'serve'
  support: Support
  /** Découpage déjà présent (peut différer du dénominateur : 1/2 sur 4 parts) */
  totalParts: number
  target: Frac
  /** Tier 2 : la commande est aussi ÉCRITE sur un ticket */
  written: boolean
  client: string
}

export interface LabelItem {
  kind: 'label'
  support: Support
  totalParts: number
  /** Parts déjà dans l'assiette du client */
  served: number
  target: Frac
  choices: Frac[]
  client: string
}

export type PzfItem = CutItem | ServeItem | LabelItem

/** Clé d'anti-répétition : deux commandes identiques d'affilée sont interdites. */
export function itemKey(item: PzfItem): string {
  if (item.kind === 'cut') return `cut:${item.support}:${item.parts}`
  if (item.kind === 'serve') return `serve:${fracLabel(item.target)}@${item.totalParts}`
  return `label:${fracLabel(item.target)}@${item.totalParts}`
}

/**
 * Commandes de coupe par niveau de Tuner. La ronde n'est JAMAIS demandée
 * en 3 (couper des tiers exacts au diamètre est impossible) : le tiers
 * passe par le gâteau — c'est l'essentiel pédagogique, pas la géométrie.
 */
export function cutPoolFor(level: number): ReadonlyArray<{ support: Support; parts: 2 | 3 | 4 }> {
  const pool: Array<{ support: Support; parts: 2 | 3 | 4 }> = [
    { support: 'pizza', parts: 2 },
    { support: 'gateau', parts: 2 },
  ]
  if (level >= 1) {
    pool.push({ support: 'gateau', parts: 3 }, { support: 'pizza', parts: 4 })
  }
  if (level >= 2) pool.push({ support: 'gateau', parts: 4 })
  return pool
}

function generateCut(level: number, prevKey: string | null): CutItem {
  const pool = cutPoolFor(level)
  const candidates = pool.filter(
    (c) => `cut:${c.support}:${c.parts}` !== prevKey,
  )
  const c = pick(candidates.length > 0 ? candidates : pool)
  return { kind: 'cut', support: c.support, parts: c.parts, client: pick(CLIENTS) }
}

/** Dénominateurs ouverts par niveau : le tiers arrive au niveau 1. */
export function densForLevel(level: number): readonly number[] {
  return level <= 0 ? [2, 4] : [2, 3, 4]
}

/** Cibles parlées (num < den) : moitié, tiers, deux tiers, quart, trois quarts. */
export const SERVE_TARGETS: readonly Frac[] = [
  { num: 1, den: 2 },
  { num: 1, den: 3 },
  { num: 2, den: 3 },
  { num: 1, den: 4 },
  { num: 3, den: 4 },
]

export function targetsForLevel(level: number): Frac[] {
  const dens = densForLevel(level)
  return SERVE_TARGETS.filter((t) => dens.includes(t.den))
}

export interface ServeOpts {
  /** Gag « toute la pizza ! » (tier 1, niveau 1+) */
  allowGag: boolean
  /** Équivalence forcée : « la moitié » sur une pizza en 4 (2 parts !) */
  allowEquiv: boolean
  written: boolean
}

function mkServe(target: Frac, totalParts: number, written: boolean, support?: Support): ServeItem {
  return {
    kind: 'serve',
    // Forcé pour les commandes dont le clip nomme « la pizza » (gag, équivalence) ;
    // sinon support au hasard. Évite « la pizza coupée en quatre » sur un gâteau.
    support: support ?? pick(SUPPORTS),
    totalParts,
    target,
    written,
    client: pick(CLIENTS),
  }
}

export function generateServe(
  level: number,
  prevKey: string | null,
  opts: ServeOpts,
): ServeItem {
  // Gag d'Henri (~1 fois sur 7) : « toute la pizza ! » — on sert tout.
  if (opts.allowGag && randInt(1, 7) === 1) {
    const den = pick(densForLevel(level))
    const gag = mkServe({ num: den, den }, den, opts.written, 'pizza')
    if (itemKey(gag) !== prevKey) return gag
  }
  // Équivalence forcée (~1 fois sur 4) : la moitié d'une pizza en 4 = 2 parts.
  if (opts.allowEquiv && randInt(1, 4) === 1) {
    const equiv = mkServe({ num: 1, den: 2 }, 4, opts.written, 'pizza')
    if (itemKey(equiv) !== prevKey) return equiv
  }
  const targets = targetsForLevel(level)
  const candidates = targets.filter(
    (t) => `serve:${fracLabel(t)}@${t.den}` !== prevKey,
  )
  const target = pick(candidates.length > 0 ? candidates : targets)
  return mkServe(target, target.den, opts.written)
}

function generateLabel(level: number, prevKey: string | null): LabelItem {
  const targets = targetsForLevel(level)
  const candidates = targets.filter(
    (t) => `label:${fracLabel(t)}@${t.den}` !== prevKey,
  )
  const target = pick(candidates.length > 0 ? candidates : targets)
  return {
    kind: 'label',
    support: pick(SUPPORTS),
    totalParts: target.den,
    served: target.num,
    target,
    choices: labelChoices(target),
    client: pick(CLIENTS),
  }
}

/**
 * Item suivant d'une partie. `slot` = index de l'item (0..7) : au tier 2,
 * les modes alternent (pair = servir d'après le ticket, impair = trouver
 * le ticket des parts servies).
 */
export function generateItem(
  tier: TierId,
  level: number,
  prevKey: string | null,
  slot = 0,
): PzfItem {
  if (tier === 0) return generateCut(level, prevKey)
  if (tier === 1) {
    return generateServe(level, prevKey, {
      allowGag: level >= 1,
      allowEquiv: true,
      written: false,
    })
  }
  return slot % 2 === 0
    ? generateServe(level, prevKey, { allowGag: false, allowEquiv: false, written: true })
    : generateLabel(level, prevKey)
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

export interface PzfProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: PzfProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: PzfProgress, tier: TierId, stars: 1 | 2 | 3): PzfProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
