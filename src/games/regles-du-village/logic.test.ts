import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  baseTrapsForTier,
  FRESH_PROGRESS,
  GESTURES,
  GESTURES_BY_ID,
  gestureOf,
  generateItem,
  isCorrect,
  ITEMS_PER_RUN,
  kindForTier,
  MAX_TUNER_LEVEL,
  SITUATIONS,
  situationsForTier,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
  trapCount,
  type RdvProgress,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('gestes & situations (données)', () => {
  it('ids de gestes uniques, emoji + libellé non vides, famille valide', () => {
    const ids = new Set(GESTURES.map((g) => g.id))
    expect(ids.size).toBe(GESTURES.length)
    for (const g of GESTURES) {
      expect(['regle', 'entraide']).toContain(g.kind)
      expect(g.label.length).toBeGreaterThan(0)
      expect(g.emoji.length).toBeGreaterThan(0)
    }
  })

  it('chaque famille a des bonnes attitudes ET des pièges', () => {
    for (const kind of ['regle', 'entraide'] as const) {
      const fam = GESTURES.filter((g) => g.kind === kind)
      expect(fam.some((g) => g.good)).toBe(true)
      expect(fam.some((g) => !g.good)).toBe(true)
    }
  })

  it('gestureOf jette pour un geste inconnu', () => {
    expect(() => gestureOf('voler')).toThrow()
  })

  it('toute situation pointe une bonne attitude connue de sa famille, et des pièges valides', () => {
    for (const s of SITUATIONS) {
      const answer = GESTURES_BY_ID.get(s.answer)
      expect(answer).toBeDefined()
      expect(answer!.good).toBe(true)
      expect(answer!.kind).toBe(s.kind)
      expect(s.traps.length).toBeGreaterThanOrEqual(1)
      for (const t of s.traps) {
        const trap = GESTURES_BY_ID.get(t)
        expect(trap).toBeDefined()
        expect(trap!.good).toBe(false)
        expect(trap!.kind).toBe(s.kind) // pièges de la MÊME catégorie
      }
    }
  })

  it('situationsForTier suit la famille du palier (règle T0/T1, entraide T2/T3)', () => {
    expect(situationsForTier(0).every((s) => s.kind === 'regle')).toBe(true)
    expect(situationsForTier(1).every((s) => s.kind === 'regle')).toBe(true)
    expect(situationsForTier(2).every((s) => s.kind === 'entraide')).toBe(true)
    expect(situationsForTier(3).every((s) => s.kind === 'entraide')).toBe(true)
    for (const tier of TIERS) {
      expect(situationsForTier(tier).length).toBeGreaterThan(0)
      expect(situationsForTier(tier).every((s) => s.kind === kindForTier(tier))).toBe(true)
    }
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        const expectedTraps = trapCount(tier, level)
        // l'entraide n'a que 3 pièges : T3 niveau 1 reste à 3 (plafond stock)
        expect(expectedTraps).toBe(
          Math.min(baseTrapsForTier(tier) + level, kindForTier(tier) === 'entraide' ? 3 : 4),
        )
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)

          // la bonne attitude est toujours présente
          expect(item.choices).toContain(item.answer)
          // une seule bonne attitude à l'écran : l'attendue
          const goods = item.choices.filter((id) => gestureOf(id).good)
          expect(goods).toEqual([item.answer])
          // au moins un piège (et exactement le compte demandé tant que le stock suffit)
          const traps = item.choices.filter((id) => !gestureOf(id).good)
          expect(traps.length).toBeGreaterThanOrEqual(1)
          expect(traps.length).toBe(expectedTraps)
          // aucun doublon dans les choix
          expect(new Set(item.choices).size).toBe(item.choices.length)
          // tous les choix sont de la famille du palier (distracteurs intelligents)
          for (const id of item.choices) expect(gestureOf(id).kind).toBe(kindForTier(tier))
          // appliquer la bonne réponse résout l'item, un piège non
          expect(isCorrect(item, item.answer)).toBe(true)
          expect(isCorrect(item, traps[0])).toBe(false)
        }
      })
    }
  }

  it('avoid ne répète pas la même situation', () => {
    let prev = generateItem(2, 0).situationId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(2, 0, prev)
      expect(next.situationId).not.toBe(prev)
      prev = next.situationId
    }
  })

  it('tous les choix appartiennent au catalogue de gestes', () => {
    const known = new Set(GESTURES.map((g) => g.id))
    for (const tier of TIERS) {
      for (let i = 0; i < 100; i++) {
        for (const id of generateItem(tier, 1).choices) expect(known.has(id)).toBe(true)
      }
    }
  })
})

describe('validation', () => {
  it('isCorrect compare à la bonne attitude de la situation', () => {
    const item = generateItem(0, 0)
    expect(isCorrect(item, item.answer)).toBe(true)
    const wrong = item.choices.find((id) => id !== item.answer)!
    expect(isCorrect(item, wrong)).toBe(false)
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
    let p: RdvProgress = { ...FRESH_PROGRESS }
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
    let p: RdvProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('regles-du-village')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
