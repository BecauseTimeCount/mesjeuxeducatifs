import { describe, expect, it } from 'vitest'
import { currentPeriod, PERIOD_LABELS, type Period } from '@/engine/periods'

describe('currentPeriod — mapping mois par mois', () => {
  // [mois 0-indexé, période attendue]
  const cases: [name: string, month: number, expected: Period][] = [
    ['janvier', 0, 3],
    ['février', 1, 3],
    ['mars', 2, 4],
    ['avril', 3, 4],
    ['mai', 4, 5],
    ['juin', 5, 5],
    ['juillet', 6, 5],
    ['août', 7, 5],
    ['septembre', 8, 1],
    ['octobre', 9, 1],
    ['novembre', 10, 2],
    ['décembre', 11, 2],
  ]

  it.each(cases)('%s (mois %i) → période %i', (_name, month, expected) => {
    expect(currentPeriod(new Date(2026, month, 15))).toBe(expected)
  })
})

describe('currentPeriod — bornes de l’année scolaire', () => {
  it('1er septembre à minuit → période 1', () => {
    expect(currentPeriod(new Date(2025, 8, 1, 0, 0, 0))).toBe(1)
  })

  it('31 août à 23 h 59 → période 5', () => {
    expect(currentPeriod(new Date(2026, 7, 31, 23, 59, 59))).toBe(5)
  })

  it('sans argument : équivaut à la date du jour', () => {
    expect(currentPeriod()).toBe(currentPeriod(new Date()))
  })
})

describe('PERIOD_LABELS', () => {
  it('un libellé « Période N · … » pour chacune des 5 périodes', () => {
    const periods: Period[] = [1, 2, 3, 4, 5]
    for (const p of periods) {
      expect(PERIOD_LABELS[p]).toMatch(new RegExp(`^Période ${p} · `))
    }
  })
})
