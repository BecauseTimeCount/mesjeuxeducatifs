// ============================================================
// Fluence Express — logique PURE.
// Génération des items (mots, phrases, textes duo), distracteurs
// orthographiques intelligents, chrono interne → mots/min,
// progression + journal de fluence. Zéro import React/engine.
// Prouvé par logic.test.ts.
// ============================================================

import type { SentencePart, WordEntry } from './words'
import {
  ACTIONS,
  DUO_ANIMAUX,
  DUO_FRUITS,
  DUO_LIEUX,
  DUO_PRENOMS,
  DUO_TEMPLATES,
  PLACES,
  SUBJECTS,
  WORDS,
} from './words'

export type TierId = 0 | 1 | 2

export const TIER_COUNT = 3
/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = ['fr.cp.fluence', 'fr.cp.fluence', 'fr.ce1.fluence'] as const
export const DUO_SKILL = 'fr.ce1.fluence'

export const WORD_ITEMS_PER_RUN = 10
export const SENTENCE_ITEMS_PER_RUN = 8
/** Le Tuner a 3 crans sur la LONGUEUR des mots (0 = courts, 2 = longs). */
export const MAX_TUNER_LEVEL = 2

export function itemsPerRun(tier: TierId): number {
  return tier === 2 ? SENTENCE_ITEMS_PER_RUN : WORD_ITEMS_PER_RUN
}

// ------------------------------------------------------------
// Hasard local (logic.ts n'importe pas le moteur)
// ------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]
}

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ------------------------------------------------------------
// Mode « Train des mots » (paliers 0 et 1)
// ------------------------------------------------------------

export const WORD_CHOICES = 4

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

/** Longueur maximale (en syllabes) des MOTS-CIBLES pour un cran de Tuner. */
export function maxSyllablesFor(level: number): number {
  const l = clampLevel(level)
  if (l === 0) return 2
  if (l === 1) return 3
  return 99
}

export function wordBank(tier: 0 | 1): WordEntry[] {
  return WORDS.filter((w) => w.tier === tier)
}

/**
 * Pool de cibles d'un palier pour un cran de Tuner : mots de plus en plus
 * longs quand le niveau monte. Jamais vide : retombe sur la banque entière
 * si le filtre est trop strict.
 */
export function wordPoolFor(tier: 0 | 1, level: number): WordEntry[] {
  const bank = wordBank(tier)
  const filtered = bank.filter((w) => w.syllables.length <= maxSyllablesFor(level))
  return filtered.length >= WORD_CHOICES * 2 ? filtered : bank
}

/** Rime graphique grossière : deux dernières lettres identiques. */
function sameRime(a: WordEntry, b: WordEntry): boolean {
  return a.word.slice(-2) === b.word.slice(-2)
}

/**
 * Distracteurs INTELLIGENTS : voisins orthographiques de la banque.
 * Score : même attaque (+2), même rime graphique (+2), même famille
 * phonique (+2), même nombre de syllabes (+1). Tirage aléatoire parmi
 * les égalités (les candidats sont mélangés avant le tri stable).
 */
export function pickDistractors(
  target: WordEntry,
  candidates: readonly WordEntry[],
  n = WORD_CHOICES - 1,
): WordEntry[] {
  const pool = candidates.filter((c) => c.word !== target.word && c.emoji !== target.emoji)
  const score = (c: WordEntry): number =>
    (c.word[0] === target.word[0] ? 2 : 0) +
    (sameRime(c, target) ? 2 : 0) +
    (c.famille === target.famille ? 2 : 0) +
    (c.syllables.length === target.syllables.length ? 1 : 0)
  return shuffled(pool)
    .sort((a, b) => score(b) - score(a))
    .slice(0, n)
}

export interface WordItem {
  target: WordEntry
  /** 4 wagons-images, mélangés ; choices[answerIndex] === target */
  choices: WordEntry[]
  answerIndex: number
}

/**
 * Item du Train des mots : une cible (jamais répétée dans la partie via
 * `usedWords`) + 3 distracteurs voisins tirés dans toute la banque du palier.
 * Au cran 2 du Tuner, biais vers les mots de 3 syllabes et plus.
 */
export function buildWordItem(
  tier: 0 | 1,
  level: number,
  usedWords: readonly string[] = [],
): WordItem {
  const pool = wordPoolFor(tier, level)
  const usedSet = new Set(usedWords)
  const fresh = pool.filter((w) => !usedSet.has(w.word))
  const candidates = fresh.length > 0 ? fresh : pool
  const biased =
    clampLevel(level) >= 2
      ? [...candidates, ...candidates.filter((w) => w.syllables.length >= 3)]
      : candidates
  const target = pickOne(biased)
  const distractors = pickDistractors(target, wordBank(tier))
  const choices = shuffled([target, ...distractors])
  return { target, choices, answerIndex: choices.findIndex((c) => c.word === target.word) }
}

/** Texte d'enseignement syllabique : « la... va... bo... lavabo ! » */
export function teachingText(entry: WordEntry): string {
  return `${entry.syllables.join('... ')}... ${entry.word} !`
}

// ------------------------------------------------------------
// Mode « Phrases express » (palier 2)
// ------------------------------------------------------------

export const SENTENCE_CHOICES = 4

/** Une scène = le rendu emoji déterministe d'un triplet sujet/action/lieu. */
export interface SceneSpec {
  subject: string
  action: string
  place: string
}

export interface SentenceItem {
  text: string
  /** Textes des parties (pour l'indice : surligner un morceau) */
  subjectText: string
  actionText: string
  placeText: string
  correct: SceneSpec
  /** 4 scènes mélangées ; scenes[answerIndex] === correct */
  scenes: SceneSpec[]
  answerIndex: number
}

export function sentenceTextOf(s: SentencePart, a: SentencePart, p: SentencePart): string {
  return `${s.text} ${a.text} ${p.text}.`
}

function sceneOf(s: SentencePart, a: SentencePart, p: SentencePart): SceneSpec {
  return { subject: s.emoji, action: a.emoji, place: p.emoji }
}

export function sceneEquals(a: SceneSpec, b: SceneSpec): boolean {
  return a.subject === b.subject && a.action === b.action && a.place === b.place
}

/** Nombre d'éléments qui diffèrent entre deux scènes (0..3). */
export function sceneDiff(a: SceneSpec, b: SceneSpec): number {
  return (
    (a.subject === b.subject ? 0 : 1) +
    (a.action === b.action ? 0 : 1) +
    (a.place === b.place ? 0 : 1)
  )
}

/** Validateur : combien de scènes de l'item correspondent à la phrase ? */
export function matchingScenes(item: SentenceItem): number {
  return item.scenes.filter((sc) => sceneEquals(sc, item.correct)).length
}

function pickOther(parts: readonly SentencePart[], index: number): SentencePart {
  const others = parts.filter((_, i) => i !== index)
  return pickOne(others)
}

/**
 * Item « Phrases express » : une phrase construite par gabarit
 * (sujet × action × lieu), 4 scènes dont 3 distracteurs qui ne diffèrent
 * chacun que par UN élément — la lecture intégrale est obligatoire.
 * `usedTexts` : phrases déjà jouées dans la partie (jamais de répétition).
 */
export function buildSentenceItem(usedTexts: readonly string[] = []): SentenceItem {
  const usedSet = new Set(usedTexts)
  const combos: Array<[number, number, number]> = []
  for (let si = 0; si < SUBJECTS.length; si++) {
    for (let ai = 0; ai < ACTIONS.length; ai++) {
      for (let pi = 0; pi < PLACES.length; pi++) {
        combos.push([si, ai, pi])
      }
    }
  }
  const free = combos.filter(
    ([si, ai, pi]) => !usedSet.has(sentenceTextOf(SUBJECTS[si], ACTIONS[ai], PLACES[pi])),
  )
  const [si, ai, pi] = pickOne(free.length > 0 ? free : combos)
  const subject = SUBJECTS[si]
  const action = ACTIONS[ai]
  const place = PLACES[pi]
  const correct = sceneOf(subject, action, place)
  const distractors: SceneSpec[] = [
    sceneOf(pickOther(SUBJECTS, si), action, place),
    sceneOf(subject, pickOther(ACTIONS, ai), place),
    sceneOf(subject, action, pickOther(PLACES, pi)),
  ]
  const scenes = shuffled([correct, ...distractors])
  return {
    text: sentenceTextOf(subject, action, place),
    subjectText: subject.text,
    actionText: action.text,
    placeText: place.text,
    correct,
    scenes,
    answerIndex: scenes.findIndex((sc) => sceneEquals(sc, correct)),
  }
}

// ------------------------------------------------------------
// Mode « Lecture chrono en duo »
// ------------------------------------------------------------

export interface DuoText {
  templateIndex: number
  text: string
  wordCount: number
}

/** Remplace chaque {slot} par sa valeur. */
export function fillTemplate(template: string, slots: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => slots[key] ?? '')
}

/** Compte les mots : tokens contenant au moins une lettre ou un chiffre. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length
}

/**
 * Texte duo procédural : un gabarit (jamais celui de `avoidTemplates`
 * si une alternative existe) rempli avec prénom/animal/lieu/fruit tirés
 * au hasard. 60 à 80 mots garantis (slots de longueur constante).
 */
export function buildDuoText(avoidTemplates: readonly number[] = []): DuoText {
  const all = DUO_TEMPLATES.map((_, i) => i)
  const avoidSet = new Set(avoidTemplates)
  const free = all.filter((i) => !avoidSet.has(i))
  const templateIndex = pickOne(free.length > 0 ? free : all)
  const text = fillTemplate(DUO_TEMPLATES[templateIndex], {
    prenom: pickOne(DUO_PRENOMS),
    animal: pickOne(DUO_ANIMAUX),
    lieu: pickOne(DUO_LIEUX),
    fruit: pickOne(DUO_FRUITS),
  })
  return { templateIndex, text, wordCount: countWords(text) }
}

// ------------------------------------------------------------
// Chrono interne → mots/min (jamais montré à l'enfant)
// ------------------------------------------------------------

/** Plafond de vraisemblance du journal (taps accidentels ultra-rapides). */
export const WPM_CAP = 300

/** Mots/min indicatifs d'une partie solo (0 si rien de mesurable). */
export function computeWpm(wordsRead: number, elapsedMs: number): number {
  if (wordsRead <= 0 || elapsedMs <= 0) return 0
  return Math.min(WPM_CAP, Math.round(wordsRead / (elapsedMs / 60_000)))
}

/** MCLM duo : mots correctement lus par minute (erreurs déduites). */
export function computeMclm(totalWords: number, errors: number, elapsedMs: number): number {
  return computeWpm(Math.max(0, totalWords - Math.max(0, errors)), elapsedMs)
}

/** Repères de la jauge parent (programmes : 30-50 fin CP, ~70 fin CE1). */
export const MCLM_MARKS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 30, label: 'objectif CP' },
  { value: 50, label: 'fin CP' },
  { value: 70, label: 'fin CE1' },
]
export const MCLM_GAUGE_MAX = 100
/** Seuil de réussite pédagogique d'une lecture duo (recordAttempt). */
export const DUO_SUCCESS_MCLM = 30

// ------------------------------------------------------------
// Score & progression — contrat lu par le dashboard parent
// ------------------------------------------------------------

/** Étoiles d'une partie : seuls les PREMIERS essais comptent. */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface FluenceLogEntry {
  ts: number
  wpm: number
  mode: 'solo' | 'duo'
}

export interface FlxProgress {
  bestStars: number[]
  unlockedTier: number
  runs: number
  fluenceLog: FluenceLogEntry[]
}

export const FLUENCE_LOG_MAX = 20

export const FRESH_PROGRESS: FlxProgress = {
  bestStars: [0, 0, 0],
  unlockedTier: 0,
  runs: 0,
  fluenceLog: [],
}

/** Ajoute une entrée au journal, plafonné aux 20 dernières (FIFO). */
export function pushLog(
  log: readonly FluenceLogEntry[],
  entry: FluenceLogEntry,
): FluenceLogEntry[] {
  return [...log, entry].slice(-FLUENCE_LOG_MAX)
}

function normalizedStars(stars: readonly number[]): number[] {
  const out = stars.slice(0, TIER_COUNT)
  while (out.length < TIER_COUNT) out.push(0)
  return out
}

/**
 * Applique une partie SOLO : meilleur score par palier, déblocage du
 * palier suivant à 2 étoiles, journal de fluence (wpm indicatif).
 */
export function applyRun(
  p: FlxProgress,
  tier: TierId,
  stars: 1 | 2 | 3,
  entry: FluenceLogEntry,
): FlxProgress {
  const bestStars = normalizedStars(p.bestStars)
  bestStars[tier] = Math.max(bestStars[tier], stars)
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars,
    unlockedTier,
    runs: p.runs + 1,
    fluenceLog: pushLog(p.fluenceLog, entry),
  }
}

/** Applique une lecture DUO : journal MCLM, sans étoiles ni déblocage. */
export function applyDuo(p: FlxProgress, entry: FluenceLogEntry): FlxProgress {
  return {
    bestStars: normalizedStars(p.bestStars),
    unlockedTier: p.unlockedTier,
    runs: p.runs + 1,
    fluenceLog: pushLog(p.fluenceLog, entry),
  }
}
