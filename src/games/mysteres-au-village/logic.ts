// ============================================================
// Mystères au Village — logique PURE.
// Compréhension orale : anaphores (il/elle/ils/elles) et inférences.
// Génération procédurale : mini-histoires à reprise pronominale
// (mode étiquette) et enquêtes à indices (mode enquête), avec
// validateurs prouvés par logic.test.ts. AUCUN pool d'histoires figé.
// Aucun import React / engine / DOM — le hasard est local et injectable.
// ============================================================

export type TierId = 0 | 1 | 2 | 3
export type Genre = 'm' | 'f'
export type Nombre = 'sg' | 'pl'
export type Pronoun = 'il' | 'elle' | 'ils' | 'elles'

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'fr.cp.comp.anaphores',
  'fr.cp.comp.anaphores',
  'fr.cp.comp.inferences',
  'fr.cp.comp.inferences',
] as const

export const TIER_COUNT = 4
/** Mode étiquette : 8 histoires par partie. Mode enquête : 4 enquêtes. */
export const STORIES_PER_RUN = 8
export const ENQUETES_PER_RUN = 4
export const CLUES_PER_ENQUETE = 3
export const MAX_TUNER_LEVEL = 2

export function modeFor(tier: TierId): 'etiquette' | 'enquete' {
  return tier <= 1 ? 'etiquette' : 'enquete'
}

/** Nombre d'items de maîtrise d'une partie (1 enquête = 1 item). */
export function itemsPerRun(tier: TierId): number {
  return modeFor(tier) === 'etiquette' ? STORIES_PER_RUN : ENQUETES_PER_RUN
}

// ------------------------------------------------------------
// Hasard local injectable (les tests peuvent passer un rng à eux)
// ------------------------------------------------------------

export type Rng = () => number

function rInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

function rPick<T>(arr: readonly T[], rng: Rng): T {
  return arr[rInt(rng, 0, arr.length - 1)]
}

function rShuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rInt(rng, 0, i)
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

// ------------------------------------------------------------
// La banque de personnages du village
// ------------------------------------------------------------

export interface Personnage {
  id: string
  emoji: string
  /** Avec article, en minuscules : « le boulanger », « les jumelles » */
  label: string
  genre: Genre
  nombre: Nombre
  /** Attributs servant aux indices d'enquête (ids de ATTRIBUTES) */
  attributs: string[]
}

export const PERSONNAGES: readonly Personnage[] = [
  { id: 'boulanger', emoji: '👨‍🍳', label: 'le boulanger', genre: 'm', nombre: 'sg', attributs: ['tablier', 'farine', 'gourmand'] },
  { id: 'fermiere', emoji: '👩‍🌾', label: 'la fermière', genre: 'f', nombre: 'sg', attributs: ['chapeau', 'tablier', 'jardin'] },
  { id: 'fermier', emoji: '👨‍🌾', label: 'le fermier', genre: 'm', nombre: 'sg', attributs: ['chapeau', 'jardin', 'moustaches'] },
  { id: 'grand-mere', emoji: '👵', label: 'la grand-mère', genre: 'f', nombre: 'sg', attributs: ['lunettes', 'tablier', 'tricot', 'gourmand'] },
  { id: 'grand-pere', emoji: '👴', label: 'le grand-père', genre: 'm', nombre: 'sg', attributs: ['lunettes', 'chapeau', 'moustaches'] },
  { id: 'maitresse', emoji: '👩‍🏫', label: 'la maîtresse', genre: 'f', nombre: 'sg', attributs: ['lunettes', 'chapeau'] },
  { id: 'jumelles', emoji: '👧👧', label: 'les jumelles', genre: 'f', nombre: 'pl', attributs: ['gourmand', 'jardin'] },
  { id: 'jumeaux', emoji: '👦👦', label: 'les jumeaux', genre: 'm', nombre: 'pl', attributs: ['gourmand', 'jardin'] },
  { id: 'chien', emoji: '🐕', label: 'le chien', genre: 'm', nombre: 'sg', attributs: ['quatre-pattes', 'moustaches', 'aime-les-os', 'jardin'] },
  { id: 'chat', emoji: '🐈', label: 'le chat', genre: 'm', nombre: 'sg', attributs: ['quatre-pattes', 'moustaches', 'miaule', 'gourmand'] },
  { id: 'chats', emoji: '🐱🐱', label: 'les chats', genre: 'm', nombre: 'pl', attributs: ['quatre-pattes', 'moustaches', 'miaule'] },
  { id: 'poules', emoji: '🐔🐔', label: 'les poules', genre: 'f', nombre: 'pl', attributs: ['plumes', 'jardin'] },
  { id: 'chevre', emoji: '🐐', label: 'la chèvre', genre: 'f', nombre: 'sg', attributs: ['quatre-pattes', 'jardin', 'gourmand'] },
]

export const PERSONNAGES_BY_ID: ReadonlyMap<string, Personnage> = new Map(
  PERSONNAGES.map((p) => [p.id, p]),
)

/** Libellés courts des attributs (badges pédagogiques côté UI). */
export const ATTRIBUTES: Readonly<Record<string, string>> = {
  'quatre-pattes': 'quatre pattes',
  moustaches: 'des moustaches',
  'aime-les-os': 'adore les os',
  gourmand: 'très gourmand',
  chapeau: 'un chapeau',
  lunettes: 'des lunettes',
  tablier: 'un tablier',
  plumes: 'des plumes',
  farine: 'de la farine',
  tricot: 'sait tricoter',
  miaule: 'sait miauler',
  jardin: 'était au jardin',
}

// ------------------------------------------------------------
// Pronoms : accord genre + nombre
// ------------------------------------------------------------

export function pronounFor(genre: Genre, nombre: Nombre): Pronoun {
  if (nombre === 'pl') return genre === 'f' ? 'elles' : 'ils'
  return genre === 'f' ? 'elle' : 'il'
}

export function pronounSpec(p: Pronoun): { genre: Genre; nombre: Nombre } {
  return {
    genre: p === 'elle' || p === 'elles' ? 'f' : 'm',
    nombre: p === 'ils' || p === 'elles' ? 'pl' : 'sg',
  }
}

export function matchesPronoun(perso: Personnage, pronoun: Pronoun): boolean {
  const spec = pronounSpec(pronoun)
  return perso.genre === spec.genre && perso.nombre === spec.nombre
}

/** Badge pédagogique d'un personnage : symbole de genre + nombre. */
export function badgeFor(p: { genre: Genre; nombre: Nombre }): { genre: '♀' | '♂'; nombre: '1' | '2' } {
  return { genre: p.genre === 'f' ? '♀' : '♂', nombre: p.nombre === 'sg' ? '1' : '2' }
}

/**
 * Clip de protestation quand l'enfant pose l'étiquette sur le mauvais
 * personnage : la PREMIÈRE différence (genre, puis nombre) explique
 * pourquoi — sinon c'est le sens de l'histoire qui tranche.
 */
export function protestClipId(tapped: Personnage, pronoun: Pronoun): string {
  const spec = pronounSpec(pronoun)
  if (tapped.genre !== spec.genre) return `mav.oups.genre.${tapped.genre}`
  if (tapped.nombre !== spec.nombre) return `mav.oups.nombre.${tapped.nombre}`
  return 'mav.oups.sens'
}

// ------------------------------------------------------------
// Gabarits de phrases (mode étiquette) — texte ET clips composables.
// logic.test.ts vérifie que chaque texte est identique au corpus.
// ------------------------------------------------------------

export interface ActionTemplate {
  id: string
  /** Phrase 1 : « <perso> <a> » (conjugaison sg/pl) */
  a: { sg: string; pl: string }
  /** Phrase 2 : « <Pronom> <s> » (conjugaison sg/pl) */
  s: { sg: string; pl: string }
}

export const ACTIONS: readonly ActionTemplate[] = [
  {
    id: 'tarte',
    a: { sg: 'prépare une tarte.', pl: 'préparent une tarte.' },
    s: { sg: 'met des pommes dedans.', pl: 'mettent des pommes dedans.' },
  },
  {
    id: 'fleurs',
    a: { sg: 'arrose les fleurs.', pl: 'arrosent les fleurs.' },
    s: { sg: 'chante une jolie chanson.', pl: 'chantent une jolie chanson.' },
  },
  {
    id: 'velo',
    a: { sg: 'fait du vélo.', pl: 'font du vélo.' },
    s: { sg: 'pédale très vite.', pl: 'pédalent très vite.' },
  },
]

export interface TransitiveTemplate {
  id: string
  /** Le complément de la phrase 1 est un personnage de la banque. */
  objetId: string
  /** « <sujet> <verbe> » — sujets toujours au singulier. */
  verbe: string
  /** Suite quand le pronom reprend L'OBJET (action que SEUL l'objet peut faire). */
  suiteObjet: string
}

export const TRANSITIFS: readonly TransitiveTemplate[] = [
  { id: 'poules', objetId: 'poules', verbe: 'nourrit les poules.', suiteObjet: 'picorent le grain.' },
  { id: 'chien', objetId: 'chien', verbe: 'promène le chien.', suiteObjet: 'remue la queue.' },
  { id: 'chats', objetId: 'chats', verbe: 'caresse les chats.', suiteObjet: 'ronronnent doucement.' },
  { id: 'chevre', objetId: 'chevre', verbe: 'brosse la chèvre.', suiteObjet: 'fait bêê très fort.' },
]

/** Suite quand le pronom reprend LE SUJET (humain, singulier). */
export const SUITE_SUJET = { clip: 'mav.s.rentre.sg', text: 'rentre à la maison.' } as const

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface Brick {
  text: string
  /** Clips à enchaîner avec say(a) puis say(b, { interrupt: false }) */
  clips: string[]
}

export type StoryKind = 'simple' | 'transitive'

export interface StoryItem {
  mode: 'etiquette'
  tier: 0 | 1
  kind: StoryKind
  pronoun: Pronoun
  referentId: string
  /** Posés uniquement pour kind 'transitive' */
  sujetId?: string
  objetId?: string
  /** Personnages affichés, mélangés — le référent en fait partie. */
  suspects: Personnage[]
  phrase1: Brick
  phrase2: Brick
}

// ------------------------------------------------------------
// Génération des histoires (mode étiquette)
// ------------------------------------------------------------

/** Nombre de personnages affichés selon palier + niveau de Tuner. */
export function suspectCountFor(tier: TierId, level: number): number {
  const l = Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
  if (tier <= 1) return l >= 1 ? 4 : 3
  if (tier === 2) return 4
  return 5
}

function pickDistractors(
  excludeIds: ReadonlySet<string>,
  pronoun: Pronoun,
  count: number,
  rng: Rng,
): Personnage[] {
  const spec = pronounSpec(pronoun)
  const others = PERSONNAGES.filter((p) => !excludeIds.has(p.id) && !matchesPronoun(p, pronoun))
  const out: Personnage[] = []
  const used = new Set(excludeIds)
  const takeFrom = (pool: readonly Personnage[]): void => {
    if (out.length >= count) return
    const c = rShuffle(pool, rng).find((p) => !used.has(p.id))
    if (c) {
      out.push(c)
      used.add(c.id)
    }
  }
  // Distracteurs INTELLIGENTS : même genre mais mauvais nombre,
  // même nombre mais mauvais genre — puis complément aléatoire.
  takeFrom(others.filter((p) => p.genre === spec.genre))
  takeFrom(others.filter((p) => p.nombre === spec.nombre))
  while (out.length < count) {
    const c = rShuffle(others, rng).find((p) => !used.has(p.id))
    if (!c) break
    out.push(c)
    used.add(c.id)
  }
  return out
}

function generateSimpleStory(
  tier: 0 | 1,
  suspectCount: number,
  avoidReferents: readonly string[],
  rng: Rng,
): StoryItem {
  // T0 : référents singuliers (il/elle). T1 : référents pluriels (ils/elles).
  const pool = PERSONNAGES.filter((p) => (tier === 0 ? p.nombre === 'sg' : p.nombre === 'pl'))
  const fresh = pool.filter((p) => !avoidReferents.includes(p.id))
  const referent = rPick(fresh.length > 0 ? fresh : pool, rng)
  const pronoun = pronounFor(referent.genre, referent.nombre)
  const action = rPick(ACTIONS, rng)
  const nb = referent.nombre
  const distractors = pickDistractors(new Set([referent.id]), pronoun, suspectCount - 1, rng)
  return {
    mode: 'etiquette',
    tier,
    kind: 'simple',
    pronoun,
    referentId: referent.id,
    suspects: rShuffle([referent, ...distractors], rng),
    phrase1: {
      text: `${capitalize(referent.label)} ${action.a[nb]}`,
      clips: [`mav.p.${referent.id}`, `mav.a.${action.id}.${nb}`],
    },
    phrase2: {
      text: `${capitalize(pronoun)} ${action.s[nb]}`,
      clips: [`mav.pr.${pronoun}`, `mav.s.${action.id}.${nb}`],
    },
  }
}

function generateTransitiveStory(
  suspectCount: number,
  avoidReferents: readonly string[],
  rng: Rng,
): StoryItem {
  const templates = avoidReferents.length > 0
    ? TRANSITIFS.filter((t) => !avoidReferents.includes(t.objetId))
    : TRANSITIFS
  const tpl = rPick(templates.length > 0 ? templates : TRANSITIFS, rng)
  const objet = PERSONNAGES_BY_ID.get(tpl.objetId)
  if (!objet) throw new Error(`gabarit transitif sans objet : ${tpl.id}`)
  const sujets = PERSONNAGES.filter(
    (p) => p.nombre === 'sg' && p.id !== objet.id && !p.attributs.includes('quatre-pattes') && p.id !== 'chat' && p.id !== 'chien',
  )
  const sujet = rPick(sujets, rng)
  // Ambiguïté grammaticale (sujet et objet de même genre ET nombre) :
  // SEUL le sens tranche → le référent doit être l'objet (suite exclusive).
  const ambiguous = sujet.genre === objet.genre && sujet.nombre === objet.nombre
  const referentIsObjet = ambiguous || rng() < 0.6
  const referent = referentIsObjet ? objet : sujet
  const pronoun = pronounFor(referent.genre, referent.nombre)
  const extra = pickDistractors(new Set([sujet.id, objet.id]), pronoun, Math.max(0, suspectCount - 2), rng)
  return {
    mode: 'etiquette',
    tier: 1,
    kind: 'transitive',
    pronoun,
    referentId: referent.id,
    sujetId: sujet.id,
    objetId: objet.id,
    suspects: rShuffle([sujet, objet, ...extra], rng),
    phrase1: {
      text: `${capitalize(sujet.label)} ${tpl.verbe}`,
      clips: [`mav.p.${sujet.id}`, `mav.v.${tpl.id}`],
    },
    phrase2: referentIsObjet
      ? {
          text: `${capitalize(pronoun)} ${tpl.suiteObjet}`,
          clips: [`mav.pr.${pronoun}`, `mav.so.${tpl.id}`],
        }
      : {
          text: `${capitalize(pronoun)} ${SUITE_SUJET.text}`,
          clips: [`mav.pr.${pronoun}`, SUITE_SUJET.clip],
        },
  }
}

/**
 * Génère une mini-histoire pour le mode étiquette.
 * T0 : phrase simple, référent singulier, distracteurs genre/nombre.
 * T1 : pronoms pluriels OU phrase à deux référents possibles
 * (sujet + objet) dont un seul cohérent — discriminés à l'oreille.
 */
export function generateStory(
  tier: 0 | 1,
  suspectCount: number,
  avoidReferents: readonly string[] = [],
  rng: Rng = Math.random,
): StoryItem {
  if (tier === 0) return generateSimpleStory(0, suspectCount, avoidReferents, rng)
  return rng() < 0.5
    ? generateSimpleStory(1, suspectCount, avoidReferents, rng)
    : generateTransitiveStory(suspectCount, avoidReferents, rng)
}

/** Validateur d'histoire — invariants prouvés par les tests. */
export function validateStory(item: StoryItem): boolean {
  const ids = item.suspects.map((s) => s.id)
  if (new Set(ids).size !== ids.length) return false
  const referent = item.suspects.find((s) => s.id === item.referentId)
  if (!referent) return false
  if (!matchesPronoun(referent, item.pronoun)) return false
  if (item.phrase1.text.length === 0 || item.phrase2.text.length === 0) return false
  if (item.phrase1.clips.length === 0 || item.phrase2.clips.length === 0) return false
  if (!item.phrase2.text.startsWith(capitalize(item.pronoun))) return false
  for (const s of item.suspects) {
    if (s.id === item.referentId) continue
    if (!matchesPronoun(s, item.pronoun)) continue
    // Un seul cas autorisé : la phrase transitive ambiguë où le sujet
    // partage genre+nombre avec l'objet-référent (le sens tranche).
    const designed =
      item.kind === 'transitive' && s.id === item.sujetId && item.referentId === item.objetId
    if (!designed) return false
  }
  return true
}

// ------------------------------------------------------------
// Mode enquête : méfaits, indices, génération + validateur
// ------------------------------------------------------------

export interface Mefait {
  id: string
  clip: string
}

export const MEFAITS: readonly Mefait[] = [
  { id: 'tarte', clip: 'mav.mefait.tarte' },
  { id: 'cles', clip: 'mav.mefait.cles' },
  { id: 'peinture', clip: 'mav.mefait.peinture' },
  { id: 'linge', clip: 'mav.mefait.linge' },
]

/** Clip d'un indice : direct (T2) ou inférentiel (T3). */
export function clueClipId(attr: string, tier: TierId): string {
  return tier >= 3 ? `mav.j.${attr}` : `mav.i.${attr}`
}

export interface EnqueteItem {
  mode: 'enquete'
  tier: 2 | 3
  mefait: Mefait
  culpritId: string
  /** Les 3 attributs-indices, dans l'ordre où ils sont donnés. */
  clueAttrs: string[]
  /** Clips correspondants (direct T2, inférentiel T3). */
  clueClips: string[]
  /** Suspects affichés, mélangés — le coupable en fait partie. */
  suspects: Personnage[]
}

/**
 * Premier indice (index 0..2) qui écarte ce personnage, ou null
 * s'il est compatible avec TOUS les indices.
 */
export function eliminatedAtClue(perso: Personnage, clueAttrs: readonly string[]): number | null {
  for (let i = 0; i < clueAttrs.length; i++) {
    if (!perso.attributs.includes(clueAttrs[i])) return i
  }
  return null
}

/** Le personnage est-il encore compatible après les `revealed` premiers indices ? */
export function compatibleAfter(
  perso: Personnage,
  clueAttrs: readonly string[],
  revealed: number,
): boolean {
  const at = eliminatedAtClue(perso, clueAttrs)
  return at === null || at >= revealed
}

function permutations3(attrs: readonly string[]): string[][] {
  const out: string[][] = []
  for (const a of attrs) {
    for (const b of attrs) {
      for (const c of attrs) {
        if (a !== b && b !== c && a !== c) out.push([a, b, c])
      }
    }
  }
  return out
}

/**
 * Remplit les « créneaux d'élimination » : pour l'indice i, chaque
 * distracteur du créneau possède les indices précédents mais PAS
 * l'indice i — il est donc écarté exactement à cet indice.
 * Créneaux servis du plus contraint (indice 3) au plus libre.
 */
function fillSlots(
  culprit: Personnage,
  clueAttrs: readonly string[],
  counts: readonly number[],
  rng: Rng,
): Personnage[] | null {
  const used = new Set([culprit.id])
  const chosen: Personnage[] = []
  for (const i of [2, 1, 0]) {
    for (let k = 0; k < counts[i]; k++) {
      const candidates = PERSONNAGES.filter(
        (p) =>
          !used.has(p.id) &&
          clueAttrs.slice(0, i).every((a) => p.attributs.includes(a)) &&
          !p.attributs.includes(clueAttrs[i]),
      )
      if (candidates.length === 0) return null
      const c = rPick(candidates, rng)
      used.add(c.id)
      chosen.push(c)
    }
  }
  return chosen
}

/**
 * Construit une enquête garantie résoluble : le coupable (singulier,
 * pour que « le coupable » reste juste à l'oreille) possède les 3
 * indices ; chaque distracteur est écarté par exactement un indice ;
 * chaque indice écarte au moins un suspect. T3 : 5 suspects, indices
 * inférentiels. La recherche essaie coupables et ordres d'indices
 * mélangés — la banque garantit qu'une solution existe toujours.
 */
export function generateEnquete(
  tier: 2 | 3,
  avoidCulprits: readonly string[] = [],
  rng: Rng = Math.random,
): EnqueteItem {
  const suspectCount = suspectCountFor(tier, 0)
  const distractorCount = suspectCount - 1
  // Répartition des éliminations par indice (chaque indice écarte ≥ 1) :
  // toutes les répartitions sont essayées, en ordre aléatoire.
  const distributions: readonly (readonly number[])[] =
    distractorCount === 3
      ? [[1, 1, 1]]
      : rShuffle(
          [
            [2, 1, 1],
            [1, 2, 1],
            [1, 1, 2],
          ],
          rng,
        )
  const all = PERSONNAGES.filter((p) => p.nombre === 'sg' && p.attributs.length >= CLUES_PER_ENQUETE)
  const fresh = all.filter((p) => !avoidCulprits.includes(p.id))
  const candidates = fresh.length > 0 ? fresh : all
  for (const culprit of rShuffle(candidates, rng)) {
    for (const clueAttrs of rShuffle(permutations3(culprit.attributs), rng)) {
      let distractors: Personnage[] | null = null
      for (const counts of distributions) {
        distractors = fillSlots(culprit, clueAttrs, counts, rng)
        if (distractors) break
      }
      if (!distractors) continue
      return {
        mode: 'enquete',
        tier,
        mefait: rPick(MEFAITS, rng),
        culpritId: culprit.id,
        clueAttrs,
        clueClips: clueAttrs.map((a) => clueClipId(a, tier)),
        suspects: rShuffle([culprit, ...distractors], rng),
      }
    }
  }
  // Jamais atteint : prouvé par les tests sur toute la banque.
  throw new Error('generateEnquete : aucune enquête possible')
}

/** Validateur d'enquête — l'unicité du coupable est NON négociable. */
export function validateEnquete(item: EnqueteItem): boolean {
  const ids = item.suspects.map((s) => s.id)
  if (new Set(ids).size !== ids.length) return false
  if (item.suspects.length !== suspectCountFor(item.tier, 0)) return false
  if (item.clueAttrs.length !== CLUES_PER_ENQUETE) return false
  if (new Set(item.clueAttrs).size !== CLUES_PER_ENQUETE) return false
  if (item.clueAttrs.some((a) => !(a in ATTRIBUTES))) return false
  const culprit = item.suspects.find((s) => s.id === item.culpritId)
  if (!culprit || culprit.nombre !== 'sg') return false
  // Le coupable correspond à TOUS les indices…
  if (eliminatedAtClue(culprit, item.clueAttrs) !== null) return false
  // … et il est le SEUL : chaque distracteur est écarté quelque part.
  const eliminations = item.suspects
    .filter((s) => s.id !== item.culpritId)
    .map((s) => eliminatedAtClue(s, item.clueAttrs))
  if (eliminations.some((e) => e === null)) return false
  // Chaque indice fait avancer l'enquête : il écarte au moins un suspect.
  for (let i = 0; i < CLUES_PER_ENQUETE; i++) {
    if (!eliminations.includes(i)) return false
  }
  return true
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

export interface MavProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: MavProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: MavProgress, tier: TierId, stars: 1 | 2 | 3): MavProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
