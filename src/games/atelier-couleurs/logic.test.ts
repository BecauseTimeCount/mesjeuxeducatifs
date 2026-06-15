import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  COLORS,
  COLORS_BY_ID,
  FRESH_PROGRESS,
  generateItem,
  isWrongPour,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  MIX_TABLE,
  mixKey,
  mixResult,
  PRIMARIES,
  recipeFor,
  SOURCES,
  starsFor,
  success,
  TIER_COUNT,
  TIER_SKILLS,
  type ColProgress,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('palette de couleurs', () => {
  it('11 couleurs, ids et hex uniques, nom non vide', () => {
    expect(COLORS).toHaveLength(11)
    const ids = new Set(COLORS.map((c) => c.id))
    expect(ids.size).toBe(11)
    const hexes = new Set(COLORS.map((c) => c.hex.toLowerCase()))
    expect(hexes.size).toBe(11)
    for (const c of COLORS) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('les sources (3 primaires + blanc + noir) sont toutes des couleurs connues', () => {
    expect(SOURCES).toEqual(['rouge', 'bleu', 'jaune', 'blanc', 'noir'])
    for (const s of SOURCES) expect(COLORS_BY_ID.has(s)).toBe(true)
  })
})

describe('mixKey / mixResult / MIX_TABLE', () => {
  it('mixKey est canonique (ordre indifférent, multiplicité conservée)', () => {
    expect(mixKey(['rouge', 'bleu'])).toBe(mixKey(['bleu', 'rouge']))
    expect(mixKey(['bleu', 'jaune', 'rouge'])).toBe(mixKey(['rouge', 'bleu', 'jaune']))
    expect(mixKey(['rouge', 'rouge'])).not.toBe(mixKey(['rouge']))
  })

  it('respecte les recettes imposées', () => {
    expect(mixResult(['bleu', 'rouge'])).toBe('violet')
    expect(mixResult(['jaune', 'rouge'])).toBe('orange')
    expect(mixResult(['bleu', 'jaune'])).toBe('vert')
    expect(mixResult(['blanc', 'rouge'])).toBe('rose')
    expect(mixResult(['blanc', 'noir'])).toBe('gris')
    expect(mixResult(['bleu', 'jaune', 'rouge'])).toBe('marron')
  })

  it('une source seule donne la couleur elle-même', () => {
    for (const p of PRIMARIES) expect(mixResult([p])).toBe(p)
    expect(mixResult(['blanc'])).toBe('blanc')
    expect(mixResult(['noir'])).toBe('noir')
  })

  it('pot vide ou mélange inconnu -> "inconnu"', () => {
    expect(mixResult([])).toBe('inconnu')
    expect(mixResult(['bleu', 'noir'])).toBe('inconnu')
    expect(mixResult(['rouge', 'rouge'])).toBe('inconnu')
    expect(mixResult(['caillou'])).toBe('inconnu')
  })

  it('toutes les recettes de la table sont résolubles par mixResult', () => {
    for (const [key, result] of MIX_TABLE) {
      expect(mixResult(key.split('+'))).toBe(result)
    }
  })
})

describe('recipeFor', () => {
  it('une cible primaire = un seul versement de cette peinture', () => {
    for (const p of PRIMARIES) {
      expect(recipeFor(p)).toEqual([p])
    }
  })

  it('une cible obtenue redonne la cible via mixResult', () => {
    for (const target of ['violet', 'orange', 'vert', 'rose', 'gris', 'marron']) {
      const recipe = recipeFor(target)
      expect(recipe.length).toBeGreaterThanOrEqual(2)
      expect(mixResult(recipe)).toBe(target)
    }
  })

  it('cible inconnue -> recette vide', () => {
    expect(recipeFor('arc-en-ciel')).toEqual([])
  })
})

describe('génération d’items résolubles', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages toujours résolubles`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateItem(tier, level)
          // recette non vide et produisant exactement la cible
          expect(item.recipe.length).toBeGreaterThanOrEqual(1)
          expect(mixResult(item.recipe)).toBe(item.targetId)
          // palette ⊇ recette (en dédupliquant, palette n'a pas de doublon)
          const paletteSet = new Set(item.palette)
          for (const id of item.recipe) expect(paletteSet.has(id)).toBe(true)
          // au moins un distracteur : une source de la palette hors recette
          const distractors = item.palette.filter((id) => !item.recipe.includes(id))
          expect(distractors.length).toBeGreaterThanOrEqual(1)
          // toutes les cases de la palette sont des sources versables
          for (const id of item.palette) expect(SOURCES).toContain(id)
          // verser exactement la recette résout l'item
          expect(success(item.recipe, item.recipe)).toBe(true)
        }
      })
    }
  }

  it('le palier détermine la compétence (cibles attendues par palier)', () => {
    const sample = (tier: TierId): Set<string> => {
      const s = new Set<string>()
      for (let i = 0; i < 300; i++) s.add(generateItem(tier, 0).targetId)
      return s
    }
    expect([...sample(0)].every((t) => PRIMARIES.includes(t))).toBe(true)
    expect([...sample(1)].every((t) => ['violet', 'orange', 'vert'].includes(t))).toBe(true)
    expect(
      [...sample(2)].every((t) => ['violet', 'orange', 'vert', 'rose', 'gris'].includes(t)),
    ).toBe(true)
    expect([...sample(3)].every((t) => ['rose', 'gris', 'marron'].includes(t))).toBe(true)
  })

  it('avoid ne répète pas la même cible deux fois de suite', () => {
    let prev = generateItem(2, 0).targetId
    for (let i = 0; i < 200; i++) {
      const next = generateItem(2, 0, prev)
      expect(next.targetId).not.toBe(prev)
      prev = next.targetId
    }
  })

  it('le niveau 1 propose au moins autant de distracteurs que le niveau 0', () => {
    // statistique douce : sur 200 tirages, la palette du niveau 1 est >= celle du niveau 0 en moyenne
    let lvl0 = 0
    let lvl1 = 0
    for (let i = 0; i < 200; i++) {
      lvl0 += generateItem(1, 0).palette.length
      lvl1 += generateItem(1, 1).palette.length
    }
    expect(lvl1).toBeGreaterThanOrEqual(lvl0)
  })
})

describe('validation (success / isWrongPour)', () => {
  it('success exige le multiset exact de la recette', () => {
    expect(success(['bleu', 'rouge'], ['rouge', 'bleu'])).toBe(true)
    expect(success(['bleu', 'rouge'], ['bleu'])).toBe(false)
    expect(success(['bleu', 'rouge'], ['bleu', 'rouge', 'jaune'])).toBe(false)
    expect(success(['rouge'], ['rouge'])).toBe(true)
  })

  it('isWrongPour repère un versement hors recette (en multiplicité)', () => {
    const recipe = ['bleu', 'jaune', 'rouge']
    expect(isWrongPour(recipe, ['bleu'])).toBe(false)
    expect(isWrongPour(recipe, ['bleu', 'jaune'])).toBe(false)
    expect(isWrongPour(recipe, ['bleu', 'noir'])).toBe(true)
    // un doublon non prévu est un mauvais versement
    expect(isWrongPour(['blanc', 'rouge'], ['rouge', 'rouge'])).toBe(true)
    expect(isWrongPour(['blanc', 'rouge'], ['rouge', 'blanc'])).toBe(false)
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
    let p: ColProgress = { ...FRESH_PROGRESS }
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
    let p: ColProgress = { ...FRESH_PROGRESS, unlockedTier: last }
    p = applyRun(p, last, 3)
    expect(p.unlockedTier).toBe(last)
  })
})

describe('cohérence skill-map / manifest', () => {
  it('toutes les compétences des paliers existent dans le skill-map', () => {
    for (const id of TIER_SKILLS) expect(SKILLS_BY_ID.has(id)).toBe(true)
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
  })

  it('le manifest déclare exactement les compétences des paliers (dédupliquées)', () => {
    const meta = GAMES_BY_ID.get('atelier-couleurs')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
    expect(ITEMS_PER_RUN).toBeGreaterThan(0)
  })
})
