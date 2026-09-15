import { describe, expect, it } from 'vitest'
import { GAMES_BY_ID } from '@/games.manifest'
import { SKILL_MAP } from '@/content/skill-map'
import {
  ACTS,
  applyRun,
  bellyTotal,
  explainFor,
  FRESH_PROGRESS,
  generateOrder,
  hasSticker,
  isActUnlocked,
  isExactTap,
  isExactTyped,
  isUnlocked,
  itemsPerRun,
  KIND_INPUT,
  KIND_SKILL,
  MAX_TUNER_LEVEL,
  orderKey,
  SERVICE_COUNT,
  SERVICES,
  starsFor,
  targetOf,
} from './logic'
import type { Order, OrderKind } from './logic'

const DRAWS = 200
const ALL_LEVELS: readonly number[] = [0, MAX_TUNER_LEVEL]
const ALL_SERVICES = SERVICES.map((s) => s.id)

function draws(service: number, level: number, n = DRAWS): Order[] {
  return Array.from({ length: n }, (_, i) => generateOrder(service, level, i))
}

function drawsOfKind(kind: OrderKind, level: number, n = DRAWS): Order[] {
  const out: Order[] = []
  for (const s of SERVICES) {
    if (s.boss || !s.kinds.includes(kind)) continue
    out.push(...draws(s.id, level, n))
  }
  return out
}

/** Vérification INDÉPENDANTE : existe-t-il un sous-ensemble de plats qui atteint la cible ? */
function hasExactSubset(order: Order): boolean {
  const n = order.items.length
  for (let mask = 1; mask < 1 << n; mask++) {
    const ids: number[] = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) ids.push(order.items[i].id)
    if (bellyTotal(order, ids) === targetOf(order)) return true
  }
  return false
}

/** Réponse recalculée indépendamment de la logique. */
function expectedAnswer(order: Order): number {
  const q = order.question
  switch (q.type) {
    case 'complement':
      return order.factor === 2 ? (q.target - q.given) / 2 : q.target - q.given
    case 'exact':
      return q.target
    case 'times':
      return q.n * q.k
    case 'howmany':
      return q.total / q.k
    case 'double':
      return 2 * q.n
    case 'half':
      return q.n / 2
  }
}

describe('SERVICES / ACTS — cohérence structurelle', () => {
  it('les ids des services sont leur index, chaque acte a exactement un boss en dernier', () => {
    SERVICES.forEach((s, i) => expect(s.id).toBe(i))
    for (const act of ACTS) {
      const own = SERVICES.filter((s) => s.act === act.id)
      expect(own.length).toBeGreaterThanOrEqual(3)
      expect(own.filter((s) => s.boss).length).toBe(1)
      expect(own[own.length - 1].boss).toBe(true)
      const kinds = new Set(own.filter((s) => !s.boss).flatMap((s) => s.kinds))
      for (const k of own[own.length - 1].kinds) expect(kinds.has(k)).toBe(true)
    }
  })

  it('les services non-boss ont un seul type ; les boss tournent sur plusieurs', () => {
    for (const s of SERVICES) {
      if (s.boss) expect(s.kinds.length).toBeGreaterThanOrEqual(2)
      else expect(s.kinds.length).toBe(1)
    }
    expect(itemsPerRun(0)).toBe(8)
    expect(itemsPerRun(2)).toBe(6)
  })

  it('chaque compétence est dans le manifest ET dans le skill-map ; les entrées tap précèdent le pavé', () => {
    const meta = GAMES_BY_ID.get('food-truck-gloutons')
    expect(meta).toBeDefined()
    const skills = new Set(meta?.skills)
    const known = new Set(SKILL_MAP.map((d) => d.id))
    for (const skill of Object.values(KIND_SKILL)) {
      expect(skills.has(skill)).toBe(true)
      expect(known.has(skill)).toBe(true)
    }
    for (const skill of skills) expect(Object.values(KIND_SKILL)).toContain(skill)
    let seenNumpad = false
    for (const s of SERVICES) {
      const input = KIND_INPUT[s.kinds[0]]
      if (input === 'numpad') seenNumpad = true
      if (seenNumpad) expect(input).toBe('numpad')
    }
  })
})

describe('generateOrder — invariants communs (tous services, tous niveaux)', () => {
  it('mode tap : solutionIds distincts, présents, somme exacte, et sous-ensemble exact vérifié indépendamment', () => {
    for (const service of ALL_SERVICES) {
      for (const level of ALL_LEVELS) {
        for (const order of draws(service, level)) {
          if (order.input !== 'tap') continue
          expect(order.items.length).toBeGreaterThanOrEqual(3)
          expect(order.items.map((it) => it.id)).toEqual(order.items.map((_, i) => i))
          expect(new Set(order.solutionIds).size).toBe(order.solutionIds.length)
          const ids = new Set(order.items.map((it) => it.id))
          for (const sid of order.solutionIds) expect(ids.has(sid)).toBe(true)
          expect(isExactTap(order, order.solutionIds)).toBe(true)
          expect(hasExactSubset(order)).toBe(true)
          expect(isExactTap(order, [])).toBe(false)
        }
      }
    }
  }, 30_000)

  it('mode pavé : aucun plat, réponse recalculée indépendamment, validation stricte', () => {
    for (const service of ALL_SERVICES) {
      for (const level of ALL_LEVELS) {
        for (const order of draws(service, level)) {
          expect(order.answer).toBe(expectedAnswer(order))
          expect(Number.isInteger(order.answer)).toBe(true)
          if (order.input !== 'numpad') continue
          expect(order.items).toEqual([])
          expect(order.solutionIds).toEqual([])
          expect(isExactTyped(order, String(order.answer))).toBe(true)
          expect(isExactTyped(order, String(order.answer + 1))).toBe(false)
          expect(isExactTyped(order, '')).toBe(false)
          expect(isExactTyped(order, 'abc')).toBe(false)
        }
      }
    }
  }, 30_000)

  it('skill, input, prompt et explain sont cohérents', () => {
    for (const service of ALL_SERVICES) {
      for (const level of ALL_LEVELS) {
        for (const order of draws(service, level)) {
          expect(order.skill).toBe(KIND_SKILL[order.kind])
          expect(order.input).toBe(KIND_INPUT[order.kind])
          expect(SERVICES[service].kinds).toContain(order.kind)
          expect(order.prompt.length).toBeGreaterThanOrEqual(2)
          for (const part of order.prompt) {
            if ('number' in part) expect(part.number).toBeLessThanOrEqual(10_000)
          }
          const steps = order.explain
          for (let i = 0; i < steps.length; i++) {
            expect(steps[i].from + steps[i].add).toBe(steps[i].to)
            expect(steps[i].add).toBeGreaterThan(0)
            if (i > 0) expect(steps[i].from).toBe(steps[i - 1].to)
          }
          if (steps.length > 0 && order.question.type === 'complement') {
            expect(steps[0].from).toBe(order.question.given)
            expect(steps[steps.length - 1].to).toBe(order.question.target)
          }
        }
      }
    }
  }, 30_000)

  it('les boss tournent sur leurs types dans l’ordre', () => {
    for (const s of SERVICES.filter((s) => s.boss)) {
      for (let i = 0; i < 6; i++) expect(generateOrder(s.id, 0, i).kind).toBe(s.kinds[i % s.kinds.length])
    }
  })

  it('évite la valeur précédente quand une alternative existe', () => {
    for (const service of ALL_SERVICES) {
      let prev: number | undefined
      for (let i = 0; i < DRAWS; i++) {
        const order = generateOrder(service, 1, i, prev)
        if (prev !== undefined && !SERVICES[service].boss) expect(orderKey(order)).not.toBe(prev)
        prev = orderKey(order)
      }
    }
  }, 30_000)
})

describe('zéro QCM — pièges et distracteurs (mode tap)', () => {
  it('complement10 : le « déjà mangé » est toujours proposé, ≥ 2 distracteurs', () => {
    for (const level of ALL_LEVELS) {
      for (const order of drawsOfKind('complement10', level)) {
        const q = order.question
        if (q.type !== 'complement') throw new Error('type')
        expect(q.target).toBe(10)
        if (level === 0) expect(q.given).toBeGreaterThanOrEqual(5)
        if (level === 0) expect(q.given).toBeLessThanOrEqual(8)
        if (q.given !== order.answer) expect(order.items.some((it) => it.value === q.given)).toBe(true)
        expect(order.items.length - order.solutionIds.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('double : cible paire, facteur 2, une seule brochette suffit, la cible entière est un piège', () => {
    for (const level of ALL_LEVELS) {
      for (const order of drawsOfKind('double', level)) {
        const q = order.question
        if (q.type !== 'complement') throw new Error('type')
        expect(order.factor).toBe(2)
        expect(q.target % 2).toBe(0)
        expect(q.given).toBe(0)
        expect(q.target).toBeLessThanOrEqual(level === 0 ? 12 : 18)
        expect(order.solutionIds.length).toBe(1)
        if (q.target <= 9) expect(order.items.some((it) => it.value === q.target)).toBe(true)
      }
    }
  })

  it('complement-dizaine : cible = dizaine supérieure, le chiffre des unités est un piège', () => {
    for (const level of ALL_LEVELS) {
      for (const order of drawsOfKind('complement-dizaine', level)) {
        const q = order.question
        if (q.type !== 'complement') throw new Error('type')
        expect(q.given % 10).not.toBe(0)
        expect(q.target).toBe(Math.ceil(q.given / 10) * 10)
        expect(q.given).toBeLessThanOrEqual(level === 0 ? 49 : 99)
        const units = q.given % 10
        if (units !== order.answer) expect(order.items.some((it) => it.value === units)).toBe(true)
      }
    }
  })

  it('passage-dizaine : passage effectif, et le détour par la dizaine est toujours possible', () => {
    for (const level of ALL_LEVELS) {
      for (const order of drawsOfKind('passage-dizaine', level)) {
        const q = order.question
        if (q.type !== 'complement') throw new Error('type')
        expect(Math.floor(q.target / 10)).toBe(Math.floor(q.given / 10) + 1)
        const toTen = 10 - (q.given % 10)
        const rest = order.answer - toTen
        expect(rest).toBeGreaterThanOrEqual(1)
        const values = order.items.map((it) => it.value)
        expect(values).toContain(toTen)
        expect(values).toContain(rest)
        expect(order.explain.length).toBe(2)
      }
    }
  })

  it('decompo100-tap : les brochettes seules ne suffisent jamais, les caisses sont indispensables', () => {
    for (const level of ALL_LEVELS) {
      for (const order of drawsOfKind('decompo100-tap', level)) {
        const q = order.question
        if (q.type !== 'complement') throw new Error('type')
        const need = q.target - q.given
        const caisses = order.items.filter((it) => it.kind === 'caisse10')
        const brochettes = order.items.filter((it) => it.kind === 'brochette')
        expect(caisses.length).toBe(Math.floor(need / 10) + 1)
        expect(brochettes.reduce((a, it) => a + it.value, 0)).toBeLessThan(need)
        for (const it of brochettes) expect(it.value).toBeLessThanOrEqual(9)
        if (level === 0) expect(q.given).toBe(0)
        expect(q.target).toBeLessThanOrEqual(89)
      }
    }
  })
})

describe('plages par niveau (mode pavé)', () => {
  it('compléments à 100 : dizaines entières (N0) ou multiples de 5 (N1) ; quelconques non multiples de 10', () => {
    for (const order of drawsOfKind('complements100-dizaines', 0)) {
      if (order.question.type === 'complement') expect(order.question.given % 10).toBe(0)
    }
    for (const order of drawsOfKind('complements100-dizaines', 1)) {
      if (order.question.type === 'complement') expect(order.question.given % 5).toBe(0)
    }
    for (const level of ALL_LEVELS) {
      for (const order of drawsOfKind('complements100', level)) {
        if (order.question.type !== 'complement') throw new Error('type')
        expect(order.question.given % 10).not.toBe(0)
        expect(order.question.target).toBe(100)
        // 37 → 40 → 100 (2 étapes) ; 95 → 100 (1 étape)
        expect(order.explain.length).toBe(Math.ceil(order.question.given / 10) * 10 < 100 ? 2 : 1)
      }
    }
  })

  it('tables : facteur k dans la table du service, n ≤ 5 au niveau 0, countBy = k', () => {
    const tables: Record<string, number[]> = {
      'tables-2-5-10': [2, 5, 10],
      'tables-3-4': [3, 4],
      'tables-6-9': [6, 7, 8, 9],
    }
    for (const [kind, ks] of Object.entries(tables)) {
      for (const level of ALL_LEVELS) {
        for (const order of drawsOfKind(kind as OrderKind, level)) {
          const q = order.question
          if (q.type !== 'times') throw new Error('type')
          expect(ks).toContain(q.k)
          expect(q.n).toBeGreaterThanOrEqual(2)
          expect(q.n).toBeLessThanOrEqual(level === 0 ? 5 : 9)
          expect(order.countBy).toBe(q.k)
        }
      }
    }
    for (const order of drawsOfKind('paquets-inverse', 1)) {
      const q = order.question
      if (q.type !== 'howmany') throw new Error('type')
      expect([2, 5, 10]).toContain(q.k)
      expect(q.total % q.k).toBe(0)
    }
  })

  it('doubles et moitiés : moitié toujours entière, bornes du scénario', () => {
    for (const level of ALL_LEVELS) {
      for (const order of drawsOfKind('double-moitie', level)) {
        const q = order.question
        if (q.type === 'double') expect(q.n).toBeLessThanOrEqual(level === 0 ? 25 : 50)
        else if (q.type === 'half') {
          expect(q.n % 2).toBe(0)
          expect(q.n).toBeLessThanOrEqual(level === 0 ? 40 : 100)
        } else throw new Error('type')
      }
    }
  })

  it('acte 5 : tout est multiple de 10 (clips audio garantis), milliers jusqu’à 10 000', () => {
    for (const kind of ['complement1000-centaines', 'complement-centaine', 'decompo1000', 'complement10000-milliers'] as const) {
      for (const level of ALL_LEVELS) {
        for (const order of drawsOfKind(kind, level)) {
          expect(order.answer % 10).toBe(0)
          expect(targetOf(order) % 10).toBe(0)
          for (const part of order.prompt) if ('number' in part) expect(part.number % 10).toBe(0)
        }
      }
    }
    for (const order of drawsOfKind('complement-centaine', 1)) {
      if (order.question.type !== 'complement') throw new Error('type')
      expect(order.question.given % 100).not.toBe(0)
      expect(order.question.target).toBe(Math.ceil(order.question.given / 100) * 100)
    }
  })
})

describe('explainFor — chemin par la dizaine et la centaine', () => {
  it('37 → 40 → 100', () => {
    expect(explainFor(37, 100)).toEqual([
      { from: 37, add: 3, to: 40 },
      { from: 40, add: 60, to: 100 },
    ])
  })
  it('640 → 700 → 1000, 8 → 10 → 13, 0 → 45 direct', () => {
    expect(explainFor(640, 1000)).toEqual([
      { from: 640, add: 60, to: 700 },
      { from: 700, add: 300, to: 1000 },
    ])
    expect(explainFor(8, 13)).toEqual([
      { from: 8, add: 2, to: 10 },
      { from: 10, add: 3, to: 13 },
    ])
    expect(explainFor(0, 45)).toEqual([{ from: 0, add: 45, to: 45 }])
    expect(explainFor(40, 40)).toEqual([])
  })
})

describe('étoiles et progression', () => {
  it('starsFor : ≥ 90 % → 3, ≥ 70 % → 2, sinon 1', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(7, 8)).toBe(2)
    expect(starsFor(6, 8)).toBe(2)
    expect(starsFor(5, 8)).toBe(1)
    expect(starsFor(0, 8)).toBe(1)
    expect(starsFor(6, 6)).toBe(3)
  })

  it('déblocage linéaire à 2 étoiles, actes et stickers', () => {
    expect(isUnlocked(FRESH_PROGRESS, 0)).toBe(true)
    expect(isUnlocked(FRESH_PROGRESS, 1)).toBe(false)
    expect(isActUnlocked(FRESH_PROGRESS, 1)).toBe(true)
    expect(isActUnlocked(FRESH_PROGRESS, 2)).toBe(false)
    let p = applyRun(FRESH_PROGRESS, 0, 1)
    expect(isUnlocked(p, 1)).toBe(false)
    p = applyRun(p, 0, 2)
    expect(isUnlocked(p, 1)).toBe(true)
    expect(p.runs).toBe(2)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(2)
    p = applyRun(applyRun(p, 1, 3), 2, 3)
    expect(isActUnlocked(p, 2)).toBe(true)
    expect(hasSticker(p, 1)).toBe(true)
    expect(hasSticker(p, 2)).toBe(false)
    expect(isUnlocked(p, SERVICE_COUNT)).toBe(false)
  })
})
