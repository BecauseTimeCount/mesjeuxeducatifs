import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  applyRun,
  FRESH_PROGRESS,
  generateItem,
  generateTarget,
  guessFromPosition,
  hintZone,
  isHit,
  isInteresting,
  isTrivialAnchor,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  maxFor,
  positionToValue,
  snapFor,
  starsFor,
  targetPool,
  teachingMarks,
  tickValues,
  TIER_COUNT,
  TIER_SKILLS,
  toleranceFor,
  valueToPosition,
} from './logic'
import type { RluProgress, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, 1, MAX_TUNER_LEVEL]

// NB : la génération ne dépend PAS du niveau du Tuner (seule la tolérance
// en dépend) — les niveaux sont éprouvés dans les tests de toleranceFor.

function targets(tier: TierId, n = DRAWS): number[] {
  return Array.from({ length: n }, () => generateTarget(tier))
}

describe('generateTarget / generateItem — invariants (tous paliers × 200 tirages)', () => {
  it('cible entière, strictement entre les rochers, jamais une ancre triviale', () => {
    for (const tier of ALL_TIERS) {
      const max = maxFor(tier)
      for (const t of targets(tier)) {
        expect(Number.isInteger(t)).toBe(true)
        expect(t).toBeGreaterThanOrEqual(1)
        expect(t).toBeLessThanOrEqual(max - 1)
        expect(isTrivialAnchor(tier, t)).toBe(false)
      }
    }
  })

  it('generateItem porte le palier, la cible et la borne max du palier', () => {
    for (const tier of ALL_TIERS) {
      for (let i = 0; i < 100; i++) {
        const item = generateItem(tier)
        expect(item.tier).toBe(tier)
        expect(item.max).toBe(maxFor(tier))
        expect(targetPool(tier)).toContain(item.target)
      }
    }
  })

  it('bornes des rivières : 10, 20, 100, 100', () => {
    expect(maxFor(0)).toBe(10)
    expect(maxFor(1)).toBe(20)
    expect(maxFor(2)).toBe(100)
    expect(maxFor(3)).toBe(100)
  })

  it('T2 : jamais 0, 50 ni 100 — ni aucune dizaine (toutes étiquetées)', () => {
    for (const t of targets(2)) {
      expect([0, 50, 100]).not.toContain(t)
      expect(t % 10).not.toBe(0)
    }
  })

  it('T3 : jamais 0, 50 ni 100, ni leurs abords immédiats', () => {
    for (const t of targets(3)) {
      expect([0, 50, 100]).not.toContain(t)
      expect(Math.abs(t - 50)).toBeGreaterThan(4)
      expect(t).toBeGreaterThanOrEqual(5)
      expect(t).toBeLessThanOrEqual(95)
    }
  })
})

describe('isTrivialAnchor — positions déjà données par la scène', () => {
  it('les rochers 0 et max sont toujours triviaux', () => {
    for (const tier of ALL_TIERS) {
      expect(isTrivialAnchor(tier, 0)).toBe(true)
      expect(isTrivialAnchor(tier, maxFor(tier))).toBe(true)
    }
  })

  it('T2 : toute dizaine est triviale, le reste non', () => {
    expect(isTrivialAnchor(2, 50)).toBe(true)
    expect(isTrivialAnchor(2, 70)).toBe(true)
    expect(isTrivialAnchor(2, 47)).toBe(false)
    expect(isTrivialAnchor(2, 71)).toBe(false)
  })

  it('T3 : le milieu (50 ± 4) et les abords des rochers sont triviaux', () => {
    expect(isTrivialAnchor(3, 50)).toBe(true)
    expect(isTrivialAnchor(3, 46)).toBe(true)
    expect(isTrivialAnchor(3, 54)).toBe(true)
    expect(isTrivialAnchor(3, 45)).toBe(false)
    expect(isTrivialAnchor(3, 55)).toBe(false)
    expect(isTrivialAnchor(3, 4)).toBe(true)
    expect(isTrivialAnchor(3, 5)).toBe(false)
    expect(isTrivialAnchor(3, 96)).toBe(true)
    expect(isTrivialAnchor(3, 95)).toBe(false)
  })

  it('T0/T1 : tout l’intérieur de la rivière est jouable', () => {
    for (let v = 1; v <= 9; v++) expect(isTrivialAnchor(0, v)).toBe(false)
    for (let v = 1; v <= 19; v++) expect(isTrivialAnchor(1, v)).toBe(false)
  })
})

describe('anti-répétition — avoid', () => {
  it('une partie de 8 items ne répète jamais une cible (tous paliers × 50 parties)', () => {
    for (const tier of ALL_TIERS) {
      for (let run = 0; run < 50; run++) {
        const used: number[] = []
        for (let i = 0; i < ITEMS_PER_RUN; i++) {
          const item = generateItem(tier, used)
          expect(used).not.toContain(item.target)
          used.push(item.target)
        }
        expect(new Set(used).size).toBe(ITEMS_PER_RUN)
      }
    }
  })

  it('le pool de chaque palier suffit à 8 items sans répétition', () => {
    for (const tier of ALL_TIERS) {
      const pool = targetPool(tier)
      expect(pool.length).toBeGreaterThanOrEqual(ITEMS_PER_RUN)
      expect(new Set(pool).size).toBe(pool.length)
      for (const v of pool) expect(isTrivialAnchor(tier, v)).toBe(false)
    }
  })

  it('avoid couvrant tout le pool : retombe sur le pool complet, jamais bloqué', () => {
    for (const tier of ALL_TIERS) {
      const pool = targetPool(tier)
      for (let i = 0; i < 50; i++) {
        expect(pool).toContain(generateTarget(tier, pool))
      }
    }
  })

  it('T0 : tout le pool sauf une valeur force cette valeur', () => {
    const avoid = targetPool(0).filter((v) => v !== 7)
    for (let i = 0; i < 50; i++) expect(generateTarget(0, avoid)).toBe(7)
  })
})

describe('isInteresting — biais T2/T3 vers les nombres loin des dizaines', () => {
  it('vrai pour les unités 3 à 7, faux ailleurs', () => {
    expect(isInteresting(43)).toBe(true)
    expect(isInteresting(67)).toBe(true)
    expect(isInteresting(42)).toBe(false)
    expect(isInteresting(68)).toBe(false)
    expect(isInteresting(70)).toBe(false)
  })
})

describe('toleranceFor — paliers et monotonie', () => {
  it('valeurs exactes par palier et niveau de Tuner', () => {
    expect(toleranceFor(0, 0)).toBe(1)
    expect(toleranceFor(0, 1)).toBe(0)
    expect(toleranceFor(0, 2)).toBe(0)
    for (const level of ALL_LEVELS) expect(toleranceFor(1, level)).toBe(1)
    expect(toleranceFor(2, 0)).toBe(8)
    expect(toleranceFor(2, 1)).toBe(6)
    expect(toleranceFor(2, 2)).toBe(5)
    expect(toleranceFor(3, 0)).toBe(12)
    expect(toleranceFor(3, 1)).toBe(10)
    expect(toleranceFor(3, 2)).toBe(8)
  })

  it('la tolérance ne s’élargit JAMAIS quand le niveau du Tuner monte', () => {
    for (const tier of ALL_TIERS) {
      for (let level = 1; level <= MAX_TUNER_LEVEL; level++) {
        expect(toleranceFor(tier, level)).toBeLessThanOrEqual(toleranceFor(tier, level - 1))
      }
    }
  })

  it('niveaux hors bornes ou fractionnaires : clampés et tronqués', () => {
    expect(toleranceFor(2, -3)).toBe(8)
    expect(toleranceFor(2, 99)).toBe(5)
    expect(toleranceFor(3, 1.9)).toBe(10)
  })
})

describe('snapFor / guessFromPosition — aimantation', () => {
  it('T0/T1 s’aimantent à la graduation entière, T2/T3 jamais (continu)', () => {
    expect(snapFor(0)).toBe(1)
    expect(snapFor(1)).toBe(1)
    expect(snapFor(2)).toBeNull()
    expect(snapFor(3)).toBeNull()
  })

  it('guessFromPosition retient la graduation la plus proche', () => {
    // T0, bande de 300 px : 149 px → 4,97 → 5 ; 134 px → 4,47 → 4
    expect(guessFromPosition(149, 300, 0)).toBe(5)
    expect(guessFromPosition(134, 300, 0)).toBe(4)
    expect(guessFromPosition(0, 300, 0)).toBe(0)
    expect(guessFromPosition(300, 300, 0)).toBe(10)
    // T2, bande de 500 px : le milieu vaut 50
    expect(guessFromPosition(250, 500, 2)).toBe(50)
    expect(guessFromPosition(500, 500, 2)).toBe(100)
  })

  it('les positions hors bande sont clampées aux rochers', () => {
    expect(guessFromPosition(-50, 300, 1)).toBe(0)
    expect(guessFromPosition(999, 300, 1)).toBe(20)
  })
})

describe('positionToValue / valueToPosition — conversions réciproques', () => {
  it('bornes et milieu', () => {
    expect(positionToValue(0, 640, 100)).toBe(0)
    expect(positionToValue(640, 640, 100)).toBe(100)
    expect(positionToValue(320, 640, 100)).toBe(50)
    expect(valueToPosition(0, 640, 100)).toBe(0)
    expect(valueToPosition(100, 640, 100)).toBe(640)
    expect(valueToPosition(50, 640, 100)).toBe(320)
  })

  it('aller-retour exact pour toutes les valeurs entières de chaque palier', () => {
    for (const tier of ALL_TIERS) {
      const max = maxFor(tier)
      for (let v = 0; v <= max; v++) {
        expect(positionToValue(valueToPosition(v, 640, max), 640, max)).toBeCloseTo(v, 9)
      }
    }
  })

  it('entrées dégénérées ou hors bornes : clampées, jamais NaN', () => {
    expect(positionToValue(50, 0, 100)).toBe(0)
    expect(positionToValue(-10, 640, 100)).toBe(0)
    expect(positionToValue(9999, 640, 100)).toBe(100)
    expect(valueToPosition(50, 640, 0)).toBe(0)
    expect(valueToPosition(-3, 640, 100)).toBe(0)
    expect(valueToPosition(250, 640, 100)).toBe(640)
  })
})

describe('isHit — bornes ±tolérance INCLUSES', () => {
  it('cible ± tolérance → réussi, cible ± (tolérance + 1) → manqué', () => {
    for (const tolerance of [0, 1, 5, 6, 8, 10, 12]) {
      const target = 70
      expect(isHit(target, target, tolerance)).toBe(true)
      expect(isHit(target, target - tolerance, tolerance)).toBe(true)
      expect(isHit(target, target + tolerance, tolerance)).toBe(true)
      expect(isHit(target, target - tolerance - 1, tolerance)).toBe(false)
      expect(isHit(target, target + tolerance + 1, tolerance)).toBe(false)
    }
  })

  it('tolérance 0 (T0 niveau 1+) : seul l’exact compte', () => {
    expect(isHit(5, 5, 0)).toBe(true)
    expect(isHit(5, 4, 0)).toBe(false)
    expect(isHit(5, 6, 0)).toBe(false)
  })
})

describe('hintZone — zone d’indice jamais invisible', () => {
  it('couvre toujours [cible − tolérance, cible + tolérance]', () => {
    for (const tier of ALL_TIERS) {
      const max = maxFor(tier)
      for (const level of ALL_LEVELS) {
        const tolerance = toleranceFor(tier, level)
        for (const t of targets(tier, 50)) {
          const [lo, hi] = hintZone(t, tolerance, max)
          expect(lo).toBeLessThanOrEqual(Math.max(0, t - tolerance))
          expect(hi).toBeGreaterThanOrEqual(Math.min(max, t + tolerance))
          expect(lo).toBeGreaterThanOrEqual(0)
          expect(hi).toBeLessThanOrEqual(max)
          expect(hi - lo).toBeGreaterThan(0)
        }
      }
    }
  })

  it('tolérance exacte (0) : la zone reste visible autour de la cible', () => {
    const [lo, hi] = hintZone(5, 0, 10)
    expect(lo).toBeLessThan(5)
    expect(hi).toBeGreaterThan(5)
    expect(hi - lo).toBeCloseTo(0.8, 9)
  })

  it('clampée aux rochers, sans déborder', () => {
    expect(hintZone(1, 1, 10)).toEqual([0, 2])
    expect(hintZone(95, 12, 100)).toEqual([83, 100])
  })
})

describe('tickValues — graduations-galets par palier', () => {
  it('T0 : toutes les graduations 0..10, étiquettes 0/5/10', () => {
    const ticks = tickValues(0)
    expect(ticks.map((t) => t.value)).toEqual(Array.from({ length: 11 }, (_, i) => i))
    expect(ticks.filter((t) => t.labeled).map((t) => t.value)).toEqual([0, 5, 10])
  })

  it('T1 : toutes les graduations 0..20, étiquettes 0/10/20', () => {
    const ticks = tickValues(1)
    expect(ticks).toHaveLength(21)
    expect(ticks.filter((t) => t.labeled).map((t) => t.value)).toEqual([0, 10, 20])
  })

  it('T2 : graduations tous les 10, TOUTES étiquetées', () => {
    const ticks = tickValues(2)
    expect(ticks.map((t) => t.value)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(ticks.every((t) => t.labeled)).toBe(true)
  })

  it('T3 : seuls 0, 50 et 100 sont marqués — aucune autre graduation', () => {
    const ticks = tickValues(3)
    expect(ticks.map((t) => t.value)).toEqual([0, 50, 100])
    expect(ticks.every((t) => t.labeled)).toBe(true)
  })
})

describe('teachingMarks — nombres-clés révélés pendant l’enseignement', () => {
  it('T0/T1 : de 5 en 5, T2/T3 : de 10 en 10', () => {
    expect(teachingMarks(0)).toEqual([0, 5, 10])
    expect(teachingMarks(1)).toEqual([0, 5, 10, 15, 20])
    expect(teachingMarks(2)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(teachingMarks(3)).toEqual(teachingMarks(2))
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
    let p: RluProgress = { ...FRESH_PROGRESS }
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
    const before: RluProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

describe('corpus audio — couverture complète, préfixe rlu.', () => {
  it('ids valides, uniques, tous préfixés rlu., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('rlu.')).toBe(true)
      expect(['denise', 'eloise', 'henri']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('aucun doublon des clips communs ui.* ni des nombres nombre.*', () => {
    for (const e of corpus.entries) {
      expect(e.id.startsWith('ui.')).toBe(false)
      expect(e.id.startsWith('nombre.')).toBe(false)
    }
  })

  it('tous les clips utilisés par le jeu existent', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const id of [
      'rlu.intro',
      'rlu.consigne.pose',
      'rlu.confirme',
      'rlu.bien-vise',
      'rlu.trop-loin',
      'rlu.regarde',
      'rlu.milieu',
      'rlu.est-ici',
      'rlu.indice',
      'rlu.niveau.0',
      'rlu.niveau.1',
      'rlu.niveau.2',
      'rlu.niveau.3',
    ]) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('un skill par palier, tous connus du skill-map', () => {
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect([...TIER_SKILLS]).toEqual([
      'ma.gs.droite10',
      'ma.gs.droite10',
      'ma.cp.num.droite',
      'ma.cp.num.droite',
    ])
    for (const id of TIER_SKILLS) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('le manifest (une fois câblé) déclare exactement les skills des paliers', () => {
    const meta = GAMES_BY_ID.get('riviere-aux-lucioles')
    if (!meta) return // entrée câblée par l'orchestrateur après ce jeu
    expect(meta.skills).toEqual([...new Set(TIER_SKILLS)])
    expect(meta.island).toBe('nombres')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('✨')
    expect(meta.accent).toBe('#00acc1')
  })
})
