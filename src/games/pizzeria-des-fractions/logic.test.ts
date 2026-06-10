import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  applyRun,
  checkCuts,
  CLIENTS,
  correctCuts,
  cutPoolFor,
  densForLevel,
  distractorsFor,
  fracClipId,
  fracEquals,
  fracLabel,
  fracText,
  FRESH_PROGRESS,
  GATEAU_NOTCHES,
  GATEAU_UNITS,
  gateauBoundaries,
  gateauSegments,
  generateItem,
  generateServe,
  itemKey,
  ITEMS_PER_RUN,
  labelChoices,
  MAX_TUNER_LEVEL,
  neededParts,
  normalizeDiameter,
  PIZZA_DIAMETERS,
  pizzaRays,
  pizzaSectors,
  SERVE_TARGETS,
  servedFraction,
  starsFor,
  SUPPORTS,
  targetsForLevel,
  TIER_COUNT,
  TIER_SKILLS,
} from './logic'
import type { Frac, PzfItem, PzfProgress, Support, TierId } from './logic'

const DRAWS = 300
const ALL_TIERS: readonly TierId[] = [0, 1, 2]
const ALL_LEVELS: readonly number[] = [0, 1, MAX_TUNER_LEVEL]

/** Toutes les cibles « parlables » du jeu (num < den, den 2..4). */
const ALL_TARGETS: readonly Frac[] = SERVE_TARGETS

function draws(tier: TierId, level: number, n = DRAWS): PzfItem[] {
  return Array.from({ length: n }, (_, i) => generateItem(tier, level, null, i))
}

// ============================================================
// Géométrie de la pizza ronde
// ============================================================

describe('normalizeDiameter — tout angle d’encoche retombe sur 0..179', () => {
  it('les deux bouts d’un diamètre donnent le même diamètre', () => {
    expect(normalizeDiameter(0)).toBe(0)
    expect(normalizeDiameter(180)).toBe(0)
    expect(normalizeDiameter(45)).toBe(45)
    expect(normalizeDiameter(225)).toBe(45)
    expect(normalizeDiameter(315)).toBe(135)
    expect(normalizeDiameter(-45)).toBe(135)
  })
})

describe('pizzaRays / pizzaSectors — parts angulaires', () => {
  it('aucune coupe : une seule part de 360°', () => {
    expect(pizzaRays([])).toEqual([])
    expect(pizzaSectors([])).toEqual([360])
  })

  it('un diamètre : deux moitiés de 180°, quel que soit le diamètre', () => {
    for (const d of PIZZA_DIAMETERS) {
      expect(pizzaSectors([d])).toEqual([180, 180])
    }
  })

  it('deux diamètres perpendiculaires : quatre quarts de 90°', () => {
    expect(pizzaSectors([0, 90])).toEqual([90, 90, 90, 90])
    expect(pizzaSectors([45, 135])).toEqual([90, 90, 90, 90])
  })

  it('deux diamètres à 45° : quatre parts INÉGALES (45/135 alternés)', () => {
    expect(pizzaSectors([0, 45])).toEqual([45, 135, 45, 135])
    expect(pizzaSectors([90, 135])).toEqual([45, 135, 45, 135])
  })

  it('les quatre diamètres : huit parts égales de 45°', () => {
    expect(pizzaSectors([0, 45, 90, 135])).toEqual([45, 45, 45, 45, 45, 45, 45, 45])
  })

  it('un diamètre en doublon (ou via son angle opposé) ne compte qu’une fois', () => {
    expect(pizzaSectors([0, 0])).toEqual([180, 180])
    expect(pizzaSectors([0, 180])).toEqual([180, 180])
  })

  it('la somme des parts fait toujours 360°', () => {
    const combos = [[], [0], [45], [0, 90], [0, 45], [0, 45, 90], [0, 45, 90, 135]]
    for (const c of combos) {
      expect(pizzaSectors(c).reduce((a, b) => a + b, 0)).toBe(360)
    }
  })
})

// ============================================================
// Géométrie du gâteau rectangulaire
// ============================================================

describe('gateauBoundaries / gateauSegments — bandes verticales', () => {
  it('aucune coupe : un seul morceau de 12 douzièmes', () => {
    expect(gateauBoundaries([])).toEqual([0, GATEAU_UNITS])
    expect(gateauSegments([])).toEqual([12])
  })

  it('coupe au milieu : deux moitiés', () => {
    expect(gateauSegments([6])).toEqual([6, 6])
  })

  it('coupes aux tiers : trois morceaux égaux, même donnés dans le désordre', () => {
    expect(gateauSegments([4, 8])).toEqual([4, 4, 4])
    expect(gateauSegments([8, 4])).toEqual([4, 4, 4])
  })

  it('coupes aux quarts : quatre morceaux égaux', () => {
    expect(gateauSegments([3, 6, 9])).toEqual([3, 3, 3, 3])
  })

  it('coupes inégales : les tailles reflètent le partage raté', () => {
    expect(gateauSegments([3, 4])).toEqual([3, 1, 8])
    expect(gateauSegments([3, 9])).toEqual([3, 6, 3])
  })

  it('doublons et valeurs hors gâteau sont ignorés', () => {
    expect(gateauSegments([6, 6])).toEqual([6, 6])
    expect(gateauSegments([0, 6, 12])).toEqual([6, 6])
  })

  it('la somme des morceaux fait toujours 12', () => {
    const combos = [[], [6], [3, 4], [3, 6, 9], [4, 8], [3, 4, 6, 8, 9]]
    for (const c of combos) {
      expect(gateauSegments(c).reduce((a, b) => a + b, 0)).toBe(GATEAU_UNITS)
    }
  })
})

// ============================================================
// Validation des coupes (tier 0)
// ============================================================

describe('checkCuts — parts égales exigées', () => {
  it('partages corrects : ronde en 2 et 4, gâteau en 2, 3 et 4', () => {
    expect(checkCuts('pizza', [90], 2).ok).toBe(true)
    expect(checkCuts('pizza', [45], 2).ok).toBe(true)
    expect(checkCuts('pizza', [0, 90], 4).ok).toBe(true)
    expect(checkCuts('pizza', [45, 135], 4).ok).toBe(true)
    expect(checkCuts('gateau', [6], 2).ok).toBe(true)
    expect(checkCuts('gateau', [4, 8], 3).ok).toBe(true)
    expect(checkCuts('gateau', [3, 6, 9], 4).ok).toBe(true)
  })

  it('parts inégales → reason unequal, avec les tailles pour la balance', () => {
    const c = checkCuts('pizza', [0, 45], 4)
    expect(c.ok).toBe(false)
    expect(c.reason).toBe('unequal')
    expect(c.sizes).toEqual([45, 135, 45, 135])
    const g = checkCuts('gateau', [3, 9], 3)
    expect(g.reason).toBe('unequal')
    expect(g.sizes).toEqual([3, 6, 3])
  })

  it('parts égales mais pas le bon compte → reason count', () => {
    // Les 4 diamètres : 8 parts égales alors qu'on en voulait 4.
    const c = checkCuts('pizza', [0, 45, 90, 135], 4)
    expect(c.ok).toBe(false)
    expect(c.reason).toBe('count')
    expect(c.parts).toBe(8)
    // Une seule coupe alors qu'on voulait 3 morceaux.
    const g = checkCuts('gateau', [6], 3)
    expect(g.reason).toBe('count')
    expect(g.parts).toBe(2)
  })

  it('aucune coupe : une part, jamais ok (on demande toujours ≥ 2)', () => {
    expect(checkCuts('pizza', [], 2)).toMatchObject({ ok: false, parts: 1, reason: 'count' })
    expect(checkCuts('gateau', [], 4)).toMatchObject({ ok: false, parts: 1, reason: 'count' })
  })

  it('le quart raté du gâteau (1/4, 1/3…) est bien inégal', () => {
    expect(checkCuts('gateau', [3, 4, 6], 4).reason).toBe('unequal')
  })
})

describe('correctCuts — l’indice est toujours un partage valide', () => {
  it('toutes les commandes possibles de tous les niveaux ont un indice correct', () => {
    for (const level of ALL_LEVELS) {
      for (const cmd of cutPoolFor(level)) {
        const cuts = correctCuts(cmd.support, cmd.parts)
        expect(cuts.length).toBeGreaterThan(0)
        expect(checkCuts(cmd.support, cuts, cmd.parts).ok).toBe(true)
      }
    }
  })

  it('les encoches de l’indice existent dans la scène', () => {
    for (const cut of correctCuts('pizza', 4)) {
      expect([...PIZZA_DIAMETERS]).toContain(cut)
    }
    for (const parts of [2, 3, 4]) {
      for (const cut of correctCuts('gateau', parts)) {
        expect([...GATEAU_NOTCHES]).toContain(cut)
      }
    }
  })
})

// ============================================================
// Service (tiers 1 et 2)
// ============================================================

describe('neededParts / servedFraction — y compris les équivalences', () => {
  it('cas directs : 1/2 de 2 → 1, 2/3 de 3 → 2, 3/4 de 4 → 3', () => {
    expect(neededParts({ num: 1, den: 2 }, 2)).toBe(1)
    expect(neededParts({ num: 2, den: 3 }, 3)).toBe(2)
    expect(neededParts({ num: 3, den: 4 }, 4)).toBe(3)
  })

  it('l’équivalence clé : la moitié d’une pizza en 4, c’est 2 parts', () => {
    expect(neededParts({ num: 1, den: 2 }, 4)).toBe(2)
    expect(servedFraction(2, 4, { num: 1, den: 2 })).toBe(true)
    expect(servedFraction(1, 4, { num: 1, den: 2 })).toBe(false)
    expect(servedFraction(3, 4, { num: 1, den: 2 })).toBe(false)
  })

  it('le gag : « toute la pizza » = toutes les parts', () => {
    expect(neededParts({ num: 3, den: 3 }, 3)).toBe(3)
    expect(servedFraction(3, 3, { num: 3, den: 3 })).toBe(true)
    expect(servedFraction(2, 3, { num: 3, den: 3 })).toBe(false)
  })

  it('découpage incompatible → null (jamais généré, mais jamais NaN)', () => {
    expect(neededParts({ num: 1, den: 3 }, 4)).toBeNull()
    expect(neededParts({ num: 1, den: 2 }, 3)).toBeNull()
  })

  it('servedFraction n’accepte que le compte exact, jamais ±1', () => {
    for (const target of ALL_TARGETS) {
      const total = target.den
      const needed = neededParts(target, total)
      expect(needed).not.toBeNull()
      if (needed === null) continue
      for (let s = 0; s <= total; s++) {
        expect(servedFraction(s, total, target)).toBe(s === needed)
      }
    }
  })
})

// ============================================================
// Étiquettes et distracteurs (tier 2)
// ============================================================

describe('fracEquals / fracLabel / fracText', () => {
  it('égalité EN VALEUR : 1/2 = 2/4 = 3/6, mais 1/2 ≠ 1/3', () => {
    expect(fracEquals({ num: 1, den: 2 }, { num: 2, den: 4 })).toBe(true)
    expect(fracEquals({ num: 1, den: 2 }, { num: 3, den: 6 })).toBe(true)
    expect(fracEquals({ num: 1, den: 2 }, { num: 1, den: 3 })).toBe(false)
    expect(fracEquals({ num: 2, den: 2 }, { num: 4, den: 4 })).toBe(true)
  })

  it('étiquettes et textes français', () => {
    expect(fracLabel({ num: 3, den: 4 })).toBe('3/4')
    expect(fracText({ num: 1, den: 2 })).toBe('la moitié')
    expect(fracText({ num: 2, den: 3 })).toBe('deux tiers')
    expect(fracText({ num: 4, den: 4 })).toBe('tout entier !')
  })
})

describe('distractorsFor — jamais égaux en valeur à la cible', () => {
  it('chaque cible a exactement 2 distracteurs valides et distincts', () => {
    for (const target of ALL_TARGETS) {
      const [d1, d2] = distractorsFor(target)
      for (const d of [d1, d2]) {
        expect(d).toBeDefined()
        expect(d.num).toBeGreaterThanOrEqual(1)
        expect(d.den).toBeGreaterThanOrEqual(1)
        expect(fracEquals(d, target), `${fracLabel(d)} ≡ ${fracLabel(target)}`).toBe(false)
      }
      expect(fracEquals(d1, d2)).toBe(false)
      expect(fracLabel(d1)).not.toBe(fracLabel(d2))
    }
  })

  it('LE piège : les distracteurs de 1/2 ne contiennent jamais 2/4 ni 3/6', () => {
    for (let i = 0; i < 50; i++) {
      for (const d of distractorsFor({ num: 1, den: 2 })) {
        expect(d.num * 2).not.toBe(d.den)
      }
    }
  })

  it('labelChoices : 3 tickets, la cible présente UNE seule fois en valeur', () => {
    for (const target of ALL_TARGETS) {
      for (let i = 0; i < 30; i++) {
        const choices = labelChoices(target)
        expect(choices).toHaveLength(3)
        const hits = choices.filter((c) => fracEquals(c, target))
        expect(hits).toHaveLength(1)
        expect(new Set(choices.map(fracLabel)).size).toBe(3)
      }
    }
  })
})

// ============================================================
// Génération procédurale
// ============================================================

describe('generateItem — tier 0 (Coupe !)', () => {
  it('toutes les commandes viennent du pool du niveau, jamais de ronde en 3', () => {
    for (const level of ALL_LEVELS) {
      const pool = cutPoolFor(level)
      for (const item of draws(0, level)) {
        expect(item.kind).toBe('cut')
        if (item.kind !== 'cut') continue
        expect(pool.some((c) => c.support === item.support && c.parts === item.parts)).toBe(true)
        expect(item.support === 'pizza' && item.parts === 3).toBe(false)
        expect([...CLIENTS]).toContain(item.client)
      }
    }
  })

  it('le niveau 0 reste sur les moitiés ; le tiers (gâteau) arrive au niveau 1', () => {
    expect(cutPoolFor(0).every((c) => c.parts === 2)).toBe(true)
    expect(cutPoolFor(1).some((c) => c.support === 'gateau' && c.parts === 3)).toBe(true)
    expect(cutPoolFor(2).some((c) => c.support === 'gateau' && c.parts === 4)).toBe(true)
  })

  it('jamais deux commandes identiques d’affilée (parties simulées de 8)', () => {
    for (const level of ALL_LEVELS) {
      for (let run = 0; run < 50; run++) {
        let prev: string | null = null
        for (let i = 0; i < ITEMS_PER_RUN; i++) {
          const item = generateItem(0, level, prev, i)
          expect(itemKey(item)).not.toBe(prev)
          prev = itemKey(item)
        }
      }
    }
  })
})

describe('generateItem — tier 1 (Sers !)', () => {
  it('invariants sur 300 tirages × niveaux : cible servable, support connu', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draws(1, level)) {
        expect(item.kind).toBe('serve')
        if (item.kind !== 'serve') continue
        expect(item.written).toBe(false)
        expect(SUPPORTS).toContain(item.support)
        expect([...CLIENTS]).toContain(item.client)
        // Le nombre de parts à servir est TOUJOURS entier (cible atteignable).
        const needed = neededParts(item.target, item.totalParts)
        expect(needed).not.toBeNull()
        if (needed === null) continue
        expect(needed).toBeGreaterThanOrEqual(1)
        expect(needed).toBeLessThanOrEqual(item.totalParts)
        expect(densForLevel(level)).toContain(item.target.den)
        expect([2, 3, 4]).toContain(item.totalParts)
      }
    }
  })

  it('niveau 0 : jamais de tiers ni de gag « tout entier »', () => {
    for (const item of draws(1, 0)) {
      if (item.kind !== 'serve') continue
      expect(item.target.den).not.toBe(3)
      expect(item.target.num).toBeLessThan(item.target.den)
    }
  })

  it('niveau 2 : les équivalences (1/2 sur 4 parts) ET le gag apparaissent', () => {
    const items = draws(1, 2, 600).filter((i) => i.kind === 'serve')
    const equiv = items.filter((i) => i.totalParts !== i.target.den)
    const gags = items.filter((i) => i.target.num === i.target.den)
    expect(equiv.length).toBeGreaterThan(0)
    expect(gags.length).toBeGreaterThan(0)
    // Toute équivalence est exactement « la moitié sur 4 parts ».
    for (const e of equiv) {
      expect(e.target).toEqual({ num: 1, den: 2 })
      expect(e.totalParts).toBe(4)
    }
  })

  it('jamais deux commandes identiques d’affilée', () => {
    for (const level of ALL_LEVELS) {
      for (let run = 0; run < 50; run++) {
        let prev: string | null = null
        for (let i = 0; i < ITEMS_PER_RUN; i++) {
          const item = generateItem(1, level, prev, i)
          expect(itemKey(item)).not.toBe(prev)
          prev = itemKey(item)
        }
      }
    }
  })

  it('generateServe sans gag ni équivalence : totalParts = dénominateur', () => {
    for (let i = 0; i < 200; i++) {
      const item = generateServe(2, null, { allowGag: false, allowEquiv: false, written: true })
      expect(item.totalParts).toBe(item.target.den)
      expect(item.target.num).toBeLessThan(item.target.den)
      expect(item.written).toBe(true)
    }
  })
})

describe('generateItem — tier 2 (L’étiquette)', () => {
  it('alternance stricte : slot pair = servir (écrit), slot impair = ticket', () => {
    for (let slot = 0; slot < ITEMS_PER_RUN; slot++) {
      for (let i = 0; i < 30; i++) {
        const item = generateItem(2, 2, null, slot)
        if (slot % 2 === 0) {
          expect(item.kind).toBe('serve')
          if (item.kind === 'serve') expect(item.written).toBe(true)
        } else {
          expect(item.kind).toBe('label')
        }
      }
    }
  })

  it('items étiquette : 3 tickets, la cible servie est affichée telle quelle', () => {
    for (const level of ALL_LEVELS) {
      for (let i = 0; i < 100; i++) {
        const item = generateItem(2, level, null, 1)
        if (item.kind !== 'label') continue
        expect(item.served).toBe(item.target.num)
        expect(item.totalParts).toBe(item.target.den)
        expect(item.choices).toHaveLength(3)
        expect(item.choices.filter((c) => fracEquals(c, item.target))).toHaveLength(1)
        expect(densForLevel(level)).toContain(item.target.den)
      }
    }
  })

  it('au tier 2, jamais de gag ni d’équivalence (notation propre)', () => {
    for (let i = 0; i < 200; i++) {
      const item = generateItem(2, 2, null, i)
      if (item.kind === 'serve') {
        expect(item.target.num).toBeLessThan(item.target.den)
        expect(item.totalParts).toBe(item.target.den)
      }
    }
  })
})

describe('targetsForLevel / densForLevel', () => {
  it('niveau 0 : moitié et quarts ; niveau 1+ : les tiers s’ouvrent', () => {
    expect(densForLevel(0)).toEqual([2, 4])
    expect(densForLevel(1)).toEqual([2, 3, 4])
    expect(targetsForLevel(0).map(fracLabel)).toEqual(['1/2', '1/4', '3/4'])
    expect(targetsForLevel(2).map(fracLabel)).toEqual(['1/2', '1/3', '2/3', '1/4', '3/4'])
  })
})

// ============================================================
// Audio — mapping fractions → clips, couverture du corpus
// ============================================================

describe('fracClipId — chaque commande générée a son clip', () => {
  const known = new Set(corpus.entries.map((e) => e.id))

  it('voix client (tier 1) et lecture (tier 2) pour toutes les cibles', () => {
    for (const target of ALL_TARGETS) {
      const spoken = fracClipId(target, false)
      const lu = fracClipId(target, true)
      expect(known.has(spoken), `clip manquant : ${spoken}`).toBe(true)
      expect(known.has(lu), `clip manquant : ${lu}`).toBe(true)
      expect(spoken).not.toBe(lu)
    }
    expect(fracClipId({ num: 2, den: 2 }, false)).toBe('pzf.frac.tout')
    expect(fracClipId({ num: 3, den: 3 }, false)).toBe('pzf.frac.tout')
  })

  it('tous les items générés (tous tiers × niveaux) pointent vers des clips connus', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (let i = 0; i < 100; i++) {
          const item = generateItem(tier, level, null, i)
          if (item.kind === 'cut') {
            expect(known.has(`pzf.parts.${item.parts}`)).toBe(true)
          } else if (item.kind === 'serve') {
            expect(known.has(fracClipId(item.target, item.written))).toBe(true)
          }
        }
      }
    }
  })
})

describe('corpus audio — préfixe pzf., ids uniques, voix connues', () => {
  it('ids valides, uniques, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('pzf.')).toBe(true)
      expect(['denise', 'eloise', 'henri']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('tous les clips utilisés par le jeu existent', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const id of [
      'pzf.intro',
      'pzf.consigne.coupe-pizza',
      'pzf.consigne.coupe-gateau',
      'pzf.consigne.coupe-aide',
      'pzf.consigne.sers',
      'pzf.consigne.etiquette',
      'pzf.parts.2',
      'pzf.parts.3',
      'pzf.parts.4',
      'pzf.cmd.donne',
      'pzf.oups',
      'pzf.teach.trop',
      'pzf.teach.pas-assez',
      'pzf.teach.inegal',
      'pzf.teach.nombre',
      'pzf.teach.compte',
      'pzf.teach.equiv',
      'pzf.teach.etiquette',
      'pzf.indice.coupe',
      'pzf.indice.sers',
      'pzf.indice.etiquette',
      'pzf.bravo-coupe',
      'pzf.miam',
      'pzf.merci',
      'pzf.gag.appetit',
      'pzf.niveau.0',
      'pzf.niveau.1',
      'pzf.niveau.2',
    ]) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

// ============================================================
// Score & progression
// ============================================================

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, ITEMS_PER_RUN)).toBe(3)
    expect(starsFor(7, ITEMS_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, ITEMS_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, ITEMS_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, ITEMS_PER_RUN)).toBe(1)
    expect(starsFor(0, 0)).toBe(1)
  })
})

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1).unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: PzfProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('rejouer un palier déjà passé ne reverrouille jamais', () => {
    const p = applyRun({ bestStars: { 0: 3 }, unlockedTier: 2, runs: 3 }, 0, 1)
    expect(p.unlockedTier).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà du tier 2', () => {
    const p = applyRun({ bestStars: {}, unlockedTier: 2, runs: 0 }, 2, 3)
    expect(p.unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: PzfProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

// ============================================================
// Cohérence skill-map et manifest
// ============================================================

describe('cohérence avec le skill-map et le manifest', () => {
  it('un skill par palier, tous connus du skill-map', () => {
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect([...TIER_SKILLS]).toEqual([
      'ma.ce1.fractions.parts',
      'ma.ce1.fractions.parts',
      'ma.ce1.fractions.lire',
    ])
    for (const id of TIER_SKILLS) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('le manifest déclare exactement les skills des paliers', () => {
    const meta = GAMES_BY_ID.get('pizzeria-des-fractions')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(meta.skills).toEqual([...new Set(TIER_SKILLS)])
    expect(meta.island).toBe('nombres')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('🍕')
    expect(meta.accent).toBe('#d84315')
  })

  it('itemKey distingue toutes les commandes (cut/serve/label, équivalences)', () => {
    const cut: PzfItem = { kind: 'cut', support: 'pizza' as Support, parts: 2, client: '🐰' }
    const serveHalf: PzfItem = {
      kind: 'serve',
      support: 'pizza',
      totalParts: 2,
      target: { num: 1, den: 2 },
      written: false,
      client: '🐰',
    }
    const serveEquiv: PzfItem = { ...serveHalf, kind: 'serve', totalParts: 4 }
    const keys = [cut, serveHalf, serveEquiv].map(itemKey)
    expect(new Set(keys).size).toBe(3)
  })
})
