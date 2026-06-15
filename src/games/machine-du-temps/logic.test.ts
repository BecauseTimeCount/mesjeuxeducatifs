import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  avoidKey,
  chainLengthForTier,
  eraOf,
  FRESH_PROGRESS,
  GENERATIONS,
  generateItem,
  ITEMS_PER_RUN,
  isSortTier,
  MAX_TUNER_LEVEL,
  OBJECTS,
  objectsForTier,
  orderedByAge,
  sortCorrect,
  starsFor,
  stepOutcome,
  TIER_COUNT,
  TIER_SKILLS,
  type MdtProgress,
  type OrderItem,
  type SortItem,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('objets datés & générations', () => {
  it('12 objets : 6 autrefois, 6 aujourd’hui, ids & emojis uniques', () => {
    expect(OBJECTS).toHaveLength(12)
    const ids = new Set(OBJECTS.map((o) => o.id))
    expect(ids.size).toBe(12)
    const emojis = new Set(OBJECTS.map((o) => o.emoji))
    expect(emojis.size).toBe(12)
    expect(OBJECTS.filter((o) => o.era === 'autrefois')).toHaveLength(6)
    expect(OBJECTS.filter((o) => o.era === 'aujourdhui')).toHaveLength(6)
    for (const o of OBJECTS) {
      expect(['autrefois', 'aujourdhui']).toContain(o.era)
      expect(o.name.length).toBeGreaterThan(0)
      expect(o.emoji.length).toBeGreaterThan(0)
    }
  })

  it('chaque objet a une époque UNIQUE (pas d’ambiguïté)', () => {
    for (const o of OBJECTS) {
      expect(eraOf(o.id)).toBe(o.era)
    }
  })

  it('eraOf jette pour un objet inconnu', () => {
    expect(() => eraOf('vaisseau')).toThrow()
  })

  it('4 générations de rangs 0..3 distincts, ordonnées du plus jeune au plus âgé', () => {
    expect(GENERATIONS).toHaveLength(4)
    const ranks = GENERATIONS.map((g) => g.rank)
    expect(new Set(ranks)).toEqual(new Set([0, 1, 2, 3]))
    expect(orderedByAge(['grand-parent', 'bebe', 'parent', 'enfant'])).toEqual([
      'bebe',
      'enfant',
      'parent',
      'grand-parent',
    ])
  })
})

describe('objectsForTier / chainLengthForTier', () => {
  it('T0 = uniquement les couples très contrastés', () => {
    expect(objectsForTier(0).every((o) => o.contrast)).toBe(true)
    expect(objectsForTier(0).length).toBeGreaterThan(0)
    expect(objectsForTier(0).length).toBeLessThan(OBJECTS.length)
  })

  it('T1 = tous les objets', () => {
    expect(objectsForTier(1)).toHaveLength(OBJECTS.length)
  })

  it('T0/T1 sont des paliers de tri, T2/T3 d’ordonnancement', () => {
    expect(isSortTier(0)).toBe(true)
    expect(isSortTier(1)).toBe(true)
    expect(isSortTier(2)).toBe(false)
    expect(isSortTier(3)).toBe(false)
  })

  it('T2 ordonne 3 générations, T3 les 4', () => {
    expect(chainLengthForTier(2)).toBe(3)
    expect(chainLengthForTier(3)).toBe(4)
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          if (item.kind === 'sort') {
            // les deux époques (bacs) sont toujours proposées : ≥1 distracteur
            expect(item.eras).toHaveLength(2)
            expect(item.eras).toContain(eraOf(item.objectId))
            const distractors = item.eras.filter((e) => e !== eraOf(item.objectId))
            expect(distractors.length).toBeGreaterThanOrEqual(1)
            // appliquer la bonne époque résout l'item
            expect(sortCorrect(item, eraOf(item.objectId))).toBe(true)
            // l'autre bac est faux : aucune ambiguïté
            for (const e of distractors) expect(sortCorrect(item, e)).toBe(false)
          } else {
            // l'ordre attendu est la sous-suite ordonnée correcte
            expect(item.expected).toHaveLength(chainLengthForTier(tier))
            expect(item.tiles).toHaveLength(item.expected.length)
            expect(new Set(item.tiles)).toEqual(new Set(item.expected))
            expect(item.expected).toEqual(orderedByAge(item.expected))
            // ranks strictement croissants → ordre unique, pas d'ambiguïté
            const ranks = item.expected.map((id) =>
              GENERATIONS.find((g) => g.id === id)!.rank,
            )
            for (let k = 1; k < ranks.length; k++) {
              expect(ranks[k]).toBeGreaterThan(ranks[k - 1])
            }
            // taper dans l'ordre attendu résout l'item
            for (let k = 0; k < item.expected.length; k++) {
              const out = stepOutcome(item.expected, k, item.expected[k])
              expect(out).toBe(k === item.expected.length - 1 ? 'complete' : 'progress')
            }
            // le plateau n'est pas déjà dans l'ordre (sinon trivial) quand n>1
            expect(item.tiles.join('-')).not.toBe(item.expected.join('-'))
          }
        }
      })
    }
  }

  it('sort (T0/T1) : aucun objet hors catalogue', () => {
    const ids = new Set(OBJECTS.map((o) => o.id))
    for (let i = 0; i < 100; i++) {
      const item = generateItem(1, 1) as SortItem
      expect(ids.has(item.objectId)).toBe(true)
    }
  })

  it('avoid ne répète pas le même item (tri T1)', () => {
    let prev = avoidKey(generateItem(1, 0))
    for (let i = 0; i < 100; i++) {
      const next = generateItem(1, 0, prev)
      expect(avoidKey(next)).not.toBe(prev)
      prev = avoidKey(next)
    }
  })

  it('avoid ne répète pas le même item (ordre T2)', () => {
    let prev = avoidKey(generateItem(2, 0))
    for (let i = 0; i < 100; i++) {
      const next = generateItem(2, 0, prev)
      expect(avoidKey(next)).not.toBe(prev)
      prev = avoidKey(next)
    }
  })
})

describe('validation', () => {
  it('sortCorrect compare à l’époque de l’objet', () => {
    const item: SortItem = { kind: 'sort', tier: 0, objectId: 'bougie', eras: ['autrefois', 'aujourdhui'] }
    expect(sortCorrect(item, 'autrefois')).toBe(true)
    expect(sortCorrect(item, 'aujourdhui')).toBe(false)
  })

  it('stepOutcome : progress, complete, wrong', () => {
    const item: OrderItem = {
      kind: 'order',
      tier: 2,
      tiles: ['enfant', 'bebe', 'parent'],
      expected: ['bebe', 'enfant', 'parent'],
    }
    expect(stepOutcome(item.expected, 0, 'bebe')).toBe('progress')
    expect(stepOutcome(item.expected, 1, 'enfant')).toBe('progress')
    expect(stepOutcome(item.expected, 2, 'parent')).toBe('complete')
    expect(stepOutcome(item.expected, 0, 'parent')).toBe('wrong')
    expect(stepOutcome(item.expected, 3, 'bebe')).toBe('wrong')
    expect(stepOutcome(item.expected, -1, 'bebe')).toBe('wrong')
  })
})

describe('score & progression', () => {
  it('starsFor : seuils 90 % / 70 %', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(6, 8)).toBe(2)
    expect(starsFor(4, 8)).toBe(1)
    expect(starsFor(0, 0)).toBe(1)
  })

  it('applyRun débloque le palier suivant à 2 étoiles, garde le meilleur score', () => {
    let p: MdtProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 1)
    expect(p.unlockedTier).toBe(0)
    p = applyRun(p, 0, 3)
    expect(p.unlockedTier).toBe(1)
    expect(p.bestStars[0]).toBe(3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3) // ne régresse jamais
    expect(p.runs).toBe(3)
  })

  it('le déblocage est plafonné au dernier palier', () => {
    const last = (TIER_COUNT - 1) as TierId
    let p: MdtProgress = { ...FRESH_PROGRESS, unlockedTier: last }
    p = applyRun(p, last, 3)
    expect(p.unlockedTier).toBe(last)
  })
})

describe('cohérence skill-map / manifest', () => {
  it('toutes les compétences des paliers existent dans le skill-map', () => {
    for (const id of TIER_SKILLS) expect(SKILLS_BY_ID.has(id)).toBe(true)
    expect(TIER_SKILLS).toHaveLength(ITEMS_PER_RUN > 0 ? TIER_COUNT : 0)
  })

  it('le manifest déclare exactement les compétences des paliers (dédupliquées)', () => {
    const meta = GAMES_BY_ID.get('machine-du-temps')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
