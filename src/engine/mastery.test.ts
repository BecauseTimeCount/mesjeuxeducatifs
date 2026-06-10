import { describe, expect, it } from 'vitest'
import type { SkillProgress } from '@/engine/types'
import { applyAttempt, computeState } from '@/engine/mastery'

const DAY = 24 * 60 * 60 * 1000
const T0 = 1_000_000

/** Fenêtre fabriquée : un élément par booléen, ts croissants. */
function win(...oks: boolean[]): SkillProgress['window'] {
  return oks.map((ok, i) => ({ ok, ts: T0 + i * 1000 }))
}

/** Applique une séquence de premiers essais, 1 s entre chaque (ts = T0 + (i+1) s). */
function run(seq: readonly boolean[], from?: SkillProgress): SkillProgress {
  let p = from
  seq.forEach((ok, i) => {
    p = applyAttempt(p, ok, T0 + (i + 1) * 1000)
  })
  if (!p) throw new Error('séquence vide')
  return p
}

describe('computeState', () => {
  it('découverte tant que moins de 3 tentatives, même avec une fenêtre parfaite', () => {
    const p: SkillProgress = { window: win(true, true), state: 'decouverte', box: 0, totalAttempts: 2 }
    expect(computeState(p)).toBe('decouverte')
  })

  it('en-cours dès 3 tentatives quand la fenêtre est trop courte (< 5)', () => {
    const p: SkillProgress = { window: win(true, true, true), state: 'decouverte', box: 0, totalAttempts: 3 }
    expect(computeState(p)).toBe('en-cours')
  })

  it('en-cours si fenêtre ≥ 5 mais ratio < 0.8', () => {
    const p: SkillProgress = { window: win(true, true, true, false, false), state: 'en-cours', box: 0, totalAttempts: 5 }
    expect(computeState(p)).toBe('en-cours')
  })

  it('maîtrise au seuil exact : 4/5 = 0.8 sur une fenêtre de 5', () => {
    const p: SkillProgress = { window: win(true, true, true, true, false), state: 'en-cours', box: 1, totalAttempts: 5 }
    expect(computeState(p)).toBe('maitrise')
  })

  it('consolidé si maîtrise ET box ≥ 2', () => {
    const p: SkillProgress = { window: win(true, true, true, true, true), state: 'maitrise', box: 2, totalAttempts: 12 }
    expect(computeState(p)).toBe('consolide')
  })

  it('box ≥ 2 sans le ratio requis → en-cours, pas consolidé', () => {
    const p: SkillProgress = { window: win(true, false, true, false, true), state: 'maitrise', box: 2, totalAttempts: 12 }
    expect(computeState(p)).toBe('en-cours')
  })
})

describe('applyAttempt — progression', () => {
  it('démarre en découverte (progression absente)', () => {
    const p = applyAttempt(undefined, true, T0)
    expect(p.state).toBe('decouverte')
    expect(p.totalAttempts).toBe(1)
    expect(p.window).toEqual([{ ok: true, ts: T0 }])
    expect(p.box).toBe(0)
    expect(p.nextReview).toBeUndefined()
  })

  it('ne mute pas la progression passée en entrée (pureté)', () => {
    const p = run([true, true, true])
    const snapshot = structuredClone(p)
    applyAttempt(p, false, T0 + 99_000)
    expect(p).toEqual(snapshot)
  })

  it('passe en en-cours à la 3e tentative', () => {
    const p = run([true, false, true])
    expect(p.state).toBe('en-cours')
    expect(p.totalAttempts).toBe(3)
  })

  it('atteint la maîtrise après 5 réussites : box 1, révision à J+2', () => {
    const p = run([true, true, true, true, true])
    expect(p.state).toBe('maitrise')
    expect(p.box).toBe(1)
    expect(p.nextReview).toBe(T0 + 5000 + 2 * DAY)
  })

  it('rester en maîtrise ne ré-incrémente pas la box', () => {
    const p = run([true, true, true, true, true, true, true])
    expect(p.state).toBe('maitrise')
    expect(p.box).toBe(1)
  })

  it('maîtrise perdue puis regagnée → box 2 → consolidé, révision à J+7', () => {
    // 5 réussites (maîtrise box 1), 2 échecs non consécutifs (retombe en-cours
    // sans rétrograder la box), puis 2 réussites : 8/10 → repassage à la maîtrise.
    const seq = [true, true, true, true, true, false, true, false, true, true]
    const p = run(seq)
    expect(p.state).toBe('consolide')
    expect(p.box).toBe(2)
    expect(p.nextReview).toBe(T0 + 10_000 + 7 * DAY)
  })
})

describe('applyAttempt — fenêtre glissante', () => {
  it('la fenêtre est plafonnée à 10, totalAttempts continue de compter', () => {
    const p = run(Array.from({ length: 12 }, () => true))
    expect(p.window).toHaveLength(10)
    expect(p.totalAttempts).toBe(12)
  })

  it('les vieux échecs sortent de la fenêtre : on peut re-réussir après un mauvais départ', () => {
    // 5 échecs puis 10 réussites : la fenêtre finit toute verte → maîtrise.
    const p = run([false, false, false, false, false, ...Array.from({ length: 10 }, () => true)])
    expect(p.window.every((a) => a.ok)).toBe(true)
    expect(p.state).toBe('maitrise')
    expect(p.box).toBe(1)
  })
})

describe('applyAttempt — boîtes de Leitner', () => {
  it('2 échecs consécutifs → box 0 et révision immédiate', () => {
    const mastered = run([true, true, true, true, true]) // box 1
    const afterOneFail = applyAttempt(mastered, false, T0 + 10_000)
    expect(afterOneFail.box).toBe(1) // un échec isolé ne rétrograde pas
    const afterTwoFails = applyAttempt(afterOneFail, false, T0 + 11_000)
    expect(afterTwoFails.box).toBe(0)
    expect(afterTwoFails.nextReview).toBe(T0 + 11_000)
    expect(afterTwoFails.state).toBe('en-cours') // 5/7 < 0.8
  })

  it('2 échecs non consécutifs ne rétrogradent pas la box', () => {
    const mastered = run([true, true, true, true, true]) // box 1
    const p = run([false, true, false], mastered)
    expect(p.box).toBe(1)
  })

  it('la box est plafonnée à 3 et la révision passe à J+21', () => {
    const now = T0 + 500_000
    const before: SkillProgress = {
      window: win(true, true, true, true, false, true, false, true, true), // 7/9
      state: 'en-cours',
      box: 3,
      totalAttempts: 30,
    }
    const p = applyAttempt(before, true, now) // 8/10 → repassage à la maîtrise
    expect(p.box).toBe(3)
    expect(p.state).toBe('consolide')
    expect(p.nextReview).toBe(now + 21 * DAY)
  })

  it('après rétrogradation, la maîtrise regagnée repart de la box 1', () => {
    const mastered = run([true, true, true, true, true]) // box 1
    const demoted = run([false, false], mastered) // box 0, fenêtre 5/7
    // 3 réussites : fenêtre [t×5, f, f, t, t, t] = 8/10 → repassage à la maîtrise.
    const regained = run([true, true, true], demoted)
    expect(regained.state).toBe('maitrise')
    expect(regained.box).toBe(1)
  })
})

describe('applyAttempt — promotion sur révision réussie', () => {
  it('révision J+2 réussie à échéance → box 2, prochaine révision à J+7', () => {
    const mastered = run([true, true, true, true, true]) // box 1, révision à J+2
    const due = mastered.nextReview
    if (due === undefined) throw new Error('nextReview attendu')
    const now = due + 1000
    const p = applyAttempt(mastered, true, now)
    expect(p.box).toBe(2)
    expect(p.nextReview).toBe(now + 7 * DAY)
  })

  it('révision en avance (now < nextReview) → pas de promotion', () => {
    const mastered = run([true, true, true, true, true]) // box 1, révision à J+2
    const p = applyAttempt(mastered, true, (mastered.nextReview ?? 0) - 1000)
    expect(p.box).toBe(1)
    expect(p.nextReview).toBe(mastered.nextReview)
  })

  it('box 3 réussie à échéance → reste box 3, la révision repart à J+21', () => {
    const before: SkillProgress = {
      window: win(...Array.from({ length: 10 }, () => true)),
      state: 'consolide',
      box: 3,
      nextReview: T0 + 10 * DAY,
      totalAttempts: 40,
    }
    const now = T0 + 11 * DAY
    const p = applyAttempt(before, true, now)
    expect(p.box).toBe(3)
    expect(p.state).toBe('consolide')
    expect(p.nextReview).toBe(now + 21 * DAY)
  })

  it('révision ratée puis re-ratée → box 0 et révision immédiate', () => {
    const mastered = run([true, true, true, true, true]) // box 1, révision à J+2
    const due = mastered.nextReview
    if (due === undefined) throw new Error('nextReview attendu')
    const failedOnce = applyAttempt(mastered, false, due)
    expect(failedOnce.box).toBe(1) // un échec isolé ne rétrograde pas
    expect(failedOnce.nextReview).toBe(due) // l'échéance ne bouge pas
    const failedTwice = applyAttempt(failedOnce, false, due + 1000)
    expect(failedTwice.box).toBe(0)
    expect(failedTwice.nextReview).toBe(due + 1000)
  })

  it('une seule promotion quand la même tentative valide révision ET maîtrise', () => {
    // box 1, révision due, fenêtre 7/9 en-cours : la réussite fait 8/10 → maîtrise.
    const before: SkillProgress = {
      window: win(true, true, true, true, false, true, false, true, true),
      state: 'en-cours',
      box: 1,
      nextReview: T0,
      totalAttempts: 9,
    }
    const now = T0 + 3 * DAY
    const p = applyAttempt(before, true, now)
    expect(p.box).toBe(2) // promotion unique : pas box 3
    expect(p.nextReview).toBe(now + 7 * DAY)
  })

  it('pas de livelock : 8 réussites, 2 échecs (fenêtre 8/10 reste maîtrisée), puis révision réussie → box 1', () => {
    // La rétrogradation laisse box 0 + révision immédiate alors que l'état
    // reste « maitrise » (8/10 = 0.8) : la réussite suivante à échéance doit
    // pouvoir remonter depuis la box 0, sinon box et échéance gèlent à vie.
    const demoted = run([true, true, true, true, true, true, true, true, false, false])
    expect(demoted.box).toBe(0)
    expect(demoted.state).toBe('maitrise')
    const due = demoted.nextReview
    if (due === undefined) throw new Error('nextReview attendu')
    const now = due + 1000
    const p = applyAttempt(demoted, true, now)
    expect(p.box).toBe(1)
    expect(p.nextReview).toBe(now + 2 * DAY)
  })

  it('box 0 sans révision programmée (compétence neuve) → aucune promotion par révision', () => {
    const p = applyAttempt(undefined, true, T0)
    expect(p.box).toBe(0)
    expect(p.nextReview).toBeUndefined()
  })
})
