import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  BESOIN_PROMPTS,
  FRESH_PROGRESS,
  generateItem,
  isCorrect,
  ITEMS,
  ITEMS_BY_ID,
  ITEMS_PER_RUN,
  MATIERE_PROMPTS,
  MAX_TUNER_LEVEL,
  optionCountFor,
  PROMPTS_BY_ID,
  promptKindForTier,
  promptsForTier,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
  type AobProgress,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('catalogue d’objets & consignes', () => {
  it('14 objets, ids et emojis non vides, ids uniques', () => {
    expect(ITEMS).toHaveLength(14)
    const ids = new Set(ITEMS.map((it) => it.id))
    expect(ids.size).toBe(ITEMS.length)
    for (const it of ITEMS) {
      expect(it.name.length).toBeGreaterThan(0)
      expect(it.emoji.length).toBeGreaterThan(0)
    }
  })

  it('8 consignes de besoin + 8 de matière, toutes ciblant un objet connu', () => {
    expect(BESOIN_PROMPTS).toHaveLength(8)
    expect(MATIERE_PROMPTS).toHaveLength(8)
    for (const p of [...BESOIN_PROMPTS, ...MATIERE_PROMPTS]) {
      expect(ITEMS_BY_ID.has(p.targetId)).toBe(true)
      expect(p.source.length).toBeGreaterThan(0)
      expect(p.sourceEmoji.length).toBeGreaterThan(0)
    }
  })

  it('ids de consignes uniques (besoin ∪ matière)', () => {
    const all = [...BESOIN_PROMPTS, ...MATIERE_PROMPTS]
    expect(PROMPTS_BY_ID.size).toBe(all.length)
  })

  it('besoin pour T0/T1, matière pour T2/T3', () => {
    expect(promptKindForTier(0)).toBe('besoin')
    expect(promptKindForTier(1)).toBe('besoin')
    expect(promptKindForTier(2)).toBe('matiere')
    expect(promptKindForTier(3)).toBe('matiere')
    expect(promptsForTier(0)).toBe(BESOIN_PROMPTS)
    expect(promptsForTier(3)).toBe(MATIERE_PROMPTS)
  })

  it('optionCountFor : 3 objets en T0/T2, 4-5 en T1/T3', () => {
    expect(optionCountFor(0, 0)).toBe(3)
    expect(optionCountFor(0, 1)).toBe(3)
    expect(optionCountFor(2, 1)).toBe(3)
    expect(optionCountFor(1, 0)).toBe(4)
    expect(optionCountFor(1, 1)).toBe(5)
    expect(optionCountFor(3, 0)).toBe(4)
    expect(optionCountFor(3, 1)).toBe(5)
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          const prompt = PROMPTS_BY_ID.get(item.promptId)
          expect(prompt).toBeDefined()
          // la consigne du palier appartient bien à ce palier
          expect(promptsForTier(tier)).toContain(prompt!)
          // la cible correspond à l'objet attendu par la consigne
          expect(item.targetId).toBe(prompt!.targetId)
          // la cible est TOUJOURS présente parmi les choix
          expect(item.optionIds).toContain(item.targetId)
          // au moins un distracteur quand il y a choix
          expect(item.optionIds.length).toBeGreaterThanOrEqual(2)
          const distractors = item.optionIds.filter((id) => id !== item.targetId)
          expect(distractors.length).toBeGreaterThanOrEqual(1)
          // aucun doublon à l'écran
          expect(new Set(item.optionIds).size).toBe(item.optionIds.length)
          // tous les choix sont des objets connus
          for (const id of item.optionIds) expect(ITEMS_BY_ID.has(id)).toBe(true)
          // aucun distracteur n'est lui-même une bonne réponse à la consigne
          for (const id of distractors) expect(isCorrect(item, id)).toBe(false)
          // taper la cible résout l'item
          expect(isCorrect(item, item.targetId)).toBe(true)
          // le nombre d'objets respecte le palier/niveau (borné par le catalogue)
          expect(item.optionIds.length).toBe(
            Math.min(optionCountFor(tier, level), ITEMS.length),
          )
        }
      })
    }
  }

  it('avoid ne répète pas la même consigne deux fois de suite', () => {
    let prev = generateItem(1, 1).promptId
    for (let i = 0; i < 100; i++) {
      const next = generateItem(1, 1, prev)
      expect(next.promptId).not.toBe(prev)
      prev = next.promptId
    }
  })
})

describe('validation', () => {
  it('isCorrect compare l’objet tapé à la cible', () => {
    const item = generateItem(0, 0)
    expect(isCorrect(item, item.targetId)).toBe(true)
    const wrong = item.optionIds.find((id) => id !== item.targetId)!
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
    let p: AobProgress = { ...FRESH_PROGRESS }
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
    let p: AobProgress = { ...FRESH_PROGRESS, unlockedTier: last }
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
    const meta = GAMES_BY_ID.get('atelier-objets')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
