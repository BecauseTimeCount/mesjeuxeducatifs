// ============================================================
// Les Mots de la Semaine — logique PURE.
// Tirages procéduraux du quiz (« Attrape les mots ») et du tri
// (« Range les familles »), mémoire d'exposition de l'imagier,
// progression par mode. Aucun import React/engine — le hasard
// est implémenté localement. Prouvé par logic.test.ts.
// ============================================================

import type { ThemeDef, ThemeId, WordDef } from './words'
import { THEMES, THEMES_BY_ID } from './words'

/** Demandes par partie d'« Attrape les mots » (mots non répétés). */
export const ATTRAPE_REQUESTS = 8
/** Items par partie de « Range les familles ». */
export const FAMILLES_ITEMS = 10
/** Le Tuner a 3 crans : 0 → 4 images, 1 → 6 images, 2 → 8 images. */
export const MAX_TUNER_LEVEL = 2

/** Compétences travaillées (doivent refléter games.manifest). */
export const ATTRAPE_SKILL = 'fr.gs.vocab.mots'
export const FAMILLES_SKILL = 'fr.gs.vocab.categories'

// ------------------------------------------------------------
// Hasard local (zéro import engine — la logique reste pure)
// ------------------------------------------------------------

function shuffleLocal<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

function pickLocal<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

export type ChooseFn = <T>(arr: readonly T[]) => T

// ------------------------------------------------------------
// « Attrape les mots » — tirages
// ------------------------------------------------------------

/** Nombre d'images affichées pour un niveau de Tuner (4 → 8). */
export function choicesFor(level: number): number {
  const l = Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
  return 4 + 2 * l
}

/** Tire n cibles UNIQUES parmi les mots du thème, dans un ordre aléatoire. */
export function pickTargets(words: readonly WordDef[], n: number): WordDef[] {
  return shuffleLocal(words).slice(0, Math.max(0, Math.min(n, words.length)))
}

/**
 * Images affichées pour une demande : la cible + des distracteurs du MÊME
 * thème (proximité sémantique : choisir EST ici la compétence réceptive).
 * Toujours uniques, toujours mélangées, la cible toujours présente.
 */
export function buildChoices(
  words: readonly WordDef[],
  target: WordDef,
  count: number,
): WordDef[] {
  const others = shuffleLocal(words.filter((w) => w.slug !== target.slug))
  const n = Math.max(2, Math.min(count, words.length))
  return shuffleLocal([target, ...others.slice(0, n - 1)])
}

export interface AttrapeItem {
  target: WordDef
  choices: WordDef[]
}

/** Une partie complète : cibles uniques, choix recalculés par demande. */
export function generateAttrapeRun(
  words: readonly WordDef[],
  requests: number = ATTRAPE_REQUESTS,
  count = 6,
): AttrapeItem[] {
  return pickTargets(words, requests).map((target) => ({
    target,
    choices: buildChoices(words, target, count),
  }))
}

// ------------------------------------------------------------
// « Range les familles » — mélange procédural de 2 thèmes
// ------------------------------------------------------------

export interface FamillesItem {
  word: WordDef
  /** Le thème (= panier) auquel appartient le mot */
  themeId: ThemeId
}

/** Mélange équilibré de 2 thèmes : moitié-moitié, ordre aléatoire, sans doublon. */
export function generateFamillesRun(
  a: ThemeDef,
  b: ThemeDef,
  items: number = FAMILLES_ITEMS,
): FamillesItem[] {
  const nA = Math.min(Math.ceil(items / 2), a.words.length)
  const nB = Math.min(items - nA, b.words.length)
  const fromA = shuffleLocal(a.words)
    .slice(0, nA)
    .map((word): FamillesItem => ({ word, themeId: a.id }))
  const fromB = shuffleLocal(b.words)
    .slice(0, nB)
    .map((word): FamillesItem => ({ word, themeId: b.id }))
  return shuffleLocal([...fromA, ...fromB])
}

// ------------------------------------------------------------
// Score & progression (mémoire d'exposition + étoiles par mode)
// ------------------------------------------------------------

/** Étoiles d'une partie : seuls les PREMIERS essais comptent. */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface MdsProgress {
  /** Mots écoutés au moins une fois dans l'imagier (clé = slug). */
  explored: Record<string, true>
  /** Meilleures étoiles par mode : 'attrape:<theme>' ou 'familles'. */
  bestStars: Record<string, 0 | 1 | 2 | 3>
  runs: number
}

export const FRESH_PROGRESS: MdsProgress = { explored: {}, bestStars: {}, runs: 0 }

export function attrapeKey(theme: ThemeId): string {
  return `attrape:${theme}`
}

export const FAMILLES_KEY = 'familles'

/** Marque un mot comme exposé. Identité préservée si déjà exploré. */
export function applyExplored(p: MdsProgress, slug: string): MdsProgress {
  if (p.explored[slug] === true) return p
  return { ...p, explored: { ...p.explored, [slug]: true } }
}

/** Nombre de mots du thème déjà écoutés dans l'imagier. */
export function exploredCount(p: MdsProgress, theme: ThemeId): number {
  const t = THEMES_BY_ID.get(theme)
  if (!t) return 0
  return t.words.filter((w) => p.explored[w.slug] === true).length
}

/** Un thème n'est jouable en quiz que si TOUS ses mots ont été écoutés. */
export function isThemeExplored(p: MdsProgress, theme: ThemeId): boolean {
  const t = THEMES_BY_ID.get(theme)
  return t !== undefined && exploredCount(p, theme) >= t.words.length
}

/** Les thèmes entièrement explorés, dans l'ordre de l'imagier. */
export function exploredThemes(p: MdsProgress): ThemeId[] {
  return THEMES.filter((t) => isThemeExplored(p, t.id)).map((t) => t.id)
}

/** Applique le résultat d'une partie : meilleur score conservé, runs +1. */
export function applyRun(p: MdsProgress, key: string, stars: 1 | 2 | 3): MdsProgress {
  const best = Math.max(p.bestStars[key] ?? 0, stars) as 0 | 1 | 2 | 3
  return { ...p, bestStars: { ...p.bestStars, [key]: best }, runs: p.runs + 1 }
}

/** Meilleur score d'« Attrape les mots », tous thèmes confondus. */
export function bestAttrapeStars(p: MdsProgress): number {
  return THEMES.reduce((acc, t) => Math.max(acc, p.bestStars[attrapeKey(t.id)] ?? 0), 0)
}

/**
 * « Range les familles » se débloque à 2 étoiles en « Attrape les mots »,
 * et exige au moins 2 thèmes entièrement explorés (on ne trie que des
 * mots déjà exposés).
 */
export function famillesUnlocked(p: MdsProgress): boolean {
  return exploredThemes(p).length >= 2 && bestAttrapeStars(p) >= 2
}

/** Second panier : un AUTRE thème déjà exploré, tiré au hasard. */
export function pickPartnerTheme(
  p: MdsProgress,
  current: ThemeId,
  choose: ChooseFn = pickLocal,
): ThemeId | null {
  const others = exploredThemes(p).filter((t) => t !== current)
  return others.length > 0 ? choose(others) : null
}
