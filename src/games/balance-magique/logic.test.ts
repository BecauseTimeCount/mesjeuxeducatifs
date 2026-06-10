import { describe, expect, it } from 'vitest'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  EXCHANGE_PAIRS,
  FRESH_PROGRESS,
  generateItem,
  groupKey,
  hintDeltas,
  isBalanced,
  ITEMS_PER_RUN,
  itemSignature,
  lastPlacedId,
  leftWeight,
  MAX_TUNER_LEVEL,
  nextStockId,
  onlyBarsTargets,
  rightWeight,
  starsFor,
  T0_COUNT_RANGES,
  T1_COMPLEMENT_RANGES,
  T1_TARGET_RANGES,
  T2_BIG_RANGES,
  T2_RATES,
  T3_NOBARS_UNIT_RANGES,
  TIER_COUNT,
  TIER_SKILLS,
  tiltDirection,
  weightOf,
} from './logic'
import type { BmaItem, BmaProgress, BmaToken, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, MAX_TUNER_LEVEL]

function draws(tier: TierId, level: number, n = DRAWS): BmaItem[] {
  return Array.from({ length: n }, () => generateItem(tier, level))
}

function tok(partial: Partial<BmaToken> & Pick<BmaToken, 'id' | 'value'>): BmaToken {
  return { kind: 'fruit', emoji: '🍎', label: 'pomme', ...partial }
}

/** Item construit à la main pour tester la pesée seule. */
function manualItem(partial: Partial<BmaItem> & Pick<BmaItem, 'left' | 'stock'>): BmaItem {
  return { tier: 0, rightPrefilled: [], solutionIds: [], ...partial }
}

describe('generateItem — invariants communs (tous paliers, tous niveaux)', () => {
  it('chaque item est résoluble : solutionIds distincts, dans le stock, équilibre exact', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          expect(item.solutionIds.length).toBeGreaterThan(0)
          expect(new Set(item.solutionIds).size).toBe(item.solutionIds.length)
          const stockIds = new Set(item.stock.map((t) => t.id))
          for (const sid of item.solutionIds) expect(stockIds.has(sid)).toBe(true)
          expect(isBalanced(item, item.solutionIds)).toBe(true)
        }
      }
    }
  })

  it('jamais de cul-de-sac : les pré-posés seuls pèsent toujours MOINS que la gauche', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          expect(weightOf(item.rightPrefilled)).toBeLessThan(leftWeight(item))
        }
      }
    }
  })

  it('ids uniques dans tout l’item et valeurs entières >= 1', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          const all = [...item.left, ...item.rightPrefilled, ...item.stock]
          expect(new Set(all.map((t) => t.id)).size).toBe(all.length)
          for (const t of all) {
            expect(Number.isInteger(t.value)).toBe(true)
            expect(t.value).toBeGreaterThanOrEqual(1)
          }
        }
      }
    }
  })

  it('le stock dépasse STRICTEMENT la solution : on peut toujours surcharger (et se corriger)', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          expect(item.stock.length).toBeGreaterThan(item.solutionIds.length)
        }
      }
    }
  })
})

describe('palier T0 « Pareil ! » — comparer des quantités', () => {
  it('gauche = N fruits IDENTIQUES de valeur 1, N dans la plage du niveau', () => {
    for (const level of ALL_LEVELS) {
      const [lo, hi] = T0_COUNT_RANGES[level]
      for (const item of draws(0, level)) {
        expect(item.left.length).toBeGreaterThanOrEqual(lo)
        expect(item.left.length).toBeLessThanOrEqual(hi)
        const emojis = new Set(item.left.map((t) => t.emoji))
        expect(emojis.size).toBe(1)
        for (const t of [...item.left, ...item.stock]) {
          expect(t.kind).toBe('fruit')
          expect(t.value).toBe(1)
        }
        expect(item.rightPrefilled).toHaveLength(0)
        expect(item.rule).toBeUndefined()
        expect(item.challenge).toBeUndefined()
        expect(item.solutionIds).toHaveLength(item.left.length)
      }
    }
  })

  it('le stock garde le même fruit que la gauche (on compare des quantités, pas des objets)', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(0, level, 100)) {
        const fruit = item.left[0].emoji
        expect(item.stock.every((t) => t.emoji === fruit)).toBe(true)
      }
    }
  })
})

describe('palier T1 « Complète ! » — compléments incarnés (k + ? = N)', () => {
  it('gauche = UN poids chiffré N dans la plage, complément dans sa plage, k >= 1', () => {
    for (const level of ALL_LEVELS) {
      const [lo, hi] = T1_TARGET_RANGES[level]
      const [clo, chi] = T1_COMPLEMENT_RANGES[level]
      for (const item of draws(1, level)) {
        expect(item.left).toHaveLength(1)
        expect(item.left[0].kind).toBe('weight')
        const target = item.left[0].value
        expect(target).toBeGreaterThanOrEqual(lo)
        expect(target).toBeLessThanOrEqual(hi)
        const complement = item.solutionIds.length
        expect(complement).toBeGreaterThanOrEqual(clo)
        expect(complement).toBeLessThanOrEqual(chi)
        const k = item.rightPrefilled.length
        expect(k).toBeGreaterThanOrEqual(1)
        expect(k + complement).toBe(target)
      }
    }
  })

  it('pré-posés et stock : des fruits unité du MÊME fruit', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(1, level, 100)) {
        const all = [...item.rightPrefilled, ...item.stock]
        expect(all.every((t) => t.kind === 'fruit' && t.value === 1)).toBe(true)
        expect(new Set(all.map((t) => t.emoji)).size).toBe(1)
      }
    }
  })
})

describe('palier T2 « Les échanges » — taux corrects, conversion forcée', () => {
  it('la règle est posée et le plateau gauche la respecte (gros = rate, petits = 1)', () => {
    for (const level of ALL_LEVELS) {
      const [blo, bhi] = T2_BIG_RANGES[level]
      for (const item of draws(2, level)) {
        const rule = item.rule
        expect(rule).toBeDefined()
        if (!rule) continue
        expect(T2_RATES[level]).toContain(rule.rate)
        expect(EXCHANGE_PAIRS.some((p) => p.pairId === rule.pairId)).toBe(true)
        const bigs = item.left.filter((t) => t.emoji === rule.big.emoji)
        const smalls = item.left.filter((t) => t.emoji === rule.small.emoji)
        expect(bigs.length + smalls.length).toBe(item.left.length)
        expect(bigs.length).toBeGreaterThanOrEqual(blo)
        expect(bigs.length).toBeLessThanOrEqual(bhi)
        expect(bigs.every((t) => t.value === rule.rate)).toBe(true)
        expect(smalls.length).toBeLessThanOrEqual(1)
        expect(smalls.every((t) => t.value === 1)).toBe(true)
      }
    }
  })

  it('niveau 0 : taux 2 uniquement et jamais de petit objet en plus à gauche', () => {
    for (const item of draws(2, 0)) {
      expect(item.rule?.rate).toBe(2)
      expect(item.left.every((t) => t.value === 2)).toBe(true)
    }
  })

  it('le stock ne contient QUE des petits objets : il FAUT convertir mentalement', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(2, level, 100)) {
        const rule = item.rule
        if (!rule) continue
        expect(item.stock.every((t) => t.emoji === rule.small.emoji && t.value === 1)).toBe(true)
        expect(item.solutionIds).toHaveLength(leftWeight(item))
      }
    }
  })
})

describe('palier T3 « Barres et cubes » — le stock impose l’échange', () => {
  it('« plus de barres » : gauche = 1 barre + u cubes, stock = cubes seulement', () => {
    for (const level of ALL_LEVELS) {
      const [ulo, uhi] = T3_NOBARS_UNIT_RANGES[level]
      const items = draws(3, level).filter((i) => i.challenge === 'no-bars')
      expect(items.length).toBeGreaterThan(0)
      for (const item of items) {
        const bars = item.left.filter((t) => t.kind === 'bar')
        const cubes = item.left.filter((t) => t.kind === 'cube')
        expect(bars).toHaveLength(1)
        expect(cubes.length).toBeGreaterThanOrEqual(ulo)
        expect(cubes.length).toBeLessThanOrEqual(uhi)
        expect(item.stock.every((t) => t.kind === 'cube' && t.value === 1)).toBe(true)
        // l'équilibre exige target cubes — le stock les a (déjà prouvé), un par un
        expect(item.solutionIds).toHaveLength(leftWeight(item))
      }
    }
  })

  it('« que des cubes à gauche » : trop peu de cubes en stock, les barres sont OBLIGATOIRES', () => {
    for (const level of ALL_LEVELS) {
      const candidates = onlyBarsTargets(level)
      const items = draws(3, level).filter((i) => i.challenge === 'only-bars')
      expect(items.length).toBeGreaterThan(0)
      for (const item of items) {
        const target = leftWeight(item)
        expect(candidates).toContain(target)
        expect(item.left.every((t) => t.kind === 'cube')).toBe(true)
        const stockBars = item.stock.filter((t) => t.kind === 'bar')
        const stockCubes = item.stock.filter((t) => t.kind === 'cube')
        expect(stockBars.length).toBe(Math.floor(target / 10) + 1)
        // poids des cubes du stock < cible : impossible d'équilibrer sans barre
        expect(weightOf(stockCubes)).toBeLessThan(target)
        // la solution échange exactement : t barres + u cubes
        const byId = new Map(item.stock.map((t) => [t.id, t]))
        const sol = item.solutionIds.map((id) => byId.get(id))
        expect(sol.filter((t) => t?.kind === 'bar')).toHaveLength(Math.floor(target / 10))
        expect(sol.filter((t) => t?.kind === 'cube')).toHaveLength(target % 10)
      }
    }
  })

  it('les barres pèsent 10, les cubes pèsent 1', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(3, level, 100)) {
        for (const t of [...item.left, ...item.stock]) {
          if (t.kind === 'bar') expect(t.value).toBe(10)
          if (t.kind === 'cube') expect(t.value).toBe(1)
        }
      }
    }
  })
})

describe('avoid — jamais deux fois le même poids de suite', () => {
  it('T0 niveau 0 : le nombre évité ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(itemSignature(generateItem(0, 0, 3))).not.toBe(3)
  })

  it('T1 niveau 0 : la cible évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(itemSignature(generateItem(1, 0, 7))).not.toBe(7)
  })

  it('T2 niveau 0 : cibles {2, 4} — avoid=2 force la cible 4', () => {
    for (let i = 0; i < 50; i++) expect(itemSignature(generateItem(2, 0, 2))).toBe(4)
  })

  it('T3 niveau 1 : la cible évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(itemSignature(generateItem(3, 1, 14))).not.toBe(14)
  })

  it('avoid hors plage : la génération reste valide', () => {
    for (let i = 0; i < 50; i++) {
      const item = generateItem(0, 0, 99)
      expect(item.left.length).toBeGreaterThanOrEqual(T0_COUNT_RANGES[0][0])
      expect(item.left.length).toBeLessThanOrEqual(T0_COUNT_RANGES[0][1])
    }
  })

  it('itemSignature = poids du plateau gauche', () => {
    const item = manualItem({ left: [tok({ id: 0, value: 4 }), tok({ id: 1, value: 3 })], stock: [] })
    expect(itemSignature(item)).toBe(7)
  })
})

describe('pesée — weightOf / rightWeight / isBalanced / tiltDirection', () => {
  const item = manualItem({
    left: [tok({ id: 0, value: 5 })],
    rightPrefilled: [tok({ id: 1, value: 2 })],
    stock: [tok({ id: 2, value: 1 }), tok({ id: 3, value: 1 }), tok({ id: 4, value: 1 }), tok({ id: 5, value: 1 })],
  })

  it('plateau droit vide (hors pré-posés) : la gauche penche', () => {
    expect(rightWeight(item, [])).toBe(2)
    expect(isBalanced(item, [])).toBe(false)
    expect(tiltDirection(item, [])).toBe('left')
  })

  it('équilibre exact : pré-posés + posés = gauche', () => {
    expect(rightWeight(item, [2, 3, 4])).toBe(5)
    expect(isBalanced(item, [2, 3, 4])).toBe(true)
    expect(tiltDirection(item, [2, 3, 4])).toBe('level')
  })

  it('surcharge : la droite penche', () => {
    expect(tiltDirection(item, [2, 3, 4, 5])).toBe('right')
    expect(isBalanced(item, [2, 3, 4, 5])).toBe(false)
  })

  it('les ids inconnus sont ignorés (et un id de la gauche n’est PAS posable)', () => {
    expect(rightWeight(item, [99, 0, 2])).toBe(3)
  })
})

describe('groupes — groupKey / nextStockId / lastPlacedId / hintDeltas', () => {
  const bar = (id: number): BmaToken => tok({ id, kind: 'bar', value: 10, emoji: '🟦', label: 'barre de dix' })
  const cube = (id: number): BmaToken => tok({ id, kind: 'cube', value: 1, emoji: '🟧', label: 'cube' })
  const item = manualItem({
    left: Array.from({ length: 14 }, (_, i) => cube(100 + i)),
    stock: [bar(0), bar(1), cube(2), cube(3), cube(4), cube(5), cube(6), cube(7)],
    solutionIds: [0, 2, 3, 4, 5],
  })
  const K_BAR = groupKey(bar(0))
  const K_CUBE = groupKey(cube(2))

  it('une barre et un cube ne partagent jamais le même groupe', () => {
    expect(K_BAR).not.toBe(K_CUBE)
    expect(groupKey(cube(2))).toBe(groupKey(cube(7)))
  })

  it('nextStockId saute les jetons déjà posés et s’épuise proprement', () => {
    expect(nextStockId(item, [], K_BAR)).toBe(0)
    expect(nextStockId(item, [0], K_BAR)).toBe(1)
    expect(nextStockId(item, [0, 1], K_BAR)).toBeUndefined()
  })

  it('lastPlacedId retire le DERNIER posé de la sorte (toujours possible)', () => {
    expect(lastPlacedId(item, [0, 2, 3], K_CUBE)).toBe(3)
    expect(lastPlacedId(item, [0, 2, 3], K_BAR)).toBe(0)
    expect(lastPlacedId(item, [2, 3], K_BAR)).toBeUndefined()
  })

  it('hintDeltas : il manque ce que la solution a en plus, en trop ce qui dépasse', () => {
    const fresh = hintDeltas(item, [])
    expect(fresh.find((g) => g.key === K_BAR)?.delta).toBe(1)
    expect(fresh.find((g) => g.key === K_CUBE)?.delta).toBe(4)
    // 2 barres posées (1 de trop), 2 cubes posés (2 manquants)
    const mixed = hintDeltas(item, [0, 1, 2, 3])
    expect(mixed.find((g) => g.key === K_BAR)?.delta).toBe(-1)
    expect(mixed.find((g) => g.key === K_CUBE)?.delta).toBe(2)
  })

  it('hintDeltas : pose exacte → aucun écart', () => {
    expect(hintDeltas(item, [0, 2, 3, 4, 5])).toHaveLength(0)
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils >= 90 % → 3, >= 70 % → 2, sinon 1', () => {
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
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1).unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: BmaProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà de T3', () => {
    const p = applyRun({ bestStars: {}, unlockedTier: TIER_COUNT - 1, runs: 0 }, 3, 3)
    expect(p.unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: BmaProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

describe('cohérence avec le manifest', () => {
  it('TIER_SKILLS correspond aux skills déclarés pour balance-magique (une fois câblé)', () => {
    const meta = GAMES_BY_ID.get('balance-magique')
    // L'entrée manifest est câblée par l'orchestrateur APRÈS ce jeu :
    // si elle existe, elle doit refléter exactement les paliers.
    if (meta) expect(meta.skills).toEqual([...TIER_SKILLS])
  })
})
