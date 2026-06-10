import { describe, expect, it } from 'vitest'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  DELTA_RANGES,
  excessCount,
  FLASH_SPECS,
  FRESH_PROGRESS,
  generateItem,
  isExact,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  MIN_PREFILLED,
  missingCount,
  neededCount,
  OBJECTS,
  starsFor,
  SUPPLY_MAX,
  TIER_COUNT,
  TIER_SKILLS,
  TIER_SPECS,
} from './logic'
import type { BanItem, BanProgress, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, MAX_TUNER_LEVEL]

function draws(tier: TierId, level: number, n = DRAWS): BanItem[] {
  return Array.from({ length: n }, () => generateItem(tier, level))
}

/** Item construit à la main pour tester la validation seule. */
function manualItem(partial: Partial<BanItem> & Pick<BanItem, 'order'>): BanItem {
  return {
    tier: 0,
    prefilled: 0,
    supply: 6,
    boxSize: 5,
    flash: null,
    ...partial,
  }
}

describe('generateItem — invariants communs (tous paliers, tous niveaux)', () => {
  it('la commande reste dans la plage du palier et tient dans la boîte', () => {
    for (const tier of ALL_TIERS) {
      const spec = TIER_SPECS[tier]
      for (const level of ALL_LEVELS) {
        const [lo, hi] = spec.orderRanges[level]
        for (const item of draws(tier, level)) {
          expect(Number.isInteger(item.order)).toBe(true)
          expect(item.order).toBeGreaterThanOrEqual(lo)
          expect(item.order).toBeLessThanOrEqual(hi)
          expect(item.order).toBeLessThanOrEqual(item.boxSize)
          expect(item.boxSize).toBe(spec.boxSize)
        }
      }
    }
  })

  it('chaque item est résoluble : le tas couvre toujours ce qui manque', () => {
    for (const tier of [0, 1, 2] as const) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          const needed = neededCount(item)
          expect(needed).toBeGreaterThanOrEqual(1)
          expect(item.supply).toBeGreaterThanOrEqual(needed)
          expect(isExact(item, item.prefilled + needed)).toBe(true)
        }
      }
    }
  })

  it('le tas offre TOUJOURS un surplus — jamais exactement le compte', () => {
    for (const tier of [0, 1, 2] as const) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          const surplus = item.supply - neededCount(item)
          expect(surplus).toBeGreaterThanOrEqual(1)
          expect(surplus).toBeLessThanOrEqual(4)
          expect(item.supply).toBeLessThanOrEqual(SUPPLY_MAX)
        }
      }
    }
  })

  it('un niveau de Tuner hors bornes est ramené dans [0, MAX_TUNER_LEVEL]', () => {
    const [lo0, hi0] = TIER_SPECS[0].orderRanges[0]
    const [lo1, hi1] = TIER_SPECS[0].orderRanges[MAX_TUNER_LEVEL]
    for (let i = 0; i < 100; i++) {
      const low = generateItem(0, -5)
      expect(low.order).toBeGreaterThanOrEqual(lo0)
      expect(low.order).toBeLessThanOrEqual(hi0)
      const high = generateItem(0, 99)
      expect(high.order).toBeGreaterThanOrEqual(lo1)
      expect(high.order).toBeLessThanOrEqual(hi1)
    }
  })
})

describe('palier T0 — petites commandes (1 à 5, boîte de 5)', () => {
  it('boîte de 5 cases, rien de préposé, pas de flash', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(0, level)) {
        expect(item.boxSize).toBe(5)
        expect(item.prefilled).toBe(0)
        expect(item.flash).toBeNull()
        expect(neededCount(item)).toBe(item.order)
      }
    }
  })

  it('plages : 1-3 au niveau 0, 1-5 au niveau 1', () => {
    expect(TIER_SPECS[0].orderRanges[0]).toEqual([1, 3])
    expect(TIER_SPECS[0].orderRanges[1]).toEqual([1, 5])
  })
})

describe('palier T1 — grandes commandes (3 à 10, boîte de 10)', () => {
  it('boîte de 10 cases (ten-frame), rien de préposé, pas de flash', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(1, level)) {
        expect(item.boxSize).toBe(10)
        expect(item.prefilled).toBe(0)
        expect(item.flash).toBeNull()
      }
    }
  })

  it('plages : 3-7 au niveau 0, 3-10 au niveau 1', () => {
    expect(TIER_SPECS[1].orderRanges[0]).toEqual([3, 7])
    expect(TIER_SPECS[1].orderRanges[1]).toEqual([3, 10])
  })
})

describe('palier T2 — complète la commande (surcomptage)', () => {
  it('k préposés ≥ 2, commande ≤ 10, et il manque entre 1 et 5 objets', () => {
    for (const level of ALL_LEVELS) {
      const [dlo, dhi] = DELTA_RANGES[level]
      for (const item of draws(2, level)) {
        expect(item.prefilled).toBeGreaterThanOrEqual(MIN_PREFILLED)
        expect(item.order).toBeLessThanOrEqual(10)
        const delta = item.order - item.prefilled
        expect(delta).toBeGreaterThanOrEqual(dlo)
        expect(delta).toBeLessThanOrEqual(dhi)
        expect(delta).toBeGreaterThanOrEqual(1)
        expect(delta).toBeLessThanOrEqual(5)
      }
    }
  })

  it('les préposés + ce qui manque tiennent toujours dans la boîte', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(2, level)) {
        expect(item.prefilled + neededCount(item)).toBe(item.order)
        expect(item.order).toBeLessThanOrEqual(item.boxSize)
        expect(item.supply).toBeGreaterThan(neededCount(item))
      }
    }
  })
})

describe('palier T3 — coup d’œil (subitizing)', () => {
  it('niveau 0 : dé simple 1-6, flash de 2 secondes, pas de parts', () => {
    for (const item of draws(3, 0)) {
      expect(item.flash).not.toBeNull()
      expect(item.flash?.kind).toBe('dice')
      expect(item.flash?.value).toBe(item.order)
      expect(item.flash?.value).toBeGreaterThanOrEqual(1)
      expect(item.flash?.value).toBeLessThanOrEqual(6)
      expect(item.flash?.parts).toBeNull()
      expect(item.flash?.durationMs).toBe(2000)
      expect(item.supply).toBe(0)
      expect(item.prefilled).toBe(0)
    }
  })

  it('niveau 1 : double-dé ou ten-frame jusqu’à 10, flash de 1,5 seconde', () => {
    for (const item of draws(3, 1)) {
      const flash = item.flash
      expect(flash).not.toBeNull()
      if (!flash) continue
      expect(['double-dice', 'ten-frame']).toContain(flash.kind)
      expect(flash.value).toBe(item.order)
      expect(flash.value).toBeGreaterThanOrEqual(2)
      expect(flash.value).toBeLessThanOrEqual(10)
      expect(flash.durationMs).toBe(1500)
    }
  })

  it('double-dé : deux faces valides (1-6 chacune) dont la somme fait la commande', () => {
    const doubles = draws(3, 1, 400).filter((i) => i.flash?.kind === 'double-dice')
    expect(doubles.length).toBeGreaterThan(0)
    for (const item of doubles) {
      const parts = item.flash?.parts
      expect(parts).not.toBeNull()
      if (!parts) continue
      const [a, b] = parts
      expect(a).toBeGreaterThanOrEqual(1)
      expect(a).toBeLessThanOrEqual(6)
      expect(b).toBeGreaterThanOrEqual(1)
      expect(b).toBeLessThanOrEqual(6)
      expect(a + b).toBe(item.flash?.value)
    }
  })

  it('ten-frame et dé simple : jamais de parts', () => {
    const singles = draws(3, 1, 400).filter((i) => i.flash?.kind === 'ten-frame')
    expect(singles.length).toBeGreaterThan(0)
    for (const item of singles) expect(item.flash?.parts).toBeNull()
  })

  it('les plages du palier T3 sont celles des specs de flash', () => {
    expect(TIER_SPECS[3].orderRanges).toEqual(FLASH_SPECS.map((f) => f.range))
    expect(FLASH_SPECS[0].durationMs).toBe(2000)
    expect(FLASH_SPECS[1].durationMs).toBe(1500)
  })
})

describe('avoid — jamais deux fois la même commande de suite', () => {
  it('T0 niveau 0 : la commande évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(0, 0, 2).order).not.toBe(2)
  })

  it('T1 niveau 1 : la commande évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(1, 1, 7).order).not.toBe(7)
  })

  it('T2 niveau 1 : la commande évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(2, 1, 8).order).not.toBe(8)
  })

  it('T3 niveau 0 : la valeur flashée évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(3, 0, 4).order).not.toBe(4)
  })

  it('avoid hors plage : la génération reste valide', () => {
    for (let i = 0; i < 50; i++) {
      const item = generateItem(0, 0, 99)
      expect(item.order).toBeGreaterThanOrEqual(1)
      expect(item.order).toBeLessThanOrEqual(3)
    }
  })
})

describe('validation — isExact / neededCount / missingCount / excessCount', () => {
  it('boîte vide → jamais exact (la commande vaut au moins 1)', () => {
    const item = manualItem({ order: 3 })
    expect(isExact(item, 0)).toBe(false)
    expect(missingCount(item, 0)).toBe(3)
  })

  it('le compte exact valide, un de plus ou de moins non', () => {
    const item = manualItem({ order: 5 })
    expect(isExact(item, 5)).toBe(true)
    expect(isExact(item, 4)).toBe(false)
    expect(isExact(item, 6)).toBe(false)
  })

  it('T2 : les préposés comptent dans le total de la boîte', () => {
    const item = manualItem({ tier: 2, order: 7, prefilled: 4, boxSize: 10 })
    expect(neededCount(item)).toBe(3)
    // l'enfant ajoute 3 → 4 + 3 = 7 dans la boîte
    expect(isExact(item, item.prefilled + 3)).toBe(true)
    // n'ajouter que 2 → 6 en tout : il en manque un
    expect(isExact(item, 6)).toBe(false)
    expect(missingCount(item, 6)).toBe(1)
  })

  it('missingCount / excessCount guident l’indice dans le bon sens', () => {
    const item = manualItem({ order: 4 })
    expect(missingCount(item, 2)).toBe(2)
    expect(excessCount(item, 2)).toBe(0)
    expect(missingCount(item, 5)).toBe(0)
    expect(excessCount(item, 5)).toBe(1)
    expect(missingCount(item, 4)).toBe(0)
    expect(excessCount(item, 4)).toBe(0)
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

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    const after2 = applyRun({ ...FRESH_PROGRESS }, 0, 2)
    expect(after2.unlockedTier).toBe(1)
    const after1 = applyRun({ ...FRESH_PROGRESS }, 0, 1)
    expect(after1.unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: BanProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà de T3', () => {
    const p = applyRun({ bestStars: {}, unlockedTier: 3, runs: 0 }, 3, 3)
    expect(p.unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('un palier déjà débloqué ne se reverrouille jamais', () => {
    const p = applyRun({ bestStars: { 0: 3 }, unlockedTier: 2, runs: 4 }, 0, 1)
    expect(p.unlockedTier).toBe(2)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: BanProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

describe('objets expédiés', () => {
  it('au moins 4 objets, clés et emojis uniques', () => {
    expect(OBJECTS.length).toBeGreaterThanOrEqual(4)
    expect(new Set(OBJECTS.map((o) => o.key)).size).toBe(OBJECTS.length)
    expect(new Set(OBJECTS.map((o) => o.emoji)).size).toBe(OBJECTS.length)
  })
})

describe('cohérence avec le manifest et la skill-map', () => {
  it('un skill par palier, parmi les 3 compétences du jeu', () => {
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    const allowed = ['ma.gs.subitizing', 'ma.gs.denombrer10', 'ma.gs.comparer']
    for (const skill of TIER_SKILLS) expect(allowed).toContain(skill)
  })

  it('le manifest (une fois câblé) référence chaque compétence des paliers', () => {
    const meta = GAMES_BY_ID.get('boites-a-nombres')
    if (!meta) return // entrée câblée par l'orchestrateur après ce jeu
    for (const skill of TIER_SKILLS) expect(meta.skills).toContain(skill)
  })
})
