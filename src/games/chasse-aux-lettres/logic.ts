// ============================================================
// La Chasse aux Lettres — logique PURE.
// Génération procédurale des scènes fouillis + validation.
// Aucun import React/DOM. Prouvé par logic.test.ts :
// la cible est TOUJOURS présente exactement le bon nombre de
// fois, jamais dupliquée comme distracteur, et les distracteurs
// sont « intelligents » (lettres proches, miroirs b/d/p/q).
//
// Paliers :
//   T0 capitales  — la lettre nommée à la voix, en CAPITALE
//   T1 minuscules — pareil en script minuscule
//   T2 écritures  — la cible en 3 graphies (capitale/script/cursive)
//   T3 premier son — un mot dit + illustré, taper son initiale
// ============================================================

import { pick, randInt, shuffle } from '@/engine/rng'

export type TierId = 0 | 1 | 2 | 3
export type Graphie = 'capital' | 'script' | 'cursive'

export const TIER_COUNT = 4
export const ITEMS_PER_RUN = 8
/** Le Tuner n'a que 2 crans : 0 = scène resserrée, 1 = scène élargie. */
export const MAX_TUNER_LEVEL = 1

export const LETTERS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
] as const
export type Letter = (typeof LETTERS)[number]

export const GRAPHIES: readonly Graphie[] = ['capital', 'script', 'cursive']

/** Compétence travaillée par palier (doit refléter games.manifest). */
export const TIER_SKILLS = [
  'fr.gs.lettres.nom',
  'fr.gs.lettres.nom',
  'fr.gs.lettres.graphies',
  'fr.gs.phono.attaque',
] as const

/** Skill enregistré à la place du palier quand la cible est b/d/p/q (hors T0). */
export const CONFUSABLE_SKILL = 'fr.cp.lettres.confusables'

/** Les 4 compétences déclarées au manifest (ensemble, sans doublon). */
export const GAME_SKILLS = [
  'fr.gs.lettres.nom',
  'fr.gs.lettres.graphies',
  'fr.gs.phono.attaque',
  'fr.cp.lettres.confusables',
] as const

// ------------------------------------------------------------
// Lettres : noms parlés, miroirs, voisines visuelles
// ------------------------------------------------------------

/** Nom français de chaque lettre, écrit phonétiquement pour le TTS. */
export const LETTER_NAMES: Readonly<Record<Letter, string>> = {
  a: 'a', b: 'bé', c: 'cé', d: 'dé', e: 'e', f: 'effe', g: 'gé',
  h: 'ache', i: 'i', j: 'ji', k: 'ka', l: 'elle', m: 'ème', n: 'ène',
  o: 'o', p: 'pé', q: 'ku', r: 'erre', s: 'esse', t: 'té', u: 'u',
  v: 'vé', w: 'double vé', x: 'ixe', y: 'i grec', z: 'zède',
}

/** Les lettres miroirs : la grande confusion du CP. */
export const MIRROR_LETTERS = ['b', 'd', 'p', 'q'] as const

const MIRROR_SET: ReadonlySet<Letter> = new Set<Letter>(MIRROR_LETTERS)

export function isMirrorLetter(l: Letter): boolean {
  return MIRROR_SET.has(l)
}

/** Les autres lettres du groupe miroir (vide hors b/d/p/q). */
export function mirrorsOf(l: Letter): Letter[] {
  if (!MIRROR_SET.has(l)) return []
  return MIRROR_LETTERS.filter((m) => m !== l)
}

/** Groupes de lettres visuellement proches (capitales ET minuscules confondues). */
const VISUAL_GROUPS: ReadonlyArray<readonly Letter[]> = [
  ['e', 'f'],
  ['o', 'q', 'g'],
  ['m', 'n', 'w'],
  ['b', 'r', 'p', 'd'],
  ['i', 'j', 'l', 't'],
  ['u', 'v', 'y'],
  ['a', 'o'],
  ['c', 'o', 'e'],
  ['s', 'z'],
  ['h', 'n'],
]

/** Lettres « pièges » pour une cible : mêmes groupes visuels + voisines de l'alphabet. */
export function lookalikesFor(letter: Letter): Letter[] {
  const out = new Set<Letter>()
  for (const group of VISUAL_GROUPS) {
    if (group.includes(letter)) {
      for (const l of group) if (l !== letter) out.add(l)
    }
  }
  const idx = LETTERS.indexOf(letter)
  if (idx > 0) out.add(LETTERS[idx - 1])
  if (idx < LETTERS.length - 1) out.add(LETTERS[idx + 1])
  return [...out]
}

/**
 * T3 : lettres dont la valeur sonore usuelle rendrait le choix injuste
 * (le son initial du mot pourrait LÉGITIMEMENT s'écrire avec elles).
 * Ces lettres sont exclues des distracteurs du mot.
 */
export const PHONETIC_RIVALS: Readonly<Partial<Record<Letter, readonly Letter[]>>> = {
  c: ['k', 'q'], // carotte : /k/ s'écrit aussi k, q
  k: ['c', 'q'],
  j: ['g'], // jus : /ʒ/ s'écrit aussi g (girafe)
  s: ['c'], // soleil : /s/ s'écrit aussi c (cerise)
  i: ['y'],
  y: ['i'],
  z: ['s'],
  v: ['w'], // vélo : /v/ s'écrit aussi w (wagon) — w n'est jamais cible T3
}

// ------------------------------------------------------------
// Corpus de mots du palier T3 (premier son)
// Initiale jamais ambiguë : pas de h muet, pas de digraphe
// initial (ch-/ou-/qu-), pas de c doux ni de g doux.
// ------------------------------------------------------------

export interface ChlWord {
  /** Mot français (jamais affiché à l'enfant — dit et illustré seulement) */
  word: string
  /** Lettre initiale = la cible à attraper */
  initial: Letter
  /** Illustration emoji (zéro asset image) */
  emoji: string
  /** Id du clip corpus (chl.mot.<slug sans accents>) */
  clipId: string
}

function W(word: string, initial: Letter, emoji: string, slug: string): ChlWord {
  return { word, initial, emoji, clipId: `chl.mot.${slug}` }
}

export const WORDS_T3: readonly ChlWord[] = [
  W('avion', 'a', '✈️', 'avion'),
  W('ananas', 'a', '🍍', 'ananas'),
  W('bateau', 'b', '⛵', 'bateau'),
  W('ballon', 'b', '🎈', 'ballon'),
  W('carotte', 'c', '🥕', 'carotte'),
  W('cadeau', 'c', '🎁', 'cadeau'),
  W('dauphin', 'd', '🐬', 'dauphin'),
  W('dé', 'd', '🎲', 'de'),
  W('éléphant', 'e', '🐘', 'elephant'),
  W('fusée', 'f', '🚀', 'fusee'),
  W('fourmi', 'f', '🐜', 'fourmi'),
  W('gâteau', 'g', '🎂', 'gateau'),
  W('île', 'i', '🏝️', 'ile'),
  W('jus', 'j', '🧃', 'jus'),
  W('kangourou', 'k', '🦘', 'kangourou'),
  W('koala', 'k', '🐨', 'koala'),
  W('lune', 'l', '🌙', 'lune'),
  W('lapin', 'l', '🐰', 'lapin'),
  W('maison', 'm', '🏠', 'maison'),
  W('mouton', 'm', '🐑', 'mouton'),
  W('nuage', 'n', '☁️', 'nuage'),
  W('nid', 'n', '🪺', 'nid'),
  W('orange', 'o', '🍊', 'orange'),
  W('papillon', 'p', '🦋', 'papillon'),
  W('pizza', 'p', '🍕', 'pizza'),
  W('robot', 'r', '🤖', 'robot'),
  W('renard', 'r', '🦊', 'renard'),
  W('soleil', 's', '☀️', 'soleil'),
  W('serpent', 's', '🐍', 'serpent'),
  W('tortue', 't', '🐢', 'tortue'),
  W('train', 't', '🚂', 'train'),
  W('usine', 'u', '🏭', 'usine'),
  W('vélo', 'v', '🚲', 'velo'),
  W('yoyo', 'y', '🪀', 'yoyo'),
  W('zèbre', 'z', '🦓', 'zebre'),
]

// ------------------------------------------------------------
// Décors de scène (purement décoratifs, changent à chaque partie)
// ------------------------------------------------------------

export interface ChlDecor {
  id: string
  /** Emojis d'ambiance dispersés derrière les lettres */
  emojis: readonly string[]
  /** Fond CSS doux — l'information n'est JAMAIS portée par la couleur */
  background: string
}

export const DECORS: readonly ChlDecor[] = [
  {
    id: 'jungle',
    emojis: ['🌿', '🦜', '🌺', '🍃', '🐒'],
    background: 'linear-gradient(160deg, #eaf6dd 0%, #d5eecb 100%)',
  },
  {
    id: 'plage',
    emojis: ['🐚', '⛱️', '🌴', '🦀', '⭐'],
    background: 'linear-gradient(160deg, #fdf3d8 0%, #cdeef3 100%)',
  },
  {
    id: 'ciel',
    emojis: ['☁️', '🪁', '🌈', '🎈', '🐦'],
    background: 'linear-gradient(160deg, #e3f2fd 0%, #d6e8fb 100%)',
  },
  {
    id: 'espace',
    emojis: ['🌟', '🪐', '🚀', '☄️', '🌙'],
    background: 'linear-gradient(160deg, #e9e6f8 0%, #d8e0f5 100%)',
  },
]

// ------------------------------------------------------------
// Spécification de difficulté
// ------------------------------------------------------------

/** Jetons dans la scène, par niveau de Tuner (index = niveau). */
export const TOKEN_COUNTS = [10, 12] as const
/** Nombre max de distracteurs « intelligents », par niveau de Tuner. */
export const SMART_BUDGETS = [3, 6] as const

function clampLevel(level: number): 0 | 1 {
  return Math.max(0, Math.min(MAX_TUNER_LEVEL, Math.floor(level))) as 0 | 1
}

export function tokenCountFor(level: number): number {
  return TOKEN_COUNTS[clampLevel(level)]
}

// ------------------------------------------------------------
// Dispersion : grille 4×3 mélangée + petit décalage aléatoire.
// Chaque jeton garde sa propre cellule → jamais deux lettres
// empilées au même endroit (positions en % du conteneur).
// ------------------------------------------------------------

export const GRID_COLS = 4
export const GRID_ROWS = 3
const JITTER_X = 3 // ± % horizontal
const JITTER_Y = 5 // ± % vertical
/**
 * Bornes horizontales du centre d'un jeton (% de la scène) : la scène est en
 * overflow-hidden, et en 375 px elle ne fait que 351 px de large. Pire cas :
 * jeton 72 px × échelle 1.1 pivoté de 12° ≈ 94 px de boîte → demi-largeur
 * ≈ 47 px ≈ 13.4 % — en deçà, la carte serait rognée (bande non tappable).
 */
export const MIN_X = 13.5
export const MAX_X = 100 - MIN_X
/**
 * Bornes verticales équivalentes : la scène fait ~320-440 px de haut selon
 * l'écran → la demi-hauteur du pire cas (≈ 47 px ≈ 15 %) rognerait le jeton
 * en haut/bas sur les lignes extrêmes sans cette borne.
 */
export const MIN_Y = 15
export const MAX_Y = 100 - MIN_Y

function scatterPositions(count: number): Array<{ x: number; y: number }> {
  if (count > GRID_COLS * GRID_ROWS) {
    throw new Error(`scatterPositions: ${count} jetons pour ${GRID_COLS * GRID_ROWS} cellules`)
  }
  const cells = shuffle(
    Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => i),
  ).slice(0, count)
  return cells.map((cell) => {
    const col = cell % GRID_COLS
    const row = Math.floor(cell / GRID_COLS)
    const baseX = ((col + 0.5) / GRID_COLS) * 100
    // Jitter resserré sur les colonnes extrêmes : x toujours dans [MIN_X, MAX_X].
    const x =
      randInt(Math.max(baseX - JITTER_X, MIN_X) * 10, Math.min(baseX + JITTER_X, MAX_X) * 10) / 10
    const baseY = ((row + 0.5) / GRID_ROWS) * 100
    // Même resserrement sur les lignes extrêmes : y toujours dans [MIN_Y, MAX_Y].
    const y =
      randInt(Math.max(baseY - JITTER_Y, MIN_Y) * 10, Math.min(baseY + JITTER_Y, MAX_Y) * 10) / 10
    return { x, y }
  })
}

// ------------------------------------------------------------
// Items
// ------------------------------------------------------------

export interface ChlToken {
  /** id stable (0..n-1) */
  id: number
  letter: Letter
  graphie: Graphie
  /** Centre du jeton, en % du conteneur de scène */
  x: number
  y: number
  /** Rotation légère en degrés (-12..12) */
  rotation: number
  /** Échelle (0.9..1.1) — la base reste ≥ 64 px de cible tactile */
  scale: number
}

export interface ChlItem {
  tier: TierId
  /** Lettre cible (toujours en minuscule a-z) */
  target: Letter
  /** T3 uniquement : le mot illustré dont on cherche l'initiale */
  word?: ChlWord
  tokens: ChlToken[]
  /** ids des jetons à attraper (1, ou 3 au palier T2) */
  targetIds: number[]
  /** Occurrences de la cible à attraper */
  neededCount: 1 | 3
  /** Compétence enregistrée à la résolution de l'item */
  skillId: string
  /** Cible dans {b,d,p,q} hors capitales → skill confusables */
  confusable: boolean
}

/** Tire dans candidates en évitant `avoid` quand une alternative existe. */
function pickAvoiding<T>(candidates: readonly T[], avoid?: T): T {
  const filtered = avoid === undefined ? candidates : candidates.filter((c) => c !== avoid)
  return pick(filtered.length > 0 ? filtered : candidates)
}

/**
 * Choisit `count` lettres-distracteurs DISTINCTES, jamais égales à la cible :
 * d'abord les miroirs imposés (cible b/d/p/q hors T0), puis des voisines
 * visuelles (dans la limite du budget « intelligent » du niveau), puis du
 * remplissage aléatoire.
 */
function distractorLetters(
  target: Letter,
  count: number,
  level: 0 | 1,
  forceMirrors: boolean,
  excluded: readonly Letter[],
): Letter[] {
  const used = new Set<Letter>([target, ...excluded])
  const out: Letter[] = []
  if (forceMirrors) {
    for (const m of mirrorsOf(target)) {
      if (!used.has(m) && out.length < count) {
        out.push(m)
        used.add(m)
      }
    }
  }
  const budget = SMART_BUDGETS[level]
  for (const l of shuffle(lookalikesFor(target))) {
    if (out.length >= budget || out.length >= count) break
    if (used.has(l)) continue
    out.push(l)
    used.add(l)
  }
  for (const l of shuffle(LETTERS)) {
    if (out.length >= count) break
    if (used.has(l)) continue
    out.push(l)
    used.add(l)
  }
  if (out.length < count) {
    throw new Error(`distractorLetters: impossible de réunir ${count} lettres distinctes`)
  }
  return out
}

/** Assemble les jetons : mélange, positions dispersées, rotations, échelles. */
function buildTokens(
  specs: ReadonlyArray<{ letter: Letter; graphie: Graphie }>,
): ChlToken[] {
  const shuffled = shuffle(specs)
  const positions = scatterPositions(shuffled.length)
  return shuffled.map((s, i): ChlToken => ({
    id: i,
    letter: s.letter,
    graphie: s.graphie,
    x: positions[i].x,
    y: positions[i].y,
    rotation: randInt(-12, 12),
    scale: randInt(90, 110) / 100,
  }))
}

/**
 * Génère un item TOUJOURS résoluble pour un palier et un niveau de Tuner.
 * - `avoid` : la cible précédente, pour ne jamais reposer la même lettre
 *   deux fois de suite.
 * - `forceConfusable` : repose une cible miroir (b/d/p/q) après une erreur
 *   sur une paire confusable — ignoré au palier T0 (capitales).
 */
export function generateItem(
  tier: TierId,
  level: number,
  avoid?: Letter,
  forceConfusable = false,
): ChlItem {
  const lvl = clampLevel(level)
  const count = TOKEN_COUNTS[lvl]

  if (tier === 3) {
    // Premier son : un mot dit + illustré, l'enfant attrape son initiale.
    let candidates = WORDS_T3
    if (forceConfusable) {
      const conf = candidates.filter((w) => isMirrorLetter(w.initial))
      if (conf.length > 0) candidates = conf
    }
    const fresh = avoid === undefined ? candidates : candidates.filter((w) => w.initial !== avoid)
    const word = pick(fresh.length > 0 ? fresh : candidates)
    const target = word.initial
    const confusable = isMirrorLetter(target)
    const letters = distractorLetters(
      target,
      count - 1,
      lvl,
      confusable,
      PHONETIC_RIVALS[target] ?? [],
    )
    const tokens = buildTokens([
      { letter: target, graphie: 'script' },
      ...letters.map((letter) => ({ letter, graphie: 'script' as Graphie })),
    ])
    return {
      tier,
      target,
      word,
      tokens,
      targetIds: tokens.filter((t) => t.letter === target).map((t) => t.id),
      neededCount: 1,
      skillId: confusable ? CONFUSABLE_SKILL : TIER_SKILLS[tier],
      confusable,
    }
  }

  // T0/T1/T2 : la cible est une lettre tirée au sort.
  const pool: readonly Letter[] =
    forceConfusable && tier > 0 ? MIRROR_LETTERS : LETTERS
  const target = pickAvoiding(pool, avoid)
  const confusable = tier > 0 && isMirrorLetter(target)

  if (tier === 2) {
    // Les trois écritures : la cible existe en capitale, script ET cursive.
    const letters = distractorLetters(target, count - 3, lvl, confusable, [])
    const tokens = buildTokens([
      { letter: target, graphie: 'capital' },
      { letter: target, graphie: 'script' },
      { letter: target, graphie: 'cursive' },
      ...letters.map((letter): { letter: Letter; graphie: Graphie } => ({
        letter,
        // Le piège miroir n'existe qu'en script : on l'y maintient.
        graphie: mirrorsOf(target).includes(letter) ? 'script' : pick(GRAPHIES),
      })),
    ])
    return {
      tier,
      target,
      tokens,
      targetIds: tokens.filter((t) => t.letter === target).map((t) => t.id),
      neededCount: 3,
      skillId: confusable ? CONFUSABLE_SKILL : TIER_SKILLS[tier],
      confusable,
    }
  }

  // T0 (capitales) / T1 (script) : la cible apparaît UNE fois.
  const graphie: Graphie = tier === 0 ? 'capital' : 'script'
  const letters = distractorLetters(target, count - 1, lvl, confusable, [])
  const tokens = buildTokens([
    { letter: target, graphie },
    ...letters.map((letter) => ({ letter, graphie })),
  ])
  return {
    tier,
    target,
    tokens,
    targetIds: tokens.filter((t) => t.letter === target).map((t) => t.id),
    neededCount: 1,
    skillId: confusable ? CONFUSABLE_SKILL : TIER_SKILLS[tier],
    confusable,
  }
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

export function tokenById(item: ChlItem, id: number): ChlToken | undefined {
  return item.tokens.find((t) => t.id === id)
}

/** Le jeton tapé est-il une occurrence de la cible ? */
export function isTargetToken(item: ChlItem, tokenId: number): boolean {
  return item.targetIds.includes(tokenId)
}

/** Toutes les occurrences demandées ont-elles été attrapées ? */
export function isItemSolved(item: ChlItem, foundIds: readonly number[]): boolean {
  return item.targetIds.every((id) => foundIds.includes(id))
}

/** Affichage d'une lettre selon sa graphie (la cursive reste en minuscule). */
export function displayedLetter(letter: Letter, graphie: Graphie): string {
  return graphie === 'capital' ? letter.toUpperCase() : letter
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

export interface ChlProgress {
  bestStars: Record<number, 0 | 1 | 2 | 3>
  unlockedTier: number
  runs: number
}

export const FRESH_PROGRESS: ChlProgress = { bestStars: {}, unlockedTier: 0, runs: 0 }

/** Applique le résultat d'une partie : meilleur score + déblocage à 2 étoiles. */
export function applyRun(p: ChlProgress, tier: TierId, stars: 1 | 2 | 3): ChlProgress {
  const best = Math.max(p.bestStars[tier] ?? 0, stars) as 0 | 1 | 2 | 3
  const unlockedTier =
    stars >= 2 ? Math.max(p.unlockedTier, Math.min(tier + 1, TIER_COUNT - 1)) : p.unlockedTier
  return {
    bestStars: { ...p.bestStars, [tier]: best },
    unlockedTier,
    runs: p.runs + 1,
  }
}
