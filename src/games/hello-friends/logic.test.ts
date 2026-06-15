import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  AGES,
  applyRun,
  CARDS_BY_ID,
  COLOURS,
  FEELINGS,
  FRESH_PROGRESS,
  generateItem,
  GREETINGS,
  isCorrect,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  optionCountFor,
  starsFor,
  TIER_CATEGORY,
  TIER_COUNT,
  TIER_SKILLS,
  type HefProgress,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('imagier (cartes)', () => {
  it('4 salutations, ids et emojis non vides, uniques', () => {
    expect(GREETINGS).toHaveLength(4)
    expect(new Set(GREETINGS.map((c) => c.id)).size).toBe(4)
    for (const c of GREETINGS) {
      expect(c.en.length).toBeGreaterThan(0)
      expect(c.emoji.length).toBeGreaterThan(0)
    }
  })

  it('émotions : au moins happy/sad/tired/ok, ids uniques', () => {
    const ids = new Set(FEELINGS.map((c) => c.id))
    for (const id of ['happy', 'sad', 'tired', 'ok']) expect(ids.has(id)).toBe(true)
    expect(ids.size).toBe(FEELINGS.length)
  })

  it('4 couleurs et 6 âges (1 à 6), ids uniques', () => {
    expect(COLOURS).toHaveLength(4)
    expect(AGES).toHaveLength(6)
    expect(AGES.map((a) => a.value)).toEqual([1, 2, 3, 4, 5, 6])
    expect(new Set(AGES.map((a) => a.id)).size).toBe(6)
  })

  it('CARDS_BY_ID référence toutes les cartes', () => {
    for (const c of [...GREETINGS, ...FEELINGS, ...COLOURS, ...AGES]) {
      expect(CARDS_BY_ID.get(c.id)).toBeDefined()
    }
  })
})

describe('optionCountFor', () => {
  it('4 à 6 cibles selon le niveau de Tuner, borné', () => {
    expect(optionCountFor(0)).toBe(4)
    expect(optionCountFor(1)).toBe(5)
    expect(optionCountFor(2)).toBe(6)
    expect(optionCountFor(5)).toBe(6)
    expect(optionCountFor(-3)).toBe(4)
  })
})

describe('génération de rounds résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const r = generateItem(tier, level)
          // la cible figure parmi les options
          expect(r.optionIds).toContain(r.targetId)
          // au moins un distracteur (donc ≥ 2 options)
          expect(r.optionIds.length).toBeGreaterThanOrEqual(2)
          // options uniques (aucune ambiguïté visuelle)
          expect(new Set(r.optionIds).size).toBe(r.optionIds.length)
          // catégorie cohérente avec le palier
          expect(r.category).toBe(TIER_CATEGORY[tier])
          // toutes les options existent
          for (const id of r.optionIds) expect(CARDS_BY_ID.get(id)).toBeDefined()
          // taper la cible résout l'item ; taper un distracteur non
          expect(isCorrect(r, r.targetId)).toBe(true)
          for (const id of r.optionIds) {
            if (id !== r.targetId) expect(isCorrect(r, id)).toBe(false)
          }
        }
      })
    }
  }

  it('T3 : age et colour ne se mélangent jamais sur le même écran', () => {
    const ageIds = new Set(AGES.map((a) => a.id))
    const colourIds = new Set(COLOURS.map((c) => c.id))
    let sawAge = false
    let sawColour = false
    for (let i = 0; i < 400; i++) {
      const r = generateItem(3, MAX_TUNER_LEVEL)
      expect(r.kind === 'age' || r.kind === 'colour').toBe(true)
      if (r.kind === 'age') {
        sawAge = true
        for (const id of r.optionIds) expect(ageIds.has(id)).toBe(true)
      } else {
        sawColour = true
        for (const id of r.optionIds) expect(colourIds.has(id)).toBe(true)
      }
    }
    // les deux sous-types sont effectivement tirés
    expect(sawAge).toBe(true)
    expect(sawColour).toBe(true)
  })

  it('avoid ne répète pas la cible précédente (100 tirages)', () => {
    let prev = generateItem(2, 0).targetId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(2, 0, prev)
      expect(next.targetId).not.toBe(prev)
      prev = next.targetId
    }
  })
})

describe('score & progression', () => {
  it('starsFor : seuils 90 % / 70 %, et starsFor(0, 0) === 1', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(6, 8)).toBe(2)
    expect(starsFor(4, 8)).toBe(1)
    expect(starsFor(0, 0)).toBe(1)
  })

  it('applyRun débloque le palier suivant à 2 étoiles, garde le meilleur score', () => {
    let p: HefProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 1)
    expect(p.unlockedTier).toBe(0) // 1 étoile ne débloque pas
    p = applyRun(p, 0, 3)
    expect(p.unlockedTier).toBe(1)
    expect(p.bestStars[0]).toBe(3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3) // ne régresse jamais
    expect(p.runs).toBe(3)
  })

  it('le déblocage est plafonné au dernier palier', () => {
    const last = (TIER_COUNT - 1) as TierId
    let p: HefProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('hello-friends')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
