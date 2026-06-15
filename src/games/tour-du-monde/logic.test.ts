import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  findCorrect,
  FRESH_PROGRESS,
  generateItem,
  GLOBE_ELEMENTS,
  GLOBE_ZONES,
  ITEMS_PER_RUN,
  kindOf,
  landscapeCountFor,
  LANDSCAPES,
  MAX_TUNER_LEVEL,
  sortCorrect,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
  type FindItem,
  type SortItem,
  type TdmProgress,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('paysages (T0/T1)', () => {
  it('6 paysages, ids et emojis uniques', () => {
    expect(LANDSCAPES).toHaveLength(6)
    const ids = new Set(LANDSCAPES.map((l) => l.id))
    expect(ids.size).toBe(6)
    for (const l of LANDSCAPES) {
      expect(l.name.length).toBeGreaterThan(0)
      expect(l.emoji.length).toBeGreaterThan(0)
    }
  })

  it('T0 affiche 4 cartes, T1 en affiche 6', () => {
    expect(landscapeCountFor(0)).toBe(4)
    expect(landscapeCountFor(1)).toBe(6)
  })
})

describe('éléments du globe (T2/T3)', () => {
  it('9 éléments, ids et emojis non vides, catégorie terre/eau valide', () => {
    expect(GLOBE_ELEMENTS).toHaveLength(9)
    for (const e of GLOBE_ELEMENTS) {
      expect(['terre', 'eau']).toContain(e.kind)
      expect(e.name.length).toBeGreaterThan(0)
      expect(e.emoji.length).toBeGreaterThan(0)
    }
  })

  it('couvre les deux catégories', () => {
    const kinds = new Set(GLOBE_ELEMENTS.map((e) => e.kind))
    expect(kinds).toEqual(new Set(['terre', 'eau']))
  })

  it('chaque élément a une catégorie terre/eau UNIQUE', () => {
    for (const e of GLOBE_ELEMENTS) {
      expect(kindOf(e.id)).toBe(e.kind)
      expect(GLOBE_ELEMENTS.filter((o) => o.id === e.id)).toHaveLength(1)
    }
  })

  it('kindOf jette pour un élément inconnu', () => {
    expect(() => kindOf('nuage')).toThrow()
  })

  it('les bacs proposés sont exactement Terre et Eau', () => {
    expect(GLOBE_ZONES).toEqual(['terre', 'eau'])
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          if (item.kind === 'find') {
            // la cible est présente parmi les choix
            expect(item.choices).toContain(item.targetId)
            // au moins un distracteur (de même catégorie : un autre paysage)
            const distractors = item.choices.filter((id) => id !== item.targetId)
            expect(distractors.length).toBeGreaterThanOrEqual(1)
            // aucune ambiguïté : pas de doublon, et un seul exemplaire de la cible
            expect(new Set(item.choices).size).toBe(item.choices.length)
            expect(item.choices.filter((id) => id === item.targetId)).toHaveLength(1)
            // nombre de cartes attendu selon le palier
            expect(item.choices.length).toBe(landscapeCountFor(item.tier))
            // toutes les cartes sont des paysages connus
            const landscapeIds = new Set(LANDSCAPES.map((l) => l.id))
            for (const id of item.choices) expect(landscapeIds.has(id)).toBe(true)
            // taper la cible résout l'item
            expect(findCorrect(item, item.targetId)).toBe(true)
            // un distracteur ne résout PAS l'item
            expect(findCorrect(item, distractors[0])).toBe(false)
          } else {
            // la bonne catégorie est toujours parmi les bacs proposés
            expect(item.zones).toContain(kindOf(item.elementId))
            // l'autre bac est faux (catégorie unique)
            const wrong = item.zones.find((z) => z !== kindOf(item.elementId))
            expect(wrong).toBeDefined()
            // ranger dans le bon bac résout l'item, dans l'autre non
            expect(sortCorrect(item, kindOf(item.elementId))).toBe(true)
            expect(sortCorrect(item, wrong!)).toBe(false)
          }
        }
      })
    }
  }

  it('find (T0/T1) : aucune carte hors du jeu de paysages', () => {
    const landscapeIds = new Set(LANDSCAPES.map((l) => l.id))
    for (let i = 0; i < 100; i++) {
      const item = generateItem(0, 0) as FindItem
      for (const id of item.choices) expect(landscapeIds.has(id)).toBe(true)
    }
  })

  it('avoid ne répète pas le même paysage (T0/T1)', () => {
    let prev = (generateItem(1, 0) as FindItem).targetId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(1, 0, prev) as FindItem
      expect(next.targetId).not.toBe(prev)
      prev = next.targetId
    }
  })

  it('avoid ne répète pas le même élément (T2/T3)', () => {
    let prev = (generateItem(2, 0) as SortItem).elementId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(2, 0, prev) as SortItem
      expect(next.elementId).not.toBe(prev)
      prev = next.elementId
    }
  })
})

describe('validation', () => {
  it('findCorrect compare à la cible', () => {
    const item: FindItem = { kind: 'find', tier: 0, targetId: 'mer', choices: ['mer', 'foret', 'ville', 'desert'] }
    expect(findCorrect(item, 'mer')).toBe(true)
    expect(findCorrect(item, 'foret')).toBe(false)
  })

  it('sortCorrect compare à la catégorie de l’élément', () => {
    const item: SortItem = { kind: 'sort', tier: 2, elementId: 'ocean', zones: GLOBE_ZONES }
    expect(sortCorrect(item, 'eau')).toBe(true)
    expect(sortCorrect(item, 'terre')).toBe(false)
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
    let p: TdmProgress = { ...FRESH_PROGRESS }
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
    let p: TdmProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('tour-du-monde')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
