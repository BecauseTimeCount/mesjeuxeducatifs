import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  ALL_SYMBOLS,
  applyRun,
  blanksFor,
  candidates,
  CELLS,
  colOf,
  conflictCells,
  countSolutions,
  EMPTY,
  FRESH_PROGRESS,
  generateItem,
  gridKey,
  hasUniqueSolution,
  isComplete,
  isSolved,
  isValidPlacement,
  ITEMS_PER_RUN,
  makePuzzle,
  MAX_TUNER_LEVEL,
  PIECES,
  place,
  regionOf,
  rowOf,
  SIZE,
  solvedGrid,
  starsFor,
  TIER_COUNT,
  TIER_SKILLS,
  type CrmProgress,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('géométrie de la grille', () => {
  it('SIZE = 4, CELLS = 16', () => {
    expect(SIZE).toBe(4)
    expect(CELLS).toBe(16)
  })

  it('rowOf / colOf / regionOf sont cohérents', () => {
    // Coin haut-gauche
    expect(rowOf(0)).toBe(0)
    expect(colOf(0)).toBe(0)
    expect(regionOf(0)).toBe(0)
    // (1,1) reste dans la région 0
    expect(regionOf(5)).toBe(0)
    // (0,2) → région 1
    expect(regionOf(2)).toBe(1)
    // (2,0) → région 2
    expect(regionOf(8)).toBe(2)
    // (3,3) → région 3
    expect(regionOf(15)).toBe(3)
  })

  it('chaque région 2x2 contient exactement 4 cases', () => {
    const counts = [0, 0, 0, 0]
    for (let i = 0; i < CELLS; i++) counts[regionOf(i)] += 1
    expect(counts).toEqual([4, 4, 4, 4])
  })
})

describe('pièces de robot', () => {
  it('4 pièces, symboles 0..3 uniques, emojis et ids distincts', () => {
    expect(PIECES).toHaveLength(SIZE)
    expect(new Set(PIECES.map((p) => p.sym))).toEqual(new Set([0, 1, 2, 3]))
    expect(new Set(PIECES.map((p) => p.emoji)).size).toBe(4)
    expect(new Set(PIECES.map((p) => p.id)).size).toBe(4)
    expect(new Set(PIECES.map((p) => p.accent)).size).toBe(4)
  })
})

describe('solvedGrid', () => {
  it('200 grilles : toutes des sudokus 4x4 valides et complets', () => {
    for (let i = 0; i < 200; i++) {
      const g = solvedGrid()
      expect(g).toHaveLength(CELLS)
      for (const v of g) expect(ALL_SYMBOLS).toContain(v)
      expect(isComplete(g)).toBe(true)
      expect(isSolved(g)).toBe(true)
    }
  })

  it('chaque ligne, colonne et région contient les 4 symboles', () => {
    for (let n = 0; n < 50; n++) {
      const g = solvedGrid()
      for (let k = 0; k < SIZE; k++) {
        const row = new Set<number>()
        const col = new Set<number>()
        const reg = new Set<number>()
        for (let i = 0; i < CELLS; i++) {
          if (rowOf(i) === k) row.add(g[i])
          if (colOf(i) === k) col.add(g[i])
          if (regionOf(i) === k) reg.add(g[i])
        }
        expect(row).toEqual(new Set([0, 1, 2, 3]))
        expect(col).toEqual(new Set([0, 1, 2, 3]))
        expect(reg).toEqual(new Set([0, 1, 2, 3]))
      }
    }
  })

  it('produit plusieurs grilles distinctes (aléatoire réel)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(gridKey(solvedGrid()))
    expect(seen.size).toBeGreaterThan(5)
  })
})

describe('contraintes (isValidPlacement / conflictCells / candidates)', () => {
  it('isValidPlacement refuse un doublon de ligne/colonne/région', () => {
    const g = solvedGrid()
    // Sur une grille pleine, chaque case porte déjà l'unique symbole valide ;
    // tout AUTRE symbole y est invalide.
    for (let i = 0; i < CELLS; i++) {
      const good = g[i]
      for (const sym of ALL_SYMBOLS) {
        // isValidPlacement ignore la case i elle-même : seul `good` y est posable.
        expect(isValidPlacement(g, i, sym)).toBe(sym === good)
      }
    }
  })

  it('conflictCells liste les cases en conflit, vide si placement valide', () => {
    const g = solvedGrid()
    // Case vide : on en retire une et on vérifie ses conflits.
    const test = [...g]
    const idx = 5
    const good = test[idx]
    test[idx] = EMPTY
    // Le bon symbole n'a pas de conflit
    expect(conflictCells(test, idx, good)).toHaveLength(0)
    // Un mauvais symbole a au moins un conflit (ligne/col/région)
    for (const sym of ALL_SYMBOLS) {
      if (sym === good) continue
      expect(conflictCells(test, idx, sym).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('candidates retourne vide pour une case occupée, et les bons symboles pour une case vide', () => {
    const g = solvedGrid()
    expect(candidates(g, 0)).toEqual([]) // case occupée
    const test = [...g]
    const idx = 10
    const good = test[idx]
    test[idx] = EMPTY
    expect(candidates(test, idx)).toEqual([good]) // une seule possibilité ici
  })
})

describe('countSolutions / unicité', () => {
  it('une grille pleine valide a exactement 1 solution', () => {
    for (let i = 0; i < 20; i++) {
      expect(countSolutions(solvedGrid())).toBe(1)
    }
  })

  it('une grille trop vide a plusieurs solutions (cap à 2)', () => {
    // Grille entièrement vide : énormément de solutions → countSolutions plafonne à 2.
    const blank = new Array<number>(CELLS).fill(EMPTY)
    expect(countSolutions(blank, 2)).toBe(2)
    expect(hasUniqueSolution(blank)).toBe(false)
  })

  it('une grille pleine sauf une case garde l’unicité', () => {
    const g = solvedGrid()
    const test = [...g]
    test[7] = EMPTY
    expect(hasUniqueSolution(test)).toBe(true)
  })
})

describe('makePuzzle / generateItem : grilles résolubles à solution unique', () => {
  for (const tier of TIERS) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 120 grilles uniques, given ⊂ solution, candidats non vides`, () => {
        for (let n = 0; n < 120; n++) {
          const item = makePuzzle(tier, level)
          // solution = vrai sudoku
          expect(item.solution).toHaveLength(CELLS)
          expect(isSolved(item.solution)).toBe(true)
          // given : valeurs = solution là où donné, EMPTY ailleurs, au moins 1 trou
          let blanks = 0
          for (let i = 0; i < CELLS; i++) {
            if (item.given[i] === EMPTY) {
              blanks += 1
            } else {
              expect(item.given[i]).toBe(item.solution[i])
            }
          }
          expect(blanks).toBeGreaterThanOrEqual(1)
          // solution UNIQUE
          expect(hasUniqueSolution(item.given)).toBe(true)
          // toute case vide a au moins un candidat (jamais d'impasse)
          for (let i = 0; i < CELLS; i++) {
            if (item.given[i] === EMPTY) {
              expect(candidates(item.given, i).length).toBeGreaterThanOrEqual(1)
            }
          }
          // la solution est atteignable depuis given (place tous les EMPTY)
          let work = [...item.given]
          for (let i = 0; i < CELLS; i++) {
            if (work[i] === EMPTY) {
              const next = place(work, i, item.solution[i])
              expect(next).not.toBeNull()
              if (next) work = next
            }
          }
          expect(isSolved(work)).toBe(true)
        }
      })
    }
  }

  it('le nombre de trous suit le palier (au moins blanksFor en moyenne)', () => {
    // T3 doit creuser plus que T0.
    const blanksT0 = makePuzzle(0, 0).given.filter((v) => v === EMPTY).length
    const blanksT3 = makePuzzle(3, 1).given.filter((v) => v === EMPTY).length
    expect(blanksT0).toBeGreaterThanOrEqual(1)
    expect(blanksT3).toBeGreaterThanOrEqual(blanksT0)
    expect(blanksFor(0, 0)).toBe(2)
    expect(blanksFor(3, 0)).toBe(6)
  })

  it('avoid : la grille générée diffère de la signature évitée', () => {
    const first = makePuzzle(1, 1)
    const key = gridKey(first.given)
    let differ = 0
    for (let i = 0; i < 30; i++) {
      if (gridKey(makePuzzle(1, 1, key).given) !== key) differ += 1
    }
    // L'immense majorité doit différer (générateur aléatoire).
    expect(differ).toBeGreaterThanOrEqual(28)
  })

  it('generateItem délègue à makePuzzle (même contrat)', () => {
    const item = generateItem(2, 0)
    expect(hasUniqueSolution(item.given)).toBe(true)
    expect(isSolved(item.solution)).toBe(true)
  })
})

describe('place', () => {
  it('refuse une case occupée ou un placement invalide, accepte un placement valide', () => {
    const g = solvedGrid()
    expect(place(g, 0, g[1])).toBeNull() // case occupée
    const test = [...g]
    const good = test[6]
    test[6] = EMPTY
    // mauvais symbole refusé
    for (const sym of ALL_SYMBOLS) {
      if (sym === good) continue
      expect(place(test, 6, sym)).toBeNull()
    }
    // bon symbole accepté
    const ok = place(test, 6, good)
    expect(ok).not.toBeNull()
    expect(ok?.[6]).toBe(good)
  })

  it('place ne mute pas la grille d’entrée', () => {
    const test = new Array<number>(CELLS).fill(EMPTY)
    const out = place(test, 0, 0)
    expect(test[0]).toBe(EMPTY)
    expect(out?.[0]).toBe(0)
  })
})

describe('score & progression', () => {
  it('starsFor : seuils 90 % / 70 %', () => {
    expect(starsFor(5, 5)).toBe(3)
    expect(starsFor(4, 5)).toBe(2) // 0.8
    expect(starsFor(3, 5)).toBe(1) // 0.6
    expect(starsFor(0, 0)).toBe(1)
  })

  it('applyRun débloque le palier suivant à 2 étoiles et garde le meilleur', () => {
    let p: CrmProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 1)
    expect(p.unlockedTier).toBe(0)
    p = applyRun(p, 0, 3)
    expect(p.unlockedTier).toBe(1)
    expect(p.bestStars[0]).toBe(3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3) // ne régresse jamais
    expect(p.runs).toBe(3)
  })

  it('le déblocage est plafonné au dernier palier', () => {
    const last = (TIER_COUNT - 1) as TierId
    let p: CrmProgress = { ...FRESH_PROGRESS, unlockedTier: last }
    p = applyRun(p, last, 3)
    expect(p.unlockedTier).toBe(last)
  })
})

describe('cohérence skill-map / manifest', () => {
  it('toutes les compétences des paliers existent dans le skill-map', () => {
    for (const id of TIER_SKILLS) expect(SKILLS_BY_ID.has(id)).toBe(true)
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect(ITEMS_PER_RUN).toBe(5)
  })

  it('le manifest déclare exactement les compétences des paliers (dédupliquées)', () => {
    const meta = GAMES_BY_ID.get('carre-magique')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})
