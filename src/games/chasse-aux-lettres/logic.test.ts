import { describe, expect, it } from 'vitest'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  applyRun,
  CONFUSABLE_SKILL,
  DECORS,
  displayedLetter,
  FRESH_PROGRESS,
  GAME_SKILLS,
  generateItem,
  GRID_COLS,
  GRID_ROWS,
  isItemSolved,
  isMirrorLetter,
  isTargetToken,
  ITEMS_PER_RUN,
  LETTER_NAMES,
  LETTERS,
  lookalikesFor,
  MAX_TUNER_LEVEL,
  MAX_X,
  MAX_Y,
  MIN_X,
  MIN_Y,
  MIRROR_LETTERS,
  mirrorsOf,
  PHONETIC_RIVALS,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
  TOKEN_COUNTS,
  tokenById,
  tokenCountFor,
  WORDS_T3,
} from './logic'
import type { ChlItem, ChlProgress, Letter, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, MAX_TUNER_LEVEL]

function draws(tier: TierId, level: number, n = DRAWS): ChlItem[] {
  return Array.from({ length: n }, () => generateItem(tier, level))
}

/** Lettres-distracteurs d'un item (tout sauf les occurrences de la cible). */
function distractorLetters(item: ChlItem): Letter[] {
  return item.tokens.filter((t) => !item.targetIds.includes(t.id)).map((t) => t.letter)
}

/** Cellule de grille d'une position — sert à prouver l'unicité des positions. */
function cellOf(x: number, y: number): number {
  return Math.floor(x / (100 / GRID_COLS)) + GRID_COLS * Math.floor(y / (100 / GRID_ROWS))
}

/** Item construit à la main pour tester la validation seule. */
function manualItem(
  partial: Partial<ChlItem> & Pick<ChlItem, 'target' | 'tokens' | 'targetIds'>,
): ChlItem {
  return {
    tier: 0,
    neededCount: 1,
    skillId: 'fr.gs.lettres.nom',
    confusable: false,
    ...partial,
  }
}

describe('generateItem — invariants communs (tous paliers, tous niveaux)', () => {
  it('la cible est présente EXACTEMENT le bon nombre de fois, jamais en distracteur', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          const expected = tier === 2 ? 3 : 1
          expect(item.neededCount).toBe(expected)
          const occurrences = item.tokens.filter((t) => t.letter === item.target)
          expect(occurrences).toHaveLength(expected)
          // targetIds = exactement ces occurrences (aucun doublon en distracteur)
          expect([...item.targetIds].sort((a, b) => a - b)).toEqual(
            occurrences.map((t) => t.id).sort((a, b) => a - b),
          )
          expect(isItemSolved(item, item.targetIds)).toBe(true)
        }
      }
    }
  })

  it('respecte le nombre de jetons du niveau, avec des ids uniques 0..n-1', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          expect(item.tokens).toHaveLength(tokenCountFor(level))
          const ids = item.tokens.map((t) => t.id).sort((a, b) => a - b)
          expect(ids).toEqual(Array.from({ length: item.tokens.length }, (_, i) => i))
        }
      }
    }
  })

  it('les lettres-distracteurs sont toutes distinctes et différentes de la cible', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          const letters = distractorLetters(item)
          expect(new Set(letters).size).toBe(letters.length)
          expect(letters.every((l) => l !== item.target)).toBe(true)
        }
      }
    }
  })

  it('positions dispersées : jamais rognées par overflow-hidden, jamais deux jetons dans la même cellule', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          const cells = item.tokens.map((t) => {
            // Centres bornés : le pire cas (72 px × 1.1 pivoté de 12°) tient
            // entièrement dans la scène (351 px de large en mobile 375 px,
            // ~320 px de haut au plus serré).
            expect(t.x).toBeGreaterThanOrEqual(MIN_X)
            expect(t.x).toBeLessThanOrEqual(MAX_X)
            expect(t.y).toBeGreaterThanOrEqual(MIN_Y)
            expect(t.y).toBeLessThanOrEqual(MAX_Y)
            return cellOf(t.x, t.y)
          })
          expect(new Set(cells).size).toBe(cells.length)
        }
      }
    }
  })

  it('rotation légère (-12°..12°) et échelle bornée (0.9..1.1, cible tactile ≥ 64 px)', () => {
    for (const tier of ALL_TIERS) {
      for (const item of draws(tier, 1, 100)) {
        for (const t of item.tokens) {
          expect(t.rotation).toBeGreaterThanOrEqual(-12)
          expect(t.rotation).toBeLessThanOrEqual(12)
          expect(t.scale).toBeGreaterThanOrEqual(0.9)
          expect(t.scale).toBeLessThanOrEqual(1.1)
          // base 72 px × échelle min = 64.8 px ≥ 64 px
          expect(72 * t.scale).toBeGreaterThanOrEqual(64)
        }
      }
    }
  })

  it('propose toujours au moins un distracteur intelligent (voisine visuelle ou miroir)', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          const smart = new Set<Letter>([
            ...lookalikesFor(item.target),
            ...mirrorsOf(item.target),
          ])
          expect(distractorLetters(item).some((l) => smart.has(l))).toBe(true)
        }
      }
    }
  })

  it('skillId : palier par défaut, confusables quand la cible est b/d/p/q hors T0', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          const expectConfusable = tier > 0 && isMirrorLetter(item.target)
          expect(item.confusable).toBe(expectConfusable)
          expect(item.skillId).toBe(expectConfusable ? CONFUSABLE_SKILL : TIER_SKILLS[tier])
          expect([...GAME_SKILLS]).toContain(item.skillId)
        }
      }
    }
  })
})

describe('graphies par palier', () => {
  it('T0 : tout en capitales — T1 et T3 : tout en script', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(0, level, 100)) {
        expect(item.tokens.every((t) => t.graphie === 'capital')).toBe(true)
      }
      for (const tier of [1, 3] as const) {
        for (const item of draws(tier, level, 100)) {
          expect(item.tokens.every((t) => t.graphie === 'script')).toBe(true)
        }
      }
    }
  })

  it('T2 : la cible existe en capitale, script ET cursive (une de chaque)', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(2, level)) {
        const graphies = item.targetIds
          .map((id) => tokenById(item, id)?.graphie)
          .sort()
        expect(graphies).toEqual(['capital', 'cursive', 'script'].sort())
      }
    }
  })

  it('T2 : les distracteurs miroirs restent en script (là où la confusion existe)', () => {
    for (let i = 0; i < DRAWS; i++) {
      const item = generateItem(2, 1, undefined, true)
      for (const tok of item.tokens) {
        if (item.targetIds.includes(tok.id)) continue
        if (mirrorsOf(item.target).includes(tok.letter)) {
          expect(tok.graphie).toBe('script')
        }
      }
    }
  })
})

describe('confusables b/d/p/q — miroirs toujours présents, repose adaptative', () => {
  it('T1/T2/T3 : quand la cible est un miroir, TOUS ses miroirs sont des distracteurs', () => {
    for (const tier of [1, 2, 3] as const) {
      for (const level of ALL_LEVELS) {
        for (let i = 0; i < DRAWS; i++) {
          const item = generateItem(tier, level, undefined, true)
          expect(item.confusable).toBe(true)
          expect(item.skillId).toBe(CONFUSABLE_SKILL)
          const letters = new Set(distractorLetters(item))
          for (const m of mirrorsOf(item.target)) {
            expect(letters.has(m)).toBe(true)
          }
        }
      }
    }
  })

  it('forceConfusable : T1/T2 ciblent b/d/p/q — T3 cible un mot en b/d/p', () => {
    for (let i = 0; i < DRAWS; i++) {
      for (const tier of [1, 2] as const) {
        const item = generateItem(tier, 0, undefined, true)
        expect([...MIRROR_LETTERS]).toContain(item.target)
      }
      const t3 = generateItem(3, 0, undefined, true)
      expect(['b', 'd', 'p']).toContain(t3.target)
      expect(t3.word?.initial).toBe(t3.target)
    }
  })

  it('forceConfusable est ignoré au palier T0 (capitales) : jamais le skill confusables', () => {
    for (let i = 0; i < DRAWS; i++) {
      const item = generateItem(0, 0, undefined, true)
      expect(item.confusable).toBe(false)
      expect(item.skillId).toBe(TIER_SKILLS[0])
    }
  })

  it('forceConfusable + avoid : repose la notion avec une NOUVELLE valeur', () => {
    for (let i = 0; i < DRAWS; i++) {
      expect(generateItem(1, 0, 'b', true).target).not.toBe('b')
      expect(generateItem(2, 1, 'd', true).target).not.toBe('d')
      expect(generateItem(3, 0, 'p', true).target).not.toBe('p')
    }
  })
})

describe('avoid — jamais deux fois la même cible de suite', () => {
  it('la cible évitée ne ressort jamais (tous paliers, toutes lettres)', () => {
    for (const tier of ALL_TIERS) {
      for (const letter of LETTERS) {
        for (let i = 0; i < 10; i++) {
          expect(generateItem(tier, 0, letter).target).not.toBe(letter)
        }
      }
    }
  })

  it('T3 : éviter une lettre écarte tous les mots qui commencent par elle', () => {
    for (let i = 0; i < DRAWS; i++) {
      const item = generateItem(3, 0, 'b')
      expect(item.word?.initial).not.toBe('b')
    }
  })
})

describe('couverture — génération procédurale, jamais de pool figé', () => {
  it('T0, T1 et T2 finissent par proposer les 26 lettres', () => {
    for (const tier of [0, 1, 2] as const) {
      const seen = new Set(draws(tier, 1, 1500).map((i) => i.target))
      expect(seen.size).toBe(26)
    }
  })

  it('T3 finit par proposer TOUS les mots du corpus', () => {
    const seen = new Set(draws(3, 1, 2000).map((i) => i.word?.word))
    expect(seen.size).toBe(WORDS_T3.length)
  })
})

describe('corpus de mots T3 — initiales sûres', () => {
  const normalize = (w: string): string =>
    w.normalize('NFD').replace(/[̀-ͯ]/g, '')

  it('environ 30 mots, tous distincts, emojis et clips uniques', () => {
    expect(WORDS_T3.length).toBeGreaterThanOrEqual(30)
    expect(new Set(WORDS_T3.map((w) => w.word)).size).toBe(WORDS_T3.length)
    expect(new Set(WORDS_T3.map((w) => w.clipId)).size).toBe(WORDS_T3.length)
    for (const w of WORDS_T3) {
      expect(w.emoji.length).toBeGreaterThan(0)
      expect(w.clipId).toMatch(/^chl\.mot\.[a-z0-9-]+$/)
    }
  })

  it('l’initiale déclarée correspond à la première lettre du mot (accents normalisés)', () => {
    for (const w of WORDS_T3) {
      expect(normalize(w.word)[0]).toBe(w.initial)
    }
  })

  it('aucune initiale ambiguë : pas de h muet, pas de digraphe ch/ou/qu, pas de c ou g doux', () => {
    for (const w of WORDS_T3) {
      const n = normalize(w.word)
      expect(n.startsWith('h')).toBe(false)
      expect(/^(ch|ou|qu)/.test(n)).toBe(false)
      if (n.startsWith('c') || n.startsWith('g')) {
        // c/g durs uniquement : suivis de a, o, u, l ou r
        expect(['a', 'o', 'u', 'l', 'r']).toContain(n[1])
      }
    }
  })

  it('T3 : les lettres au son rival sont exclues des distracteurs (c↔k↔q, j↔g…)', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(3, level, 600)) {
        const rivals = PHONETIC_RIVALS[item.target] ?? []
        const letters = new Set(item.tokens.map((t) => t.letter))
        for (const r of rivals) {
          expect(letters.has(r)).toBe(false)
        }
      }
    }
  })

  it('v compte w parmi ses rivaux : /v/ s’écrit aussi w (wagon)', () => {
    expect(PHONETIC_RIVALS.v).toContain('w')
  })
})

describe('validation — isTargetToken / isItemSolved', () => {
  const tokens = [
    { id: 0, letter: 'b' as Letter, graphie: 'script' as const, x: 10, y: 10, rotation: 0, scale: 1 },
    { id: 1, letter: 'd' as Letter, graphie: 'script' as const, x: 50, y: 10, rotation: 0, scale: 1 },
    { id: 2, letter: 'b' as Letter, graphie: 'capital' as const, x: 90, y: 10, rotation: 0, scale: 1 },
  ]

  it('reconnaît les occurrences de la cible et elles seules', () => {
    const item = manualItem({ target: 'b', tokens, targetIds: [0, 2], neededCount: 3 })
    expect(isTargetToken(item, 0)).toBe(true)
    expect(isTargetToken(item, 2)).toBe(true)
    expect(isTargetToken(item, 1)).toBe(false)
    expect(isTargetToken(item, 99)).toBe(false)
  })

  it('résolu seulement quand TOUTES les occurrences sont attrapées (ordre libre)', () => {
    const item = manualItem({ target: 'b', tokens, targetIds: [0, 2], neededCount: 3 })
    expect(isItemSolved(item, [])).toBe(false)
    expect(isItemSolved(item, [0])).toBe(false)
    expect(isItemSolved(item, [2, 0])).toBe(true)
    expect(isItemSolved(item, [0, 1, 2])).toBe(true) // ids en trop ignorés
  })

  it('tokenById retrouve un jeton, undefined sinon', () => {
    const item = manualItem({ target: 'b', tokens, targetIds: [0, 2] })
    expect(tokenById(item, 1)?.letter).toBe('d')
    expect(tokenById(item, 42)).toBeUndefined()
  })
})

describe('lettres — noms, miroirs, voisines, affichage', () => {
  it('les 26 lettres ont un nom parlé non vide', () => {
    expect(LETTERS).toHaveLength(26)
    for (const l of LETTERS) {
      expect(LETTER_NAMES[l].length).toBeGreaterThan(0)
    }
  })

  it('mirrorsOf : le groupe b/d/p/q, vide ailleurs', () => {
    expect(mirrorsOf('b').sort()).toEqual(['d', 'p', 'q'])
    expect(mirrorsOf('q').sort()).toEqual(['b', 'd', 'p'])
    expect(mirrorsOf('a')).toEqual([])
    expect(isMirrorLetter('d')).toBe(true)
    expect(isMirrorLetter('m')).toBe(false)
  })

  it('lookalikesFor : jamais la lettre elle-même, toujours au moins une voisine', () => {
    for (const l of LETTERS) {
      const looks = lookalikesFor(l)
      expect(looks.length).toBeGreaterThan(0)
      expect(looks).not.toContain(l)
    }
    // les voisines de l'alphabet sont incluses
    expect(lookalikesFor('a')).toContain('b')
    expect(lookalikesFor('z')).toContain('y')
    // le groupe visuel B/R/P/D
    for (const m of ['r', 'p', 'd'] as const) {
      expect(lookalikesFor('b')).toContain(m)
    }
  })

  it('displayedLetter : capitale en majuscule, script et cursive en minuscule', () => {
    expect(displayedLetter('b', 'capital')).toBe('B')
    expect(displayedLetter('b', 'script')).toBe('b')
    expect(displayedLetter('b', 'cursive')).toBe('b')
  })

  it('tokenCountFor : borné aux niveaux du Tuner, et tient dans la grille', () => {
    expect(tokenCountFor(-3)).toBe(TOKEN_COUNTS[0])
    expect(tokenCountFor(0)).toBe(TOKEN_COUNTS[0])
    expect(tokenCountFor(1)).toBe(TOKEN_COUNTS[1])
    expect(tokenCountFor(99)).toBe(TOKEN_COUNTS[1])
    for (const c of TOKEN_COUNTS) {
      expect(c).toBeLessThanOrEqual(GRID_COLS * GRID_ROWS)
    }
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, ITEMS_PER_RUN)).toBe(3)
    expect(starsFor(7, ITEMS_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, ITEMS_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, ITEMS_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, ITEMS_PER_RUN)).toBe(1)
  })

  it('bornes exactes : 9/10 → 3 et 7/10 → 2', () => {
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(7, 10)).toBe(2)
  })
})

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 3).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1).unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: ChlProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà de T3', () => {
    const p = applyRun({ bestStars: {}, unlockedTier: 3, runs: 0 }, 3, 3)
    expect(p.unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: ChlProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

describe('corpus audio — couverture complète, préfixe chl.', () => {
  const ids = new Set(corpus.entries.map((e) => e.id))

  it('ids valides, uniques, tous préfixés chl., voix connues', () => {
    expect(ids.size).toBe(corpus.entries.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('chl.')).toBe(true)
      expect(['denise', 'eloise', 'henri']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('chaque lettre a son nom, son « ça c’est le… » et son « comme… »', () => {
    for (const l of LETTERS) {
      expect(ids.has(`chl.lettre.${l}`)).toBe(true)
      expect(ids.has(`chl.cest.${l}`)).toBe(true)
      expect(ids.has(`chl.comme.${l}`)).toBe(true)
    }
  })

  it('le clip du nom de chaque lettre porte exactement le texte phonétique attendu', () => {
    const byId = new Map(corpus.entries.map((e) => [e.id, e.text]))
    for (const l of LETTERS) {
      expect(byId.get(`chl.lettre.${l}`)).toBe(LETTER_NAMES[l])
    }
  })

  it('chaque mot T3 a son clip, au texte exact du mot', () => {
    const byId = new Map(corpus.entries.map((e) => [e.id, e.text]))
    for (const w of WORDS_T3) {
      expect(byId.get(w.clipId)).toBe(w.word)
    }
  })

  it('consignes, indice, niveaux et verrouillage sont présents', () => {
    for (const id of [
      'chl.intro',
      'chl.consigne.trouve',
      'chl.consigne.trouve-tous',
      'chl.consigne.trois',
      'chl.consigne.ecoute',
      'chl.consigne.commence',
      'chl.indice',
      'chl.bien-vu',
      'chl.verrouille',
      'chl.niveau.0',
      'chl.niveau.1',
      'chl.niveau.2',
      'chl.niveau.3',
    ]) {
      expect(ids.has(id)).toBe(true)
    }
  })
})

describe('décors — purement décoratifs, variés', () => {
  it('au moins 3 décors, chacun avec plusieurs emojis et un fond', () => {
    expect(DECORS.length).toBeGreaterThanOrEqual(3)
    expect(new Set(DECORS.map((d) => d.id)).size).toBe(DECORS.length)
    for (const d of DECORS) {
      expect(d.emojis.length).toBeGreaterThanOrEqual(4)
      expect(d.background.length).toBeGreaterThan(0)
    }
  })
})

describe('cohérence avec le manifest (une fois câblé par l’orchestrateur)', () => {
  it('les skills déclarés correspondent à GAME_SKILLS', () => {
    const meta = GAMES_BY_ID.get('chasse-aux-lettres')
    if (!meta) return // entrée manifest pas encore câblée — câblage hors périmètre
    expect(meta.skills).toEqual([...GAME_SKILLS])
    expect(meta.island).toBe('sons')
    expect(meta.status).toBe('v2')
  })

  it('chaque skill de palier appartient aux skills du jeu', () => {
    for (const s of TIER_SKILLS) {
      expect([...GAME_SKILLS]).toContain(s)
    }
    expect([...GAME_SKILLS]).toContain(CONFUSABLE_SKILL)
  })
})
