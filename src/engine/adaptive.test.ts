import { describe, expect, it } from 'vitest'
import { Tuner } from '@/engine/adaptive'

/** Applique une séquence de résultats et renvoie les retours d'onResult. */
function play(t: Tuner, seq: readonly boolean[]): ('up' | 'down' | 'same')[] {
  return seq.map((ok) => t.onResult(ok))
}

describe('Tuner — cas nominaux', () => {
  it('démarre à min par défaut', () => {
    expect(new Tuner({ min: 1, max: 5 }).level).toBe(1)
  })

  it('démarre à start si fourni', () => {
    expect(new Tuner({ min: 1, max: 5, start: 3 }).level).toBe(3)
  })

  it('3 réussites consécutives → up', () => {
    const t = new Tuner({ min: 1, max: 5 })
    expect(play(t, [true, true, true])).toEqual(['same', 'same', 'up'])
    expect(t.level).toBe(2)
  })

  it('le compteur repart à zéro après un up : il faut 3 nouvelles réussites', () => {
    const t = new Tuner({ min: 1, max: 5 })
    play(t, [true, true, true]) // up → niveau 2
    expect(play(t, [true, true, true])).toEqual(['same', 'same', 'up'])
    expect(t.level).toBe(3)
  })

  it('un échec casse la série de réussites', () => {
    const t = new Tuner({ min: 1, max: 5 })
    expect(play(t, [true, true, false, true, true, true])).toEqual([
      'same',
      'same',
      'same',
      'same',
      'same',
      'up',
    ])
    expect(t.level).toBe(2)
  })

  it('2 échecs consécutifs → down', () => {
    const t = new Tuner({ min: 1, max: 5, start: 3 })
    expect(play(t, [false, false])).toEqual(['same', 'down'])
    expect(t.level).toBe(2)
  })

  it('des échecs isolés (entrecoupés de réussites) ne descendent jamais', () => {
    const t = new Tuner({ min: 1, max: 5, start: 3 })
    expect(play(t, [false, true, false, true, false])).toEqual([
      'same',
      'same',
      'same',
      'same',
      'same',
    ])
    expect(t.level).toBe(3)
  })

  it('4 échecs consécutifs → deux down (le compteur repart après chaque down)', () => {
    const t = new Tuner({ min: 1, max: 5, start: 3 })
    expect(play(t, [false, false, false, false])).toEqual(['same', 'down', 'same', 'down'])
    expect(t.level).toBe(1)
  })

  it('une réussite remet le compteur d’échecs à zéro', () => {
    const t = new Tuner({ min: 1, max: 5, start: 3 })
    expect(play(t, [false, true, false])).toEqual(['same', 'same', 'same'])
    expect(t.level).toBe(3)
  })
})

describe('Tuner — bornes', () => {
  it('plafonné à max : 3 réussites au plafond → same, le niveau ne bouge pas', () => {
    const t = new Tuner({ min: 1, max: 2, start: 2 })
    expect(play(t, [true, true, true])).toEqual(['same', 'same', 'same'])
    expect(t.level).toBe(2)
  })

  it('plancher à min : 2 échecs au plancher → same, le niveau ne bouge pas', () => {
    const t = new Tuner({ min: 1, max: 5, start: 1 })
    expect(play(t, [false, false])).toEqual(['same', 'same'])
    expect(t.level).toBe(1)
  })

  it('min === max : le niveau ne bouge jamais', () => {
    const t = new Tuner({ min: 2, max: 2 })
    expect(play(t, [true, true, true, false, false])).toEqual([
      'same',
      'same',
      'same',
      'same',
      'same',
    ])
    expect(t.level).toBe(2)
  })
})

describe('Tuner — reset', () => {
  it('reset() revient au niveau de départ', () => {
    const t = new Tuner({ min: 1, max: 5, start: 2 })
    play(t, [true, true, true]) // up → 3
    t.reset()
    expect(t.level).toBe(2)
  })

  it('reset() purge les compteurs : il faut 3 réussites complètes après', () => {
    const t = new Tuner({ min: 1, max: 5 })
    play(t, [true, true]) // 2 réussites en cours
    t.reset()
    expect(play(t, [true, true, true])).toEqual(['same', 'same', 'up'])
    expect(t.level).toBe(2)
  })
})
