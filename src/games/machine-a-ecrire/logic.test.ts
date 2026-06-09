import { describe, expect, it } from 'vitest'
import corpus from './corpus.json'
import {
  CONSONANTS,
  DIGRAPHS,
  KEYBOARDS,
  REVIEW_MAX,
  REVIEW_QUEUE_CAP,
  RUN_LENGTH,
  TARGETS,
  TIER_SKILLS,
  VOWELS,
  correctPrefixLen,
  findTarget,
  generateRun,
  graphemeSlug,
  isDigraphKey,
  isPrefix,
  isVowelKey,
  keyClipId,
  keyboardRows,
  nextExpected,
  pushReview,
  starsFor,
  takeReview,
  targetClipId,
  validate,
  wordSlug,
  type MaeTier,
} from './logic'

const TIERS: readonly MaeTier[] = [0, 1, 2, 3]

// ============================================================
// (a) Chaque item généré est RÉSOLUBLE
// ============================================================

describe('banques de cibles — résolubilité', () => {
  it('la concaténation des graphèmes redonne exactement le mot', () => {
    for (const tier of TIERS) {
      for (const t of TARGETS[tier]) {
        expect(t.graphemes.join(''), `palier ${tier} : ${t.word}`).toBe(t.word)
      }
    }
  })

  it('chaque grapheme de chaque cible existe sur le clavier de son palier', () => {
    for (const tier of TIERS) {
      const keys = new Set(KEYBOARDS[tier])
      for (const t of TARGETS[tier]) {
        for (const g of t.graphemes) {
          expect(keys.has(g), `palier ${tier} : « ${g} » de ${t.word}`).toBe(true)
        }
      }
    }
  })

  it('aucun grapheme vide, aucune cible vide', () => {
    for (const tier of TIERS) {
      for (const t of TARGETS[tier]) {
        expect(t.word.length).toBeGreaterThan(0)
        expect(t.graphemes.length).toBeGreaterThan(0)
        expect(t.graphemes.every((g) => g.length > 0)).toBe(true)
      }
    }
  })

  it('les mots sont uniques au sein de chaque palier', () => {
    for (const tier of TIERS) {
      const words = TARGETS[tier].map((t) => t.word)
      expect(new Set(words).size).toBe(words.length)
    }
  })
})

// ============================================================
// (b) Contraintes propres à chaque palier
// ============================================================

describe('contraintes des paliers', () => {
  it('T0 : exactement les 6 voyelles, 1 grapheme chacune', () => {
    expect(TARGETS[0].map((t) => t.word)).toEqual([...VOWELS])
    for (const t of TARGETS[0]) {
      expect(t.kind).toBe('voyelle')
      expect(t.graphemes).toHaveLength(1)
    }
  })

  it('T1 : syllabes consonne + voyelle (2 graphèmes simples)', () => {
    expect(TARGETS[1].length).toBeGreaterThanOrEqual(20)
    const cons = new Set<string>(CONSONANTS)
    const vows = new Set<string>(VOWELS)
    for (const t of TARGETS[1]) {
      expect(t.kind).toBe('syllabe')
      expect(t.graphemes).toHaveLength(2)
      expect(cons.has(t.graphemes[0]), `${t.word} : attaque consonne`).toBe(true)
      expect(vows.has(t.graphemes[1]), `${t.word} : rime voyelle`).toBe(true)
    }
  })

  it('T2 : 2 à 4 graphèmes ; les syllabes contiennent un digraphe', () => {
    expect(TARGETS[2].length).toBeGreaterThanOrEqual(18)
    const dig = new Set<string>(DIGRAPHS)
    for (const t of TARGETS[2]) {
      expect(t.graphemes.length).toBeGreaterThanOrEqual(2)
      expect(t.graphemes.length).toBeLessThanOrEqual(4)
      if (t.kind === 'syllabe') {
        expect(t.graphemes.some((g) => dig.has(g)), `${t.word} : digraphe attendu`).toBe(true)
      }
    }
  })

  it('T2 : au moins 12 syllabes à digraphe ET au moins 4 petits mots', () => {
    const sylls = TARGETS[2].filter((t) => t.kind === 'syllabe')
    const mots = TARGETS[2].filter((t) => t.kind === 'mot')
    expect(sylls.length).toBeGreaterThanOrEqual(12)
    expect(mots.length).toBeGreaterThanOrEqual(4)
  })

  it('T3 : mots de 3 à 6 graphèmes, tous avec au moins un digraphe et un emoji', () => {
    expect(TARGETS[3].length).toBeGreaterThanOrEqual(18)
    const dig = new Set<string>(DIGRAPHS)
    for (const t of TARGETS[3]) {
      expect(t.kind).toBe('mot')
      expect(t.graphemes.length).toBeGreaterThanOrEqual(3)
      expect(t.graphemes.length).toBeLessThanOrEqual(6)
      expect(t.graphemes.some((g) => dig.has(g)), `${t.word} : digraphe attendu`).toBe(true)
      expect(t.emoji, `${t.word} : emoji indice de sens`).toBeTruthy()
    }
  })

  it('chaque palier déclare au moins une compétence du jeu', () => {
    for (const tier of TIERS) {
      expect(TIER_SKILLS[tier].length).toBeGreaterThan(0)
    }
  })

  it('claviers : T0 = 6 voyelles, T1 = 15, T2/T3 = 20 touches uniques', () => {
    expect(KEYBOARDS[0]).toHaveLength(6)
    expect(KEYBOARDS[1]).toHaveLength(15)
    expect(KEYBOARDS[2]).toHaveLength(20)
    expect(KEYBOARDS[3]).toEqual(KEYBOARDS[2])
    for (const tier of TIERS) {
      expect(new Set(KEYBOARDS[tier]).size).toBe(KEYBOARDS[tier].length)
    }
  })

  it('keyboardRows couvre exactement le clavier du palier', () => {
    for (const tier of TIERS) {
      expect(keyboardRows(tier).flat()).toEqual([...KEYBOARDS[tier]])
    }
  })

  it('isVowelKey / isDigraphKey classent correctement les touches', () => {
    expect(isVowelKey('é')).toBe(true)
    expect(isVowelKey('ch')).toBe(false)
    expect(isDigraphKey('ou')).toBe(true)
    expect(isDigraphKey('m')).toBe(false)
  })
})

// ============================================================
// Validation par séquence de graphèmes
// ============================================================

describe('validation', () => {
  const matin = findTarget(3, 'matin')
  if (!matin) throw new Error('cible « matin » absente du palier 3')

  it('la séquence canonique exacte valide', () => {
    expect(validate(['m', 'a', 't', 'in'], matin)).toBe(true)
  })

  it('même chaîne mais mauvaise segmentation (i+n au lieu de « in ») : refusé', () => {
    expect(['m', 'a', 't', 'i', 'n'].join('')).toBe('matin')
    expect(validate(['m', 'a', 't', 'i', 'n'], matin)).toBe(false)
  })

  it('trop court ou trop long : refusé', () => {
    expect(validate(['m', 'a', 't'], matin)).toBe(false)
    expect(validate(['m', 'a', 't', 'in', 'a'], matin)).toBe(false)
    expect(validate([], matin)).toBe(false)
  })

  it('correctPrefixLen compte les graphèmes bien placés au début', () => {
    expect(correctPrefixLen([], matin)).toBe(0)
    expect(correctPrefixLen(['m', 'a'], matin)).toBe(2)
    expect(correctPrefixLen(['m', 'o', 't'], matin)).toBe(1)
    expect(correctPrefixLen(['a', 'm'], matin)).toBe(0)
    expect(correctPrefixLen(['m', 'a', 't', 'in'], matin)).toBe(4)
  })

  it('isPrefix / nextExpected guident l’indice', () => {
    expect(isPrefix(['m', 'a'], matin)).toBe(true)
    expect(nextExpected(['m', 'a'], matin)).toBe('t')
    expect(nextExpected([], matin)).toBe('m')
    // frappe déviée → null (l’indice pointe la touche effacer)
    expect(isPrefix(['m', 'o'], matin)).toBe(false)
    expect(nextExpected(['m', 'o'], matin)).toBeNull()
    // cible complète → null (il ne reste qu’à imprimer)
    expect(nextExpected(['m', 'a', 't', 'in'], matin)).toBeNull()
  })
})

// ============================================================
// Génération procédurale d'une partie
// ============================================================

describe('generateRun', () => {
  it('produit toujours 8 items résolubles sur le clavier du palier', () => {
    for (const tier of TIERS) {
      const keys = new Set(KEYBOARDS[tier])
      for (let i = 0; i < 50; i++) {
        const { items } = generateRun(tier)
        expect(items).toHaveLength(RUN_LENGTH)
        for (const t of items) {
          expect(t.graphemes.every((g) => keys.has(g))).toBe(true)
        }
      }
    }
  })

  it('jamais deux items identiques d’affilée (même au palier 0, banque de 6)', () => {
    for (const tier of TIERS) {
      for (let i = 0; i < 100; i++) {
        const { items } = generateRun(tier)
        for (let k = 1; k < items.length; k++) {
          expect(items[k].word, `palier ${tier}, position ${k}`).not.toBe(items[k - 1].word)
        }
      }
    }
  })

  it('pas de doublon quand la banque est assez grande (paliers 1-3)', () => {
    for (const tier of [1, 2, 3] as const) {
      for (let i = 0; i < 50; i++) {
        const { items } = generateRun(tier)
        expect(new Set(items.map((t) => t.word)).size).toBe(items.length)
      }
    }
  })

  it('les révisions sont injectées en tête, max 3, comptées dans les 8', () => {
    const review = ['mouton', 'lapin', 'vache', 'savon']
    const { items, reviewCount } = generateRun(3, review)
    expect(reviewCount).toBe(REVIEW_MAX)
    expect(items).toHaveLength(RUN_LENGTH)
    expect(items.slice(0, 3).map((t) => t.word)).toEqual(['mouton', 'lapin', 'vache'])
  })

  it('les mots de révision inconnus du palier sont ignorés', () => {
    const { items, reviewCount } = generateRun(0, ['mouton', 'a', 'zzz'])
    expect(reviewCount).toBe(1)
    expect(items[0].word).toBe('a')
  })

  it('les révisions dupliquées ne sont injectées qu’une fois', () => {
    const { reviewCount, items } = generateRun(2, ['chou', 'chou', 'lune'])
    expect(reviewCount).toBe(2)
    expect(items[0].word).toBe('chou')
    expect(items[1].word).toBe('lune')
  })

  it('une révision ne réapparaît pas en doublon dans les items frais (paliers 1-3)', () => {
    for (let i = 0; i < 30; i++) {
      const { items } = generateRun(3, ['mouton'])
      expect(items.filter((t) => t.word === 'mouton')).toHaveLength(1)
    }
  })
})

// ============================================================
// File de répétition espacée
// ============================================================

describe('file de révision', () => {
  it('pushReview ajoute en fin, dédoublonne, plafonne', () => {
    expect(pushReview([], 'ma')).toEqual(['ma'])
    expect(pushReview(['ma', 'lo'], 'ma')).toEqual(['lo', 'ma'])
    const full = Array.from({ length: REVIEW_QUEUE_CAP }, (_, i) => `w${i}`)
    const pushed = pushReview(full, 'nouveau')
    expect(pushed).toHaveLength(REVIEW_QUEUE_CAP)
    expect(pushed[pushed.length - 1]).toBe('nouveau')
    expect(pushed[0]).toBe('w1')
  })

  it('takeReview prélève au plus 3 en tête et laisse le reste', () => {
    const { now, rest } = takeReview(['a', 'b', 'c', 'd', 'e'])
    expect(now).toEqual(['a', 'b', 'c'])
    expect(rest).toEqual(['d', 'e'])
    expect(takeReview([])).toEqual({ now: [], rest: [] })
    expect(takeReview(['x'])).toEqual({ now: ['x'], rest: [] })
  })
})

// ============================================================
// Étoiles — premiers essais uniquement
// ============================================================

describe('starsFor', () => {
  it('seuils 90 % / 70 %', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(7, 8)).toBe(2) // 87,5 %
    expect(starsFor(6, 8)).toBe(2) // 75 %
    expect(starsFor(5, 8)).toBe(1) // 62,5 %
    expect(starsFor(0, 8)).toBe(1)
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(7, 10)).toBe(2)
    expect(starsFor(0, 0)).toBe(1)
  })
})

// ============================================================
// Cohérence logic ↔ corpus.json
// ============================================================

describe('cohérence corpus', () => {
  const ids = new Set(corpus.entries.map((e) => e.id))
  const ID_RE = /^[a-z0-9][a-z0-9.-]*$/

  it('ids valides, uniques, préfixés mae.', () => {
    expect(ids.size).toBe(corpus.entries.length)
    for (const e of corpus.entries) {
      expect(e.id, e.id).toMatch(ID_RE)
      expect(e.id.startsWith('mae.'), e.id).toBe(true)
      expect(e.text.trim().length, e.id).toBeGreaterThan(0)
    }
  })

  it('chaque touche de chaque clavier a son clip mae.touche.*', () => {
    for (const tier of TIERS) {
      for (const g of KEYBOARDS[tier]) {
        expect(ids.has(keyClipId(g)), keyClipId(g)).toBe(true)
      }
    }
  })

  it('chaque cible de chaque palier a son clip mae.cible.* avec le mot exact en texte', () => {
    const byId = new Map(corpus.entries.map((e) => [e.id, e]))
    for (const tier of TIERS) {
      for (const t of TARGETS[tier]) {
        const entry = byId.get(targetClipId(t))
        expect(entry, targetClipId(t)).toBeDefined()
        expect(entry?.text).toBe(t.word)
      }
    }
  })

  it('les ids de cibles sont uniques (pas de collision de slug é→ee)', () => {
    const all = TIERS.flatMap((tier) => TARGETS[tier].map((t) => targetClipId(t)))
    expect(new Set(all).size).toBe(all.length)
  })

  it('consignes, paliers et réactions attendus présents', () => {
    const required = [
      'mae.consigne.intro',
      'mae.consigne.t0',
      'mae.consigne.t1',
      'mae.consigne.t2',
      'mae.consigne.t3',
      'mae.consigne.verrouille',
      'mae.palier.t0',
      'mae.palier.t1',
      'mae.palier.t2',
      'mae.palier.t3',
      'mae.reaction.tu-as-ecrit',
      'mae.reaction.moi-jai-dit',
      'mae.reaction.revision',
      'mae.reaction.indice',
    ]
    for (const id of required) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('slugs : é → ee, ids dérivés cohérents', () => {
    expect(graphemeSlug('é')).toBe('ee')
    expect(wordSlug('vélo')).toBe('veelo')
    expect(keyClipId('ch')).toBe('mae.touche.ch')
    const velo = findTarget(2, 'vélo')
    if (!velo) throw new Error('cible « vélo » absente du palier 2')
    expect(targetClipId(velo)).toBe('mae.cible.veelo')
    expect(ids.has('mae.cible.veelo')).toBe(true)
  })
})
