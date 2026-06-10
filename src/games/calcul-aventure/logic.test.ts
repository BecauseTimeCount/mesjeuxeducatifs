import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  applyRun,
  checkAnswer,
  FRESH_PROGRESS,
  generateItem,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  neededPlacements,
  starsFor,
  TIER_SKILLS,
  TIER_SPECS,
} from './logic'
import type { CavItem, CavProgress, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, MAX_TUNER_LEVEL]

function draws(tier: TierId, level: number, n = DRAWS): CavItem[] {
  return Array.from({ length: n }, () => generateItem(tier, level))
}

/** Item construit à la main pour tester la validation seule. */
function manualItem(partial: Partial<CavItem> & Pick<CavItem, 'answer'>): CavItem {
  return {
    tier: 0,
    op: 'add',
    a: 1,
    b: partial.answer - 1,
    main: partial.answer,
    skill: 'ma.cp.add10',
    ...partial,
  }
}

describe('generateItem — invariants communs (tous paliers, tous niveaux)', () => {
  it('arithmétique exacte, opérandes ≥ 1, JAMAIS de résultat négatif', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          expect(Number.isInteger(item.a)).toBe(true)
          expect(Number.isInteger(item.b)).toBe(true)
          expect(item.a).toBeGreaterThanOrEqual(1)
          expect(item.b).toBeGreaterThanOrEqual(1)
          if (item.op === 'add') {
            expect(item.answer).toBe(item.a + item.b)
            expect(item.main).toBe(item.a + item.b)
          } else {
            // soustraction : diminuende toujours ≥ soustracteur
            expect(item.a).toBeGreaterThanOrEqual(item.b)
            expect(item.answer).toBe(item.a - item.b)
            expect(item.main).toBe(item.a)
          }
          expect(item.answer).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })

  it('le « grand nombre » respecte la plage du palier × niveau de Tuner', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        const [lo, hi] = TIER_SPECS[tier].mainRanges[level]
        for (const item of draws(tier, level)) {
          expect(item.main).toBeGreaterThanOrEqual(lo)
          expect(item.main).toBeLessThanOrEqual(hi)
        }
      }
    }
  })

  it('chaque item est résoluble : la réponse exacte valide toujours', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          expect(checkAnswer(item, String(item.answer))).toBe(true)
        }
      }
    }
  })

  it('un niveau de Tuner hors bornes est ramené dans [0..MAX]', () => {
    for (let i = 0; i < 50; i++) {
      const low = generateItem(0, -3)
      const high = generateItem(0, 99)
      const [lo0, hi0] = TIER_SPECS[0].mainRanges[0]
      const [lo1, hi1] = TIER_SPECS[0].mainRanges[MAX_TUNER_LEVEL]
      expect(low.main).toBeGreaterThanOrEqual(lo0)
      expect(low.main).toBeLessThanOrEqual(hi0)
      expect(high.main).toBeGreaterThanOrEqual(lo1)
      expect(high.main).toBeLessThanOrEqual(hi1)
    }
  })
})

describe('palier T0 — Les paniers (additions ≤ 10, concret)', () => {
  it('toujours une addition de skill ma.cp.add10, sommes ≤ 6 puis ≤ 10', () => {
    for (const level of ALL_LEVELS) {
      const cap = level === 0 ? 6 : 10
      for (const item of draws(0, level)) {
        expect(item.op).toBe('add')
        expect(item.skill).toBe('ma.cp.add10')
        expect(item.answer).toBeLessThanOrEqual(cap)
        expect(neededPlacements(item)).toBe(item.a + item.b)
      }
    }
  })
})

describe('palier T1 — Le singe chapardeur (soustractions ≤ 10)', () => {
  it('toujours une soustraction de skill ma.cp.sous10, panier ≤ 6 puis ≤ 10', () => {
    for (const level of ALL_LEVELS) {
      const cap = level === 0 ? 6 : 10
      for (const item of draws(1, level)) {
        expect(item.op).toBe('sub')
        expect(item.skill).toBe('ma.cp.sous10')
        expect(item.a).toBeLessThanOrEqual(cap)
        expect(item.b).toBeLessThan(item.a)
        // l'enfant donne exactement b objets au singe
        expect(neededPlacements(item)).toBe(item.b)
      }
    }
  })
})

describe('palier T2 — La boîte de dix (additions 11..20)', () => {
  it('franchit TOUJOURS la dizaine : a ≤ 10, b ≤ 10 et a + b ≥ 11', () => {
    for (const level of ALL_LEVELS) {
      const cap = level === 0 ? 14 : 20
      for (const item of draws(2, level)) {
        expect(item.op).toBe('add')
        expect(item.skill).toBe('ma.cp.add20')
        expect(item.a).toBeLessThanOrEqual(10)
        expect(item.b).toBeLessThanOrEqual(10)
        expect(item.answer).toBeGreaterThanOrEqual(11)
        expect(item.answer).toBeLessThanOrEqual(cap)
      }
    }
  })
})

describe('palier T3 — Le calcul de tête (mixte ≤ 20, abstrait)', () => {
  it('mélange réellement additions et soustractions dans les tirages', () => {
    for (const level of ALL_LEVELS) {
      const items = draws(3, level)
      expect(items.some((i) => i.op === 'add')).toBe(true)
      expect(items.some((i) => i.op === 'sub')).toBe(true)
    }
  })

  it('mapping de compétence exact selon l’opération et la plage', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(3, level)) {
        if (item.op === 'add') {
          expect(item.skill).toBe(item.main > 10 ? 'ma.cp.add20' : 'ma.cp.add10')
        } else {
          expect(item.skill).toBe(item.main > 10 ? 'ma.cp.sous20' : 'ma.cp.sous10')
        }
      }
    }
  })

  it('plages : ≤ 14 au niveau 0, ≤ 20 au niveau 1 ; opérandes raisonnables CP', () => {
    for (const level of ALL_LEVELS) {
      const cap = level === 0 ? 14 : 20
      for (const item of draws(3, level)) {
        expect(item.main).toBeLessThanOrEqual(cap)
        if (item.op === 'add') {
          expect(item.a).toBeLessThanOrEqual(10)
          expect(item.b).toBeLessThanOrEqual(10)
        } else {
          expect(item.b).toBeLessThanOrEqual(9)
        }
        // pas d'objets à manipuler : NumPad direct
        expect(neededPlacements(item)).toBe(0)
      }
    }
  })
})

describe('avoid — jamais deux fois le même calcul de suite', () => {
  it('T0 niveau 0 : le grand nombre évité ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(0, 0, 5).main).not.toBe(5)
  })

  it('T1 niveau 1 : le panier de départ évité ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(1, 1, 8).main).not.toBe(8)
  })

  it('T2 niveau 0 : la somme évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(2, 0, 12).main).not.toBe(12)
  })

  it('T3 niveau 1 : le grand nombre évité ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) expect(generateItem(3, 1, 13).main).not.toBe(13)
  })

  it('avoid hors plage : la génération reste valide', () => {
    for (let i = 0; i < 50; i++) {
      const item = generateItem(0, 0, 99)
      expect(item.main).toBeGreaterThanOrEqual(3)
      expect(item.main).toBeLessThanOrEqual(6)
    }
  })
})

describe('checkAnswer — validation de la saisie NumPad', () => {
  it('accepte la réponse exacte, y compris avec un zéro de tête', () => {
    const item = manualItem({ answer: 7 })
    expect(checkAnswer(item, '7')).toBe(true)
    expect(checkAnswer(item, '07')).toBe(true)
  })

  it('refuse une réponse différente, vide ou non numérique', () => {
    const item = manualItem({ answer: 7 })
    expect(checkAnswer(item, '8')).toBe(false)
    expect(checkAnswer(item, '17')).toBe(false)
    expect(checkAnswer(item, '')).toBe(false)
    expect(checkAnswer(item, ' 7')).toBe(false)
    expect(checkAnswer(item, '7a')).toBe(false)
  })

  it('réponses à deux chiffres', () => {
    const item = manualItem({ answer: 14 })
    expect(checkAnswer(item, '14')).toBe(true)
    expect(checkAnswer(item, '4')).toBe(false)
    expect(checkAnswer(item, '41')).toBe(false)
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
    let p: CavProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà de T3', () => {
    const p = applyRun({ bestStars: {}, unlockedTier: 3, runs: 0 }, 3, 3)
    expect(p.unlockedTier).toBe(3)
  })

  it('un déblocage déjà acquis ne régresse jamais', () => {
    const p = applyRun({ bestStars: { 2: 3 }, unlockedTier: 3, runs: 5 }, 0, 1)
    expect(p.unlockedTier).toBe(3)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: CavProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('chaque skill de TIER_SKILLS existe dans le SKILL_MAP', () => {
    for (const skill of TIER_SKILLS) {
      expect(SKILLS_BY_ID.has(skill)).toBe(true)
    }
  })

  it('TIER_SKILLS correspond aux skills du manifest (une fois l’entrée câblée)', () => {
    // L'entrée manifest est câblée par l'orchestrateur après ce jeu :
    // on ne valide l'égalité que si elle existe déjà.
    const meta = GAMES_BY_ID.get('calcul-aventure')
    if (meta) expect(meta.skills).toEqual([...TIER_SKILLS])
  })
})
