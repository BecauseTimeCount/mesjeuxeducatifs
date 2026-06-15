import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  CYCLE,
  feedComplete,
  FRESH_PROGRESS,
  generateItem,
  isFeedTier,
  isNeed,
  itemSignature,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  NEEDS,
  stageRank,
  starsFor,
  stepOutcome,
  TIER_COUNT,
  TIER_SKILLS,
  type FeedItem,
  type OrderItem,
  type PgrProgress,
  type StageId,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('cartes & cycle', () => {
  it('8 cartes : 4 besoins, 4 pièges, ids et emojis uniques', () => {
    expect(NEEDS).toHaveLength(8)
    expect(NEEDS.filter((c) => c.isNeed)).toHaveLength(4)
    expect(NEEDS.filter((c) => !c.isNeed)).toHaveLength(4)
    const ids = new Set(NEEDS.map((c) => c.id))
    const emojis = new Set(NEEDS.map((c) => c.emoji))
    expect(ids.size).toBe(8)
    expect(emojis.size).toBe(8)
    for (const c of NEEDS) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.emoji.length).toBeGreaterThan(0)
    }
  })

  it('les 4 besoins attendus sont reconnus, les pièges refusés', () => {
    for (const id of ['eau', 'soleil', 'air', 'terre']) expect(isNeed(id)).toBe(true)
    for (const id of ['bonbon', 'jouet', 'tele', 'chaussure']) expect(isNeed(id)).toBe(false)
    expect(isNeed('caillou')).toBe(false)
  })

  it('le cycle a 5 étapes ordonnées et distinctes', () => {
    expect(CYCLE).toHaveLength(5)
    const ids = CYCLE.map((s) => s.id)
    expect(ids).toEqual(['graine', 'germe', 'pousse', 'fleur', 'fruit'])
    expect(new Set(ids).size).toBe(5)
    ids.forEach((id, i) => expect(stageRank(id)).toBe(i))
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          expect(item.tier).toBe(tier)
          if (item.kind === 'feed') {
            expect(isFeedTier(tier)).toBe(true)
            // ≥ 1 besoin ET ≥ 1 piège sur le plateau
            expect(item.correctIds.length).toBeGreaterThanOrEqual(1)
            const traps = item.tray.filter((id) => !isNeed(id))
            expect(traps.length).toBeGreaterThanOrEqual(1)
            // correctIds = exactement les vrais besoins du plateau
            const needsOnTray = item.tray.filter((id) => isNeed(id))
            expect(new Set(item.correctIds)).toEqual(new Set(needsOnTray))
            // pas de doublon, toutes les cartes existent
            expect(new Set(item.tray).size).toBe(item.tray.length)
            // donner tous les bons besoins résout l'item
            expect(feedComplete(item, item.correctIds)).toBe(true)
          } else {
            expect(isFeedTier(tier)).toBe(false)
            const expectedLen = tier === 2 ? 4 : 5
            expect(item.expected).toHaveLength(expectedLen)
            expect(item.cards).toHaveLength(expectedLen)
            // expected est une sous-suite ORDONNÉE correcte du cycle
            const ranks = item.expected.map(stageRank)
            for (let k = 1; k < ranks.length; k++) expect(ranks[k]).toBeGreaterThan(ranks[k - 1])
            expect(ranks[0]).toBe(0)
            // cards = exactement les mêmes étapes que expected (juste mélangées)
            expect(new Set(item.cards)).toEqual(new Set(item.expected))
            expect(new Set(item.cards).size).toBe(item.cards.length)
            // taper dans l'ordre attendu résout l'item
            let idx = 0
            for (const id of item.expected) {
              const out = stepOutcome(item.expected, idx, id)
              expect(out).toBe(idx === item.expected.length - 1 ? 'complete' : 'progress')
              idx++
            }
          }
        }
      })
    }
  }

  it('feed (T0/T1) : aucune carte hors du jeu de cartes', () => {
    const known = new Set(NEEDS.map((c) => c.id))
    for (let i = 0; i < 100; i++) {
      const item = generateItem(1, 1) as FeedItem
      for (const id of item.tray) expect(known.has(id)).toBe(true)
    }
  })

  it('avoid ne répète pas l’item précédent (feed)', () => {
    let prev = itemSignature(generateItem(1, 1))
    for (let i = 0; i < 100; i++) {
      const next = generateItem(1, 1, prev)
      expect(itemSignature(next)).not.toBe(prev)
      prev = itemSignature(next)
    }
  })

  it('avoid ne répète pas l’item précédent (order)', () => {
    let prev = itemSignature(generateItem(3, 0))
    for (let i = 0; i < 100; i++) {
      const next = generateItem(3, 0, prev)
      expect(itemSignature(next)).not.toBe(prev)
      prev = itemSignature(next)
    }
  })
})

describe('validation', () => {
  it('feedComplete exige tous les vrais besoins', () => {
    const item: FeedItem = {
      kind: 'feed',
      tier: 1,
      tray: ['eau', 'soleil', 'bonbon'],
      correctIds: ['eau', 'soleil'],
    }
    expect(feedComplete(item, ['eau'])).toBe(false)
    expect(feedComplete(item, ['eau', 'soleil'])).toBe(true)
    expect(feedComplete(item, ['eau', 'soleil', 'bonbon'])).toBe(true)
  })

  it('stepOutcome valide une séquence ordonnée et rejette les erreurs', () => {
    const item: OrderItem = {
      kind: 'order',
      tier: 2,
      cards: ['pousse', 'graine', 'fleur', 'germe'],
      expected: ['graine', 'germe', 'pousse', 'fleur'],
    }
    expect(stepOutcome(item.expected, 0, 'graine')).toBe('progress')
    expect(stepOutcome(item.expected, 0, 'germe')).toBe('wrong')
    expect(stepOutcome(item.expected, 3, 'fleur')).toBe('complete')
    expect(stepOutcome(item.expected, 3, 'graine')).toBe('wrong')
    // index hors bornes
    expect(stepOutcome(item.expected, -1, 'graine')).toBe('wrong')
    expect(stepOutcome(item.expected, 4, 'graine' as StageId)).toBe('wrong')
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
    let p: PgrProgress = { ...FRESH_PROGRESS }
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
    let p: PgrProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('petite-graine')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
