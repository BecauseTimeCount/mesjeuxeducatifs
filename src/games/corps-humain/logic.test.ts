import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  BODY_PARTS,
  FRESH_PROGRESS,
  generateItem,
  HABITS,
  habitCorrect,
  isTrapHabit,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  modeForTier,
  partCardCount,
  partCorrect,
  SENSE_ORGANS,
  SENSES,
  senseCorrect,
  SITUATIONS,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
  type CorpsProgress,
  type HabitItem,
  type PartItem,
  type SenseItem,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('données : parties, sens, gestes', () => {
  it('10 parties du corps, ids et emojis uniques, libellés présents', () => {
    expect(BODY_PARTS).toHaveLength(10)
    const ids = new Set(BODY_PARTS.map((p) => p.id))
    expect(ids.size).toBe(10)
    for (const p of BODY_PARTS) {
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.emoji.length).toBeGreaterThan(0)
    }
  })

  it('5 sens, chacun avec un organe distinct', () => {
    expect(SENSES).toHaveLength(5)
    expect(SENSE_ORGANS).toHaveLength(5)
    const organIds = new Set(SENSES.map((s) => s.organId))
    expect(organIds.size).toBe(5)
  })

  it('gestes : 6 bons gestes, 3 pièges', () => {
    expect(HABITS.filter((h) => h.good)).toHaveLength(6)
    expect(HABITS.filter((h) => !h.good)).toHaveLength(3)
  })

  it('chaque situation pointe vers un bon geste et a au moins un piège plausible', () => {
    for (const s of SITUATIONS) {
      const answer = HABITS.find((h) => h.id === s.answerId)
      expect(answer).toBeDefined()
      expect(answer!.good).toBe(true)
      expect(s.trapIds.length).toBeGreaterThanOrEqual(1)
      for (const t of s.trapIds) {
        const trap = HABITS.find((h) => h.id === t)
        expect(trap).toBeDefined()
        expect(trap!.good).toBe(false)
      }
    }
  })

  it('modeForTier : T0/T1 = parties, T2 = sens, T3 = hygiène', () => {
    expect(modeForTier(0)).toBe('part')
    expect(modeForTier(1)).toBe('part')
    expect(modeForTier(2)).toBe('sense')
    expect(modeForTier(3)).toBe('habit')
  })

  it('partCardCount : T0 = 4, T1 = 6', () => {
    expect(partCardCount(0)).toBe(4)
    expect(partCardCount(1)).toBe(6)
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)

          if (item.kind === 'part') {
            // la cible est présente
            expect(item.choices).toContain(item.targetId)
            // au moins un distracteur (choix réel, pas de carte unique)
            expect(item.choices.length).toBeGreaterThanOrEqual(2)
            // bon nombre de cartes selon le palier
            expect(item.choices.length).toBe(partCardCount(item.tier))
            // aucune ambiguïté : pas de doublon parmi les cartes
            expect(new Set(item.choices).size).toBe(item.choices.length)
            // appliquer la bonne réponse résout l'item
            expect(partCorrect(item, item.targetId)).toBe(true)
            // chaque carte distractrice est une autre partie (jamais la cible)
            for (const id of item.choices) {
              if (id !== item.targetId) expect(partCorrect(item, id)).toBe(false)
            }
          } else if (item.kind === 'sense') {
            // la bonne réponse (organe du sens) est présente
            expect(item.choices).toContain(item.targetOrganId)
            // les 5 organes proposés, sans doublon
            expect(item.choices.length).toBe(SENSE_ORGANS.length)
            expect(new Set(item.choices).size).toBe(item.choices.length)
            // l'organe attendu correspond bien au sens demandé
            const sense = SENSES.find((s) => s.id === item.senseId)
            expect(sense).toBeDefined()
            expect(item.targetOrganId).toBe(sense!.organId)
            // appliquer la bonne réponse résout l'item
            expect(senseCorrect(item, item.targetOrganId)).toBe(true)
          } else {
            // le bon geste est présent
            expect(item.choices).toContain(item.answerId)
            // au moins un distracteur de même nature (un geste)
            expect(item.choices.length).toBeGreaterThanOrEqual(2)
            // au niveau 0 : 2 cartes ; au niveau 1 : 3 cartes
            expect(item.choices.length).toBe(level === 0 ? 2 : 3)
            // aucune ambiguïté : pas de doublon
            expect(new Set(item.choices).size).toBe(item.choices.length)
            // la réponse est bien un geste sain ; les autres ne le sont pas
            expect(isTrapHabit(item.answerId)).toBe(false)
            // appliquer la bonne réponse résout l'item
            expect(habitCorrect(item, item.answerId)).toBe(true)
            // exactement une bonne réponse parmi les cartes
            const goodOnes = item.choices.filter((id) => habitCorrect(item, id))
            expect(goodOnes).toEqual([item.answerId])
          }
        }
      })
    }
  }

  it('parties : aucune carte hors du référentiel', () => {
    const partIds = new Set(BODY_PARTS.map((p) => p.id))
    for (let i = 0; i < 100; i++) {
      const item = generateItem(1, 0) as PartItem
      for (const id of item.choices) expect(partIds.has(id)).toBe(true)
    }
  })

  it('sens : aucun organe hors du référentiel', () => {
    const organIds = new Set(SENSE_ORGANS.map((o) => o.id))
    for (let i = 0; i < 100; i++) {
      const item = generateItem(2, 1) as SenseItem
      for (const id of item.choices) expect(organIds.has(id)).toBe(true)
    }
  })

  it('hygiène : un distracteur piège touché est bien un piège, pas la réponse', () => {
    for (let i = 0; i < 100; i++) {
      const item = generateItem(3, 1) as HabitItem
      for (const id of item.choices) {
        if (id !== item.answerId && isTrapHabit(id)) {
          expect(habitCorrect(item, id)).toBe(false)
        }
      }
    }
  })

  it('avoid ne répète pas la même cible (parties)', () => {
    let prev = (generateItem(1, 0) as PartItem).targetId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(1, 0, prev) as PartItem
      expect(next.targetId).not.toBe(prev)
      prev = next.targetId
    }
  })

  it('avoid ne répète pas le même sens', () => {
    let prev = (generateItem(2, 0) as SenseItem).senseId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(2, 0, prev) as SenseItem
      expect(next.senseId).not.toBe(prev)
      prev = next.senseId
    }
  })

  it('avoid ne répète pas la même situation (hygiène)', () => {
    let prev = (generateItem(3, 0) as HabitItem).situationId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(3, 0, prev) as HabitItem
      expect(next.situationId).not.toBe(prev)
      prev = next.situationId
    }
  })
})

describe('validation', () => {
  it('partCorrect compare à la partie cible', () => {
    const item: PartItem = { kind: 'part', tier: 0, targetId: 'tete', choices: ['tete', 'bras'] }
    expect(partCorrect(item, 'tete')).toBe(true)
    expect(partCorrect(item, 'bras')).toBe(false)
  })

  it('senseCorrect compare à l’organe du sens', () => {
    const item: SenseItem = {
      kind: 'sense',
      tier: 2,
      senseId: 'vue',
      targetOrganId: 'oeil',
      choices: ['oeil', 'oreille', 'nez', 'langue', 'main'],
    }
    expect(senseCorrect(item, 'oeil')).toBe(true)
    expect(senseCorrect(item, 'oreille')).toBe(false)
  })

  it('habitCorrect & isTrapHabit', () => {
    const item: HabitItem = {
      kind: 'habit',
      tier: 3,
      situationId: 'avant-manger',
      answerId: 'mains',
      choices: ['mains', 'bonbons'],
    }
    expect(habitCorrect(item, 'mains')).toBe(true)
    expect(habitCorrect(item, 'bonbons')).toBe(false)
    expect(isTrapHabit('bonbons')).toBe(true)
    expect(isTrapHabit('mains')).toBe(false)
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
    let p: CorpsProgress = { ...FRESH_PROGRESS }
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
    let p: CorpsProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('corps-humain')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
