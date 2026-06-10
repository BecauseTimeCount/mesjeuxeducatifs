import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  addToGallery,
  applyRun,
  arrowCells,
  axisForLevel,
  checkGrid,
  colorClipId,
  colorCountFor,
  COLORS,
  coordLabel,
  copyPuzzle,
  DICTEE_CALLS_PER_GRID,
  DICTEE_GRIDS_PER_RUN,
  DICTEE_SIZE,
  emptyCells,
  FREE_COLORS,
  FREE_SIZE,
  FRESH_PROGRESS,
  generateCopyModel,
  generateDictee,
  generateFigurativeModel,
  generateMirrorPuzzle,
  generateSymmetricModel,
  GRIDS_PER_RUN,
  gridSizeFor,
  gridsFor,
  heartCells,
  hintCell,
  houseCells,
  inSourceRegion,
  isUsableModel,
  letterClipId,
  MAX_GALLERY,
  MAX_TUNER_LEVEL,
  mirrorSizeFor,
  MODE_SKILLS,
  paintCell,
  paintedCount,
  reflectH,
  reflectV,
  shapeBounds,
  starsFor,
} from './logic'
import type { ApxProgress, Axis, Cell, Model, SavedArt } from './logic'

const DRAWS = 100
const ALL_LEVELS: readonly number[] = [0, 1, MAX_TUNER_LEVEL]
const ALL_AXES: readonly Axis[] = ['vertical', 'horizontal', 'both']

function grid(model: Model): string[] {
  const out: string[] = []
  for (let r = 0; r < model.rows; r++) {
    out.push(
      model.cells
        .slice(r * model.cols, (r + 1) * model.cols)
        .map((v) => (v === 0 ? '.' : 'X'))
        .join(''),
    )
  }
  return out
}

describe('réglages du Tuner — tailles, couleurs, axes', () => {
  it('tailles de grille 5/6/8, miroir toujours pair, couleurs 2/3/4', () => {
    expect([gridSizeFor(0), gridSizeFor(1), gridSizeFor(2)]).toEqual([5, 6, 8])
    expect([mirrorSizeFor(0), mirrorSizeFor(1), mirrorSizeFor(2)]).toEqual([6, 6, 8])
    expect([colorCountFor(0), colorCountFor(1), colorCountFor(2)]).toEqual([2, 3, 4])
    for (const level of ALL_LEVELS) expect(mirrorSizeFor(level) % 2).toBe(0)
  })

  it('axes du miroir : vertical → horizontal → les deux (mandala)', () => {
    expect(axisForLevel(0)).toBe('vertical')
    expect(axisForLevel(1)).toBe('horizontal')
    expect(axisForLevel(2)).toBe('both')
  })

  it('niveaux hors bornes ou fractionnaires : clampés et tronqués', () => {
    expect(gridSizeFor(-5)).toBe(5)
    expect(gridSizeFor(99)).toBe(8)
    expect(gridSizeFor(1.9)).toBe(6)
    expect(colorCountFor(-1)).toBe(2)
    expect(axisForLevel(42)).toBe('both')
  })

  it('grilles par partie : 6 en copie/miroir/mémoire, 3 en dictée', () => {
    expect(gridsFor('copie')).toBe(GRIDS_PER_RUN)
    expect(gridsFor('miroir')).toBe(6)
    expect(gridsFor('memoire')).toBe(6)
    expect(gridsFor('dictee')).toBe(DICTEE_GRIDS_PER_RUN)
    expect(DICTEE_GRIDS_PER_RUN).toBe(3)
  })
})

describe('formes paramétrées — générées par algorithme, jamais figées', () => {
  it('heartCells(5) dessine le cœur classique', () => {
    const model: Model = { rows: 4, cols: 5, cells: emptyCells(4, 5) }
    for (const [r, c] of heartCells(5)) model.cells[r * 5 + c] = 1
    expect(grid(model)).toEqual(['.X.X.', 'XXXXX', '.XXX.', '..X..'])
  })

  it('heartCells(7) garde la structure : bosses, ligne pleine, cône vers la pointe', () => {
    const model: Model = { rows: 5, cols: 7, cells: emptyCells(5, 7) }
    for (const [r, c] of heartCells(7)) model.cells[r * 7 + c] = 1
    expect(grid(model)).toEqual(['.XX.XX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'])
  })

  it('heartCells refuse les largeurs paires ou trop petites', () => {
    expect(() => heartCells(4)).toThrow()
    expect(() => heartCells(3)).toThrow()
  })

  it('arrowCells : pointe triangulaire + tige, dans les 4 directions', () => {
    const up = arrowCells(2, 2, 'up')
    const m: Model = { rows: 4, cols: 3, cells: emptyCells(4, 3) }
    for (const [r, c] of up) m.cells[r * 3 + c] = 1
    expect(grid(m)).toEqual(['.X.', 'XXX', '.X.', '.X.'])
    // Les rotations conservent le nombre de cases et l'encombrement transposé
    for (const dir of ['down', 'left', 'right'] as const) {
      const pts = arrowCells(3, 2, dir)
      expect(pts).toHaveLength(arrowCells(3, 2, 'up').length)
      const b = shapeBounds(pts)
      const bu = shapeBounds(arrowCells(3, 2, 'up'))
      if (dir === 'down') expect(b).toEqual(bu)
      else expect(b).toEqual({ rows: bu.cols, cols: bu.rows })
    }
  })

  it('arrowCells down : la pointe est en bas', () => {
    const down = arrowCells(2, 2, 'down')
    const m: Model = { rows: 4, cols: 3, cells: emptyCells(4, 3) }
    for (const [r, c] of down) m.cells[r * 3 + c] = 1
    expect(grid(m)).toEqual(['.X.', '.X.', 'XXX', '.X.'])
  })

  it('houseCells : toit triangulaire, corps plein, porte centrée en bas', () => {
    const { roof, body, door } = houseCells(5, 3)
    const m: Model = { rows: 6, cols: 5, cells: emptyCells(6, 5) }
    for (const [r, c] of body) m.cells[r * 5 + c] = 1
    for (const [r, c] of roof) m.cells[r * 5 + c] = 1
    expect(grid(m)).toEqual(['..X..', '.XXX.', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX'])
    // La porte : 2 cases au centre des 2 dernières lignes du corps
    expect(door).toEqual([
      [4, 2],
      [5, 2],
    ])
  })
})

describe('generateFigurativeModel / generateSymmetricModel / generateCopyModel', () => {
  it('figuratif : tient toujours dans la grille, couleurs dans la palette', () => {
    for (const level of ALL_LEVELS) {
      const size = gridSizeFor(level)
      const colors = colorCountFor(level)
      for (let i = 0; i < DRAWS; i++) {
        const m = generateFigurativeModel(size, colors)
        expect(m.cells).toHaveLength(size * size)
        for (const v of m.cells) {
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(colors)
        }
        expect(paintedCount(m.cells)).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('symétrique : reflet vertical exact, jamais vide', () => {
    for (const level of ALL_LEVELS) {
      const size = gridSizeFor(level)
      for (let i = 0; i < DRAWS; i++) {
        const m = generateSymmetricModel(size, colorCountFor(level))
        for (let idx = 0; idx < m.cells.length; idx++) {
          expect(m.cells[idx]).toBe(m.cells[reflectV(idx, size)])
        }
        expect(paintedCount(m.cells)).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('modèle de copie : TOUJOURS utilisable (≥ 4 cases, jamais plein)', () => {
    for (const level of ALL_LEVELS) {
      const size = gridSizeFor(level)
      for (let i = 0; i < DRAWS; i++) {
        const m = generateCopyModel(size, colorCountFor(level))
        expect(isUsableModel(m)).toBe(true)
      }
    }
  })

  it('le rng injecté rend la génération déterministe', () => {
    const seq = [0.1, 0.7, 0.3, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6, 0.05]
    const rngA = (() => {
      let i = 0
      return () => seq[i++ % seq.length] as number
    })()
    const rngB = (() => {
      let i = 0
      return () => seq[i++ % seq.length] as number
    })()
    expect(generateCopyModel(6, 3, rngA)).toEqual(generateCopyModel(6, 3, rngB))
  })
})

describe('reflets et région source du miroir', () => {
  it('reflectV / reflectH : involutions correctes sur une grille 6×6', () => {
    const size = 6
    for (let i = 0; i < size * size; i++) {
      expect(reflectV(reflectV(i, size), size)).toBe(i)
      expect(reflectH(reflectH(i, size, size), size, size)).toBe(i)
    }
    expect(reflectV(0, 6)).toBe(5) // (0,0) → (0,5)
    expect(reflectH(0, 6, 6)).toBe(30) // (0,0) → (5,0)
  })

  it('inSourceRegion : moitié gauche, moitié haute, quadrant haut-gauche', () => {
    const size = 6
    const count = (axis: Axis): number =>
      Array.from({ length: size * size }, (_, i) => i).filter((i) =>
        inSourceRegion(i, size, axis),
      ).length
    expect(count('vertical')).toBe(18)
    expect(count('horizontal')).toBe(18)
    expect(count('both')).toBe(9)
    expect(inSourceRegion(2, 6, 'vertical')).toBe(true) // (0,2)
    expect(inSourceRegion(3, 6, 'vertical')).toBe(false) // (0,3)
  })
})

describe('generateMirrorPuzzle — la moitié donnée, le reflet à compléter', () => {
  it('cible exactement symétrique selon l’axe, source verrouillée, reste vide', () => {
    for (const level of ALL_LEVELS) {
      const size = mirrorSizeFor(level)
      const axis = axisForLevel(level)
      for (let i = 0; i < DRAWS; i++) {
        const p = generateMirrorPuzzle(size, colorCountFor(level), axis)
        expect(p.axis).toBe(axis)
        for (let idx = 0; idx < p.target.length; idx++) {
          if (axis === 'vertical' || axis === 'both') {
            expect(p.target[idx]).toBe(p.target[reflectV(idx, size)])
          }
          if (axis === 'horizontal' || axis === 'both') {
            expect(p.target[idx]).toBe(p.target[reflectH(idx, size, size)])
          }
          // Verrouillage = toute la région source ; start = cible sur la
          // source, vide ailleurs.
          expect(p.locked[idx]).toBe(inSourceRegion(idx, size, axis))
          expect(p.start[idx]).toBe(p.locked[idx] ? p.target[idx] : 0)
        }
      }
    }
  })

  it('au moins 3 cases peintes dans la source — le puzzle a de la matière', () => {
    for (const axis of ALL_AXES) {
      for (let i = 0; i < DRAWS; i++) {
        const p = generateMirrorPuzzle(6, 3, axis)
        const sourcePainted = p.start.filter((v, idx) => (p.locked[idx] ?? false) && v !== 0)
        expect(sourcePainted.length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('compléter le start avec la cible passe toujours la validation', () => {
    for (const axis of ALL_AXES) {
      const p = generateMirrorPuzzle(8, 4, axis)
      expect(checkGrid([...p.target], p.target, p.locked).ok).toBe(true)
      // Le start seul n'est pas suffisant (il manque le reflet)
      expect(checkGrid(p.start, p.target, p.locked).ok).toBe(false)
    }
  })

  it('refuse une taille impaire (l’axe passe entre deux colonnes)', () => {
    expect(() => generateMirrorPuzzle(5, 2, 'vertical')).toThrow()
  })
})

describe('checkGrid — validation cellule à cellule', () => {
  const target: Cell[] = [1, 0, 2, 0]

  it('grille exacte → ok, aucun défaut', () => {
    expect(checkGrid([1, 0, 2, 0], target)).toEqual({ ok: true, wrong: [], missing: [] })
  })

  it('mauvaise couleur ou case en trop → wrong ; case attendue vide → missing', () => {
    const v = checkGrid([2, 1, 0, 0], target)
    expect(v.ok).toBe(false)
    expect(v.wrong).toEqual([0, 1]) // 0 : mauvaise couleur, 1 : en trop
    expect(v.missing).toEqual([2])
  })

  it('les cases verrouillées sont ignorées (correctes par construction)', () => {
    const v = checkGrid([0, 0, 2, 0], target, [true, false, false, false])
    expect(v.ok).toBe(true)
  })

  it('hintCell : une fautive d’abord, sinon une manquante, sinon null', () => {
    expect(hintCell({ ok: false, wrong: [3, 1], missing: [2] })).toBe(3)
    expect(hintCell({ ok: false, wrong: [], missing: [2] })).toBe(2)
    expect(hintCell({ ok: true, wrong: [], missing: [] })).toBeNull()
  })
})

describe('paintCell — peindre, repeindre, effacer', () => {
  it('peint la couleur choisie, re-taper la même couleur efface', () => {
    let cells: Cell[] = [0, 0]
    cells = paintCell(cells, 0, 2)
    expect(cells).toEqual([2, 0])
    cells = paintCell(cells, 0, 3) // autre couleur : repeint directement
    expect(cells).toEqual([3, 0])
    cells = paintCell(cells, 0, 3) // même couleur : efface
    expect(cells).toEqual([0, 0])
  })

  it('ne touche jamais une case verrouillée ni un index hors grille', () => {
    const locked = [true, false]
    expect(paintCell([1, 0], 0, 2, locked)).toEqual([1, 0])
    expect(paintCell([1, 0], -1, 2)).toEqual([1, 0])
    expect(paintCell([1, 0], 5, 2)).toEqual([1, 0])
  })

  it('ne mute jamais le tableau d’entrée', () => {
    const before: Cell[] = [0, 1]
    paintCell(before, 0, 2)
    expect(before).toEqual([0, 1])
  })
})

describe('dictée — coordonnées A-F × 1-6, fresque surprise', () => {
  it('coordLabel : colonne = lettre, ligne = nombre (B3 = colonne B, ligne 3)', () => {
    expect(coordLabel(0, 0)).toBe('A1')
    expect(coordLabel(2, 1)).toBe('B3')
    expect(coordLabel(5, 5)).toBe('F6')
    expect(() => coordLabel(6, 0)).toThrow()
    expect(() => coordLabel(0, 6)).toThrow()
  })

  it('letterClipId / colorClipId : ids des clips composés', () => {
    expect(letterClipId(0)).toBe('apx.lettre.a')
    expect(letterClipId(5)).toBe('apx.lettre.f')
    expect(() => letterClipId(6)).toThrow()
    expect(colorClipId(1)).toBe('apx.couleur.rouge')
    expect(colorClipId(COLORS.length)).toBe(`apx.couleur.${COLORS[COLORS.length - 1]?.id}`)
    expect(() => colorClipId(0)).toThrow()
    expect(() => colorClipId(99)).toThrow()
  })

  it('8 dictées uniques, toutes peintes dans la fresque, à la bonne couleur', () => {
    for (let i = 0; i < DRAWS; i++) {
      const d = generateDictee(3)
      expect(d.rows).toBe(DICTEE_SIZE)
      expect(d.cols).toBe(DICTEE_SIZE)
      expect(d.calls).toHaveLength(DICTEE_CALLS_PER_GRID)
      expect(new Set(d.calls.map((c) => c.index)).size).toBe(DICTEE_CALLS_PER_GRID)
      for (const call of d.calls) {
        expect(call.index).toBe(call.row * DICTEE_SIZE + call.col)
        expect(call.row).toBeGreaterThanOrEqual(0)
        expect(call.row).toBeLessThan(DICTEE_SIZE)
        expect(call.col).toBeGreaterThanOrEqual(0)
        expect(call.col).toBeLessThan(DICTEE_SIZE)
        expect(call.color).toBe(d.target[call.index])
        expect(call.color).toBeGreaterThanOrEqual(1)
        expect(call.color).toBeLessThanOrEqual(3)
        // Le clip de chaque dictée est composable : lettre + nombre + couleur
        expect(letterClipId(call.col)).toMatch(/^apx\.lettre\.[a-f]$/)
        expect(colorClipId(call.color)).toMatch(/^apx\.couleur\./)
      }
      // La fresque dépasse les cases dictées : il y a un dessin à révéler
      expect(paintedCount(d.target)).toBeGreaterThanOrEqual(DICTEE_CALLS_PER_GRID)
    }
  })
})

describe('copyPuzzle — grille de copie vierge face au modèle', () => {
  it('start vide, rien de verrouillé, cible = modèle (copie défensive)', () => {
    const model = generateCopyModel(5, 2)
    const p = copyPuzzle(model, 2)
    expect(p.start.every((v) => v === 0)).toBe(true)
    expect(p.locked.every((v) => !v)).toBe(true)
    expect(p.target).toEqual(model.cells)
    expect(p.target).not.toBe(model.cells)
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1 (parties de 6 grilles)', () => {
    expect(starsFor(6, 6)).toBe(3)
    expect(starsFor(5, 6)).toBe(2) // 83 %
    expect(starsFor(4, 6)).toBe(1) // 67 %
    expect(starsFor(0, 6)).toBe(1)
  })

  it('parties de dictée (3 grilles)', () => {
    expect(starsFor(3, 3)).toBe(3)
    expect(starsFor(2, 3)).toBe(1) // 67 %
  })
})

describe('applyRun — progression par mode', () => {
  it('bestStars conserve le meilleur score par mode, runs s’incrémente', () => {
    let p: ApxProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 'copie', 3)
    p = applyRun(p, 'copie', 1)
    p = applyRun(p, 'miroir', 2)
    expect(p.bestStars.copie).toBe(3)
    expect(p.bestStars.miroir).toBe(2)
    expect(p.bestStars.dictee).toBeUndefined()
    expect(p.runs).toBe(3)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: ApxProgress = { bestStars: { copie: 1 }, runs: 1 }
    applyRun(before, 'copie', 3)
    expect(before).toEqual({ bestStars: { copie: 1 }, runs: 1 })
  })
})

describe('galerie du mode libre', () => {
  const art = (ts: number): SavedArt => ({
    rows: FREE_SIZE,
    cols: FREE_SIZE,
    cells: emptyCells(FREE_SIZE, FREE_SIZE),
    ts,
  })

  it('ajoute en tête, plafonne à 12 (les plus anciennes sortent)', () => {
    let g: SavedArt[] = []
    for (let i = 1; i <= MAX_GALLERY + 3; i++) g = addToGallery(g, art(i))
    expect(g).toHaveLength(MAX_GALLERY)
    expect(g[0]?.ts).toBe(MAX_GALLERY + 3)
    expect(g[MAX_GALLERY - 1]?.ts).toBe(4)
  })

  it('ne mute pas la galerie d’entrée', () => {
    const before = [art(1)]
    addToGallery(before, art(2))
    expect(before).toHaveLength(1)
  })

  it('le jouet libre : grille 10×10, 8 couleurs', () => {
    expect(FREE_SIZE).toBe(10)
    expect(FREE_COLORS).toBe(8)
    expect(COLORS).toHaveLength(8)
  })
})

describe('corpus audio — couverture complète, préfixe apx.', () => {
  it('ids valides, uniques, tous préfixés apx., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('apx.')).toBe(true)
      expect(['denise', 'eloise']).toContain(e.voice)
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
    const needed = [
      'apx.intro',
      'apx.consigne.copie',
      'apx.consigne.miroir',
      'apx.consigne.memoire',
      'apx.consigne.dictee',
      'apx.consigne.libre',
      'apx.mode.copie',
      'apx.mode.miroir',
      'apx.mode.memoire',
      'apx.mode.dictee',
      'apx.mode.libre',
      'apx.cache',
      'apx.revoir',
      'apx.presque',
      'apx.indice',
      'apx.indice.dictee',
      'apx.bravo-grille',
      'apx.fresque',
      'apx.ecoute',
      'apx.galerie',
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((l) => `apx.lettre.${l}`),
      ...COLORS.map((c) => `apx.couleur.${c.id}`),
    ]
    for (const id of needed) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('chaque mode objectif exerce une compétence connue du skill-map', () => {
    expect(MODE_SKILLS.copie).toBe('lo.gs.quadrillage')
    expect(MODE_SKILLS.memoire).toBe('lo.gs.quadrillage')
    expect(MODE_SKILLS.miroir).toBe('lo.cp.symetrie')
    expect(MODE_SKILLS.dictee).toBe('lo.cp.coordonnees')
    for (const id of Object.values(MODE_SKILLS)) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('le manifest déclare le jeu et exactement les skills des modes', () => {
    const meta = GAMES_BY_ID.get('atelier-pixel')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(new Set(meta.skills)).toEqual(new Set(Object.values(MODE_SKILLS)))
    expect(meta.island).toBe('robots')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('🎨')
    expect(meta.accent).toBe('#4527a0')
  })
})
