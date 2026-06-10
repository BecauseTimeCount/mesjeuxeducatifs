import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  applyRun,
  applyTraceResult,
  dist,
  distToPath,
  distToSegment,
  evaluateTrace,
  FRESH_PROGRESS,
  initialFlow,
  isAntiClockwise,
  isFirstTry,
  MAX_TUNER_LEVEL,
  MIN_COVERAGE,
  pathLength,
  pickSessionStrokes,
  resample,
  signedArea,
  START_TOLERANCE,
  starsFor,
  toleranceFor,
  TRACES_PER_RUN,
} from './logic'
import type { LmaProgress, Pt, TraceFlow } from './logic'
import {
  ALL_STROKES,
  FORME_STROKES,
  LETTER_FAMILIES,
  LETTRE_STROKES,
  STROKES_BY_ID,
} from './strokes'

// ------------------------------------------------------------
// Outils de test
// ------------------------------------------------------------

/** RNG déterministe (mulberry32) pour les tirages de session. */
function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Bruit déterministe ≤ ±3 par axe (≈ 4,3 en norme). */
function noisy(points: readonly Pt[]): Pt[] {
  return points.map((p, i) => ({
    x: p.x + 3 * Math.sin(i * 1.7),
    y: p.y + 3 * Math.cos(i * 2.3),
  }))
}

function translated(points: readonly Pt[], dx: number, dy: number): Pt[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

const OPEN_STROKES = ALL_STROKES.filter((s) => dist(s.points[0], s.points[s.points.length - 1]) > 15)

// ------------------------------------------------------------
// strokes.ts — qualité des données
// ------------------------------------------------------------

describe('strokes — invariants des 20 tracés', () => {
  it('8 formes GS + 12 lettres CP, ids uniques', () => {
    expect(FORME_STROKES).toHaveLength(8)
    expect(LETTRE_STROKES).toHaveLength(12)
    const ids = ALL_STROKES.map((s) => s.id)
    expect(new Set(ids).size).toBe(20)
    expect(STROKES_BY_ID.size).toBe(20)
  })

  it('lettres dans l’ordre officiel d’apprentissage par familles de geste', () => {
    expect(LETTRE_STROKES.map((s) => s.id)).toEqual([
      'e', 'l', 'i', 'u', 't', 'c', 'o', 'a', 'd', 'm', 'n', 's',
    ])
  })

  it('≥ 15 points, tous dans les bornes 0-100', () => {
    for (const s of ALL_STROKES) {
      expect(s.points.length, s.id).toBeGreaterThanOrEqual(15)
      for (const p of s.points) {
        expect(p.x, s.id).toBeGreaterThanOrEqual(0)
        expect(p.x, s.id).toBeLessThanOrEqual(100)
        expect(p.y, s.id).toBeGreaterThanOrEqual(0)
        expect(p.y, s.id).toBeLessThanOrEqual(100)
      }
    }
  })

  it('geste CONTINU : distance entre points consécutifs bornée (0 < d ≤ 8)', () => {
    for (const s of ALL_STROKES) {
      for (let i = 1; i < s.points.length; i++) {
        const d = dist(s.points[i - 1], s.points[i])
        expect(d, `${s.id} segment ${i}`).toBeLessThanOrEqual(8)
      }
      expect(pathLength(s.points), s.id).toBeGreaterThan(30)
    }
  })

  it('proportions Seyès : corps entre l’interligne (30) et la ligne de base (50)', () => {
    // Lettres à corps simple : ne montent pas au-dessus de l'interligne.
    for (const id of ['e', 'i', 'u', 'c', 'o', 'a', 'm', 'n', 's']) {
      const ys = STROKES_BY_ID.get(id)!.points.map((p) => p.y)
      expect(Math.min(...ys), id).toBeGreaterThanOrEqual(28)
      expect(Math.max(...ys), id).toBeLessThanOrEqual(52)
    }
    // Les grandes boucles montent vers y = 10, t et d sont intermédiaires.
    expect(Math.min(...STROKES_BY_ID.get('l')!.points.map((p) => p.y))).toBeLessThanOrEqual(14)
    expect(Math.min(...STROKES_BY_ID.get('grande-boucle')!.points.map((p) => p.y))).toBeLessThanOrEqual(14)
    expect(Math.min(...STROKES_BY_ID.get('t')!.points.map((p) => p.y))).toBeLessThanOrEqual(24)
    expect(Math.min(...STROKES_BY_ID.get('d')!.points.map((p) => p.y))).toBeLessThanOrEqual(18)
    // Aucun jambage : rien ne descend franchement sous la ligne de base.
    for (const s of ALL_STROKES) {
      expect(Math.max(...s.points.map((p) => p.y)), s.id).toBeLessThanOrEqual(52)
    }
  })

  it('départs cohérents : e, l, i, u, t, s et les boucles partent de la ligne de base', () => {
    for (const id of ['e', 'l', 'i', 'u', 't', 's', 'grande-boucle', 'petite-boucle', 'canne']) {
      const start = STROKES_BY_ID.get(id)!.points[0]
      expect(start.y, id).toBeGreaterThanOrEqual(46)
    }
    // Les rondes partent en haut à droite (au-dessus du centre du corps).
    for (const id of ['rond', 'c', 'o', 'a', 'd']) {
      const s = STROKES_BY_ID.get(id)!
      const start = s.points[0]
      const cx = (Math.min(...s.points.map((p) => p.x)) + Math.max(...s.points.map((p) => p.x))) / 2
      expect(start.y, id).toBeLessThanOrEqual(36)
      expect(start.x, id).toBeGreaterThanOrEqual(cx - 2)
    }
  })

  it('le rond, le o et le c tournent en ANTI-HORAIRE (aire signée négative à l’écran)', () => {
    for (const id of ['rond', 'o', 'c']) {
      const s = STROKES_BY_ID.get(id)!
      expect(signedArea(s.points), id).toBeLessThan(0)
      expect(isAntiClockwise(s.points), id).toBe(true)
    }
  })

  it('le pont se trace en sens HORAIRE (aire signée positive)', () => {
    expect(signedArea(STROKES_BY_ID.get('pont')!.points)).toBeGreaterThan(0)
  })

  it('familles de lettres : couvrent exactement les 12 lettres, ids connus', () => {
    const covered = LETTER_FAMILIES.flatMap((f) => f.strokes)
    expect(covered).toEqual(LETTRE_STROKES.map((s) => s.id))
    for (const f of LETTER_FAMILIES) {
      expect(f.strokes.length).toBeGreaterThan(0)
      for (const id of f.strokes) {
        expect(STROKES_BY_ID.get(id)?.atelier, id).toBe('lettres')
      }
    }
  })
})

// ------------------------------------------------------------
// resample — rééchantillonnage par longueur d'arc
// ------------------------------------------------------------

describe('resample', () => {
  it('n points régulièrement espacés, extrémités préservées', () => {
    const out = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }], 11)
    expect(out).toHaveLength(11)
    out.forEach((p, i) => {
      expect(p.x).toBeCloseTo(i, 6)
      expect(p.y).toBeCloseTo(0, 6)
    })
  })

  it('uniformise un échantillonnage irrégulier (rafales puis trous des pointer events)', () => {
    const irregular: Pt[] = [
      { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.8, y: 0 }, { x: 1, y: 0 },
      { x: 50, y: 0 }, { x: 100, y: 0 },
    ]
    const out = resample(irregular, 21)
    const gaps = out.slice(1).map((p, i) => dist(out[i], p))
    const min = Math.min(...gaps)
    const max = Math.max(...gaps)
    expect(max - min).toBeLessThan(0.01)
    expect(out[0]).toEqual({ x: 0, y: 0 })
    expect(out[20].x).toBeCloseTo(100, 6)
  })

  it('suit la polyligne (les coins sont respectés)', () => {
    const corner: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const out = resample(corner, 21)
    expect(out[10]).toEqual({ x: 10, y: 0 })
    for (const p of out) {
      expect(distToPath(p, corner)).toBeLessThan(0.01)
    }
  })

  it('cas dégénérés : point unique, longueur nulle, n ≤ 0', () => {
    expect(resample([{ x: 3, y: 4 }], 5)).toEqual(Array.from({ length: 5 }, () => ({ x: 3, y: 4 })))
    expect(resample([{ x: 3, y: 4 }, { x: 3, y: 4 }], 4)).toEqual(
      Array.from({ length: 4 }, () => ({ x: 3, y: 4 })),
    )
    expect(resample([], 3)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])
    expect(resample([{ x: 1, y: 1 }, { x: 2, y: 2 }], 0)).toEqual([])
  })
})

// ------------------------------------------------------------
// Géométrie
// ------------------------------------------------------------

describe('géométrie de base', () => {
  it('distToSegment : projection, extrémités, segment dégénéré', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3, 6)
    expect(distToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5, 6)
    expect(distToSegment({ x: 1, y: 1 }, { x: 4, y: 5 }, { x: 4, y: 5 })).toBeCloseTo(5, 6)
  })

  it('signedArea : triangle horaire positif, anti-horaire négatif (y vers le bas)', () => {
    // À l'écran (y vers le bas) : droite puis bas = sens HORAIRE visuel.
    const horaire: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    expect(signedArea(horaire)).toBeGreaterThan(0)
    expect(isAntiClockwise(horaire)).toBe(false)
    const anti = [...horaire].reverse()
    expect(signedArea(anti)).toBeLessThan(0)
    expect(isAntiClockwise(anti)).toBe(true)
  })
})

// ------------------------------------------------------------
// evaluateTrace — validation du tracé
// ------------------------------------------------------------

describe('evaluateTrace', () => {
  it('le modèle lui-même passe, pour les 20 tracés (tolérance 10)', () => {
    for (const s of ALL_STROKES) {
      const r = evaluateTrace(s.points, s.points, 10)
      expect(r.wrongStart, s.id).toBe(false)
      expect(r.offTrack, s.id).toBe(false)
      expect(r.coverage, s.id).toBeGreaterThanOrEqual(MIN_COVERAGE)
      expect(r.ok, s.id).toBe(true)
    }
  })

  it('le modèle bruité (±3) passe, pour les 20 tracés (tolérance 12)', () => {
    for (const s of ALL_STROKES) {
      const r = evaluateTrace(s.points, noisy(s.points), 12)
      expect(r.ok, s.id).toBe(true)
    }
  })

  it('tracé à l’envers : wrongStart sur tous les tracés ouverts', () => {
    for (const s of OPEN_STROKES) {
      const r = evaluateTrace(s.points, [...s.points].reverse(), 10)
      expect(r.wrongStart, s.id).toBe(true)
      expect(r.ok, s.id).toBe(false)
    }
  })

  it('rond tracé à l’envers (sens horaire) : départ correct mais couverture effondrée', () => {
    const rond = STROKES_BY_ID.get('rond')!
    const r = evaluateTrace(rond.points, [...rond.points].reverse(), 10)
    expect(r.wrongStart).toBe(false) // le départ et l'arrivée coïncident
    expect(r.coverage).toBeLessThan(MIN_COVERAGE) // mais l'ordre n'est jamais suivi
    expect(r.ok).toBe(false)
  })

  it('tracé partiel (première moitié) : coverage faible, ni wrongStart ni offTrack', () => {
    for (const id of ['grande-boucle', 'trois-ponts', 'm']) {
      const s = STROKES_BY_ID.get(id)!
      const half = s.points.slice(0, Math.ceil(s.points.length / 2))
      const r = evaluateTrace(s.points, half, 10)
      expect(r.wrongStart, id).toBe(false)
      expect(r.offTrack, id).toBe(false)
      expect(r.coverage, id).toBeLessThan(MIN_COVERAGE)
      expect(r.ok, id).toBe(false)
    }
  })

  it('gribouillage : offTrack, même en partant de la bonne étoile', () => {
    const s = STROKES_BY_ID.get('rond')!
    const scribble: Pt[] = [
      s.points[0],
      { x: 5, y: 90 }, { x: 95, y: 10 }, { x: 5, y: 10 }, { x: 95, y: 90 }, { x: 5, y: 50 },
    ]
    const r = evaluateTrace(s.points, scribble, 10)
    expect(r.wrongStart).toBe(false)
    expect(r.offTrack).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('tracé décalé de 30 : wrongStart', () => {
    const s = STROKES_BY_ID.get('e')!
    const r = evaluateTrace(s.points, translated(s.points, 30, 0), 10)
    expect(r.wrongStart).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('la tolérance élargie du palier 3 rattrape un tracé décalé de 13', () => {
    const s = STROKES_BY_ID.get('t')!
    const drawn = translated(s.points, 13, 0)
    expect(evaluateTrace(s.points, drawn, toleranceFor(2, 2)).ok).toBe(false) // serré : 10
    expect(evaluateTrace(s.points, drawn, toleranceFor(3, 0)).ok).toBe(true) // élargi : 16
  })

  it('entrées dégénérées : vide, point unique, tap sans longueur → échec propre', () => {
    const model = STROKES_BY_ID.get('i')!.points
    expect(evaluateTrace(model, [], 12).ok).toBe(false)
    expect(evaluateTrace(model, [{ x: 32, y: 50 }], 12).ok).toBe(false)
    expect(evaluateTrace(model, [{ x: 32, y: 50 }, { x: 32, y: 50 }], 12).ok).toBe(false)
    expect(evaluateTrace([], model, 12).ok).toBe(false)
  })

  it('le départ tolère un doigt un peu à côté (≤ START_TOLERANCE)', () => {
    const s = STROKES_BY_ID.get('l')!
    const drawn = [
      { x: s.points[0].x + START_TOLERANCE - 2, y: s.points[0].y },
      ...s.points.slice(1),
    ]
    expect(evaluateTrace(s.points, drawn, 10).wrongStart).toBe(false)
  })
})

// ------------------------------------------------------------
// Tolérances & paliers
// ------------------------------------------------------------

describe('toleranceFor — paliers de guidage et Tuner', () => {
  it('le palier 3 (de mémoire) est toujours PLUS tolérant que le palier 2', () => {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      expect(toleranceFor(3, level)).toBeGreaterThan(toleranceFor(2, level))
    }
  })

  it('la tolérance ne s’élargit JAMAIS quand le Tuner monte', () => {
    for (const palier of [2, 3] as const) {
      for (let level = 1; level <= MAX_TUNER_LEVEL; level++) {
        expect(toleranceFor(palier, level)).toBeLessThanOrEqual(toleranceFor(palier, level - 1))
      }
    }
  })

  it('valeurs exactes, niveaux clampés et tronqués', () => {
    expect(toleranceFor(2, 0)).toBe(14)
    expect(toleranceFor(2, 2)).toBe(10)
    expect(toleranceFor(3, 0)).toBe(16)
    expect(toleranceFor(3, 2)).toBe(12)
    expect(toleranceFor(2, -5)).toBe(14)
    expect(toleranceFor(2, 99)).toBe(10)
    expect(toleranceFor(3, 1.9)).toBe(14)
  })
})

describe('applyTraceResult — machine à paliers d’un tracé', () => {
  function run(results: boolean[]): TraceFlow {
    return results.reduce(applyTraceResult, initialFlow())
  }

  it('parcours nominal : 2 réussites au palier 2 → palier 3 → acquis, premier essai honnête', () => {
    const f1 = run([true])
    expect(f1.palier).toBe(2)
    expect(f1.p2Done).toBe(1)
    const f2 = run([true, true])
    expect(f2.palier).toBe(3)
    const f3 = run([true, true, true])
    expect(f3.done).toBe(true)
    expect(isFirstTry(f3)).toBe(true)
  })

  it('échec au palier 2 : remise à zéro des réussites, sans pénaliser le premier essai', () => {
    const f = run([true, false])
    expect(f.palier).toBe(2)
    expect(f.p2Done).toBe(0)
    const done = run([true, false, true, true, true])
    expect(done.done).toBe(true)
    expect(isFirstTry(done)).toBe(true)
  })

  it('un échec au palier 3 : on reste au palier 3, mais le premier essai est perdu', () => {
    const f = run([true, true, false])
    expect(f.palier).toBe(3)
    expect(f.p3Fails).toBe(1)
    expect(f.done).toBe(false)
    const done = run([true, true, false, true])
    expect(done.done).toBe(true)
    expect(isFirstTry(done)).toBe(false)
  })

  it('2 échecs au palier 3 : retour au guidage (palier 2), UNE réussite suffit pour remonter', () => {
    const f = run([true, true, false, false])
    expect(f.palier).toBe(2)
    expect(f.fellBack).toBe(true)
    expect(f.p2Target).toBe(1)
    const back = run([true, true, false, false, true])
    expect(back.palier).toBe(3)
    const done = run([true, true, false, false, true, true])
    expect(done.done).toBe(true)
    expect(isFirstTry(done)).toBe(false)
  })

  it('l’état acquis est absorbant', () => {
    const done = run([true, true, true])
    expect(applyTraceResult(done, false)).toEqual(done)
    expect(applyTraceResult(done, true)).toEqual(done)
  })
})

// ------------------------------------------------------------
// Composition de session
// ------------------------------------------------------------

describe('pickSessionStrokes', () => {
  const FORME_IDS = FORME_STROKES.map((s) => s.id)

  it('6 tracés tirés d’un pool de 8 : tous distincts, tous du pool', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const out = pickSessionStrokes(FORME_IDS, TRACES_PER_RUN, seededRand(seed))
      expect(out).toHaveLength(TRACES_PER_RUN)
      expect(new Set(out).size).toBe(TRACES_PER_RUN)
      for (const id of out) expect(FORME_IDS).toContain(id)
    }
  })

  it('pool de 2 (famille boucles) : équilibré 3-3, jamais deux fois de suite', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const out = pickSessionStrokes(['e', 'l'], 6, seededRand(seed))
      expect(out).toHaveLength(6)
      expect(out.filter((id) => id === 'e')).toHaveLength(3)
      for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1])
    }
  })

  it('pool de 1 (le serpent) : répète le seul tracé disponible', () => {
    expect(pickSessionStrokes(['s'], 6, seededRand(7))).toEqual(['s', 's', 's', 's', 's', 's'])
  })

  it('cas dégénérés : pool vide ou n ≤ 0', () => {
    expect(pickSessionStrokes([], 6)).toEqual([])
    expect(pickSessionStrokes(['e'], 0)).toEqual([])
  })
})

// ------------------------------------------------------------
// Score & progression
// ------------------------------------------------------------

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1 (sur 6 tracés)', () => {
    expect(starsFor(6, TRACES_PER_RUN)).toBe(3)
    expect(starsFor(5, TRACES_PER_RUN)).toBe(2) // 83 %
    expect(starsFor(5 - 1, 6)).toBe(1) // 66 %
    expect(starsFor(0, TRACES_PER_RUN)).toBe(1)
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(7, 10)).toBe(2)
    expect(starsFor(0, 0)).toBe(1)
  })
})

describe('applyRun — progression persistée', () => {
  const N = LETTER_FAMILIES.length

  it('bestStars conserve le meilleur, runs s’incrémente, acquis fusionnés', () => {
    let p: LmaProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 'formes', 0, 3, ['rond', 'vague'], N)
    p = applyRun(p, 'formes', 0, 1, ['pont'], N)
    expect(p.bestStars).toBe(3)
    expect(p.runs).toBe(2)
    expect(p.acquired).toEqual({ rond: true, vague: true, pont: true })
  })

  it('2 étoiles sur la famille courante de lettres débloquent la suivante', () => {
    const p = applyRun({ ...FRESH_PROGRESS }, 'lettres', 0, 2, ['e'], N)
    expect(p.unlockedFamily).toBe(1)
  })

  it('1 étoile ne débloque rien ; l’atelier formes ne débloque jamais de famille', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 'lettres', 0, 1, [], N).unlockedFamily).toBe(0)
    expect(applyRun({ ...FRESH_PROGRESS }, 'formes', 0, 3, [], N).unlockedFamily).toBe(0)
  })

  it('rejouer une famille déjà passée ne reverrouille jamais', () => {
    const base: LmaProgress = { bestStars: 2, unlockedFamily: 3, runs: 5, acquired: {} }
    expect(applyRun(base, 'lettres', 0, 3, [], N).unlockedFamily).toBe(3)
    expect(applyRun(base, 'lettres', 1, 1, [], N).unlockedFamily).toBe(3)
  })

  it('la dernière famille ne débloque rien au-delà', () => {
    const base: LmaProgress = { bestStars: 0, unlockedFamily: N - 1, runs: 0, acquired: {} }
    expect(applyRun(base, 'lettres', N - 1, 3, [], N).unlockedFamily).toBe(N - 1)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: LmaProgress = { bestStars: 1, unlockedFamily: 0, runs: 1, acquired: { e: true } }
    applyRun(before, 'lettres', 0, 3, ['l'], N)
    expect(before).toEqual({ bestStars: 1, unlockedFamily: 0, runs: 1, acquired: { e: true } })
  })
})

// ------------------------------------------------------------
// Corpus audio
// ------------------------------------------------------------

describe('corpus audio — couverture complète, préfixe lma.', () => {
  it('ids valides, uniques, tous préfixés lma., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('lma.')).toBe(true)
      expect(['denise', 'eloise', 'henri']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('chaque tracé a son clip de geste (la fée) ET son clip de nom', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const s of ALL_STROKES) {
      expect(known.has(`lma.geste.${s.id}`), `geste manquant : ${s.id}`).toBe(true)
      expect(known.has(`lma.nom.${s.id}`), `nom manquant : ${s.id}`).toBe(true)
    }
  })

  it('tous les clips de structure utilisés par le jeu existent', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const id of [
      'lma.intro',
      'lma.atelier.formes',
      'lma.atelier.lettres',
      'lma.palier.regarde',
      'lma.palier.pointilles',
      'lma.palier.seule',
      'lma.encore',
      'lma.depart',
      'lma.acquise',
      'lma.famille.debloquee',
      'lma.verrou',
    ]) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })

  it('jamais le mot « faux » face à l’enfant', () => {
    for (const e of corpus.entries) {
      expect(e.text.toLowerCase()).not.toContain('faux')
    }
  })
})

// ------------------------------------------------------------
// Cohérence skill-map / manifest
// ------------------------------------------------------------

describe('cohérence avec le skill-map et le manifest', () => {
  it('les deux compétences travaillées existent dans le skill-map', () => {
    expect(SKILLS_BY_ID.has('fr.gs.graphisme.formes')).toBe(true)
    expect(SKILLS_BY_ID.has('fr.cp.ecriture.cursive')).toBe(true)
  })

  it('le manifest déclare le jeu avec les bons attributs', () => {
    const meta = GAMES_BY_ID.get('lettre-magique')
    expect(meta).toBeDefined()
    expect(meta?.skills).toEqual(['fr.gs.graphisme.formes', 'fr.cp.ecriture.cursive'])
    expect(meta?.island).toBe('sons')
    expect(meta?.status).toBe('v2')
    expect(meta?.icon).toBe('✍️')
    expect(meta?.accent).toBe('#6d4c41')
  })
})
