import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  compareCorrect,
  compareKey,
  extremeTarget,
  FRESH_PROGRESS,
  generateItem,
  isCompareTier,
  ITEMS_PER_RUN,
  itemKey,
  MAX_TUNER_LEVEL,
  measureCorrect,
  measureKey,
  OBJECTS,
  OBJECTS_BY_ID,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
  type CompareItem,
  type MeasureItem,
  type MmgProgress,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('bestiaire d’objets', () => {
  it('6 objets, ids et emojis non vides, ids uniques', () => {
    expect(OBJECTS).toHaveLength(6)
    const ids = new Set(OBJECTS.map((o) => o.id))
    expect(ids.size).toBe(6)
    for (const o of OBJECTS) {
      expect(o.name.length).toBeGreaterThan(0)
      expect(o.emoji.length).toBeGreaterThan(0)
      expect(OBJECTS_BY_ID.get(o.id)).toEqual(o)
    }
  })

  it('isCompareTier : T0/T1 comparent, T2/T3 mesurent', () => {
    expect(isCompareTier(0)).toBe(true)
    expect(isCompareTier(1)).toBe(true)
    expect(isCompareTier(2)).toBe(false)
    expect(isCompareTier(3)).toBe(false)
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          expect(item.tier).toBe(tier)

          if (item.kind === 'compare') {
            // 2 objets en T0, 3 en T1
            expect(item.objects.length).toBe(tier === 0 ? 2 : 3)
            // longueurs TOUTES distinctes → extremum unique
            const lengths = item.objects.map((o) => o.length)
            expect(new Set(lengths).size).toBe(lengths.length)
            for (const o of item.objects) {
              expect(o.length).toBeGreaterThanOrEqual(1)
              expect(OBJECTS_BY_ID.has(o.id)).toBe(true)
            }
            // la cible est l'unique extremum demandé
            expect(item.targetId).toBe(extremeTarget(item.objects, item.extreme))
            const targetLen = item.objects.find((o) => o.id === item.targetId)!.length
            const others = item.objects.filter((o) => o.id !== item.targetId)
            for (const o of others) {
              if (item.extreme === 'long') expect(o.length).toBeLessThan(targetLen)
              else expect(o.length).toBeGreaterThan(targetLen)
            }
            // appliquer la bonne réponse résout l'item
            expect(compareCorrect(item, item.targetId)).toBe(true)
            // tout autre objet est une erreur (≥ 1 distracteur)
            expect(others.length).toBeGreaterThanOrEqual(1)
            for (const o of others) expect(compareCorrect(item, o.id)).toBe(false)
          } else {
            // bornes de cubes selon palier
            const [lo, hi] = tier === 2 ? [2, 5] : [3, 9]
            expect(item.cubes).toBeGreaterThanOrEqual(lo)
            expect(item.cubes).toBeLessThanOrEqual(hi)
            expect(OBJECTS_BY_ID.has(item.objectId)).toBe(true)
            // la cible figure parmi les choix, tous ≥ 1, sans doublon
            expect(item.choices).toContain(item.cubes)
            for (const c of item.choices) expect(c).toBeGreaterThanOrEqual(1)
            expect(new Set(item.choices).size).toBe(item.choices.length)
            // ≥ 1 distracteur
            expect(item.choices.length).toBeGreaterThanOrEqual(2)
            // appliquer la bonne réponse résout l'item, les autres sont des erreurs
            expect(measureCorrect(item, item.cubes)).toBe(true)
            for (const c of item.choices) {
              if (c !== item.cubes) expect(measureCorrect(item, c)).toBe(false)
            }
          }
        }
      })
    }
  }

  it('comparer : avoid ne répète pas la même cible/extremum (100 tirages)', () => {
    let prev = itemKey(generateItem(1, 0))
    for (let i = 0; i < 100; i++) {
      const next = generateItem(1, 0, prev)
      expect(itemKey(next)).not.toBe(prev)
      prev = itemKey(next)
    }
  })

  it('mesurer : avoid ne répète pas le même couple objet/nombre (100 tirages)', () => {
    let prev = itemKey(generateItem(3, 0))
    for (let i = 0; i < 100; i++) {
      const next = generateItem(3, 0, prev)
      expect(itemKey(next)).not.toBe(prev)
      prev = itemKey(next)
    }
  })
})

describe('helpers d’extremum & clés', () => {
  it('extremeTarget renvoie le plus long et le plus court', () => {
    const objects = [
      { id: 'a', length: 3 },
      { id: 'b', length: 7 },
      { id: 'c', length: 5 },
    ]
    expect(extremeTarget(objects, 'long')).toBe('b')
    expect(extremeTarget(objects, 'short')).toBe('a')
  })

  it('compareKey / measureKey sont stables et discriminants', () => {
    const cmp: CompareItem = {
      kind: 'compare',
      tier: 0,
      extreme: 'long',
      objects: [
        { id: 'serpent', length: 5 },
        { id: 'ver', length: 2 },
      ],
      targetId: 'serpent',
    }
    expect(compareKey(cmp)).toBe('long:serpent')
    expect(itemKey(cmp)).toBe('long:serpent')

    const meas: MeasureItem = {
      kind: 'measure',
      tier: 2,
      objectId: 'train',
      cubes: 4,
      choices: [4, 3, 5],
    }
    expect(measureKey(meas)).toBe('train:4')
    expect(itemKey(meas)).toBe('train:4')
  })
})

describe('validation', () => {
  it('compareCorrect compare à la cible', () => {
    const item: CompareItem = {
      kind: 'compare',
      tier: 1,
      extreme: 'short',
      objects: [
        { id: 'crayon', length: 6 },
        { id: 'ver', length: 2 },
        { id: 'baguette', length: 4 },
      ],
      targetId: 'ver',
    }
    expect(compareCorrect(item, 'ver')).toBe(true)
    expect(compareCorrect(item, 'crayon')).toBe(false)
  })

  it('measureCorrect compare au nombre de cubes', () => {
    const item: MeasureItem = {
      kind: 'measure',
      tier: 3,
      objectId: 'serpent',
      cubes: 7,
      choices: [7, 6, 8, 5],
    }
    expect(measureCorrect(item, 7)).toBe(true)
    expect(measureCorrect(item, 6)).toBe(false)
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
    let p: MmgProgress = { ...FRESH_PROGRESS }
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
    let p: MmgProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('metre-magique')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
