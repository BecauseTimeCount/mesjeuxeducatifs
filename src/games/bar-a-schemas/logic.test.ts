import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  applyRun,
  buildSlots,
  computeAnswer,
  correctRolesFor,
  drawNumbers,
  FRESH_PROGRESS,
  generateItem,
  isAnswerCorrect,
  isModelComplete,
  isPlacementValid,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  naiveKeywordAnswer,
  starsFor,
  TEMPLATES,
  TEMPLATES_BY_TIER,
  TIER_SKILLS,
  TIER_TOTAL_CAP,
  TIER_TYPES,
  unknownRole,
} from './logic'
import type { BscItem, BscProgress, Placement, ProblemType, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, MAX_TUNER_LEVEL]

function draws(tier: TierId, level: number, n = DRAWS): BscItem[] {
  return Array.from({ length: n }, () => generateItem(tier, level))
}

/** Item construit à la main (premier template du type) pour tester la validation seule. */
function manualItem(type: ProblemType, a: number, b: number): BscItem {
  const template = TEMPLATES.find((t) => t.type === type)
  if (!template) throw new Error(`aucun template de type ${type}`)
  return {
    tier: template.tier,
    template,
    a,
    b,
    answer: computeAnswer(type, a, b),
    slots: buildSlots(type, a, b),
    tiles: [a, b],
  }
}

/** Résolution INDÉPENDANTE du placement : pose chaque tuile sur un rôle valide. */
function solvePlacement(item: BscItem): Placement {
  let placed: Placement = {}
  for (const v of item.tiles) {
    const roles = correctRolesFor(item, v, placed)
    expect(roles.length).toBeGreaterThan(0)
    placed = { ...placed, [roles[0]]: v }
  }
  return placed
}

// ------------------------------------------------------------
// Invariants de génération
// ------------------------------------------------------------

describe('generateItem — invariants communs (tous paliers, tous niveaux)', () => {
  it('chaque item est TOUJOURS résoluble : tuiles plaçables, schéma complet, réponse exacte', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          const placed = solvePlacement(item)
          expect(isModelComplete(item, placed)).toBe(true)
          expect(isAnswerCorrect(item, item.answer)).toBe(true)
          expect(() => unknownRole(item)).not.toThrow()
        }
      }
    }
  })

  it('nombres ≥ 2, réponse dans [2..20], plafond du « tout » respecté par palier', () => {
    // ≥ 2 : le clip nu « nombre.1 » casserait genre et accords dans l'audio assemblé.
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          expect(Number.isInteger(item.a)).toBe(true)
          expect(Number.isInteger(item.b)).toBe(true)
          expect(item.a).toBeGreaterThanOrEqual(2)
          expect(item.b).toBeGreaterThanOrEqual(2)
          expect(item.answer).toBeGreaterThanOrEqual(2)
          expect(item.answer).toBeLessThanOrEqual(20)
          for (const slot of item.slots) {
            const v = slot.value ?? item.answer
            expect(v).toBeLessThanOrEqual(TIER_TOTAL_CAP[tier])
          }
        }
      }
    }
  })

  it('les tuiles proposées sont EXACTEMENT les nombres connus de l’énoncé', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          expect([...item.tiles].sort((x, y) => x - y)).toEqual(
            [item.a, item.b].sort((x, y) => x - y),
          )
        }
      }
    }
  })

  it('exactement un emplacement « ? », template et type du bon palier', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          expect(item.slots.filter((s) => s.value === null)).toHaveLength(1)
          expect(item.template.tier).toBe(tier)
          expect(TIER_TYPES[tier]).toContain(item.template.type)
        }
      }
    }
  })
})

describe('avoid — jamais deux fois le même template de suite', () => {
  it('le template évité ne ressort jamais (tous paliers)', () => {
    for (const tier of ALL_TIERS) {
      const avoid = TEMPLATES_BY_TIER[tier][0].id
      for (let i = 0; i < 100; i++) {
        expect(generateItem(tier, 0, avoid).template.id).not.toBe(avoid)
      }
    }
  })

  it('avoid inconnu : la génération reste valide', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateItem(0, 0, 'template-fantome').template.tier).toBe(0)
    }
  })
})

// ------------------------------------------------------------
// Cohérence arithmétique de CHAQUE type
// ------------------------------------------------------------

describe('cohérence arithmétique par type (drawNumbers × computeAnswer)', () => {
  it('parties-tout : les parties somment au tout', () => {
    for (const level of ALL_LEVELS) {
      for (let i = 0; i < DRAWS; i++) {
        const { a, b } = drawNumbers('parties-tout', level)
        expect(computeAnswer('parties-tout', a, b)).toBe(a + b)
        expect(a + b).toBeLessThanOrEqual(10)
      }
    }
  })

  it('transformation : initial ± changement = final, et il reste toujours au moins 2', () => {
    for (const level of ALL_LEVELS) {
      for (let i = 0; i < DRAWS; i++) {
        const gain = drawNumbers('transfo-gain', level)
        expect(computeAnswer('transfo-gain', gain.a, gain.b)).toBe(gain.a + gain.b)
        expect(gain.a + gain.b).toBeLessThanOrEqual(12)
        expect(gain.b).toBeGreaterThanOrEqual(2)
        const perte = drawNumbers('transfo-perte', level)
        expect(computeAnswer('transfo-perte', perte.a, perte.b)).toBe(perte.a - perte.b)
        expect(perte.a - perte.b).toBeGreaterThanOrEqual(2)
        expect(perte.b).toBeGreaterThanOrEqual(2)
        expect(perte.a).toBeLessThanOrEqual(12)
      }
    }
  })

  it('partie cachée : partie connue + partie cachée = tout (≤ 15)', () => {
    for (const level of ALL_LEVELS) {
      for (let i = 0; i < DRAWS; i++) {
        const { a, b } = drawNumbers('partie-cachee', level)
        const hidden = computeAnswer('partie-cachee', a, b)
        expect(b + hidden).toBe(a)
        expect(b).toBeLessThan(a)
        expect(b).toBeGreaterThanOrEqual(2)
        expect(hidden).toBeGreaterThanOrEqual(2)
        expect(a).toBeLessThanOrEqual(15)
      }
    }
  })

  it('comparaison concordante : la différence est correcte (collections ≤ 20)', () => {
    for (const level of ALL_LEVELS) {
      for (let i = 0; i < DRAWS; i++) {
        const { a, b } = drawNumbers('compare-diff', level)
        expect(computeAnswer('compare-diff', a, b)).toBe(a - b)
        expect(a).toBeGreaterThan(b)
        expect(a).toBeLessThanOrEqual(20)
        expect(a - b).toBeGreaterThanOrEqual(2)
        expect(b).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('DISCORDANT « de plus » : la réponse est correcte et N’EST PAS l’addition naïve', () => {
    for (const level of ALL_LEVELS) {
      for (let i = 0; i < DRAWS; i++) {
        const { a, b } = drawNumbers('compare-plus', level)
        const answer = computeAnswer('compare-plus', a, b)
        // « Il en a b de plus que l'autre » → l'autre en a a − b
        expect(answer + b).toBe(a)
        expect(answer).toBeGreaterThanOrEqual(2)
        expect(answer).not.toBe(naiveKeywordAnswer('compare-plus', a, b))
      }
    }
  })

  it('DISCORDANT « de moins » : la réponse est correcte et N’EST PAS la soustraction naïve', () => {
    for (const level of ALL_LEVELS) {
      for (let i = 0; i < DRAWS; i++) {
        const { a, b } = drawNumbers('compare-moins', level)
        const answer = computeAnswer('compare-moins', a, b)
        // « Il en a b de moins que l'autre » → l'autre en a a + b
        expect(answer - b).toBe(a)
        expect(answer).toBeLessThanOrEqual(20)
        expect(answer).not.toBe(naiveKeywordAnswer('compare-moins', a, b))
      }
    }
  })

  it('naiveKeywordAnswer : null pour les types non discordants', () => {
    expect(naiveKeywordAnswer('parties-tout', 3, 4)).toBeNull()
    expect(naiveKeywordAnswer('transfo-gain', 3, 4)).toBeNull()
    expect(naiveKeywordAnswer('partie-cachee', 8, 3)).toBeNull()
    expect(naiveKeywordAnswer('compare-diff', 9, 6)).toBeNull()
    expect(naiveKeywordAnswer('compare-plus', 9, 3)).toBe(12)
    expect(naiveKeywordAnswer('compare-moins', 6, 3)).toBe(3)
  })
})

describe('niveaux du Tuner — plages resserrées (0) et élargies (1)', () => {
  it('niveau 0 : plages resserrées par type', () => {
    for (let i = 0; i < DRAWS; i++) {
      const pt = drawNumbers('parties-tout', 0)
      expect(pt.a + pt.b).toBeLessThanOrEqual(8)
      const g = drawNumbers('transfo-gain', 0)
      expect(g.a + g.b).toBeLessThanOrEqual(10)
      expect(drawNumbers('partie-cachee', 0).a).toBeLessThanOrEqual(10)
      expect(drawNumbers('compare-diff', 0).a).toBeLessThanOrEqual(10)
      const cm = drawNumbers('compare-moins', 0)
      expect(cm.a + cm.b).toBeLessThanOrEqual(12)
    }
  })

  it('le niveau est borné : hors plage, il est ramené à [0..MAX_TUNER_LEVEL]', () => {
    for (let i = 0; i < 50; i++) {
      const low = drawNumbers('parties-tout', -5)
      expect(low.a + low.b).toBeLessThanOrEqual(8)
      const high = drawNumbers('partie-cachee', 99)
      expect(high.a).toBeLessThanOrEqual(15)
    }
  })
})

// ------------------------------------------------------------
// Validation du placement (phase MODÉLISER)
// ------------------------------------------------------------

describe('isPlacementValid — parties-tout : les deux ordres sont acceptés', () => {
  it('chaque partie accepte chacune des deux valeurs', () => {
    const item = manualItem('parties-tout', 3, 5)
    expect(isPlacementValid(item, 'part1', 3, {})).toBe(true)
    expect(isPlacementValid(item, 'part1', 5, {})).toBe(true)
    expect(isPlacementValid(item, 'part2', 3, {})).toBe(true)
    expect(isPlacementValid(item, 'part2', 5, {})).toBe(true)
  })

  it('ordre inversé complet : 3 dans part2 puis 5 dans part1', () => {
    const item = manualItem('parties-tout', 3, 5)
    expect(isPlacementValid(item, 'part2', 3, {})).toBe(true)
    expect(isPlacementValid(item, 'part1', 5, { part2: 3 })).toBe(true)
    expect(isModelComplete(item, { part1: 5, part2: 3 })).toBe(true)
  })

  it('après avoir posé une valeur, elle n’est plus attendue dans le groupe', () => {
    const item = manualItem('parties-tout', 3, 5)
    expect(isPlacementValid(item, 'part1', 3, { part2: 3 })).toBe(false)
    expect(isPlacementValid(item, 'part1', 5, { part2: 3 })).toBe(true)
  })

  it('parties égales (4 et 4) : les deux emplacements acceptent 4', () => {
    const item = manualItem('parties-tout', 4, 4)
    expect(isPlacementValid(item, 'part1', 4, {})).toBe(true)
    expect(isPlacementValid(item, 'part2', 4, { part1: 4 })).toBe(true)
  })

  it('jamais sur l’inconnue « ? » ni sur un emplacement déjà rempli', () => {
    const item = manualItem('parties-tout', 3, 5)
    expect(isPlacementValid(item, 'whole', 3, {})).toBe(false)
    expect(isPlacementValid(item, 'part1', 5, { part1: 3 })).toBe(false)
  })

  it('un rôle étranger au schéma est refusé', () => {
    const item = manualItem('parties-tout', 3, 5)
    expect(isPlacementValid(item, 'diff', 3, {})).toBe(false)
  })
})

describe('isPlacementValid — partie cachée : le piège « le tout dans une partie »', () => {
  const item = manualItem('partie-cachee', 8, 3)

  it('le tout va en haut, la partie connue en bas', () => {
    expect(isPlacementValid(item, 'whole', 8, {})).toBe(true)
    expect(isPlacementValid(item, 'part1', 3, {})).toBe(true)
  })

  it('poser le TOUT dans une partie est refusé', () => {
    expect(isPlacementValid(item, 'part1', 8, {})).toBe(false)
    expect(isPlacementValid(item, 'part2', 8, {})).toBe(false) // part2 = « ? »
  })

  it('poser la partie dans le tout est refusé', () => {
    expect(isPlacementValid(item, 'whole', 3, {})).toBe(false)
  })

  it('l’inconnue est la partie cachée', () => {
    expect(unknownRole(item)).toBe('part2')
  })
})

describe('isPlacementValid — transformation : départ et flèche ne sont pas interchangeables', () => {
  const item = manualItem('transfo-gain', 5, 3)

  it('chaque nombre va à son emplacement conceptuel', () => {
    expect(isPlacementValid(item, 'start', 5, {})).toBe(true)
    expect(isPlacementValid(item, 'change', 3, {})).toBe(true)
    expect(isPlacementValid(item, 'start', 3, {})).toBe(false)
    expect(isPlacementValid(item, 'change', 5, {})).toBe(false)
    expect(isPlacementValid(item, 'end', 5, {})).toBe(false) // « ? »
  })

  it('valeurs égales (4 et 4) : les deux emplacements acceptent 4', () => {
    const twin = manualItem('transfo-gain', 4, 4)
    expect(isPlacementValid(twin, 'start', 4, {})).toBe(true)
    expect(isPlacementValid(twin, 'change', 4, { start: 4 })).toBe(true)
  })

  it('l’inconnue est la barre d’après', () => {
    expect(unknownRole(item)).toBe('end')
    expect(unknownRole(manualItem('transfo-perte', 8, 3))).toBe('end')
  })
})

describe('isPlacementValid — comparaison (concordante et discordante)', () => {
  it('concordante : chaque collection sur sa barre, l’écart est l’inconnue', () => {
    const item = manualItem('compare-diff', 9, 6)
    expect(isPlacementValid(item, 'heroBar', 9, {})).toBe(true)
    expect(isPlacementValid(item, 'rivalBar', 6, {})).toBe(true)
    expect(isPlacementValid(item, 'heroBar', 6, {})).toBe(false)
    expect(isPlacementValid(item, 'diff', 6, {})).toBe(false) // « ? »
    expect(unknownRole(item)).toBe('diff')
  })

  it('discordante « de plus » : le 2ᵉ nombre va sur l’écart, PAS sur la barre de l’autre', () => {
    const item = manualItem('compare-plus', 9, 3)
    expect(isPlacementValid(item, 'heroBar', 9, {})).toBe(true)
    expect(isPlacementValid(item, 'diff', 3, {})).toBe(true)
    expect(isPlacementValid(item, 'rivalBar', 3, {})).toBe(false) // « ? » : le piège
    expect(isPlacementValid(item, 'heroBar', 3, {})).toBe(false)
    expect(isPlacementValid(item, 'diff', 9, {})).toBe(false)
    expect(unknownRole(item)).toBe('rivalBar')
  })

  it('discordante « de moins » : même schéma, la barre inconnue est la plus longue', () => {
    const item = manualItem('compare-moins', 6, 3)
    expect(item.answer).toBe(9)
    expect(isPlacementValid(item, 'heroBar', 6, {})).toBe(true)
    expect(isPlacementValid(item, 'diff', 3, {})).toBe(true)
    expect(unknownRole(item)).toBe('rivalBar')
  })
})

describe('correctRolesFor / isModelComplete', () => {
  it('liste les emplacements valides puis se réduit après chaque pose', () => {
    const item = manualItem('parties-tout', 3, 5)
    expect(correctRolesFor(item, 3, {})).toEqual(['part1', 'part2'])
    expect(correctRolesFor(item, 5, { part2: 3 })).toEqual(['part1'])
    expect(correctRolesFor(item, 99, {})).toEqual([])
  })

  it('le schéma n’est complet que quand tous les emplacements connus sont remplis', () => {
    const item = manualItem('transfo-perte', 8, 3)
    expect(isModelComplete(item, {})).toBe(false)
    expect(isModelComplete(item, { start: 8 })).toBe(false)
    expect(isModelComplete(item, { start: 8, change: 3 })).toBe(true)
  })
})

describe('isAnswerCorrect — phase CALCULER', () => {
  it('seule la valeur exacte de l’inconnue est acceptée', () => {
    const item = manualItem('partie-cachee', 8, 3)
    expect(isAnswerCorrect(item, 5)).toBe(true)
    expect(isAnswerCorrect(item, 4)).toBe(false)
    expect(isAnswerCorrect(item, 6)).toBe(false)
    expect(isAnswerCorrect(item, 8)).toBe(false)
  })
})

// ------------------------------------------------------------
// Score & progression
// ------------------------------------------------------------

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
    let p: BscProgress = { ...FRESH_PROGRESS }
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
    const before: BscProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

// ------------------------------------------------------------
// Templates & corpus
// ------------------------------------------------------------

describe('templates — inventaire et cohérence', () => {
  it('au moins 5 templates par palier, ids uniques', () => {
    for (const tier of ALL_TIERS) {
      expect(TEMPLATES_BY_TIER[tier].length).toBeGreaterThanOrEqual(5)
    }
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('T3 contient des énoncés concordants ET discordants (plus et moins)', () => {
    const types = TEMPLATES_BY_TIER[3].map((t) => t.type)
    expect(types).toContain('compare-diff')
    expect(types).toContain('compare-plus')
    expect(types).toContain('compare-moins')
  })

  it('chaque template a le type de son palier et les comparaisons ont un rival', () => {
    for (const t of TEMPLATES) {
      expect(TIER_TYPES[t.tier]).toContain(t.type)
      if (t.tier === 3) expect(t.emoji.rival).toBeDefined()
    }
  })

  it('chaque template utilise les deux nombres entendus (a et b) et la réponse', () => {
    for (const t of TEMPLATES) {
      const nums = [...t.fragments, ...t.question]
        .filter((f) => 'num' in f)
        .map((f) => ('num' in f ? f.num : ''))
      expect(nums).toEqual(['a', 'b'])
      const answerNums = t.answer.filter((f) => 'num' in f)
      expect(answerNums).toEqual([{ num: 'answer' }])
    }
  })

  it('tous les clips référencés existent dans corpus.json', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const t of TEMPLATES) {
      for (const f of [...t.fragments, ...t.question, ...t.answer]) {
        if ('clip' in f) expect(known.has(f.clip), `clip manquant : ${f.clip}`).toBe(true)
      }
    }
  })

  it('corpus : ids valides, uniques, préfixés bsc., voix connues', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('bsc.')).toBe(true)
      expect(e.text.length).toBeGreaterThan(0)
      expect(['denise', 'eloise', 'henri']).toContain(e.voice)
    }
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('les 4 compétences des paliers existent dans le skill-map', () => {
    expect([...TIER_SKILLS]).toEqual([
      'ma.cp.pb.partiestout',
      'ma.cp.pb.transfo',
      'ma.cp.pb.partie',
      'ma.cp.pb.compare',
    ])
    for (const id of TIER_SKILLS) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('TIER_SKILLS correspond au manifest (dès que l’entrée est câblée)', () => {
    const meta = GAMES_BY_ID.get('bar-a-schemas')
    if (meta) expect(meta.skills).toEqual([...TIER_SKILLS])
  })
})
