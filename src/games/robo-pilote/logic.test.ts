import { describe, expect, it } from 'vitest'
import type { Block, Cell, Dir, Puzzle } from './logic'
import {
  DIRS,
  MIN_STRAIGHT_RUN_T3,
  REPEAT_MAX,
  REPEAT_MIN,
  TIERS,
  compressToBlocks,
  compressedLength,
  expandProgram,
  generatePuzzle,
  inBounds,
  makeCustomPuzzle,
  maxRunLength,
  moveCell,
  runLengths,
  sameCell,
  simulate,
  solvePath,
  tracePath,
} from './logic'

const N_GEN = 200

function moveBlocks(dirs: readonly Dir[]): Block[] {
  return dirs.map((dir): Block => ({ kind: 'move', dir }))
}

function keyOf(c: Cell): string {
  return `${c.x},${c.y}`
}

// ============================================================
// Génération procédurale — 200 puzzles par palier
// ============================================================

describe.each([0, 1, 2, 3])('génération palier T%i (200 puzzles)', (tier) => {
  const params = TIERS[tier]
  const puzzles = Array.from({ length: N_GEN }, () => generatePuzzle(tier))

  it('chaque puzzle est RÉSOLUBLE : le chemin optimal mène au trésor', () => {
    for (const p of puzzles) {
      const res = simulate(p, moveBlocks(p.optimalPath))
      expect(res.outcome).toBe('treasure')
      expect(sameCell(res.end, p.treasure)).toBe(true)
    }
  })

  it('longueur du chemin optimal dans les bornes du palier', () => {
    for (const p of puzzles) {
      expect(p.optimalPath.length).toBeGreaterThanOrEqual(params.pathLen[0])
      expect(p.optimalPath.length).toBeLessThanOrEqual(params.pathLen[1])
    }
  })

  it('nombre d’obstacles dans les bornes, taille de grille du palier', () => {
    for (const p of puzzles) {
      expect(p.size).toBe(params.grid)
      expect(p.obstacles.length).toBeGreaterThanOrEqual(params.obstacles[0])
      expect(p.obstacles.length).toBeLessThanOrEqual(params.obstacles[1])
    }
  })

  it('jamais de trésor sur le robot, ni robot/trésor sur un obstacle, tout en grille', () => {
    for (const p of puzzles) {
      expect(sameCell(p.robot, p.treasure)).toBe(false)
      const blocked = new Set(p.obstacles.map(keyOf))
      expect(blocked.has(keyOf(p.robot))).toBe(false)
      expect(blocked.has(keyOf(p.treasure))).toBe(false)
      expect(blocked.size).toBe(p.obstacles.length) // obstacles tous distincts
      for (const c of [p.robot, p.treasure, ...p.obstacles]) {
        expect(inBounds(c, p.size)).toBe(true)
      }
    }
  })

  it('budget TOUJOURS suffisant avec compression : le programme compressé tient et résout', () => {
    for (const p of puzzles) {
      const blocks = compressToBlocks(p.optimalPath)
      expect(blocks.length).toBe(compressedLength(p.optimalPath))
      expect(blocks.length).toBeLessThanOrEqual(p.budget)
      expect(simulate(p, blocks).outcome).toBe('treasure')
    }
  })
})

describe('budgets par palier', () => {
  it('T0–T2 : budget = chemin optimal + 2 (résoluble à plat)', () => {
    for (const tier of [0, 1, 2]) {
      for (let i = 0; i < 50; i++) {
        const p = generatePuzzle(tier)
        expect(p.budget).toBe(p.optimalPath.length + 2)
      }
    }
  })

  it('T3 : budget STRICTEMENT inférieur au chemin à plat (la boucle est obligatoire)', () => {
    for (let i = 0; i < N_GEN; i++) {
      const p = generatePuzzle(3)
      expect(p.budget).toBeLessThan(p.optimalPath.length)
      expect(p.budget).toBeGreaterThanOrEqual(compressedLength(p.optimalPath))
    }
  })

  it('T3 : au moins un segment rectiligne ≥ 3 pour rentabiliser la boucle', () => {
    for (let i = 0; i < N_GEN; i++) {
      const p = generatePuzzle(3)
      expect(maxRunLength(p.optimalPath)).toBeGreaterThanOrEqual(MIN_STRAIGHT_RUN_T3)
    }
  })

  it('targetLen reste dans les bornes du palier', () => {
    for (const target of [0, 2, 7, 99]) {
      const p = generatePuzzle(1, target)
      expect(p.optimalPath.length).toBeGreaterThanOrEqual(TIERS[1].pathLen[0])
      expect(p.optimalPath.length).toBeLessThanOrEqual(TIERS[1].pathLen[1])
      expect(simulate(p, moveBlocks(p.optimalPath)).outcome).toBe('treasure')
    }
  })
})

// ============================================================
// Simulation
// ============================================================

describe('simulate', () => {
  const puzzle: Puzzle = {
    tier: 0,
    size: 5,
    robot: { x: 0, y: 0 },
    treasure: { x: 2, y: 0 },
    obstacles: [{ x: 1, y: 1 }],
    optimalPath: ['right', 'right'],
    budget: 4,
  }

  it('trésor atteint avec le bon programme', () => {
    const res = simulate(puzzle, moveBlocks(['right', 'right']))
    expect(res.outcome).toBe('treasure')
    expect(res.end).toEqual({ x: 2, y: 0 })
    expect(res.steps).toHaveLength(2)
    expect(res.steps.every((s) => s.ok)).toBe(true)
  })

  it('bord : sortir de la grille arrête l’exécution sur un pas raté', () => {
    const res = simulate(puzzle, moveBlocks(['up']))
    expect(res.outcome).toBe('wall')
    expect(res.failCell).toEqual({ x: 0, y: -1 })
    expect(res.end).toEqual({ x: 0, y: 0 })
    expect(res.steps).toHaveLength(1)
    expect(res.steps[0].ok).toBe(false)
  })

  it('rocher : percuter un obstacle arrête l’exécution et le signale', () => {
    const res = simulate(puzzle, moveBlocks(['down', 'right', 'right']))
    expect(res.outcome).toBe('rock')
    expect(res.failCell).toEqual({ x: 1, y: 1 })
    expect(res.end).toEqual({ x: 0, y: 1 }) // le robot reste avant l'obstacle
    expect(res.steps).toHaveLength(2)
    expect(res.steps[1].ok).toBe(false)
  })

  it('programme trop court : le robot s’arrête avant le trésor', () => {
    const res = simulate(puzzle, moveBlocks(['right']))
    expect(res.outcome).toBe('short')
    expect(res.end).toEqual({ x: 1, y: 0 })
    expect(res.failCell).toBeUndefined()
  })

  it('trésor atteint en cours de programme : les blocs restants sont ignorés', () => {
    const res = simulate(puzzle, moveBlocks(['right', 'right', 'right', 'up']))
    expect(res.outcome).toBe('treasure')
    expect(res.steps).toHaveLength(2)
  })

  it('programme vide : short, le robot ne bouge pas', () => {
    const res = simulate(puzzle, [])
    expect(res.outcome).toBe('short')
    expect(res.end).toEqual(puzzle.robot)
    expect(res.steps).toHaveLength(0)
  })

  it('bloc répéter exécuté pas à pas', () => {
    const res = simulate(puzzle, [{ kind: 'repeat', dir: 'right', times: 2 }])
    expect(res.outcome).toBe('treasure')
    expect(res.steps).toHaveLength(2)
  })
})

// ============================================================
// Compression / expansion
// ============================================================

describe('expandProgram / compression', () => {
  it('expandProgram déroule moves et repeats dans l’ordre', () => {
    const blocks: Block[] = [
      { kind: 'move', dir: 'up' },
      { kind: 'repeat', dir: 'right', times: 3 },
      { kind: 'move', dir: 'down' },
    ]
    expect(expandProgram(blocks)).toEqual(['up', 'right', 'right', 'right', 'down'])
  })

  it('runLengths et maxRunLength', () => {
    const dirs: Dir[] = ['right', 'right', 'right', 'up', 'right', 'right']
    expect(runLengths(dirs)).toEqual([3, 1, 2])
    expect(maxRunLength(dirs)).toBe(3)
    expect(maxRunLength([])).toBe(0)
  })

  it('compressedLength : pas isolés = 1 emplacement chacun', () => {
    expect(compressedLength(['right', 'up', 'left'])).toBe(3)
  })

  it('compressedLength : une suite de 6 pas = 2 emplacements (répéter ≤ 5)', () => {
    const six: Dir[] = Array.from({ length: 6 }, (): Dir => 'down')
    expect(compressedLength(six)).toBe(2)
    const five: Dir[] = Array.from({ length: 5 }, (): Dir => 'down')
    expect(compressedLength(five)).toBe(1)
  })

  it('compressToBlocks : l’expansion redonne exactement le chemin (50 chemins aléatoires)', () => {
    for (let i = 0; i < 50; i++) {
      const dirs: Dir[] = Array.from(
        { length: 1 + Math.floor(Math.random() * 30) },
        () => DIRS[Math.floor(Math.random() * DIRS.length)],
      )
      expect(expandProgram(compressToBlocks(dirs))).toEqual(dirs)
      expect(compressToBlocks(dirs).length).toBe(compressedLength(dirs))
    }
  })

  it('compressToBlocks : jamais de répéter hors bornes [2..5]', () => {
    const dirs: Dir[] = [
      ...Array.from({ length: 11 }, (): Dir => 'right'),
      'up',
      ...Array.from({ length: 2 }, (): Dir => 'left'),
    ]
    for (const b of compressToBlocks(dirs)) {
      if (b.kind === 'repeat') {
        expect(b.times).toBeGreaterThanOrEqual(REPEAT_MIN)
        expect(b.times).toBeLessThanOrEqual(REPEAT_MAX)
      }
    }
  })

  it('compressToBlocks : chemin vide → aucun bloc', () => {
    expect(compressToBlocks([])).toEqual([])
  })
})

// ============================================================
// Géométrie
// ============================================================

describe('géométrie', () => {
  it('moveCell applique le bon vecteur', () => {
    expect(moveCell({ x: 2, y: 2 }, 'up')).toEqual({ x: 2, y: 1 })
    expect(moveCell({ x: 2, y: 2 }, 'down')).toEqual({ x: 2, y: 3 })
    expect(moveCell({ x: 2, y: 2 }, 'left')).toEqual({ x: 1, y: 2 })
    expect(moveCell({ x: 2, y: 2 }, 'right')).toEqual({ x: 3, y: 2 })
  })

  it('inBounds détecte les bords', () => {
    expect(inBounds({ x: 0, y: 0 }, 5)).toBe(true)
    expect(inBounds({ x: 4, y: 4 }, 5)).toBe(true)
    expect(inBounds({ x: 5, y: 0 }, 5)).toBe(false)
    expect(inBounds({ x: 0, y: -1 }, 5)).toBe(false)
  })

  it('tracePath liste les cases visitées (départ exclu, arrivée incluse)', () => {
    expect(tracePath({ x: 0, y: 0 }, ['right', 'down'])).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ])
    expect(tracePath({ x: 3, y: 3 }, [])).toEqual([])
  })
})

// ============================================================
// Atelier — solvePath / makeCustomPuzzle
// ============================================================

describe('atelier (solvePath / makeCustomPuzzle)', () => {
  it('trouve un chemin sur une grille libre', () => {
    const path = solvePath(3, [], { x: 0, y: 0 }, { x: 2, y: 2 })
    expect(path).toHaveLength(4)
    const visited = tracePath({ x: 0, y: 0 }, path)
    expect(visited[visited.length - 1]).toEqual({ x: 2, y: 2 })
  })

  it('mur de rochers infranchissable → []', () => {
    const wall: Cell[] = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]
    expect(solvePath(3, wall, { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([])
  })

  it('configurations invalides → []', () => {
    expect(solvePath(3, [], { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([])
    expect(solvePath(3, [{ x: 2, y: 2 }], { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([])
    expect(solvePath(3, [{ x: 0, y: 0 }], { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([])
  })

  it('makeCustomPuzzle : null si insoluble, sinon résoluble dans le budget', () => {
    const wall: Cell[] = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 1, y: 4 },
      { x: 1, y: 5 },
    ]
    expect(makeCustomPuzzle({ x: 0, y: 0 }, { x: 3, y: 3 }, wall, 6)).toBeNull()

    const p = makeCustomPuzzle({ x: 0, y: 0 }, { x: 5, y: 5 }, [{ x: 2, y: 2 }], 6)
    expect(p).not.toBeNull()
    if (p === null) return
    const blocks = compressToBlocks(p.optimalPath)
    expect(blocks.length).toBeLessThanOrEqual(p.budget)
    expect(simulate(p, blocks).outcome).toBe('treasure')
  })

  it('makeCustomPuzzle : labyrinthe en serpentin — budget couvre toujours la version compressée', () => {
    // Couloir forcé : le chemin zigzague, la compression est peu efficace,
    // le budget doit quand même suffire.
    const rocks: Cell[] = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 1, y: 4 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ]
    const p = makeCustomPuzzle({ x: 0, y: 0 }, { x: 5, y: 0 }, rocks, 6)
    expect(p).not.toBeNull()
    if (p === null) return
    expect(compressToBlocks(p.optimalPath).length).toBeLessThanOrEqual(p.budget)
    expect(simulate(p, compressToBlocks(p.optimalPath)).outcome).toBe('treasure')
  })
})
