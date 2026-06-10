// ============================================================
// La Machine Folle — logique PURE.
// Machine à rouleaux : l'enfant tourne les rouleaux pour
// fabriquer une phrase qui existe (sens), une étiquette de
// caisse (accord GN) ou une phrase accordée (accord SV).
// Aucun import React/DOM. Prouvé par logic.test.ts :
// chaque item démarre INVALIDE et une combinaison valide
// est TOUJOURS atteignable en tournant les rouleaux.
// ============================================================

import { pick, shuffle } from '@/engine/rng'

export type TierId = 0 | 1 | 2 | 3

export interface RollerOption {
  /** Texte affiché en GROS sur le rouleau */
  text: string
  /** Clip corpus (mfo.w.*) lu à chaque rotation et quand la machine lit */
  clipId: string
  /** Emoji pour la scène animée (sujets, compléments…) */
  emoji?: string
  /** Terminaison mise en évidence à l'écran (« s », « x », « ent », « ont »…) */
  hi?: string
}

export interface SceneSpec {
  /** 'caisse' = T2 (objets dans une caisse), 'animaux' = T3 (animaux en action) */
  kind: 'caisse' | 'animaux'
  /** Emoji répété `count` fois — la VÉRITÉ TERRAIN montrée à l'enfant */
  emoji: string
  count: number
  /** Emoji de l'action en cours (T3) */
  action?: string
}

export interface MfoFrame {
  id: string
  /** Un tableau d'options par rouleau */
  rollers: ReadonlyArray<ReadonlyArray<RollerOption>>
  /** Combinaisons d'indices VALIDES (une entrée par rouleau) — énumérées */
  valid: ReadonlyArray<ReadonlyArray<number>>
  /** Complément FIXE, lu après les rouleaux (T3) — pas un rouleau */
  tail?: RollerOption
  /** Vérité terrain montrée à l'enfant (T2/T3) */
  scene?: SceneSpec
}

export interface MfoItem {
  tier: TierId
  frame: MfoFrame
  /** Combinaison de départ — TOUJOURS invalide (garanti par le générateur) */
  start: readonly number[]
}

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'fr.cp.phrase.sens',
  'fr.cp.phrase.sens',
  'fr.cp.phrase.accord-gn',
  'fr.cp.phrase.accord-sv',
] as const

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Tuner à 2 crans : 0 = un seul rouleau à corriger, 1 = jusqu'à deux. */
export const MAX_TUNER_LEVEL = 1

// ------------------------------------------------------------
// Données — T0 : SUJET + ACTION (le sens, paires énumérées)
// ------------------------------------------------------------

function w(text: string, clip: string, emoji?: string, hi?: string): RollerOption {
  return { text, clipId: `mfo.w.${clip}`, emoji, hi }
}

export const T0_FRAMES: readonly MfoFrame[] = [
  {
    id: 't0-animaux',
    rollers: [
      [w('Le chat', 'le-chat', '🐱'), w('Le chien', 'le-chien', '🐶'), w('L’oiseau', 'l-oiseau', '🐦')],
      [w('miaule', 'miaule', '🎶'), w('aboie', 'aboie', '📢'), w('vole', 'vole', '🪽')],
    ],
    valid: [[0, 0], [1, 1], [2, 2]],
  },
  {
    id: 't0-reveurs',
    rollers: [
      [w('Le bébé', 'le-bebe', '👶'), w('La fusée', 'la-fusee', '🚀'), w('Le cheval', 'le-cheval', '🐴')],
      [
        w('boit son biberon', 'boit-son-biberon', '🍼'),
        w('décolle vers les étoiles', 'decolle', '✨'),
        w('galope dans le pré', 'galope', '🌾'),
      ],
    ],
    valid: [[0, 0], [1, 1], [2, 2]],
  },
  {
    id: 't0-heros',
    rollers: [
      [w('Le pirate', 'le-pirate', '🏴‍☠️'), w('La sorcière', 'la-sorciere', '🧙'), w('Le lapin', 'le-lapin', '🐰')],
      [
        w('cherche un trésor', 'cherche-un-tresor', '💰'),
        w('vole sur un balai', 'vole-sur-un-balai', '🧹'),
        w('croque une carotte', 'croque-une-carotte', '🥕'),
      ],
    ],
    // La sorcière aussi peut chercher un trésor.
    valid: [[0, 0], [1, 1], [2, 2], [1, 0]],
  },
  {
    id: 't0-ferme',
    rollers: [
      [w('La vache', 'la-vache', '🐮'), w('Le coq', 'le-coq', '🐓'), w('Le mouton', 'le-mouton', '🐑')],
      [w('fait meuh', 'fait-meuh', '💬'), w('chante cocorico', 'chante-cocorico', '🎵'), w('fait bêê', 'fait-bee', '💬')],
    ],
    valid: [[0, 0], [1, 1], [2, 2]],
  },
  {
    id: 't0-jardin',
    rollers: [
      [w('La grenouille', 'la-grenouille', '🐸'), w('L’abeille', 'l-abeille', '🐝'), w('Le serpent', 'le-serpent', '🐍')],
      [
        w('saute sur un nénuphar', 'saute-nenuphar', '🪷'),
        w('butine les fleurs', 'butine', '🌸'),
        w('siffle dans l’herbe', 'siffle', '🌿'),
      ],
    ],
    valid: [[0, 0], [1, 1], [2, 2]],
  },
  {
    id: 't0-chateau',
    rollers: [
      [w('Le dragon', 'le-dragon', '🐉'), w('La princesse', 'la-princesse', '👸'), w('Le chevalier', 'le-chevalier', '🛡️')],
      [
        w('crache du feu', 'crache-du-feu', '🔥'),
        w('habite un château', 'habite-un-chateau', '🏰'),
        w('porte une armure', 'porte-une-armure', '⚔️'),
      ],
    ],
    // Le dragon, la princesse ET le chevalier peuvent habiter un château.
    valid: [[0, 0], [1, 1], [2, 2], [2, 1], [0, 1]],
  },
]

// ------------------------------------------------------------
// Données — T1 : SUJET + VERBE + COMPLÉMENT (triplets énumérés)
// ------------------------------------------------------------

export const T1_FRAMES: readonly MfoFrame[] = [
  {
    id: 't1-gourmands',
    rollers: [
      [w('Le pirate', 'le-pirate', '🏴‍☠️'), w('Le singe', 'le-singe', '🐵'), w('La maîtresse', 'la-maitresse', '👩‍🏫')],
      [w('mange', 'mange', '😋'), w('lit', 'lit', '👀'), w('cache', 'cache', '🤫')],
      [w('une banane', 'une-banane', '🍌'), w('une histoire', 'une-histoire', '📖'), w('un trésor', 'un-tresor', '💰')],
    ],
    // Tout le monde peut manger une banane, lire une histoire, cacher un
    // trésor… et le singe peut aussi cacher une banane !
    valid: [
      [0, 0, 0], [1, 0, 0], [2, 0, 0],
      [0, 1, 1], [1, 1, 1], [2, 1, 1],
      [0, 2, 2], [1, 2, 2], [2, 2, 2],
      [1, 2, 0],
    ],
  },
  {
    id: 't1-maison',
    rollers: [
      [w('Le chien', 'le-chien', '🐶'), w('La grand-mère', 'la-grand-mere', '👵'), w('Le bébé', 'le-bebe', '👶')],
      [w('croque', 'croque', '😬'), w('tricote', 'tricote', '🧶'), w('boit', 'boit', '🥛')],
      [w('un os', 'un-os', '🦴'), w('un pull', 'un-pull', '🧥'), w('du lait', 'du-lait', '🥛')],
    ],
    valid: [[0, 0, 0], [1, 1, 1], [0, 2, 2], [1, 2, 2], [2, 2, 2]],
  },
  {
    id: 't1-cuisine',
    rollers: [
      [w('Le cuisinier', 'le-cuisinier', '🧑‍🍳'), w('La souris', 'la-souris', '🐭'), w('L’ogre', 'l-ogre', '👹')],
      [w('prépare', 'prepare', '🍳'), w('grignote', 'grignote', '🧀'), w('dévore', 'devore', '😋')],
      [w('une soupe', 'une-soupe', '🍲'), w('du fromage', 'du-fromage', '🧀'), w('un gâteau géant', 'un-gateau-geant', '🎂')],
    ],
    valid: [[0, 0, 0], [0, 0, 2], [1, 1, 1], [1, 1, 2], [2, 2, 1], [2, 2, 2]],
  },
  {
    id: 't1-explorateurs',
    rollers: [
      [w('L’astronaute', 'l-astronaute', '🧑‍🚀'), w('Le jardinier', 'le-jardinier', '🧑‍🌾'), w('Le peintre', 'le-peintre', '🧑‍🎨')],
      [w('explore', 'explore', '🔭'), w('arrose', 'arrose', '💧'), w('peint', 'peint', '🖌️')],
      [w('la lune', 'la-lune', '🌙'), w('les fleurs', 'les-fleurs', '🌷'), w('un tableau', 'un-tableau', '🖼️')],
    ],
    valid: [[0, 0, 0], [1, 1, 1], [2, 2, 2], [2, 2, 1], [2, 2, 0]],
  },
  {
    id: 't1-rigolos',
    rollers: [
      [w('Le perroquet', 'le-perroquet', '🦜'), w('Le pêcheur', 'le-pecheur', '🎣'), w('La tortue', 'la-tortue', '🐢')],
      [w('répète', 'repete', '🗣️'), w('attrape', 'attrape', '🥅'), w('porte', 'porte', '🎒')],
      [w('des mots rigolos', 'des-mots-rigolos', '💬'), w('un gros poisson', 'un-gros-poisson', '🐟'), w('sa maison', 'sa-maison', '🏠')],
    ],
    valid: [[0, 0, 0], [1, 0, 0], [1, 1, 1], [2, 2, 2]],
  },
  {
    id: 't1-magiciens',
    rollers: [
      [w('Le pompier', 'le-pompier', '🧑‍🚒'), w('La fée', 'la-fee', '🧚'), w('Le boulanger', 'le-boulanger', '👨‍🍳')],
      [w('éteint', 'eteint', '🚒'), w('agite', 'agite', '✨'), w('prépare', 'prepare', '🥣')],
      [w('un grand feu', 'un-grand-feu', '🔥'), w('sa baguette magique', 'sa-baguette-magique', '🪄'), w('des croissants', 'des-croissants', '🥐')],
    ],
    valid: [[0, 0, 0], [1, 1, 1], [2, 2, 2], [1, 2, 2]],
  },
]

// ------------------------------------------------------------
// Données — T2 : accord dans le groupe nominal (les étiquettes)
// ------------------------------------------------------------

export type Gender = 'm' | 'f'

export interface Article {
  text: string
  clipId: string
  /** null = les/des (valent pour les deux genres) */
  gender: Gender | null
  plural: boolean
}

export const ARTICLES: readonly Article[] = [
  { text: 'le', clipId: 'mfo.w.le', gender: 'm', plural: false },
  { text: 'la', clipId: 'mfo.w.la', gender: 'f', plural: false },
  { text: 'les', clipId: 'mfo.w.les', gender: null, plural: true },
  { text: 'un', clipId: 'mfo.w.un', gender: 'm', plural: false },
  { text: 'une', clipId: 'mfo.w.une', gender: 'f', plural: false },
  { text: 'des', clipId: 'mfo.w.des', gender: null, plural: true },
]

export interface GnNoun {
  id: string
  gender: Gender
  singular: string
  plural: string
  /** Terminaison du pluriel mise en évidence (« s » ou « x ») */
  pluralHi: string
  emoji: string
  clipSing: string
  clipPlur: string
}

export const GN_NOUNS: readonly GnNoun[] = [
  { id: 'chaussette', gender: 'f', singular: 'chaussette', plural: 'chaussettes', pluralHi: 's', emoji: '🧦', clipSing: 'mfo.w.chaussette', clipPlur: 'mfo.w.chaussettes' },
  { id: 'ballon', gender: 'm', singular: 'ballon', plural: 'ballons', pluralHi: 's', emoji: '🎈', clipSing: 'mfo.w.ballon', clipPlur: 'mfo.w.ballons' },
  { id: 'pomme', gender: 'f', singular: 'pomme', plural: 'pommes', pluralHi: 's', emoji: '🍎', clipSing: 'mfo.w.pomme', clipPlur: 'mfo.w.pommes' },
  { id: 'chapeau', gender: 'm', singular: 'chapeau', plural: 'chapeaux', pluralHi: 'x', emoji: '🎩', clipSing: 'mfo.w.chapeau', clipPlur: 'mfo.w.chapeaux' },
  { id: 'voiture', gender: 'f', singular: 'voiture', plural: 'voitures', pluralHi: 's', emoji: '🚗', clipSing: 'mfo.w.voiture', clipPlur: 'mfo.w.voitures' },
  { id: 'crayon', gender: 'm', singular: 'crayon', plural: 'crayons', pluralHi: 's', emoji: '✏️', clipSing: 'mfo.w.crayon', clipPlur: 'mfo.w.crayons' },
  { id: 'banane', gender: 'f', singular: 'banane', plural: 'bananes', pluralHi: 's', emoji: '🍌', clipSing: 'mfo.w.banane', clipPlur: 'mfo.w.bananes' },
  { id: 'robot', gender: 'm', singular: 'robot', plural: 'robots', pluralHi: 's', emoji: '🤖', clipSing: 'mfo.w.robot', clipPlur: 'mfo.w.robots' },
]

/** Matrice d'accord article-nom : nombre d'abord, puis genre (les/des = neutres). */
export function articleAgrees(article: Article, gender: Gender, plural: boolean): boolean {
  if (article.plural !== plural) return false
  return article.gender === null || article.gender === gender
}

function gnOption(n: GnNoun, plural: boolean): RollerOption {
  return {
    text: plural ? n.plural : n.singular,
    clipId: plural ? n.clipPlur : n.clipSing,
    emoji: n.emoji,
    hi: plural ? n.pluralHi : undefined,
  }
}

/**
 * Construit la frame « étiquette » : la caisse contient `count` × noun.emoji
 * (vérité terrain), l'étiquette doit être accordée en genre ET en nombre.
 * « les chaussettes » et « des chaussettes » sont tous deux valides.
 */
export function buildGnFrame(noun: GnNoun, distractor: GnNoun, count: number): MfoFrame {
  const plural = count >= 2
  const articleRoller: RollerOption[] = ARTICLES.map((a) => ({ text: a.text, clipId: a.clipId }))
  const forms = shuffle([
    gnOption(noun, false),
    gnOption(noun, true),
    gnOption(distractor, false),
    gnOption(distractor, true),
  ])
  const wanted = plural ? noun.clipPlur : noun.clipSing
  const valid: number[][] = []
  ARTICLES.forEach((a, ai) => {
    forms.forEach((f, fi) => {
      if (f.clipId === wanted && articleAgrees(a, noun.gender, plural)) valid.push([ai, fi])
    })
  })
  return {
    id: `gn-${noun.id}`,
    rollers: [articleRoller, forms],
    valid,
    scene: { kind: 'caisse', emoji: noun.emoji, count },
  }
}

// ------------------------------------------------------------
// Données — T3 : accord sujet-verbe (singulier ≠ pluriel À L'OREILLE)
// ------------------------------------------------------------

export interface SvSubject {
  id: string
  singular: string
  plural: string
  emoji: string
  clipSing: string
  clipPlur: string
}

export const SV_SUBJECTS: readonly SvSubject[] = [
  { id: 'chat', singular: 'Le chat', plural: 'Les chats', emoji: '🐱', clipSing: 'mfo.w.le-chat', clipPlur: 'mfo.w.les-chats' },
  { id: 'chien', singular: 'Le chien', plural: 'Les chiens', emoji: '🐶', clipSing: 'mfo.w.le-chien', clipPlur: 'mfo.w.les-chiens' },
  { id: 'lapin', singular: 'Le lapin', plural: 'Les lapins', emoji: '🐰', clipSing: 'mfo.w.le-lapin', clipPlur: 'mfo.w.les-lapins' },
  { id: 'poule', singular: 'La poule', plural: 'Les poules', emoji: '🐔', clipSing: 'mfo.w.la-poule', clipPlur: 'mfo.w.les-poules' },
  { id: 'vache', singular: 'La vache', plural: 'Les vaches', emoji: '🐮', clipSing: 'mfo.w.la-vache', clipPlur: 'mfo.w.les-vaches' },
  { id: 'singe', singular: 'Le singe', plural: 'Les singes', emoji: '🐵', clipSing: 'mfo.w.le-singe', clipPlur: 'mfo.w.les-singes' },
]

export interface SvVerb {
  id: string
  /** Formes dont singulier et pluriel S'ENTENDENT différemment (audio-first) */
  singular: string
  plural: string
  /** Terminaison du pluriel mise en évidence (« ent », « ont ») */
  hiPlur: string
  clipSing: string
  clipPlur: string
  /** Complément fixe lu après le verbe */
  tailText: string
  tailClip: string
  tailEmoji: string
  /** Emoji de l'action montré dans la scène */
  actionEmoji: string
}

export const SV_VERBS: readonly SvVerb[] = [
  { id: 'etre', singular: 'est', plural: 'sont', hiPlur: 'ont', clipSing: 'mfo.w.est', clipPlur: 'mfo.w.sont', tailText: 'dans le jardin', tailClip: 'mfo.w.dans-le-jardin', tailEmoji: '🌳', actionEmoji: '🌳' },
  { id: 'aller', singular: 'va', plural: 'vont', hiPlur: 'ont', clipSing: 'mfo.w.va', clipPlur: 'mfo.w.vont', tailText: 'à l’école', tailClip: 'mfo.w.a-l-ecole', tailEmoji: '🏫', actionEmoji: '🎒' },
  { id: 'faire', singular: 'fait', plural: 'font', hiPlur: 'ont', clipSing: 'mfo.w.fait', clipPlur: 'mfo.w.font', tailText: 'un gâteau', tailClip: 'mfo.w.un-gateau', tailEmoji: '🎂', actionEmoji: '🎂' },
  { id: 'avoir', singular: 'a', plural: 'ont', hiPlur: 'ont', clipSing: 'mfo.w.a', clipPlur: 'mfo.w.ont', tailText: 'un ballon', tailClip: 'mfo.w.un-ballon', tailEmoji: '🎈', actionEmoji: '🎈' },
  { id: 'lire', singular: 'lit', plural: 'lisent', hiPlur: 'ent', clipSing: 'mfo.w.lit', clipPlur: 'mfo.w.lisent', tailText: 'un livre', tailClip: 'mfo.w.un-livre', tailEmoji: '📖', actionEmoji: '📖' },
  { id: 'dormir', singular: 'dort', plural: 'dorment', hiPlur: 'ent', clipSing: 'mfo.w.dort', clipPlur: 'mfo.w.dorment', tailText: 'dans le panier', tailClip: 'mfo.w.dans-le-panier', tailEmoji: '🧺', actionEmoji: '💤' },
  { id: 'boire', singular: 'boit', plural: 'boivent', hiPlur: 'ent', clipSing: 'mfo.w.boit', clipPlur: 'mfo.w.boivent', tailText: 'du lait', tailClip: 'mfo.w.du-lait', tailEmoji: '🥛', actionEmoji: '🥛' },
  { id: 'dire', singular: 'dit', plural: 'disent', hiPlur: 'ent', clipSing: 'mfo.w.dit', clipPlur: 'mfo.w.disent', tailText: 'bonjour', tailClip: 'mfo.w.bonjour', tailEmoji: '👋', actionEmoji: '💬' },
  { id: 'ecrire', singular: 'écrit', plural: 'écrivent', hiPlur: 'ent', clipSing: 'mfo.w.ecrit', clipPlur: 'mfo.w.ecrivent', tailText: 'une lettre', tailClip: 'mfo.w.une-lettre', tailEmoji: '✉️', actionEmoji: '✏️' },
]

function svOption(s: SvSubject, plural: boolean): RollerOption {
  return {
    text: plural ? s.plural : s.singular,
    clipId: plural ? s.clipPlur : s.clipSing,
    emoji: s.emoji,
    hi: plural ? 's' : undefined,
  }
}

/**
 * Construit la frame « accord SV » : la scène montre `count` animaux en
 * action. Le sujet doit correspondre à la scène (bon animal, bon nombre)
 * ET le verbe doit s'accorder — exactement UNE combinaison valide.
 */
export function buildSvFrame(
  animal: SvSubject,
  distractor: SvSubject,
  verb: SvVerb,
  count: number,
): MfoFrame {
  const plural = count >= 2
  const subjects = shuffle([
    svOption(animal, false),
    svOption(animal, true),
    svOption(distractor, false),
    svOption(distractor, true),
  ])
  const verbs = shuffle([
    { text: verb.singular, clipId: verb.clipSing },
    { text: verb.plural, clipId: verb.clipPlur, hi: verb.hiPlur },
  ])
  const wantedSubject = plural ? animal.clipPlur : animal.clipSing
  const wantedVerb = plural ? verb.clipPlur : verb.clipSing
  const valid: number[][] = []
  subjects.forEach((s, si) => {
    verbs.forEach((v, vi) => {
      if (s.clipId === wantedSubject && v.clipId === wantedVerb) valid.push([si, vi])
    })
  })
  return {
    id: `sv-${animal.id}-${verb.id}`,
    rollers: [subjects, verbs],
    valid,
    tail: { text: verb.tailText, clipId: verb.tailClip, emoji: verb.tailEmoji },
    scene: { kind: 'animaux', emoji: animal.emoji, count, action: verb.actionEmoji },
  }
}

// ------------------------------------------------------------
// Cœur : validité, distance, rouleau à corriger
// ------------------------------------------------------------

/** La combinaison correspond-elle à une combinaison valide énumérée ? */
export function isValid(frame: MfoFrame, combo: readonly number[]): boolean {
  return frame.valid.some(
    (v) => v.length === combo.length && v.every((x, i) => x === combo[i]),
  )
}

/** Nombre MINIMAL de rouleaux à changer pour atteindre une combinaison valide. */
export function distanceToValid(frame: MfoFrame, combo: readonly number[]): number {
  let best = Infinity
  for (const v of frame.valid) {
    let d = 0
    for (let i = 0; i < v.length; i++) if (v[i] !== combo[i]) d += 1
    if (d < best) best = d
  }
  return best
}

/**
 * Le rouleau en conflit : premier rouleau qui diffère d'une combinaison
 * valide à distance MINIMALE. null si la combinaison est déjà valide.
 * Tourner ce rouleau vers la bonne valeur réduit toujours la distance.
 */
export function closestFix(frame: MfoFrame, combo: readonly number[]): number | null {
  if (isValid(frame, combo)) return null
  let bestDist = Infinity
  let bestIdx: number | null = null
  for (const v of frame.valid) {
    const diffs: number[] = []
    for (let i = 0; i < v.length; i++) if (v[i] !== combo[i]) diffs.push(i)
    if (diffs.length > 0 && diffs.length < bestDist) {
      bestDist = diffs.length
      bestIdx = diffs[0]
    }
  }
  return bestIdx
}

/** Tourne le rouleau `roller` d'un cran (retourne une COPIE). */
export function rotated(frame: MfoFrame, combo: readonly number[], roller: number): number[] {
  const next = [...combo]
  next[roller] = (next[roller] + 1) % frame.rollers[roller].length
  return next
}

/** Toutes les combinaisons possibles de la frame (produit cartésien). */
export function allCombos(frame: MfoFrame): number[][] {
  let combos: number[][] = [[]]
  for (const opts of frame.rollers) {
    const next: number[][] = []
    for (const c of combos) {
      for (let i = 0; i < opts.length; i++) next.push([...c, i])
    }
    combos = next
  }
  return combos
}

/** Options actuellement affichées par les rouleaux (sans le complément fixe). */
export function comboOptions(frame: MfoFrame, combo: readonly number[]): RollerOption[] {
  return combo.map((idx, r) => frame.rollers[r][idx])
}

/** Clips à lire dans l'ordre : rouleaux puis complément fixe. */
export function comboClipIds(frame: MfoFrame, combo: readonly number[]): string[] {
  const ids = comboOptions(frame, combo).map((o) => o.clipId)
  if (frame.tail) ids.push(frame.tail.clipId)
  return ids
}

/** Texte de la phrase affichée (rouleaux + complément fixe). */
export function sentenceText(frame: MfoFrame, combo: readonly number[]): string {
  const parts = comboOptions(frame, combo).map((o) => o.text)
  if (frame.tail) parts.push(frame.tail.text)
  return parts.join(' ')
}

// ------------------------------------------------------------
// Génération d'items
// ------------------------------------------------------------

/** Mélange les options de chaque rouleau et remappe les combinaisons valides. */
function permuteFrame(frame: MfoFrame): MfoFrame {
  const perms = frame.rollers.map((opts) => shuffle(opts.map((_, i) => i)))
  const rollers = frame.rollers.map((opts, r) => perms[r].map((oldIdx) => opts[oldIdx]))
  const inverse = perms.map((p) => {
    const inv = new Array<number>(p.length)
    p.forEach((oldIdx, newIdx) => {
      inv[oldIdx] = newIdx
    })
    return inv
  })
  const valid = frame.valid.map((combo) => combo.map((oldIdx, r) => inverse[r][oldIdx]))
  return { ...frame, rollers, valid }
}

/** Moitié singulier, moitié pluriel pour les scènes T2/T3. */
const SCENE_COUNTS = [1, 1, 2, 3] as const

function buildFrame(tier: TierId, avoid?: string): MfoFrame {
  if (tier === 0 || tier === 1) {
    const pool = tier === 0 ? T0_FRAMES : T1_FRAMES
    const fresh = pool.filter((f) => f.id !== avoid)
    return permuteFrame(pick(fresh.length > 0 ? fresh : pool))
  }
  if (tier === 2) {
    const fresh = GN_NOUNS.filter((n) => `gn-${n.id}` !== avoid)
    const noun = pick(fresh.length > 0 ? fresh : GN_NOUNS)
    const distractor = pick(GN_NOUNS.filter((n) => n.id !== noun.id))
    return buildGnFrame(noun, distractor, pick(SCENE_COUNTS))
  }
  const animal = pick(SV_SUBJECTS)
  const freshVerbs = SV_VERBS.filter((v) => `sv-${animal.id}-${v.id}` !== avoid)
  const verb = pick(freshVerbs.length > 0 ? freshVerbs : SV_VERBS)
  const distractor = pick(SV_SUBJECTS.filter((s) => s.id !== animal.id))
  return buildSvFrame(animal, distractor, verb, pick(SCENE_COUNTS))
}

/**
 * Combinaison de départ TOUJOURS invalide. Niveau 0 : un seul rouleau à
 * corriger (distance 1). Niveau 1 : deux rouleaux si la frame le permet.
 */
function pickStart(frame: MfoFrame, level: number): number[] {
  const invalid = allCombos(frame).filter((c) => !isValid(frame, c))
  if (invalid.length === 0) throw new Error(`frame ${frame.id} : aucune combinaison invalide`)
  const desired = level <= 0 ? 1 : 2
  const exact = invalid.filter((c) => distanceToValid(frame, c) === desired)
  if (exact.length > 0) return pick(exact)
  const near = invalid.filter((c) => distanceToValid(frame, c) === 1)
  return pick(near.length > 0 ? near : invalid)
}

/**
 * Génère un item pour un palier et un niveau de Tuner.
 * `avoid` = id de la frame précédente, pour ne jamais reproposer
 * exactement le même contenu deux fois de suite.
 */
export function generateItem(tier: TierId, level: number, avoid?: string): MfoItem {
  const lvl = Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level)))
  const frame = buildFrame(tier, avoid)
  return { tier, frame, start: pickStart(frame, lvl) }
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

export interface MfoProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: MfoProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: MfoProgress, tier: TierId, stars: 1 | 2 | 3): MfoProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
