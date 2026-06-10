// ============================================================
// Le Grand Horloger — logique PURE.
// L'enfant FAIT le temps : il place le soleil sur l'arc du ciel,
// tourne la roue des jours, règle les aiguilles de l'horloge,
// parcourt la roue des mois et les saisons.
// Génération procédurale sans répétition + validation.
// Aucun import React/engine/DOM. Prouvé par logic.test.ts.
// ============================================================

export type TierId = 0 | 1 | 2 | 3

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner a 3 crans : il élargit les variantes de la roue des jours. */
export const MAX_TUNER_LEVEL = 2

// ------------------------------------------------------------
// Compétences (skill-map BO 2025) — doivent refléter games.manifest.
// ------------------------------------------------------------

export const SKILL_JOURNEE = 'mo.gs.temps.journee'
export const SKILL_SEMAINE = 'mo.gs.temps.semaine'
export const SKILL_HEURES = 'mo.cp.temps.heures'
export const SKILL_CALENDRIER = 'mo.cp.temps.calendrier'

/** Les compétences du jeu, dans l'ordre du manifest. */
export const GAME_SKILLS = [SKILL_JOURNEE, SKILL_SEMAINE, SKILL_HEURES, SKILL_CALENDRIER] as const

// ------------------------------------------------------------
// Données du temps (ids ascii pour le corpus, libellés accentués pour l'UI)
// ------------------------------------------------------------

export type Moment = 'matin' | 'midi' | 'apres-midi' | 'soir'
export const MOMENTS = ['matin', 'midi', 'apres-midi', 'soir'] as const

export const MOMENT_LABELS: Readonly<Record<Moment, string>> = {
  matin: 'Matin',
  midi: 'Midi',
  'apres-midi': 'Après-midi',
  soir: 'Soir',
}

/** Jours indexés 0..6 (lundi..dimanche) — ids corpus ascii. */
export const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
export const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const

/** Mois indexés 0..11 — ids corpus ascii (sans accents). */
export const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
] as const
export const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const
export const MONTH_SHORT = [
  'janv', 'févr', 'mars', 'avr', 'mai', 'juin',
  'juil', 'août', 'sept', 'oct', 'nov', 'déc',
] as const

export type Season = 'printemps' | 'ete' | 'automne' | 'hiver'
export const SEASONS = ['printemps', 'ete', 'automne', 'hiver'] as const
export const SEASON_LABELS: Readonly<Record<Season, string>> = {
  printemps: 'Printemps',
  ete: 'Été',
  automne: 'Automne',
  hiver: 'Hiver',
}

// ------------------------------------------------------------
// Banques procédurales (les textes vivent dans corpus.json,
// la logique ne manipule que des ids stables).
// ------------------------------------------------------------

/** 6 activités par moment de la journée : 24 consignes audio distinctes. */
export const ACTIVITIES_PER_MOMENT = 6

export const ACTIVITIES: ReadonlyArray<{ id: string; moment: Moment }> = MOMENTS.flatMap(
  (moment) =>
    Array.from({ length: ACTIVITIES_PER_MOMENT }, (_, i) => ({
      id: `gho.act.${moment}.${i + 1}`,
      moment,
    })),
)

/** Questions-saisons : 2 par saison, chacune avec son clip audio. */
export const SEASON_QUESTIONS: ReadonlyArray<{ id: string; answer: Season }> = [
  { id: 'gho.q.saison.neige', answer: 'hiver' },
  { id: 'gho.q.saison.bonhomme', answer: 'hiver' },
  { id: 'gho.q.saison.feuilles', answer: 'automne' },
  { id: 'gho.q.saison.champignons', answer: 'automne' },
  { id: 'gho.q.saison.fleurs', answer: 'printemps' },
  { id: 'gho.q.saison.nids', answer: 'printemps' },
  { id: 'gho.q.saison.plage', answer: 'ete' },
  { id: 'gho.q.saison.cigales', answer: 'ete' },
]

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface MomentItem {
  kind: 'moment'
  moment: Moment
  /** id du clip-consigne (activité décrite + « Place le soleil au matin ! ») */
  activityId: string
}

export type DayVariant = 'apres' | 'avant' | 'demain' | 'hier'

export interface DayItem {
  kind: 'jour'
  variant: DayVariant
  /** jour de référence, 0..6 */
  ref: number
  /** jour attendu, 0..6 */
  answer: number
}

export interface ClockItem {
  kind: 'heure'
  /** 1..11 — jamais 12 : les aiguilles partent de 12, l'item serait gratuit. */
  hour: number
  /** true = « et demie » : la grande aiguille doit pointer le 6 */
  half: boolean
}

export type MonthVariant = 'apres' | 'avant'

export interface MonthItem {
  kind: 'mois'
  variant: MonthVariant
  /** mois de référence, 0..11 */
  ref: number
  /** mois attendu, 0..11 */
  answer: number
}

export interface SeasonItem {
  kind: 'saison'
  /** id du clip-question */
  questionId: string
  answer: Season
}

export type GhoItem = MomentItem | DayItem | ClockItem | MonthItem | SeasonItem

/** Clé d'anti-répétition d'un item dans une partie. */
export function itemKey(item: GhoItem): string {
  switch (item.kind) {
    case 'moment':
      return item.activityId
    case 'jour':
      return `jour:${item.variant}:${item.ref}`
    case 'heure':
      return `heure:${item.hour}:${item.half ? '30' : '00'}`
    case 'mois':
      return `mois:${item.variant}:${item.ref}`
    case 'saison':
      return item.questionId
  }
}

/** Compétence travaillée par UN item (le tier 3 alterne heures et calendrier). */
export function skillFor(item: GhoItem): string {
  switch (item.kind) {
    case 'moment':
      return SKILL_JOURNEE
    case 'jour':
      return SKILL_SEMAINE
    case 'heure':
      return SKILL_HEURES
    case 'mois':
    case 'saison':
      return SKILL_CALENDRIER
  }
}

// ------------------------------------------------------------
// Relations « avant / après » (cycliques, jamais hors bornes)
// ------------------------------------------------------------

/** Jour attendu pour une variante : après/demain → +1, avant/hier → −1 (mod 7). */
export function dayAnswer(variant: DayVariant, ref: number): number {
  const forward = variant === 'apres' || variant === 'demain'
  return (ref + (forward ? 1 : 6)) % 7
}

/** Mois attendu : après → +1, avant → −1 (mod 12). */
export function monthAnswer(variant: MonthVariant, ref: number): number {
  return (ref + (variant === 'apres' ? 1 : 11)) % 12
}

/**
 * Variantes de la roue des jours par cran du Tuner.
 * Niveau 0 : « après » et « demain » (le sens de lecture).
 * Niveau 1 : + « avant ». Niveau 2 : + « hier » (remonter le temps).
 */
export function dayVariantsFor(level: number): readonly DayVariant[] {
  const clamped = Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
  if (clamped === 0) return ['apres', 'demain']
  if (clamped === 1) return ['apres', 'demain', 'avant']
  return ['apres', 'demain', 'avant', 'hier']
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

export function isCorrectMoment(item: MomentItem, moment: Moment): boolean {
  return item.moment === moment
}

export function isCorrectDay(item: DayItem, day: number): boolean {
  return item.answer === day
}

export function isCorrectMonth(item: MonthItem, month: number): boolean {
  return item.answer === month
}

export function isCorrectSeason(item: SeasonItem, season: Season): boolean {
  return item.answer === season
}

/**
 * L'horloge est-elle bien réglée ? La petite aiguille pointe le chiffre cible ;
 * la grande pointe le 12 (heure pile) ou le 6 (« et demie »).
 */
export function isClockSet(item: ClockItem, hourDigit: number, minuteDigit: number): boolean {
  return hourDigit === item.hour && minuteDigit === (item.half ? 6 : 12)
}

// ------------------------------------------------------------
// Géométrie des aiguilles (degrés, 0° = midi, sens horaire)
// ------------------------------------------------------------

/** Angle de la petite aiguille : avance d'une demi-graduation à la demie. */
export function hourAngle(hourDigit: number, minuteDigit: number): number {
  return ((hourDigit % 12) * 30 + (minuteDigit === 6 ? 15 : 0)) % 360
}

/** Angle de la grande aiguille : le chiffre pointé × 30°. */
export function minuteAngle(minuteDigit: number): number {
  return (minuteDigit % 12) * 30
}

// ------------------------------------------------------------
// Pools (purs, énumérables, testables)
// ------------------------------------------------------------

export function momentPool(): MomentItem[] {
  return ACTIVITIES.map((a) => ({ kind: 'moment', moment: a.moment, activityId: a.id }))
}

export function dayPool(level: number): DayItem[] {
  const out: DayItem[] = []
  for (const variant of dayVariantsFor(level)) {
    for (let ref = 0; ref < 7; ref++) {
      out.push({ kind: 'jour', variant, ref, answer: dayAnswer(variant, ref) })
    }
  }
  return out
}

/** Heures 1..11 — le 12 est exclu (les aiguilles partent de 12). */
export function clockPool(half: boolean): ClockItem[] {
  const out: ClockItem[] = []
  for (let hour = 1; hour <= 11; hour++) out.push({ kind: 'heure', hour, half })
  return out
}

export function monthPool(): MonthItem[] {
  const out: MonthItem[] = []
  for (const variant of ['apres', 'avant'] as const) {
    for (let ref = 0; ref < 12; ref++) {
      out.push({ kind: 'mois', variant, ref, answer: monthAnswer(variant, ref) })
    }
  }
  return out
}

export function seasonPool(): SeasonItem[] {
  return SEASON_QUESTIONS.map((q) => ({ kind: 'saison', questionId: q.id, answer: q.answer }))
}

// ------------------------------------------------------------
// Tirage sans répétition (rng local : zéro import)
// ------------------------------------------------------------

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Tire un item hors de `avoid` ; si tout est épuisé, retombe sur le pool complet. */
function freshPick<T extends GhoItem>(pool: readonly T[], avoid: readonly string[]): T {
  const used = new Set(avoid)
  const candidates = pool.filter((it) => !used.has(itemKey(it)))
  return pickOne(candidates.length > 0 ? candidates : pool)
}

// ------------------------------------------------------------
// Programme du tier 3 : alternance horloge / calendrier, déterministe
// pour qu'une partie de 8 items soit toujours équilibrée :
// indexes pairs → horloge (piles aux 0 et 4, demies aux 2 et 6),
// indexes impairs → mois (1, 5) et saisons (3, 7).
// ------------------------------------------------------------

export function tier3Kind(index: number): 'heure' | 'mois' | 'saison' {
  if (index % 2 === 0) return 'heure'
  return Math.floor(index / 2) % 2 === 0 ? 'mois' : 'saison'
}

export function tier3Half(index: number): boolean {
  return index % 4 === 2
}

// ------------------------------------------------------------
// Génération d'un item
// ------------------------------------------------------------

export function generateItem(
  tier: TierId,
  index: number,
  avoid: readonly string[] = [],
  level = 0,
): GhoItem {
  if (tier === 0) return freshPick(momentPool(), avoid)
  if (tier === 1) return freshPick(dayPool(level), avoid)
  if (tier === 2) return freshPick(clockPool(false), avoid)
  const kind = tier3Kind(index)
  if (kind === 'heure') return freshPick(clockPool(tier3Half(index)), avoid)
  if (kind === 'mois') return freshPick(monthPool(), avoid)
  return freshPick(seasonPool(), avoid)
}

// ------------------------------------------------------------
// Séquences audio (ids de clips, joués dans l'ordre par index.tsx)
// ------------------------------------------------------------

export function hourClip(hour: number, half: boolean): string {
  return half ? `gho.heure.${hour}.demie` : `gho.heure.${hour}`
}

/** Consigne complète d'un item, clip par clip. */
export function consigneClips(item: GhoItem): string[] {
  switch (item.kind) {
    case 'moment':
      return [item.activityId]
    case 'jour': {
      const day = `gho.jour.${DAYS[item.ref]}`
      if (item.variant === 'apres') return ['gho.consigne.jour.apres', day, 'gho.consigne.jour.tape']
      if (item.variant === 'avant') return ['gho.consigne.jour.avant', day, 'gho.consigne.jour.tape']
      if (item.variant === 'demain') return ['gho.consigne.jour.aujourdhui', day, 'gho.consigne.jour.demain']
      return ['gho.consigne.jour.aujourdhui', day, 'gho.consigne.jour.hier']
    }
    case 'heure': {
      const out = ['gho.consigne.heure', hourClip(item.hour, item.half)]
      if (item.half) out.push('gho.aiguille.grande')
      return out
    }
    case 'mois': {
      const month = `gho.mois.${MONTHS[item.ref]}`
      const lead = item.variant === 'apres' ? 'gho.consigne.mois.apres' : 'gho.consigne.mois.avant'
      return [lead, month, 'gho.consigne.mois.tape']
    }
    case 'saison':
      return [item.questionId]
  }
}

/** Feedback élaboratif après une erreur : montrer et NOMMER la bonne réponse. */
export function teachClips(item: GhoItem): string[] {
  switch (item.kind) {
    case 'moment':
      return ['gho.regarde.journee', `gho.moment.${item.moment}`, 'gho.reessaie']
    case 'jour':
      return ['gho.regarde.jour', `gho.jour.${DAYS[item.answer]}`, 'gho.reessaie']
    case 'heure':
      return ['gho.regarde.heure', hourClip(item.hour, item.half), 'gho.reessaie']
    case 'mois':
      return ['gho.regarde.mois', `gho.mois.${MONTHS[item.answer]}`, 'gho.reessaie']
    case 'saison':
      return ['gho.regarde.saison', `gho.saison.${item.answer}`, 'gho.reessaie']
  }
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

export type Stars = 0 | 1 | 2 | 3

export interface GhoProgress {
  bestStars: [Stars, Stars, Stars, Stars]
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: GhoProgress = { bestStars: [0, 0, 0, 0], unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: GhoProgress, tier: TierId, stars: 1 | 2 | 3): GhoProgress {
  const bestStars = p.bestStars.map((s, i) =>
    i === tier ? (Math.max(s, stars) as Stars) : s,
  ) as GhoProgress['bestStars']
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return { bestStars, unlockedTier, runs: p.runs + 1 }
}
