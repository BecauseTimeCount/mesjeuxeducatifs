import { describe, expect, it } from 'vitest'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  bellyTotal,
  FRESH_PROGRESS,
  generateItem,
  isExact,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  numberStyle,
  pairsFor,
  PREFILLED_RANGES,
  starsFor,
  sumSelected,
  TIER_SKILLS,
  TIER_SPECS,
} from './logic'
import type { GdxItem, GdxProgress, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, MAX_TUNER_LEVEL]

function draws(tier: TierId, level: number, n = DRAWS): GdxItem[] {
  return Array.from({ length: n }, () => generateItem(tier, level))
}

/** Vérification INDÉPENDANTE : une paire de jetons distincts somme à la cible. */
function hasExactPair(item: GdxItem): boolean {
  for (let i = 0; i < item.tokens.length; i++) {
    for (let j = i + 1; j < item.tokens.length; j++) {
      if (item.tokens[i].value + item.tokens[j].value === item.target) return true
    }
  }
  return false
}

/** Item construit à la main pour tester la validation seule. */
function manualItem(partial: Partial<GdxItem> & Pick<GdxItem, 'target' | 'tokens'>): GdxItem {
  return {
    tier: 1,
    prefilled: 0,
    gloutons: 1,
    solutionIds: [],
    ...partial,
  }
}

describe('generateItem — invariants communs (tous paliers, tous niveaux)', () => {
  it('chaque item est résoluble : solutionIds distincts, présents, et somme exacte', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          expect(new Set(item.solutionIds).size).toBe(item.solutionIds.length)
          const ids = new Set(item.tokens.map((t) => t.id))
          for (const sid of item.solutionIds) expect(ids.has(sid)).toBe(true)
          expect(isExact(item, item.solutionIds)).toBe(true)
        }
      }
    }
  })

  it('respecte le nombre de jetons et la plage de valeurs du palier', () => {
    for (const tier of ALL_TIERS) {
      const spec = TIER_SPECS[tier]
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          expect(item.tokens).toHaveLength(spec.tokenCount)
          for (const t of item.tokens) {
            expect(Number.isInteger(t.value)).toBe(true)
            expect(t.value).toBeGreaterThanOrEqual(spec.valueMin)
            expect(t.value).toBeLessThanOrEqual(spec.valueMax)
          }
        }
      }
    }
  })

  it('propose toujours au moins un distracteur plausible (valeur voisine ou piège)', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          const solutionValues = item.solutionIds.map(
            (sid) => item.tokens.find((t) => t.id === sid)?.value ?? -99,
          )
          const plausible = item.tokens.some(
            (t) =>
              !item.solutionIds.includes(t.id) &&
              (solutionValues.some((s) => Math.abs(t.value - s) <= 1) ||
                (tier === 2 && t.value === item.prefilled)),
          )
          expect(plausible).toBe(true)
        }
      }
    }
  })
})

describe('palier T0 — décomposer jusqu’à 5', () => {
  it('cible dans la plage du niveau, solution = paire, et une paire exacte existe', () => {
    for (const level of ALL_LEVELS) {
      const [lo, hi] = TIER_SPECS[0].targetRanges[level]
      for (const item of draws(0, level)) {
        expect(item.target).toBeGreaterThanOrEqual(lo)
        expect(item.target).toBeLessThanOrEqual(hi)
        expect(item.solutionIds).toHaveLength(2)
        expect(hasExactPair(item)).toBe(true)
        expect(item.prefilled).toBe(0)
        expect(item.gloutons).toBe(1)
      }
    }
  })

  it('aucun jeton ne vaut la cible : impossible de répondre sans décomposer', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(0, level)) {
        expect(item.tokens.every((t) => t.value !== item.target)).toBe(true)
      }
    }
  })
})

describe('palier T1 — décomposer jusqu’à 10', () => {
  it('cible dans la plage du niveau, solution = paire, et une paire exacte existe', () => {
    for (const level of ALL_LEVELS) {
      const [lo, hi] = TIER_SPECS[1].targetRanges[level]
      for (const item of draws(1, level)) {
        expect(item.target).toBeGreaterThanOrEqual(lo)
        expect(item.target).toBeLessThanOrEqual(hi)
        expect(item.solutionIds).toHaveLength(2)
        expect(hasExactPair(item)).toBe(true)
      }
    }
  })

  it('aucun jeton ne vaut la cible', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(1, level)) {
        expect(item.tokens.every((t) => t.value !== item.target)).toBe(true)
      }
    }
  })
})

describe('palier T2 — compléments à 10', () => {
  it('la cible est TOUJOURS 10 et le complément existe en UN seul jeton', () => {
    for (const level of ALL_LEVELS) {
      const [plo, phi] = PREFILLED_RANGES[level]
      for (const item of draws(2, level)) {
        expect(item.target).toBe(10)
        expect(item.prefilled).toBeGreaterThanOrEqual(plo)
        expect(item.prefilled).toBeLessThanOrEqual(phi)
        expect(item.solutionIds).toHaveLength(1)
        // vérification indépendante : un jeton vaut bien 10 - prefilled
        expect(item.tokens.some((t) => t.value === 10 - item.prefilled)).toBe(true)
        expect(bellyTotal(item, item.solutionIds)).toBe(10)
      }
    }
  })

  it('le piège « redonner ce qu’il a déjà » est toujours proposé', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(2, level)) {
        const sameAsPrefilled = item.tokens.filter((t) => t.value === item.prefilled).length
        const minimum = 10 - item.prefilled === item.prefilled ? 2 : 1
        expect(sameAsPrefilled).toBeGreaterThanOrEqual(minimum)
      }
    }
  })
})

describe('palier T3 — les doubles (jumeaux)', () => {
  it('cible paire dans la plage, et la moitié existe toujours en un jeton', () => {
    for (const level of ALL_LEVELS) {
      const [lo, hi] = TIER_SPECS[3].targetRanges[level]
      for (const item of draws(3, level)) {
        expect(item.gloutons).toBe(2)
        expect(item.target % 2).toBe(0)
        expect(item.target).toBeGreaterThanOrEqual(lo)
        expect(item.target).toBeLessThanOrEqual(hi)
        expect(item.solutionIds).toHaveLength(1)
        // vérification indépendante : la paire double existe
        expect(item.tokens.some((t) => t.value === item.target / 2)).toBe(true)
      }
    }
  })
})

describe('avoid — jamais deux fois le même puzzle de suite', () => {
  it('T0 niveau 0 : avoid=3 force la cible 4', () => {
    for (let i = 0; i < 50; i++) expect(generateItem(0, 0, 3).target).toBe(4)
  })

  it('T1 niveau 1 : la cible évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(1, 1, 8).target).not.toBe(8)
  })

  it('T2 niveau 1 : le jeton déjà avalé évité ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(2, 1, 7).prefilled).not.toBe(7)
  })

  it('T3 niveau 1 : la cible évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(3, 1, 12).target).not.toBe(12)
  })

  it('avoid hors plage : la génération reste valide', () => {
    for (let i = 0; i < 50; i++) {
      const item = generateItem(0, 0, 99)
      expect(item.target === 3 || item.target === 4).toBe(true)
    }
  })
})

describe('validation — sumSelected / bellyTotal / isExact', () => {
  it('sélection vide → jamais exact', () => {
    const item = manualItem({ target: 5, tokens: [{ id: 0, value: 5 }] })
    expect(isExact(item, [])).toBe(false)
    expect(bellyTotal(item, [])).toBe(0)
  })

  it('les ids inconnus sont ignorés', () => {
    const item = manualItem({ target: 5, tokens: [{ id: 0, value: 2 }] })
    expect(sumSelected(item, [99, 0])).toBe(2)
  })

  it('T2 : le jeton déjà avalé compte dans le total', () => {
    const item = manualItem({
      tier: 2,
      target: 10,
      prefilled: 7,
      tokens: [{ id: 0, value: 3 }, { id: 1, value: 4 }],
    })
    expect(bellyTotal(item, [0])).toBe(10)
    expect(isExact(item, [0])).toBe(true)
    expect(isExact(item, [1])).toBe(false)
  })

  it('T3 : chaque jumeau mange chaque jeton donné (total doublé)', () => {
    const item = manualItem({
      tier: 3,
      target: 8,
      gloutons: 2,
      tokens: [{ id: 0, value: 4 }, { id: 1, value: 3 }],
    })
    expect(bellyTotal(item, [0])).toBe(8)
    expect(isExact(item, [0])).toBe(true)
    expect(isExact(item, [1])).toBe(false)
    // deux jetons donnés aux jumeaux : (4+3) × 2 = 14
    expect(bellyTotal(item, [0, 1])).toBe(14)
  })

  it('une somme trop grande ou trop petite n’est pas exacte', () => {
    const item = manualItem({
      target: 6,
      tokens: [{ id: 0, value: 2 }, { id: 1, value: 3 }, { id: 2, value: 5 }],
    })
    expect(isExact(item, [0, 1])).toBe(false) // 5
    expect(isExact(item, [1, 2])).toBe(false) // 8
    expect(isExact(item, [0, 1, 2])).toBe(false) // 10
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, ITEMS_PER_RUN)).toBe(3)
    expect(starsFor(7, ITEMS_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, ITEMS_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, ITEMS_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, ITEMS_PER_RUN)).toBe(1)
  })

  it('bornes exactes : 9/10 → 3 et 7/10 → 2', () => {
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(7, 10)).toBe(2)
  })
})

describe('numberStyle — représentation par palier', () => {
  it('T0 points, T1 points+chiffre, T2/T3 chiffre seul', () => {
    expect(numberStyle(0)).toBe('dots')
    expect(numberStyle(1)).toBe('dots-digit')
    expect(numberStyle(2)).toBe('digit')
    expect(numberStyle(3)).toBe('digit')
  })
})

describe('pairsFor — paires de décomposition', () => {
  it('cas limites', () => {
    expect(pairsFor(3, 1, 4)).toEqual([[1, 2]])
    expect(pairsFor(2, 1, 4)).toEqual([[1, 1]])
    expect(pairsFor(20, 1, 9)).toEqual([])
    expect(pairsFor(10, 1, 9)).toContainEqual([1, 9])
    expect(pairsFor(10, 1, 9)).toContainEqual([5, 5])
  })
})

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    const after2 = applyRun({ ...FRESH_PROGRESS }, 0, 2)
    expect(after2.unlockedTier).toBe(1)
    const after1 = applyRun({ ...FRESH_PROGRESS }, 0, 1)
    expect(after1.unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: GdxProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà de T3', () => {
    const p = applyRun({ bestStars: {}, unlockedTier: 3, runs: 0 }, 3, 3)
    expect(p.unlockedTier).toBe(3)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: GdxProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

describe('cohérence avec le manifest', () => {
  it('TIER_SKILLS correspond aux skills déclarés pour gloutons-du-dix', () => {
    expect(GAMES_BY_ID.get('gloutons-du-dix')?.skills).toEqual([...TIER_SKILLS])
  })
})
