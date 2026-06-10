import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  applyRun,
  areConfusable,
  buildSequence,
  buildUnit,
  checkFill,
  COLOR_KINDS,
  countSolutions,
  distinctLetters,
  FRESH_PROGRESS,
  generateItem,
  holesCountFor,
  intruderCountFor,
  isFillComplete,
  isPeriodicWith,
  isUniquelySolvable,
  ITEMS_PER_RUN,
  itemSignature,
  MAX_TUNER_LEVEL,
  patternsFor,
  periodGroup,
  repsFor,
  SHAPE_KINDS,
  starsFor,
  SYMBOL_KINDS,
  TIER_COUNT,
  TIER_SKILLS,
  validPeriods,
} from './logic'
import type { BeadKind, CdpItem, CdpProgress, TierId } from './logic'

const DRAWS = 150
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, 1, MAX_TUNER_LEVEL]

function draws(tier: TierId, n = DRAWS, level = 0): CdpItem[] {
  return Array.from({ length: n }, () => generateItem(tier, [], level))
}

/** Le remplissage exact attendu pour un item. */
function trueFill(item: CdpItem): Record<number, BeadKind> {
  return Object.fromEntries(item.holes.map((i) => [i, item.sequence[i]]))
}

// ============================================================
// Briques pures
// ============================================================

describe('buildUnit / buildSequence / distinctLetters', () => {
  it('instancie un patron abstrait avec des perles concrètes', () => {
    expect(buildUnit('AAB', ['rouge', 'bleu'])).toEqual(['rouge', 'rouge', 'bleu'])
    expect(buildUnit('ABC', ['rouge', 'bleu', 'vert'])).toEqual(['rouge', 'bleu', 'vert'])
    expect(buildUnit('AABB', ['jaune', 'vert'])).toEqual(['jaune', 'jaune', 'vert', 'vert'])
  })

  it('buildSequence répète l’unité exactement reps fois', () => {
    expect(buildSequence(['a', 'b'], 4)).toEqual(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'])
    expect(buildSequence(['a', 'a', 'b'], 3)).toHaveLength(9)
  })

  it('distinctLetters préserve l’ordre de première apparition', () => {
    expect(distinctLetters('AABC')).toEqual(['A', 'B', 'C'])
    expect(distinctLetters('ABB')).toEqual(['A', 'B'])
  })

  it('repsFor garde le collier entre 8 et 9 perles', () => {
    expect(repsFor(2) * 2).toBe(8)
    expect(repsFor(3) * 3).toBe(9)
    expect(repsFor(4) * 4).toBe(8)
  })
})

describe('isPeriodicWith / validPeriods', () => {
  it('reconnaît la périodicité réelle et rejette le reste', () => {
    expect(isPeriodicWith(['a', 'b', 'a', 'b'], 2)).toBe(true)
    expect(isPeriodicWith(['a', 'a', 'b', 'b', 'a', 'a', 'b', 'b'], 4)).toBe(true)
    expect(isPeriodicWith(['a', 'a', 'b', 'b', 'a', 'a', 'b', 'b'], 2)).toBe(false)
    expect(isPeriodicWith(['a', 'b', 'a', 'a'], 2)).toBe(false)
  })

  it('une unité constante n’est jamais un motif', () => {
    expect(isPeriodicWith(['a', 'a', 'a', 'a'], 2)).toBe(false)
    expect(validPeriods(['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a'])).toEqual([])
  })

  it('p doit diviser la longueur', () => {
    expect(isPeriodicWith(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a'], 2)).toBe(false)
    expect(validPeriods(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c'])).toEqual([3])
  })

  it('AB sur 8 perles est périodique en 2 ET en 4 (même remplissage)', () => {
    expect(validPeriods(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'])).toEqual([2, 4])
  })
})

describe('countSolutions / isUniquelySolvable — le vérificateur brute-force', () => {
  const ab8 = ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']

  it('trous en fin de motif AB : une seule solution', () => {
    expect(countSolutions(ab8, [6, 7], ['a', 'b', 'x'])).toBe(1)
    expect(isUniquelySolvable(ab8, [6, 7], ['a', 'b', 'x'])).toBe(true)
  })

  it('détecte une vraie ambiguïté (période 4 parasite via les trous)', () => {
    // visible : a b _ b _ b _ _ → le remplissage x,a,x,a crée abxb abxa… non,
    // a b x b a b x b est périodique en 4 : DEUX solutions au moins.
    expect(countSolutions(ab8, [2, 4, 6, 7], ['a', 'b', 'x'])).toBeGreaterThan(1)
    expect(isUniquelySolvable(ab8, [2, 4, 6, 7], ['a', 'b', 'x'])).toBe(false)
  })

  it('une solution non périodique est rejetée d’office', () => {
    expect(isUniquelySolvable(['a', 'b', 'b', 'a', 'a', 'b'], [4, 5], ['a', 'b'])).toBe(false)
  })

  it('la solution vraie compte toujours parmi les remplissages valides', () => {
    const aab9 = ['a', 'a', 'b', 'a', 'a', 'b', 'a', 'a', 'b']
    expect(countSolutions(aab9, [5, 7, 8], ['a', 'b', 'x'])).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================
// Génération — invariants sur tous les paliers
// ============================================================

describe('generateItem — invariants communs (tous paliers × 150 tirages)', () => {
  it('séquence périodique avec l’unité, première période jamais trouée', () => {
    for (const tier of ALL_TIERS) {
      for (const item of draws(tier)) {
        expect(item.tier).toBe(tier)
        expect(item.sequence.length % item.unit.length).toBe(0)
        expect(isPeriodicWith(item.sequence, item.unit.length)).toBe(true)
        // En mode 'code', la rangée réponse est l'unité TRANSCRITE en symboles.
        const expectedFirstPeriod =
          item.mode === 'code' && item.symbolMap
            ? item.unit.map((k) => (item.symbolMap as Record<BeadKind, BeadKind>)[k])
            : item.unit
        expect(item.sequence.slice(0, item.unit.length)).toEqual(expectedFirstPeriod)
        expect(item.sequence.length).toBeGreaterThanOrEqual(8)
        expect(item.sequence.length).toBeLessThanOrEqual(9)
        for (const h of item.holes) {
          expect(h).toBeGreaterThanOrEqual(item.unit.length)
          expect(h).toBeLessThan(item.sequence.length)
        }
        expect([...item.holes]).toEqual([...item.holes].sort((a, b) => a - b))
        expect(new Set(item.holes).size).toBe(item.holes.length)
      }
    }
  })

  it('la palette contient TOUTES les perles nécessaires aux trous + ≥1 intrus', () => {
    for (const tier of ALL_TIERS) {
      for (const item of draws(tier)) {
        const needed = new Set(item.holes.map((i) => item.sequence[i]))
        for (const k of needed) expect(item.palette).toContain(k)
        const answerKinds = new Set(item.sequence)
        const intruders = item.palette.filter((k) => !answerKinds.has(k))
        expect(intruders.length).toBeGreaterThanOrEqual(1)
        expect(new Set(item.palette).size).toBe(item.palette.length)
      }
    }
  })

  it('les perles de l’unité ne sont jamais confusables entre elles', () => {
    for (const tier of ALL_TIERS) {
      for (const item of draws(tier)) {
        const kinds = [...new Set(item.unit)]
        for (let i = 0; i < kinds.length; i++) {
          for (let j = i + 1; j < kinds.length; j++) {
            expect(areConfusable(kinds[i], kinds[j])).toBe(false)
          }
        }
      }
    }
  })

  it('mode continue : les trous sont résolubles de façon UNIQUE', () => {
    for (const tier of [0, 1, 2] as const) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, 60, level)) {
          expect(item.mode).toBe('continue')
          expect(
            isUniquelySolvable(item.sequence, item.holes, item.palette),
            `ambigu : ${item.sequence.join(',')} trous ${item.holes.join(',')}`,
          ).toBe(true)
        }
      }
    }
  })
})

describe('generateItem — spécificités par palier', () => {
  it('T0 : motif AB, 2 couleurs, exactement 2 trous en fin de collier', () => {
    for (const item of draws(0)) {
      expect(item.unit).toHaveLength(2)
      expect(new Set(item.unit).size).toBe(2)
      for (const k of item.unit) expect(COLOR_KINDS).toContain(k)
      const len = item.sequence.length
      expect(item.holes).toEqual([len - 2, len - 1])
    }
  })

  it('T1 : motifs AAB/ABB/AABB, 3 trous, et parfois un trou au MILIEU', () => {
    const items = draws(1)
    let middleSeen = 0
    for (const item of items) {
      const pattern = item.unit
        .map((k) => String.fromCharCode(65 + [...new Set(item.unit)].indexOf(k)))
        .join('')
      expect(patternsFor(1)).toContain(pattern)
      expect(item.holes).toHaveLength(3)
      if (item.holes.some((h) => h < item.sequence.length - 3)) middleSeen++
    }
    expect(middleSeen).toBeGreaterThan(0)
    expect(middleSeen).toBeLessThan(items.length)
  })

  it('T2 : motifs ABC/AABC, formes ET couleurs, 3-4 trous dont un milieu', () => {
    for (const item of draws(2)) {
      expect([3, 4]).toContain(item.unit.length)
      expect(new Set(item.unit).size).toBe(3)
      const kinds = [...new Set(item.unit)]
      expect(kinds.some((k) => (SHAPE_KINDS as readonly string[]).includes(k))).toBe(true)
      expect(kinds.some((k) => (COLOR_KINDS as readonly string[]).includes(k))).toBe(true)
      expect(item.holes.length).toBeGreaterThanOrEqual(3)
      expect(item.holes.length).toBeLessThanOrEqual(4)
      expect(item.holes.some((h) => h <= item.sequence.length - 3)).toBe(true)
    }
    // au niveau 1+ du Tuner : 4 trous
    for (const item of draws(2, 40, 1)) expect(item.holes).toHaveLength(4)
  })

  it('T3 : transcription perles ↔ symboles, correspondance exacte position à position', () => {
    const items = draws(3)
    const modes = new Set(items.map((i) => i.mode))
    expect(modes.has('code') || modes.has('decode')).toBe(true)
    for (const item of items) {
      expect(['code', 'decode']).toContain(item.mode)
      expect(item.reference).not.toBeNull()
      expect(item.symbolMap).not.toBeNull()
      const reference = item.reference as BeadKind[]
      const map = item.symbolMap as Record<BeadKind, BeadKind>
      expect(reference).toHaveLength(item.sequence.length)
      // bijection perle → symbole
      const mapped = Object.values(map)
      expect(new Set(mapped).size).toBe(mapped.length)
      for (const s of mapped) expect(SYMBOL_KINDS).toContain(s)
      for (let i = 0; i < reference.length; i++) {
        if (item.mode === 'code') expect(item.sequence[i]).toBe(map[reference[i]])
        else expect(reference[i]).toBe(map[item.sequence[i]])
      }
      expect(item.holes).toHaveLength(3)
    }
  })

  it('T3 : la correspondance est toujours inférable (première période intacte)', () => {
    for (const item of draws(3, 80)) {
      const holeSet = new Set(item.holes)
      for (const h of item.holes) {
        const refKind = (item.reference as BeadKind[])[h]
        // une position visible porte la même perle de référence → la paire est lisible
        const visible = item.sequence.some(
          (_, i) => !holeSet.has(i) && (item.reference as BeadKind[])[i] === refKind,
        )
        expect(visible).toBe(true)
      }
    }
  })
})

describe('anti-répétition — avoid par signature', () => {
  it('une partie de 8 items ne répète jamais un motif (tous paliers × 30 parties)', () => {
    for (const tier of ALL_TIERS) {
      for (let run = 0; run < 30; run++) {
        const used: string[] = []
        for (let i = 0; i < ITEMS_PER_RUN; i++) {
          const item = generateItem(tier, used)
          expect(used).not.toContain(itemSignature(item))
          used.push(itemSignature(item))
        }
        expect(new Set(used).size).toBe(ITEMS_PER_RUN)
      }
    }
  })

  it('avoid saturé : retombe sur un item valide, jamais bloqué', () => {
    // on interdit énormément de signatures plausibles — la génération rend quand même un item
    const avoid = Array.from({ length: 500 }, (_, i) => `continue:fake-${i}`)
    const item = generateItem(0, avoid)
    expect(isPeriodicWith(item.sequence, item.unit.length)).toBe(true)
  })
})

// ============================================================
// Difficulté, validation, score
// ============================================================

describe('holesCountFor / intruderCountFor — crans du Tuner', () => {
  it('valeurs par palier et niveau', () => {
    expect(holesCountFor(0, 0)).toBe(2)
    expect(holesCountFor(0, 2)).toBe(2)
    expect(holesCountFor(1, 0)).toBe(3)
    expect(holesCountFor(2, 0)).toBe(3)
    expect(holesCountFor(2, 1)).toBe(4)
    expect(holesCountFor(3, 2)).toBe(3)
    expect(intruderCountFor(0, 0)).toBe(1)
    expect(intruderCountFor(0, 2)).toBe(2)
    expect(intruderCountFor(1, 0)).toBe(1)
    expect(intruderCountFor(1, 1)).toBe(2)
  })

  it('niveaux hors bornes ou fractionnaires : clampés', () => {
    expect(holesCountFor(2, -5)).toBe(3)
    expect(holesCountFor(2, 99)).toBe(4)
    expect(intruderCountFor(1, 1.9)).toBe(2)
  })
})

describe('checkFill / isFillComplete', () => {
  const item = generateItem(1)

  it('le remplissage exact est accepté, sans trou fautif', () => {
    const res = checkFill(item, trueFill(item))
    expect(res.ok).toBe(true)
    expect(res.wrongHoles).toEqual([])
    expect(isFillComplete(item, trueFill(item))).toBe(true)
  })

  it('une perle de travers : ok=false et SEUL ce trou est fautif', () => {
    const fill = trueFill(item)
    const culprit = item.holes[0]
    const wrong = item.palette.find((k) => k !== item.sequence[culprit])
    fill[culprit] = wrong as BeadKind
    const res = checkFill(item, fill)
    expect(res.ok).toBe(false)
    expect(res.wrongHoles).toEqual([culprit])
  })

  it('un trou vide compte comme fautif et le collier n’est pas complet', () => {
    const fill = trueFill(item)
    delete fill[item.holes[item.holes.length - 1]]
    expect(isFillComplete(item, fill)).toBe(false)
    expect(checkFill(item, fill).ok).toBe(false)
  })
})

describe('periodGroup — l’indice par groupes', () => {
  it('découpe le collier en périodes', () => {
    expect(periodGroup(0, 2)).toBe(0)
    expect(periodGroup(1, 2)).toBe(0)
    expect(periodGroup(2, 2)).toBe(1)
    expect(periodGroup(7, 2)).toBe(3)
    expect(periodGroup(5, 3)).toBe(1)
    expect(periodGroup(0, 0)).toBe(0)
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, ITEMS_PER_RUN)).toBe(3)
    expect(starsFor(7, ITEMS_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, ITEMS_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, ITEMS_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, ITEMS_PER_RUN)).toBe(1)
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
    let p: CdpProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('rejouer un palier déjà passé ne reverrouille jamais', () => {
    const p = applyRun({ bestStars: { 0: 3 }, unlockedTier: 2, runs: 3 }, 0, 1)
    expect(p.unlockedTier).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà de T3', () => {
    const p = applyRun({ bestStars: {}, unlockedTier: 3, runs: 0 }, 3, 3)
    expect(p.unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: CdpProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

// ============================================================
// Corpus, manifest, skill-map
// ============================================================

describe('corpus audio — couverture complète, préfixe cdp.', () => {
  it('ids valides, uniques, tous préfixés cdp., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('cdp.')).toBe(true)
      expect(['denise', 'eloise', 'henri']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('tous les clips utilisés par le jeu existent', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const id of [
      'cdp.intro',
      'cdp.consigne.continue',
      'cdp.consigne.code',
      'cdp.consigne.decode',
      'cdp.fini',
      'cdp.bravo',
      'cdp.presque',
      'cdp.ecoute',
      'cdp.reessaie',
      'cdp.indice',
      'cdp.niveau.0',
      'cdp.niveau.1',
      'cdp.niveau.2',
      'cdp.niveau.3',
    ]) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('un skill par palier, tous connus du skill-map', () => {
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect([...TIER_SKILLS]).toEqual([
      'lo.gs.motifs.suite',
      'lo.gs.motifs.suite',
      'lo.gs.motifs.suite',
      'lo.gs.motifs.creer',
    ])
    for (const id of TIER_SKILLS) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('le manifest déclare exactement les skills des paliers', () => {
    const meta = GAMES_BY_ID.get('collier-de-perles')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(meta.skills).toEqual([...new Set(TIER_SKILLS)])
    expect(meta.island).toBe('robots')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('📿')
    expect(meta.accent).toBe('#5c6bc0')
  })
})
