import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  BODY_PARTS,
  categoryForTier,
  correctColumn,
  FOODS,
  FRESH_PROGRESS,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  optionCountFor,
  poolForTier,
  sortCorrect,
  starsFor,
  tapCorrect,
  TIER_COUNT,
  TIER_SKILLS,
  type MbfProgress,
  type SortItem,
  type TapItem,
  type TierId,
} from './logic'

const GAME_ID = 'my-body-food'

describe('lexique (body parts & foods)', () => {
  it('8 parties du corps, ids/mots/emojis uniques et non vides', () => {
    expect(BODY_PARTS).toHaveLength(8)
    expect(new Set(BODY_PARTS.map((b) => b.id)).size).toBe(8)
    expect(new Set(BODY_PARTS.map((b) => b.emoji)).size).toBe(8)
    for (const b of BODY_PARTS) {
      expect(b.word.length).toBeGreaterThan(0)
      expect(b.emoji.length).toBeGreaterThan(0)
    }
    // Les 4 premières sont les parties « Head, Shoulders, Knees and Toes ».
    expect(BODY_PARTS.slice(0, 4).map((b) => b.id)).toEqual(['head', 'shoulders', 'knees', 'toes'])
  })

  it('10 aliments, ids/mots/emojis uniques et non vides', () => {
    expect(FOODS).toHaveLength(10)
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(10)
    expect(new Set(FOODS.map((f) => f.emoji)).size).toBe(10)
    for (const f of FOODS) {
      expect(f.word.length).toBeGreaterThan(0)
      expect(f.emoji.length).toBeGreaterThan(0)
    }
  })
})

describe('paliers (poolForTier / categoryForTier)', () => {
  it('T0 = 4 parties du corps, T1 = 6 parties du corps', () => {
    expect(poolForTier(0)).toHaveLength(4)
    expect(poolForTier(1)).toHaveLength(6)
    expect(categoryForTier(0)).toBe('body')
    expect(categoryForTier(1)).toBe('body')
  })

  it('T2 = aliments', () => {
    expect(poolForTier(2)).toHaveLength(FOODS.length)
    expect(categoryForTier(2)).toBe('food')
  })

  it('optionCountFor est borné par la taille du pool et ≥ 2', () => {
    for (const tier of [0, 1, 2] as TierId[]) {
      for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
        const n = optionCountFor(tier, level)
        expect(n).toBeGreaterThanOrEqual(2)
        expect(n).toBeLessThanOrEqual(poolForTier(tier).length)
      }
    }
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of [0, 1, 2] as TierId[]) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages tap toujours résolubles`, () => {
        const valid = new Set(poolForTier(tier).map((c) => c.id))
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          expect(item.kind).toBe('tap')
          if (item.kind !== 'tap') continue
          // la cible est affichée
          expect(item.optionIds).toContain(item.targetId)
          // au moins un distracteur
          expect(item.optionIds.length).toBeGreaterThanOrEqual(2)
          // aucun doublon, toutes les cartes appartiennent au pool du palier
          expect(new Set(item.optionIds).size).toBe(item.optionIds.length)
          for (const id of item.optionIds) expect(valid.has(id)).toBe(true)
          // taper la cible résout l'item, taper un distracteur non
          expect(tapCorrect(item, item.targetId)).toBe(true)
          const distractor = item.optionIds.find((id) => id !== item.targetId)!
          expect(tapCorrect(item, distractor)).toBe(false)
        }
      })
    }
  }

  it('T3 : 200 tirages — la phrase détermine une colonne unique et résoluble', () => {
    const foodIds = new Set(FOODS.map((f) => f.id))
    for (let i = 0; i < 200; i++) {
      const item = generateItem(3, 0)
      expect(item.kind).toBe('sort')
      if (item.kind !== 'sort') continue
      expect(foodIds.has(item.foodId)).toBe(true)
      const right = correctColumn(item)
      // la colonne correcte est exactement dictée par like, sans ambiguïté
      expect(right).toBe(item.like ? 'like' : 'dislike')
      expect(sortCorrect(item, right)).toBe(true)
      expect(sortCorrect(item, right === 'like' ? 'dislike' : 'like')).toBe(false)
    }
  })

  it('avoid ne répète pas l’item précédent (T0 cible, 100 tirages)', () => {
    let prev = (generateItem(0, 0) as TapItem).targetId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(0, 0, prev) as TapItem
      expect(next.targetId).not.toBe(prev)
      prev = next.targetId
    }
  })

  it('avoid ne répète pas l’aliment précédent (T3, 100 tirages)', () => {
    let prev = (generateItem(3, 0) as SortItem).foodId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(3, 0, prev) as SortItem
      expect(next.foodId).not.toBe(prev)
      prev = next.foodId
    }
  })
})

describe('score & progression', () => {
  it('starsFor : seuils 90 % / 70 %, et starsFor(0,0) === 1', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(6, 8)).toBe(2)
    expect(starsFor(4, 8)).toBe(1)
    expect(starsFor(0, 0)).toBe(1)
  })

  it('applyRun débloque le palier suivant à 2 étoiles, garde le meilleur score', () => {
    let p: MbfProgress = { ...FRESH_PROGRESS }
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
    let p: MbfProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get(GAME_ID)
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
