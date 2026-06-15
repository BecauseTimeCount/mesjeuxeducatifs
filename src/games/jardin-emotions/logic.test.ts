import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  ACTIONS,
  applyRun,
  calmComplete,
  EMOTIONS,
  faceCorrect,
  FRESH_PROGRESS,
  generateCalmItem,
  generateFaceItem,
  generateItem,
  generateStoryItem,
  isBadAction,
  isEmotionId,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  modeForTier,
  SCENARIOS,
  starsFor,
  STORIES,
  storyCorrect,
  TIER_COUNT,
  TIER_SKILLS,
  type CalmItem,
  type EmotionId,
  type FaceItem,
  type JdeProgress,
  type StoryItem,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]
const DRAWS = 200

describe('émotions', () => {
  it('5 émotions de base, ids/emojis/couleurs uniques', () => {
    expect(EMOTIONS).toHaveLength(5)
    expect(new Set(EMOTIONS.map((e) => e.id)).size).toBe(5)
    expect(new Set(EMOTIONS.map((e) => e.emoji)).size).toBe(5)
    expect(new Set(EMOTIONS.map((e) => e.ink)).size).toBe(5)
    for (const e of EMOTIONS) {
      expect(e.label.length).toBeGreaterThan(0)
      expect(e.ink).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('couvre exactement les 5 émotions imposées', () => {
    expect(new Set(EMOTIONS.map((e) => e.id))).toEqual(
      new Set<EmotionId>(['joie', 'tristesse', 'colere', 'peur', 'surprise']),
    )
  })

  it('isEmotionId filtre les inconnues', () => {
    expect(isEmotionId('joie')).toBe(true)
    expect(isEmotionId('amour')).toBe(false)
  })
})

describe('histoires (T2)', () => {
  it('≥12 histoires, chaque émotion couverte ≥2 fois', () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(12)
    for (const e of EMOTIONS) {
      const n = STORIES.filter((s) => s.emotion === e.id).length
      expect(n).toBeGreaterThanOrEqual(2)
    }
  })

  it('chaque histoire pointe vers une émotion connue, ids uniques', () => {
    const ids = new Set<string>()
    for (const s of STORIES) {
      expect(isEmotionId(s.emotion)).toBe(true)
      expect(s.id.startsWith('jde.story.')).toBe(true)
      expect(ids.has(s.id)).toBe(false)
      ids.add(s.id)
    }
  })
})

describe('scénarios (T3)', () => {
  it('≥5 scénarios, chacun ≥2 bonnes actions et ≥1 piège, ids cohérents', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(5)
    const ids = new Set<string>()
    for (const sc of SCENARIOS) {
      expect(sc.goodActions.length).toBeGreaterThanOrEqual(2)
      expect(sc.badActions.length).toBeGreaterThanOrEqual(1)
      expect(sc.id.startsWith('jde.scene.')).toBe(true)
      expect(ids.has(sc.id)).toBe(false)
      ids.add(sc.id)
      // good réellement bonnes, bad réellement pièges, pas de chevauchement
      for (const id of sc.goodActions) expect(ACTIONS.find((a) => a.id === id)?.good).toBe(true)
      for (const id of sc.badActions) expect(ACTIONS.find((a) => a.id === id)?.good).toBe(false)
      expect(sc.goodActions.some((id) => sc.badActions.includes(id))).toBe(false)
    }
  })

  it('catalogue d’actions : ≥4 bonnes et ≥3 pièges', () => {
    expect(ACTIONS.filter((a) => a.good).length).toBeGreaterThanOrEqual(4)
    expect(ACTIONS.filter((a) => !a.good).length).toBeGreaterThanOrEqual(3)
  })
})

describe('modeForTier', () => {
  it('T0/T1=face, T2=story, T3=calm', () => {
    expect(modeForTier(0)).toBe('face')
    expect(modeForTier(1)).toBe('face')
    expect(modeForTier(2)).toBe('story')
    expect(modeForTier(3)).toBe('calm')
  })
})

describe('génération de visages (T0/T1) résolubles', () => {
  for (const tier of [0, 1] as TierId[]) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : ${DRAWS} tirages — cible + distracteurs sans doublon`, () => {
        for (let i = 0; i < DRAWS; i++) {
          const item = generateFaceItem(tier, level)
          // cible présente
          expect(item.choices).toContain(item.target)
          // au moins un distracteur
          expect(item.choices.length).toBeGreaterThanOrEqual(2)
          // pas de doublon
          expect(new Set(item.choices).size).toBe(item.choices.length)
          // toutes les graines sont des émotions connues
          for (const id of item.choices) expect(isEmotionId(id)).toBe(true)
          // taille attendue
          const expected = tier === 0 ? 3 : level === 0 ? 4 : 5
          expect(item.choices.length).toBe(expected)
          // T0 affiche le mot
          expect(item.withWord).toBe(tier === 0)
          // résolubilité : taper la cible réussit
          expect(faceCorrect(item, item.target)).toBe(true)
        }
      })
    }
  }

  it('avoid ne répète pas la même émotion cible', () => {
    let prev = generateFaceItem(1, 1).target
    for (let i = 0; i < DRAWS; i++) {
      const next = generateFaceItem(1, 1, prev)
      expect(next.target).not.toBe(prev)
      prev = next.target
    }
  })
})

describe('génération d’histoires (T2) résolubles', () => {
  for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
    it(`niveau ${level} : ${DRAWS} tirages — émotion connue, 5 graines, cible présente`, () => {
      for (let i = 0; i < DRAWS; i++) {
        const item = generateStoryItem(level)
        expect(isEmotionId(item.target)).toBe(true)
        expect(item.choices).toHaveLength(5)
        expect(new Set(item.choices).size).toBe(5)
        expect(item.choices).toContain(item.target)
        expect(STORIES.some((s) => s.id === item.storyId && s.emotion === item.target)).toBe(true)
        expect(storyCorrect(item, item.target)).toBe(true)
      }
    })
  }

  it('avoid ne répète pas la même histoire', () => {
    let prev = generateStoryItem(0).storyId
    for (let i = 0; i < DRAWS; i++) {
      const next = generateStoryItem(0, prev)
      expect(next.storyId).not.toBe(prev)
      prev = next.storyId
    }
  })
})

describe('génération de scénarios calmes (T3) résolubles', () => {
  for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
    it(`niveau ${level} : ${DRAWS} tirages — ≥2 bonnes, ≥1 piège, validation cohérente`, () => {
      for (let i = 0; i < DRAWS; i++) {
        const item = generateCalmItem(level)
        expect(item.goodActions.length).toBeGreaterThanOrEqual(2)
        expect(item.badActions.length).toBeGreaterThanOrEqual(1)
        // tiles = exactement good + bad, mélangées, sans doublon
        expect(new Set(item.tiles)).toEqual(new Set([...item.goodActions, ...item.badActions]))
        expect(item.tiles.length).toBe(item.goodActions.length + item.badActions.length)
        // good et bad disjoints
        expect(item.goodActions.some((id) => item.badActions.includes(id))).toBe(false)
        // poser toutes les bonnes actions réussit
        expect(calmComplete(item, item.goodActions)).toBe(true)
        // poser un seul piège fait échouer
        const trap = item.badActions[0]
        expect(isBadAction(item, trap)).toBe(true)
        expect(calmComplete(item, [...item.goodActions, trap])).toBe(false)
        // bonnes actions incomplètes : échec
        if (item.goodActions.length > 1) {
          expect(calmComplete(item, item.goodActions.slice(0, 1))).toBe(false)
        }
      }
    })
  }

  it('niveau 1 ajoute (au plus) un piège supplémentaire vs niveau 0 du même scénario', () => {
    // sur de nombreux tirages, le max de pièges en niveau 1 dépasse le min en niveau 0
    let maxBad1 = 0
    let minBad0 = Infinity
    for (let i = 0; i < DRAWS; i++) {
      maxBad1 = Math.max(maxBad1, generateCalmItem(1).badActions.length)
      minBad0 = Math.min(minBad0, generateCalmItem(0).badActions.length)
    }
    expect(maxBad1).toBeGreaterThan(minBad0)
  })

  it('avoid ne répète pas le même scénario', () => {
    let prev = generateCalmItem(0).scenarioId
    for (let i = 0; i < DRAWS; i++) {
      const next = generateCalmItem(0, prev)
      expect(next.scenarioId).not.toBe(prev)
      prev = next.scenarioId
    }
  })
})

describe('façade generateItem', () => {
  it('route vers le bon mode par palier', () => {
    expect((generateItem(0, 0) as FaceItem).kind).toBe('face')
    expect((generateItem(1, 0) as FaceItem).kind).toBe('face')
    expect((generateItem(2, 0) as StoryItem).kind).toBe('story')
    expect((generateItem(3, 0) as CalmItem).kind).toBe('calm')
  })

  it('chaque palier produit un item résoluble', () => {
    for (const tier of TIERS) {
      for (let i = 0; i < 50; i++) {
        const item = generateItem(tier, 1)
        if (item.kind === 'face') expect(faceCorrect(item, item.target)).toBe(true)
        else if (item.kind === 'story') expect(storyCorrect(item, item.target)).toBe(true)
        else expect(calmComplete(item, item.goodActions)).toBe(true)
      }
    }
  })
})

describe('validation', () => {
  it('faceCorrect compare à la cible', () => {
    const item: FaceItem = {
      kind: 'face',
      tier: 0,
      target: 'joie',
      choices: ['joie', 'peur', 'colere'],
      withWord: true,
    }
    expect(faceCorrect(item, 'joie')).toBe(true)
    expect(faceCorrect(item, 'peur')).toBe(false)
  })

  it('storyCorrect compare à l’émotion ressentie', () => {
    const item: StoryItem = {
      kind: 'story',
      tier: 2,
      storyId: 'jde.story.doudou',
      target: 'tristesse',
      choices: ['joie', 'tristesse', 'colere', 'peur', 'surprise'],
    }
    expect(storyCorrect(item, 'tristesse')).toBe(true)
    expect(storyCorrect(item, 'joie')).toBe(false)
  })

  it('calmComplete : toutes les bonnes ET aucune piège', () => {
    const item: CalmItem = {
      kind: 'calm',
      tier: 3,
      scenarioId: 'jde.scene.jouet',
      goodActions: ['respire', 'dire-ressenti'],
      badActions: ['crier'],
      tiles: ['respire', 'dire-ressenti', 'crier'],
    }
    expect(calmComplete(item, ['respire', 'dire-ressenti'])).toBe(true)
    expect(calmComplete(item, ['respire'])).toBe(false) // incomplet
    expect(calmComplete(item, ['respire', 'dire-ressenti', 'crier'])).toBe(false) // piège
    expect(isBadAction(item, 'crier')).toBe(true)
    expect(isBadAction(item, 'respire')).toBe(false)
  })
})

describe('score & progression', () => {
  it('starsFor : seuils 90 % / 70 %', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(6, 8)).toBe(2)
    expect(starsFor(4, 8)).toBe(1)
    expect(starsFor(0, 0)).toBe(1)
  })

  it('applyRun débloque le palier suivant à 2 étoiles, garde le meilleur', () => {
    let p: JdeProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 1)
    expect(p.unlockedTier).toBe(0)
    p = applyRun(p, 0, 3)
    expect(p.unlockedTier).toBe(1)
    expect(p.bestStars[0]).toBe(3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(3)
  })

  it('le déblocage est plafonné au dernier palier', () => {
    const last = (TIER_COUNT - 1) as TierId
    let p: JdeProgress = { ...FRESH_PROGRESS, unlockedTier: last }
    p = applyRun(p, last, 3)
    expect(p.unlockedTier).toBe(last)
  })
})

describe('cohérence skill-map / manifest', () => {
  it('toutes les compétences des paliers existent dans le skill-map', () => {
    for (const id of TIER_SKILLS) expect(SKILLS_BY_ID.has(id)).toBe(true)
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect(ITEMS_PER_RUN).toBeGreaterThan(0)
  })

  it('le manifest déclare exactement les compétences des paliers (dédupliquées)', () => {
    const meta = GAMES_BY_ID.get('jardin-emotions')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
