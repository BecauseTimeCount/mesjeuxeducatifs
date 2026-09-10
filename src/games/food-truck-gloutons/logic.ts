// ============================================================
// Le Food-Truck des Gloutons — logique PURE.
// Actes, services, génération procédurale des commandes, validation,
// feedback élaboratif, étoiles, progression. Aucun import React/three.
// Prouvé par logic.test.ts : chaque commande générée est TOUJOURS
// résoluble avec les plats proposés (mode tap) ou par la réponse attendue (mode pavé).
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'
import type { SkillId } from '@/engine/types'

export type ActId = 1 | 2 | 3 | 4 | 5
export type InputMode = 'tap' | 'numpad'

export type OrderKind =
  // Acte 1 — révision CP (tap, brochettes)
  | 'complement10'
  | 'double'
  // Acte 2 — CE1 P1 (tap, brochettes + caisses de 10)
  | 'complement-dizaine'
  | 'passage-dizaine'
  | 'decompo100-tap'
  // Acte 3 — CE1 P2 (pavé)
  | 'complements100-dizaines'
  | 'complements100'
  | 'decompo100'
  // Acte 4 — CE1 P2-P5 + CE2 (pavé)
  | 'tables-2-5-10'
  | 'tables-3-4'
  | 'paquets-inverse'
  | 'double-moitie'
  | 'tables-6-9'
  // Acte 5 — CE1 P3 + CE2 (pavé)
  | 'complement1000-centaines'
  | 'complement-centaine'
  | 'decompo1000'
  | 'complement10000-milliers'

/** Compétence enregistrée par type de commande (doit être ⊂ manifest.skills). */
export const KIND_SKILL: Readonly<Record<OrderKind, SkillId>> = {
  complement10: 'ma.cp.complements10',
  double: 'ma.cp.doubles',
  'complement-dizaine': 'ma.ce1.calc.complement-dizaine',
  'passage-dizaine': 'ma.ce1.calc.passage-dizaine',
  'decompo100-tap': 'ma.cp.num.decompo100',
  'complements100-dizaines': 'ma.ce1.calc.complements100',
  complements100: 'ma.ce1.calc.complements100',
  decompo100: 'ma.cp.num.decompo100',
  'tables-2-5-10': 'ma.ce1.mult.tables-2-5-10',
  'tables-3-4': 'ma.ce1.mult.tables-3-4',
  'paquets-inverse': 'ma.ce1.mult.tables-2-5-10',
  'double-moitie': 'ma.ce1.calc.doubles-moities100',
  'tables-6-9': 'ma.ce2.mult.tables-6-9',
  'complement1000-centaines': 'ma.ce1.num.complements1000',
  'complement-centaine': 'ma.ce1.num.complements1000',
  decompo1000: 'ma.ce1.num.complements1000',
  'complement10000-milliers': 'ma.ce2.num.complements10000',
}

export const KIND_INPUT: Readonly<Record<OrderKind, InputMode>> = {
  complement10: 'tap',
  double: 'tap',
  'complement-dizaine': 'tap',
  'passage-dizaine': 'tap',
  'decompo100-tap': 'tap',
  'complements100-dizaines': 'numpad',
  complements100: 'numpad',
  decompo100: 'numpad',
  'tables-2-5-10': 'numpad',
  'tables-3-4': 'numpad',
  'paquets-inverse': 'numpad',
  'double-moitie': 'numpad',
  'tables-6-9': 'numpad',
  'complement1000-centaines': 'numpad',
  'complement-centaine': 'numpad',
  decompo1000: 'numpad',
  'complement10000-milliers': 'numpad',
}

export interface ActSpec {
  id: ActId
  name: string
  stop: string
  emoji: string
  sticker: string
}

export const ACTS: readonly ActSpec[] = [
  { id: 1, name: 'La Plage des Dix', stop: 'Plage', emoji: '🏖️', sticker: '⛱️' },
  { id: 2, name: 'Le Marché des Dizaines', stop: 'Marché', emoji: '🧺', sticker: '🧺' },
  { id: 3, name: 'Le Port des Cent', stop: 'Port', emoji: '⚓', sticker: '⚓' },
  { id: 4, name: 'La Fête des Paquets', stop: 'Fête', emoji: '🎪', sticker: '🎈' },
  { id: 5, name: 'Le Volcan des Mille', stop: 'Volcan', emoji: '🌋', sticker: '👑' },
]

export interface ServiceSpec {
  /** index dans SERVICES = ordre de progression */
  id: number
  act: ActId
  /** un seul type pour un service, plusieurs (en rotation) pour un boss */
  kinds: readonly OrderKind[]
  name: string
  sub: string
  boss?: true
}

export const SERVICES: readonly ServiceSpec[] = [
  { id: 0, act: 1, kinds: ['complement10'], name: 'Tout le monde veut dix', sub: 'Compléments à 10' },
  { id: 1, act: 1, kinds: ['double'], name: 'Les Jumeaux', sub: 'Les doubles' },
  { id: 2, act: 1, kinds: ['double', 'complement10'], name: 'Les Jumeaux Géants', sub: 'Menu du boss', boss: true },
  { id: 3, act: 2, kinds: ['complement-dizaine'], name: 'Jusqu’à la dizaine', sub: 'Compléter à la dizaine' },
  { id: 4, act: 2, kinds: ['passage-dizaine'], name: 'Passer la dizaine', sub: 'Additionner en passant 10' },
  { id: 5, act: 2, kinds: ['decompo100-tap'], name: 'Caisses et brochettes', sub: 'Dizaines et unités' },
  { id: 6, act: 2, kinds: ['complement-dizaine', 'decompo100-tap', 'passage-dizaine'], name: 'La Marchande', sub: 'Menu du boss', boss: true },
  { id: 7, act: 3, kinds: ['complements100-dizaines'], name: 'Cent en dizaines', sub: 'Compléments à 100' },
  { id: 8, act: 3, kinds: ['complements100'], name: 'Compléter à cent', sub: 'Compléments à 100' },
  { id: 9, act: 3, kinds: ['decompo100'], name: 'Commande directe', sub: 'Écrire le nombre' },
  { id: 10, act: 3, kinds: ['complements100-dizaines', 'complements100', 'decompo100'], name: 'La Capitaine', sub: 'Menu du boss', boss: true },
  { id: 11, act: 4, kinds: ['tables-2-5-10'], name: 'Paquets de 2, 5, 10', sub: 'Tables de 2, 5 et 10' },
  { id: 12, act: 4, kinds: ['tables-3-4'], name: 'Paquets de 3 et 4', sub: 'Tables de 3 et 4' },
  { id: 13, act: 4, kinds: ['paquets-inverse'], name: 'Combien de paquets ?', sub: 'Partager en paquets' },
  { id: 14, act: 4, kinds: ['double-moitie'], name: 'Doubles et moitiés', sub: 'Jusqu’à 100' },
  { id: 15, act: 4, kinds: ['tables-6-9'], name: 'Paquets de 6 à 9', sub: 'Tables de 6, 7, 8, 9 (CE2)' },
  { id: 16, act: 4, kinds: ['tables-2-5-10', 'tables-3-4', 'double-moitie'], name: 'Le Forain', sub: 'Menu du boss', boss: true },
  { id: 17, act: 5, kinds: ['complement1000-centaines'], name: 'Mille en centaines', sub: 'Compléments à 1000' },
  { id: 18, act: 5, kinds: ['complement-centaine'], name: 'Jusqu’à la centaine', sub: 'Compléter à la centaine' },
  { id: 19, act: 5, kinds: ['decompo1000'], name: 'Grande commande', sub: 'Écrire le nombre' },
  { id: 20, act: 5, kinds: ['complement10000-milliers'], name: 'Dix mille en milliers', sub: 'Jusqu’à 10 000 (CE2)' },
  { id: 21, act: 5, kinds: ['complement1000-centaines', 'complement-centaine', 'decompo1000'], name: 'Le Glouton Ancestral', sub: 'Menu du boss', boss: true },
]

export const SERVICE_COUNT = SERVICES.length
export const ITEMS_PER_RUN = 8
/** Un boss = deux menus de 3 plats. */
export const BOSS_ITEMS_PER_RUN = 6
/** Le Tuner n'a que 2 crans : 0 = plage resserrée, 1 = plage élargie. */
export const MAX_TUNER_LEVEL = 1

export function itemsPerRun(service: number): number {
  return SERVICES[service]?.boss ? BOSS_ITEMS_PER_RUN : ITEMS_PER_RUN
}

// ------------------------------------------------------------
// Commandes
// ------------------------------------------------------------

export type FoodKind = 'brochette' | 'caisse10' | 'caisse100' | 'caisse1000' | 'paquet'

export interface FoodItem {
  /** id stable = position d'affichage (0..n-1) */
  id: number
  /** valeur en unités (une caisse de 10 vaut 10) */
  value: number
  kind: FoodKind
}

export type Question =
  /** « Il veut target, il a déjà given » */
  | { type: 'complement'; target: number; given: number }
  /** « Il veut target » (écrire / composer le nombre) */
  | { type: 'exact'; target: number }
  /** « n paquets de k » */
  | { type: 'times'; n: number; k: number }
  /** « total, en paquets de k : combien de paquets ? » */
  | { type: 'howmany'; total: number; k: number }
  | { type: 'double'; n: number }
  | { type: 'half'; n: number }

/** Morceau de consigne audio : clip du corpus ou nombre (clip nombre.<n>). */
export type PromptPart = { clip: string } | { number: number }

/** Étape du feedback élaboratif : from + add = to (chemin par la dizaine / centaine). */
export interface ExplainStep {
  from: number
  add: number
  to: number
}

export interface Order {
  service: number
  kind: OrderKind
  skill: SkillId
  input: InputMode
  question: Question
  /** réponse attendue (mode pavé : nombre tapé ; mode tap : somme des plats à servir) */
  answer: number
  /** jumeaux : chaque plat servi est mangé par les deux */
  factor: 1 | 2
  /** plats sur le comptoir (mode tap) — [] en mode pavé */
  items: FoodItem[]
  /** ids d'UNE solution exacte — sert à l'indice après 2 échecs */
  solutionIds: number[]
  prompt: PromptPart[]
  explain: ExplainStep[]
  /** compter de k en k au recomptage (tables) */
  countBy?: number
}

// ------------------------------------------------------------
// Helpers internes
// ------------------------------------------------------------

function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
}

function range(lo: number, hi: number, step = 1): number[] {
  const out: number[] = []
  for (let v = lo; v <= hi; v += step) out.push(v)
  return out
}

/** Tire dans candidates en évitant `avoid` quand une alternative existe. */
function pickAvoiding(candidates: readonly number[], avoid?: number): number {
  const filtered = avoid === undefined ? candidates : candidates.filter((v) => v !== avoid)
  return pick(filtered.length > 0 ? filtered : candidates)
}

/**
 * Assemble les brochettes (valeurs 1..9) : la solution, des plats imposés
 * (pièges), jusqu'à 2 distracteurs plausibles (±1), puis complément aléatoire.
 * Retourne les items mélangés et les ids de la solution.
 */
function buildBrochettes(
  solution: readonly number[],
  forced: readonly number[],
  count: number,
  isForbidden: (v: number) => boolean,
): { items: FoodItem[]; solutionIds: number[] } {
  const values: number[] = [...solution, ...forced]
  const near = shuffle(
    [...new Set(solution.flatMap((v) => [v - 1, v + 1]))].filter(
      (v) => v >= 1 && v <= 9 && !isForbidden(v),
    ),
  )
  for (const v of near) {
    if (values.length >= count) break
    values.push(v)
  }
  let guard = 0
  while (values.length < count && guard++ < 200) {
    const v = randInt(1, 9)
    if (!isForbidden(v)) values.push(v)
  }
  const order = shuffle(values.map((_, i) => i))
  const items: FoodItem[] = order.map((src, id) => ({ id, value: values[src], kind: 'brochette' }))
  const solutionIds = solution.map((_, k) => order.indexOf(k))
  return { items, solutionIds }
}

/** Chemin par la dizaine puis la centaine (37 → 40 → 100). Étapes chaînées. */
export function explainFor(given: number, target: number): ExplainStep[] {
  const steps: ExplainStep[] = []
  let cur = given
  for (const unit of [10, 100, 1000]) {
    if (cur >= target) break
    const next = Math.ceil(cur / unit) * unit
    if (next > cur && next < target) {
      steps.push({ from: cur, add: next - cur, to: next })
      cur = next
    }
  }
  if (cur < target) steps.push({ from: cur, add: target - cur, to: target })
  return steps
}

function complementPrompt(target: number, given: number, twins = false): PromptPart[] {
  const parts: PromptPart[] = twins
    ? [{ clip: 'ftg.consigne.jumeaux' }, { number: target }]
    : [{ clip: 'ftg.consigne.veut' }, { number: target }]
  if (given > 0) parts.push({ clip: 'ftg.consigne.deja' }, { number: given }, { clip: 'ftg.consigne.combien' })
  return parts
}

interface Draft {
  question: Question
  answer: number
  factor?: 1 | 2
  items?: FoodItem[]
  solutionIds?: number[]
  prompt: PromptPart[]
  explain?: ExplainStep[]
  countBy?: number
}

// ------------------------------------------------------------
// Générateurs par type de commande
// ------------------------------------------------------------

/** « Il veut 10, il a déjà g » — une brochette vaut le complément ; piège : g est toujours proposé. */
function genComplement10(level: number, avoid?: number): Draft {
  const given = pickAvoiding(level === 0 ? range(5, 8) : range(1, 9), avoid)
  const answer = 10 - given
  const built = buildBrochettes([answer], given === answer ? [] : [given], 6, (v) => v === 10)
  return {
    question: { type: 'complement', target: 10, given },
    answer,
    ...built,
    prompt: complementPrompt(10, given),
    explain: explainFor(given, 10),
  }
}

/** Jumeaux : cible paire, chaque brochette comptée deux fois. Piège : la cible elle-même si ≤ 9. */
function genDouble(level: number, avoid?: number, givenAllowed = false): Draft {
  const target = pickAvoiding(range(2, level === 0 ? 12 : 18, 2), avoid)
  // Boss : parfois un « déjà mangé » pair, pour un double + complément.
  const given = givenAllowed && target >= 6 && Math.random() < 0.5 ? pick(range(2, target - 2, 2)) : 0
  const half = (target - given) / 2
  const forced = [target, target - given].filter((v) => v >= 1 && v <= 9 && v !== half)
  const built = buildBrochettes([half], [...new Set(forced)], 6, () => false)
  return {
    question: { type: 'complement', target, given },
    answer: half,
    factor: 2,
    ...built,
    prompt: complementPrompt(target, given, true),
    explain: given > 0 ? explainFor(given, target) : [],
  }
}

/** « Il veut 40, il a 37 » — une brochette vaut le complément ; piège : le chiffre des unités. */
function genComplementDizaine(level: number, avoid?: number): Draft {
  const candidates = range(11, level === 0 ? 49 : 99).filter((v) => v % 10 !== 0)
  const given = pickAvoiding(candidates, avoid)
  const target = Math.ceil(given / 10) * 10
  const answer = target - given
  const units = given % 10
  const built = buildBrochettes([answer], units === answer ? [] : [units], 6, () => false)
  return {
    question: { type: 'complement', target, given },
    answer,
    ...built,
    prompt: complementPrompt(target, given),
    explain: explainFor(given, target),
  }
}

/** « Il veut 13, il a 8 » — b direct OU le détour par la dizaine (2 puis 3) : les deux sont proposés. */
function genPassageDizaine(level: number, avoid?: number): Draft {
  const givenCandidates = level === 0 ? range(5, 9) : range(11, 89).filter((v) => v % 10 >= 2)
  const given = pickAvoiding(givenCandidates, avoid)
  const toTen = 10 - (given % 10)
  const b = randInt(toTen + 1, 9)
  const target = given + b
  const rest = b - toTen
  const built = buildBrochettes([b], rest === b ? [toTen] : [toTen, rest], 6, () => false)
  return {
    question: { type: 'complement', target, given },
    answer: b,
    ...built,
    prompt: complementPrompt(target, given),
    explain: explainFor(given, target),
  }
}

/**
 * « Il veut 60, il a 24 » — caisses de 10 + brochettes. Les brochettes ne
 * suffisent jamais : la somme des brochettes proposées est < manque.
 */
function genDecompo100Tap(level: number, avoid?: number): Draft {
  let given: number
  let target: number
  if (level === 0) {
    given = 0
    target = pickAvoiding(range(21, 59).filter((v) => v % 10 !== 0), avoid)
  } else {
    given = pickAvoiding(range(11, 40), avoid)
    target = randInt(given + 21, 89)
  }
  const need = target - given
  const tens = Math.floor(need / 10)
  const units = need % 10
  const values: Array<{ value: number; kind: FoodKind }> = []
  for (let i = 0; i < tens + 1; i++) values.push({ value: 10, kind: 'caisse10' })
  const brochettes: number[] = units > 0 ? [units] : []
  // Distracteurs ±1 sans que les brochettes seules puissent atteindre le manque.
  for (const v of shuffle([units - 1, units + 1, units + 2])) {
    if (brochettes.length >= 3) break
    if (v >= 1 && v <= 9 && brochettes.reduce((a, b) => a + b, 0) + v < need) brochettes.push(v)
  }
  for (const v of brochettes) values.push({ value: v, kind: 'brochette' })
  const order = shuffle(values.map((_, i) => i))
  const items: FoodItem[] = order.map((src, id) => ({ id, ...values[src] }))
  const solutionSrc = [...range(0, tens - 1)]
  if (units > 0) solutionSrc.push(tens + 1) // la première brochette = units
  const solutionIds = solutionSrc.map((k) => order.indexOf(k))
  return {
    question: { type: 'complement', target, given },
    answer: need,
    items,
    solutionIds,
    prompt: complementPrompt(target, given),
    explain: explainFor(given, target),
  }
}

function genComplements100Dizaines(level: number, avoid?: number): Draft {
  const given = pickAvoiding(level === 0 ? range(10, 90, 10) : range(5, 95, 5), avoid)
  return {
    question: { type: 'complement', target: 100, given },
    answer: 100 - given,
    prompt: complementPrompt(100, given),
    explain: explainFor(given, 100),
  }
}

function genComplements100(level: number, avoid?: number): Draft {
  const candidates = range(level === 0 ? 21 : 11, level === 0 ? 79 : 99).filter((v) => v % 10 !== 0)
  const given = pickAvoiding(candidates, avoid)
  return {
    question: { type: 'complement', target: 100, given },
    answer: 100 - given,
    prompt: complementPrompt(100, given),
    explain: explainFor(given, 100),
  }
}

function genDecompo100(level: number, avoid?: number): Draft {
  const target = pickAvoiding(level === 0 ? range(21, 59) : range(60, 99), avoid)
  return {
    question: { type: 'exact', target },
    answer: target,
    prompt: [{ clip: 'ftg.consigne.veut' }, { number: target }],
    explain: [],
  }
}

function genTables(ks: readonly number[], level: number, avoid?: number): Draft {
  const n = pickAvoiding(level === 0 ? range(2, 5) : range(2, 9), avoid)
  const k = pick(ks)
  return {
    question: { type: 'times', n, k },
    answer: n * k,
    prompt: [{ clip: 'ftg.consigne.veut' }, { number: n }, { clip: 'ftg.consigne.paquets-de' }, { number: k }],
    explain: [],
    countBy: k,
  }
}

function genPaquetsInverse(level: number, avoid?: number): Draft {
  const k = pick([2, 5, 10])
  const n = pickAvoiding(level === 0 ? range(2, 5) : range(2, 9), avoid)
  const total = n * k
  return {
    question: { type: 'howmany', total, k },
    answer: n,
    prompt: [
      { clip: 'ftg.consigne.veut' },
      { number: total },
      { clip: 'ftg.consigne.en-paquets-de' },
      { number: k },
      { clip: 'ftg.consigne.combien-paquets' },
    ],
    explain: [],
    countBy: k,
  }
}

function genDoubleMoitie(level: number, avoid?: number): Draft {
  if (Math.random() < 0.5) {
    const n = pickAvoiding(level === 0 ? range(6, 25) : range(11, 50), avoid)
    return {
      question: { type: 'double', n },
      answer: 2 * n,
      prompt: [{ clip: 'ftg.consigne.double' }, { number: n }],
      explain: [],
    }
  }
  const n = pickAvoiding(level === 0 ? range(12, 40, 2) : range(22, 100, 2), avoid)
  return {
    question: { type: 'half', n },
    answer: n / 2,
    prompt: [{ clip: 'ftg.consigne.moitie' }, { number: n }],
    explain: [],
  }
}

function genComplement1000Centaines(level: number, avoid?: number): Draft {
  const given = pickAvoiding(level === 0 ? range(100, 900, 100) : range(50, 950, 50), avoid)
  return {
    question: { type: 'complement', target: 1000, given },
    answer: 1000 - given,
    prompt: complementPrompt(1000, given),
    explain: explainFor(given, 1000),
  }
}

function genComplementCentaine(level: number, avoid?: number): Draft {
  const candidates = range(110, level === 0 ? 490 : 990, 10).filter((v) => v % 100 !== 0)
  const given = pickAvoiding(candidates, avoid)
  const target = Math.ceil(given / 100) * 100
  return {
    question: { type: 'complement', target, given },
    answer: target - given,
    prompt: complementPrompt(target, given),
    explain: explainFor(given, target),
  }
}

function genDecompo1000(level: number, avoid?: number): Draft {
  const target = pickAvoiding(level === 0 ? range(110, 490, 10) : range(510, 990, 10), avoid)
  return {
    question: { type: 'exact', target },
    answer: target,
    prompt: [{ clip: 'ftg.consigne.veut' }, { number: target }],
    explain: [],
  }
}

function genComplement10000Milliers(level: number, avoid?: number): Draft {
  const given = pickAvoiding(level === 0 ? range(1000, 9000, 1000) : range(500, 9500, 500), avoid)
  return {
    question: { type: 'complement', target: 10_000, given },
    answer: 10_000 - given,
    prompt: complementPrompt(10_000, given),
    explain: explainFor(given, 10_000),
  }
}

function draft(kind: OrderKind, level: number, avoid: number | undefined, boss: boolean): Draft {
  switch (kind) {
    case 'complement10':
      return genComplement10(level, avoid)
    case 'double':
      return genDouble(level, avoid, boss)
    case 'complement-dizaine':
      return genComplementDizaine(level, avoid)
    case 'passage-dizaine':
      return genPassageDizaine(level, avoid)
    case 'decompo100-tap':
      return genDecompo100Tap(level, avoid)
    case 'complements100-dizaines':
      return genComplements100Dizaines(level, avoid)
    case 'complements100':
      return genComplements100(level, avoid)
    case 'decompo100':
      return genDecompo100(level, avoid)
    case 'tables-2-5-10':
      return genTables([2, 5, 10], level, avoid)
    case 'tables-3-4':
      return genTables([3, 4], level, avoid)
    case 'paquets-inverse':
      return genPaquetsInverse(level, avoid)
    case 'double-moitie':
      return genDoubleMoitie(level, avoid)
    case 'tables-6-9':
      return genTables([6, 7, 8, 9], level, avoid)
    case 'complement1000-centaines':
      return genComplement1000Centaines(level, avoid)
    case 'complement-centaine':
      return genComplementCentaine(level, avoid)
    case 'decompo1000':
      return genDecompo1000(level, avoid)
    case 'complement10000-milliers':
      return genComplement10000Milliers(level, avoid)
  }
}

/** Clé « à éviter » d'une commande : ce qui la rendrait répétitive si retiré deux fois de suite. */
export function orderKey(order: Order): number {
  const q = order.question
  switch (q.type) {
    case 'complement':
      return q.given > 0 ? q.given : q.target
    case 'exact':
      return q.target
    case 'times':
    case 'howmany':
      return q.type === 'times' ? q.n : order.answer
    case 'double':
    case 'half':
      return q.n
  }
}

/**
 * Génère une commande pour un service. `index` = rang dans la partie
 * (les boss tournent sur leurs types). `avoid` = orderKey de la commande
 * précédente (évite deux fois la même valeur d'affilée).
 */
export function generateOrder(service: number, level: number, index = 0, avoid?: number): Order {
  const spec = SERVICES[service]
  if (!spec) throw new Error(`service inconnu : ${service}`)
  const kind = spec.kinds[index % spec.kinds.length]
  const d = draft(kind, clampLevel(level), avoid, spec.boss === true)
  return {
    service,
    kind,
    skill: KIND_SKILL[kind],
    input: KIND_INPUT[kind],
    question: d.question,
    answer: d.answer,
    factor: d.factor ?? 1,
    items: d.items ?? [],
    solutionIds: d.solutionIds ?? [],
    prompt: d.prompt,
    explain: d.explain ?? [],
    ...(d.countBy !== undefined ? { countBy: d.countBy } : {}),
  }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/** Somme des plats sélectionnés (avant facteur jumeaux). */
export function sumSelected(order: Order, ids: readonly number[]): number {
  const set = new Set(ids)
  return order.items.filter((it) => set.has(it.id)).reduce((a, it) => a + it.value, 0)
}

/** Total dans le ventre = déjà mangé + facteur × plats servis (mode tap). */
export function bellyTotal(order: Order, ids: readonly number[]): number {
  const given = order.question.type === 'complement' ? order.question.given : 0
  return given + order.factor * sumSelected(order, ids)
}

/** Ce que veut le client au total (pour la jauge). */
export function targetOf(order: Order): number {
  const q = order.question
  switch (q.type) {
    case 'complement':
    case 'exact':
      return q.target
    case 'times':
      return q.n * q.k
    case 'howmany':
      return q.total
    case 'double':
      return 2 * q.n
    case 'half':
      return q.n
  }
}

export function isExactTap(order: Order, ids: readonly number[]): boolean {
  return order.input === 'tap' && bellyTotal(order, ids) === targetOf(order)
}

export function isExactTyped(order: Order, typed: string): boolean {
  if (order.input !== 'numpad' || !/^\d{1,5}$/.test(typed)) return false
  return Number(typed) === order.answer
}

// ------------------------------------------------------------
// Étoiles et progression
// ------------------------------------------------------------

export type Stars = 0 | 1 | 2 | 3

/** ≥ 90 % → 3, ≥ 70 % → 2, sinon 1 (ENGINE.md, loi n°4). */
export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? firstTryCorrect / total : 0
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  return 1
}

export interface FtgProgress {
  bestStars: Record<number, Stars>
  runs: number
}

export const FRESH_PROGRESS: FtgProgress = { bestStars: {}, runs: 0 }

/** Service 0 toujours ouvert ; service n ouvert si le service n-1 a ≥ 2 étoiles. */
export function isUnlocked(p: FtgProgress, service: number): boolean {
  if (service <= 0) return true
  if (service >= SERVICE_COUNT) return false
  return (p.bestStars[service - 1] ?? 0) >= 2
}

/** Acte ouvert si son premier service est ouvert. */
export function isActUnlocked(p: FtgProgress, act: ActId): boolean {
  const first = SERVICES.find((s) => s.act === act)
  return first !== undefined && isUnlocked(p, first.id)
}

/** Sticker gagné = boss de l'acte réussi à 3 étoiles. */
export function hasSticker(p: FtgProgress, act: ActId): boolean {
  const boss = SERVICES.find((s) => s.act === act && s.boss)
  return boss !== undefined && (p.bestStars[boss.id] ?? 0) === 3
}

export function applyRun(p: FtgProgress, service: number, stars: 1 | 2 | 3): FtgProgress {
  const best = Math.max(p.bestStars[service] ?? 0, stars) as Stars
  return { bestStars: { ...p.bestStars, [service]: best }, runs: p.runs + 1 }
}
