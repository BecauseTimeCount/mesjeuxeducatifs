import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  accepts,
  ANIMALS,
  animalsForTier,
  applyRun,
  FOODS,
  feedComplete,
  FRESH_PROGRESS,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  regimeOf,
  sortCorrect,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
  zonesForTier,
  type CdfProgress,
  type FeedItem,
  type SortItem,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('bestiaire & garde-manger', () => {
  it('16 animaux, ids et emojis uniques, régime valide', () => {
    expect(ANIMALS).toHaveLength(16)
    const ids = new Set(ANIMALS.map((a) => a.id))
    expect(ids.size).toBe(16)
    for (const a of ANIMALS) {
      expect(['herbivore', 'carnivore', 'omnivore']).toContain(a.regime)
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.emoji.length).toBeGreaterThan(0)
    }
  })

  it('couvre les 3 régimes', () => {
    const regimes = new Set(ANIMALS.map((a) => a.regime))
    expect(regimes).toEqual(new Set(['herbivore', 'carnivore', 'omnivore']))
  })

  it('8 aliments : 5 plantes, 3 viandes', () => {
    expect(FOODS).toHaveLength(8)
    expect(FOODS.filter((f) => f.kind === 'plante')).toHaveLength(5)
    expect(FOODS.filter((f) => f.kind === 'viande')).toHaveLength(3)
  })
})

describe('règles du vivant (accepts / regimeOf)', () => {
  it('herbivore mange les plantes, refuse les viandes', () => {
    const herb = ANIMALS.find((a) => a.regime === 'herbivore')!
    for (const f of FOODS) {
      expect(accepts(herb.id, f.id)).toBe(f.kind === 'plante')
    }
  })

  it('carnivore mange les viandes, refuse les plantes', () => {
    const carn = ANIMALS.find((a) => a.regime === 'carnivore')!
    for (const f of FOODS) {
      expect(accepts(carn.id, f.id)).toBe(f.kind === 'viande')
    }
  })

  it('omnivore accepte tout', () => {
    const omni = ANIMALS.find((a) => a.regime === 'omnivore')!
    for (const f of FOODS) expect(accepts(omni.id, f.id)).toBe(true)
  })

  it('regimeOf jette pour un animal inconnu', () => {
    expect(() => regimeOf('dragon')).toThrow()
  })

  it('accepts est faux pour un aliment inconnu', () => {
    expect(accepts('lapin', 'caillou')).toBe(false)
  })
})

describe('animalsForTier / zonesForTier', () => {
  it('T0 = uniquement des herbivores', () => {
    expect(animalsForTier(0).every((a) => a.regime === 'herbivore')).toBe(true)
    expect(animalsForTier(0).length).toBeGreaterThan(0)
  })

  it('T1 = herbivores + carnivores, pas d’omnivore', () => {
    expect(animalsForTier(1).some((a) => a.regime === 'omnivore')).toBe(false)
    expect(animalsForTier(1).some((a) => a.regime === 'carnivore')).toBe(true)
  })

  it('T2 (tri 2 bacs) ne contient aucun omnivore — sinon insoluble', () => {
    expect(zonesForTier(2)).toEqual(['herbivore', 'carnivore'])
    expect(animalsForTier(2).some((a) => a.regime === 'omnivore')).toBe(false)
  })

  it('T3 (tri 3 bacs) propose la famille omnivore et inclut des omnivores', () => {
    expect(zonesForTier(3)).toEqual(['herbivore', 'carnivore', 'omnivore'])
    expect(animalsForTier(3).some((a) => a.regime === 'omnivore')).toBe(true)
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          if (item.kind === 'feed') {
            // bon plateau : au moins un bon aliment ET au moins un piège
            expect(item.correctIds.length).toBeGreaterThanOrEqual(1)
            const refused = item.tray.filter((id) => !accepts(item.animalId, id))
            expect(refused.length).toBeGreaterThanOrEqual(1)
            // correctIds = exactement les aliments du plateau acceptés
            const accepted = item.tray.filter((id) => accepts(item.animalId, id))
            expect(new Set(item.correctIds)).toEqual(new Set(accepted))
            // servir tous les bons aliments résout l'item
            expect(feedComplete(item, item.correctIds)).toBe(true)
          } else {
            // la bonne famille est toujours parmi les bacs proposés
            expect(item.zones).toContain(regimeOf(item.animalId))
          }
        }
      })
    }
  }

  it('feed (T0/T1) : aucun aliment du plateau hors garde-manger', () => {
    const foodIds = new Set(FOODS.map((f) => f.id))
    for (let i = 0; i < 100; i++) {
      const item = generateItem(0, 1) as FeedItem
      for (const id of item.tray) expect(foodIds.has(id)).toBe(true)
    }
  })

  it('avoid ne répète pas le même animal', () => {
    let prev = generateItem(1, 0).animalId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(1, 0, prev)
      expect(next.animalId).not.toBe(prev)
      prev = next.animalId
    }
  })
})

describe('validation', () => {
  it('feedComplete exige tous les bons aliments', () => {
    const item: FeedItem = {
      kind: 'feed',
      tier: 0,
      animalId: 'lapin',
      tray: ['herbe', 'carotte', 'viande'],
      correctIds: ['herbe', 'carotte'],
    }
    expect(feedComplete(item, ['herbe'])).toBe(false)
    expect(feedComplete(item, ['herbe', 'carotte'])).toBe(true)
    expect(feedComplete(item, ['herbe', 'carotte', 'viande'])).toBe(true)
  })

  it('sortCorrect compare à la famille de l’animal', () => {
    const item: SortItem = { kind: 'sort', tier: 3, animalId: 'ours', zones: zonesForTier(3) }
    expect(sortCorrect(item, 'omnivore')).toBe(true)
    expect(sortCorrect(item, 'herbivore')).toBe(false)
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
    let p: CdfProgress = { ...FRESH_PROGRESS }
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
    let p: CdfProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('cantine-foret')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
