import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  FRESH_PROGRESS,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  modeForTier,
  optionCountFor,
  rollBinFor,
  ROLL_BINS,
  SHAPES,
  SIDE_BINS,
  sideBinFor,
  SOLIDS,
  sortRollCorrect,
  sortSidesCorrect,
  starsFor,
  tapShapeCorrect,
  tapSolidCorrect,
  TIER_COUNT,
  TIER_SKILLS,
  type AfoProgress,
  type SortRollItem,
  type SortSidesItem,
  type TapShapeItem,
  type TapSolidItem,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('données : figures & solides', () => {
  it('4 figures planes : ids/noms uniques, côtés valides', () => {
    expect(SHAPES).toHaveLength(4)
    const ids = new Set(SHAPES.map((s) => s.id))
    expect(ids.size).toBe(4)
    for (const s of SHAPES) {
      expect([0, 3, 4]).toContain(s.sides)
      expect(s.name.length).toBeGreaterThan(0)
    }
  })

  it('couvre 3 côtés, 4 côtés et le rond', () => {
    expect(SHAPES.some((s) => s.sides === 3)).toBe(true)
    expect(SHAPES.filter((s) => s.sides === 4)).toHaveLength(2) // carré + rectangle
    expect(SHAPES.some((s) => s.sides === 0)).toBe(true)
  })

  it('4 solides : ids/emojis uniques, une seule famille « ça roule » (la boule)', () => {
    expect(SOLIDS).toHaveLength(4)
    expect(new Set(SOLIDS.map((s) => s.id)).size).toBe(4)
    expect(new Set(SOLIDS.map((s) => s.emoji)).size).toBe(4)
    expect(SOLIDS.filter((s) => s.rolls)).toHaveLength(1)
    expect(SOLIDS.find((s) => s.rolls)?.id).toBe('boule')
  })

  it('3 bacs « côtés », 2 bacs « roule »', () => {
    expect(SIDE_BINS).toHaveLength(3)
    expect(ROLL_BINS).toHaveLength(2)
  })

  it('sideBinFor / rollBinFor mappent chaque entité vers un bac', () => {
    expect(sideBinFor('triangle')).toBe('s3')
    expect(sideBinFor('carre')).toBe('s4')
    expect(sideBinFor('rectangle')).toBe('s4')
    expect(sideBinFor('cercle')).toBe('s0')
    expect(rollBinFor('boule')).toBe('roule')
    expect(rollBinFor('cube')).toBe('roule-pas')
    expect(rollBinFor('pave')).toBe('roule-pas')
    expect(rollBinFor('pyramide')).toBe('roule-pas')
  })
})

describe('modeForTier / optionCountFor', () => {
  it('chaque palier a son mode', () => {
    expect(modeForTier(0)).toBe('tap-shape')
    expect(modeForTier(1)).toBe('sort-sides')
    expect(modeForTier(2)).toBe('tap-solid')
    expect(modeForTier(3)).toBe('sort-roll')
  })

  it('optionCountFor : 3 cibles au cran 0, 4 au cran 1', () => {
    expect(optionCountFor(0)).toBe(3)
    expect(optionCountFor(MAX_TUNER_LEVEL)).toBe(4)
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          if (item.kind === 'tap-shape') {
            // cible présente
            expect(item.optionIds).toContain(item.targetId)
            // au moins un distracteur
            expect(item.optionIds.length).toBeGreaterThanOrEqual(2)
            expect(item.optionIds.some((id) => id !== item.targetId)).toBe(true)
            // aucun doublon
            expect(new Set(item.optionIds).size).toBe(item.optionIds.length)
            // taper la cible résout l'item, taper un autre échoue
            expect(tapShapeCorrect(item, item.targetId)).toBe(true)
            for (const id of item.optionIds) {
              // Inclusion : le carré est aussi un rectangle (accepté pour la cible « rectangle »).
              const expected =
                id === item.targetId || (item.targetId === 'rectangle' && id === 'carre')
              expect(tapShapeCorrect(item, id)).toBe(expected)
            }
          } else if (item.kind === 'tap-solid') {
            expect(item.optionIds).toContain(item.targetId)
            expect(item.optionIds.length).toBeGreaterThanOrEqual(2)
            expect(item.optionIds.some((id) => id !== item.targetId)).toBe(true)
            expect(new Set(item.optionIds).size).toBe(item.optionIds.length)
            expect(tapSolidCorrect(item, item.targetId)).toBe(true)
            for (const id of item.optionIds) {
              expect(tapSolidCorrect(item, id)).toBe(id === item.targetId)
            }
          } else if (item.kind === 'sort-sides') {
            // le bon bac est toujours parmi ceux proposés
            const good = sideBinFor(item.shapeId)
            expect(item.bins).toContain(good)
            // catégorie unique : exactement un bac correct
            const correct = item.bins.filter((b) => sortSidesCorrect(item, b))
            expect(correct).toEqual([good])
          } else {
            const good = rollBinFor(item.solidId)
            expect(item.bins).toContain(good)
            const correct = item.bins.filter((b) => sortRollCorrect(item, b))
            expect(correct).toEqual([good])
          }
        }
      })
    }
  }

  it('tap-shape : aucune figure hors catalogue', () => {
    const ids = new Set(SHAPES.map((s) => s.id))
    for (let i = 0; i < 100; i++) {
      const item = generateItem(0, 1) as TapShapeItem
      for (const id of item.optionIds) expect(ids.has(id)).toBe(true)
    }
  })

  it('avoid ne répète pas la figure précédente (tap-shape)', () => {
    let prev = (generateItem(0, 0) as TapShapeItem).targetId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(0, 0, prev) as TapShapeItem
      expect(next.targetId).not.toBe(prev)
      prev = next.targetId
    }
  })

  it('avoid ne répète pas le solide précédent (sort-roll)', () => {
    let prev = (generateItem(3, 0) as SortRollItem).solidId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(3, 0, prev) as SortRollItem
      expect(next.solidId).not.toBe(prev)
      prev = next.solidId
    }
  })
})

describe('validation', () => {
  it('sortSidesCorrect compare au nombre de côtés de la figure', () => {
    const item: SortSidesItem = {
      kind: 'sort-sides',
      tier: 1,
      shapeId: 'triangle',
      bins: SIDE_BINS.map((b) => b.id),
    }
    expect(sortSidesCorrect(item, 's3')).toBe(true)
    expect(sortSidesCorrect(item, 's4')).toBe(false)
    expect(sortSidesCorrect(item, 's0')).toBe(false)
  })

  it('sortRollCorrect : la boule roule, les autres non', () => {
    const boule: SortRollItem = {
      kind: 'sort-roll',
      tier: 3,
      solidId: 'boule',
      bins: ROLL_BINS.map((b) => b.id),
    }
    const cube: SortRollItem = { ...boule, solidId: 'cube' }
    expect(sortRollCorrect(boule, 'roule')).toBe(true)
    expect(sortRollCorrect(boule, 'roule-pas')).toBe(false)
    expect(sortRollCorrect(cube, 'roule-pas')).toBe(true)
    expect(sortRollCorrect(cube, 'roule')).toBe(false)
  })

  it('tapSolidCorrect ne valide que la cible', () => {
    const item: TapSolidItem = {
      kind: 'tap-solid',
      tier: 2,
      targetId: 'cube',
      optionIds: ['cube', 'boule', 'pave'],
    }
    expect(tapSolidCorrect(item, 'cube')).toBe(true)
    expect(tapSolidCorrect(item, 'boule')).toBe(false)
  })

  it('inclusion carré ⊂ rectangle : le carré vaut pour « trouve le rectangle »', () => {
    const rect: TapShapeItem = {
      kind: 'tap-shape',
      tier: 0,
      targetId: 'rectangle',
      optionIds: ['rectangle', 'carre', 'triangle'],
    }
    expect(tapShapeCorrect(rect, 'rectangle')).toBe(true)
    expect(tapShapeCorrect(rect, 'carre')).toBe(true) // un carré est un rectangle
    expect(tapShapeCorrect(rect, 'triangle')).toBe(false)
    // L'inverse est faux : un rectangle allongé n'est pas un carré.
    const carre: TapShapeItem = { ...rect, targetId: 'carre' }
    expect(tapShapeCorrect(carre, 'carre')).toBe(true)
    expect(tapShapeCorrect(carre, 'rectangle')).toBe(false)
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
    let p: AfoProgress = { ...FRESH_PROGRESS }
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
    let p: AfoProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('atelier-formes')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
