import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import {
  adjacentCorrect,
  applyRun,
  CELL_COUNT,
  DIRS,
  findCorrect,
  FRESH_PROGRESS,
  generateAdjacent,
  generateFind,
  generateGuide,
  generateItem,
  guideReaches,
  GRID,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  modeForTier,
  neighbor,
  nextHint,
  PLAN,
  reached,
  ROOM_INDEX,
  ROOMS,
  roomIdAt,
  shortestPath,
  starsFor,
  step,
  TIER_COUNT,
  TIER_SKILLS,
  walkable,
  type Dir,
  type PlumeProgress,
  type TierId,
} from './logic'

const TIERS: TierId[] = [0, 1, 2, 3]

describe('plan de l’école', () => {
  it('grille 5×5, 25 cases, types valides', () => {
    expect(GRID).toBe(5)
    expect(CELL_COUNT).toBe(25)
    expect(PLAN).toHaveLength(25)
    for (const c of PLAN) {
      expect(['wall', 'corridor', 'room']).toContain(c.kind)
      if (c.kind === 'room') expect(c.roomId).toBeTruthy()
      else expect(c.roomId).toBeUndefined()
    }
  })

  it('8 salles, ids et emojis uniques, toutes posées sur le plan', () => {
    expect(ROOMS).toHaveLength(8)
    const ids = new Set(ROOMS.map((r) => r.id))
    expect(ids.size).toBe(8)
    const emojis = new Set(ROOMS.map((r) => r.emoji))
    expect(emojis.size).toBe(8)
    for (const r of ROOMS) {
      expect(ROOM_INDEX.has(r.id)).toBe(true)
      const idx = ROOM_INDEX.get(r.id)!
      expect(roomIdAt(idx)).toBe(r.id)
      expect(r.name.length).toBeGreaterThan(0)
    }
  })

  it('le réseau de couloirs+salles est connexe (toute salle est atteignable)', () => {
    // BFS depuis la première salle, sur les cases praticables.
    const startRoom = ROOM_INDEX.get(ROOMS[0].id)!
    const seen = new Set<number>([startRoom])
    const queue = [startRoom]
    for (let i = 0; i < queue.length; i++) {
      for (const dir of DIRS) {
        const n = neighbor(queue[i], dir)
        if (n === null || !walkable(n) || seen.has(n)) continue
        seen.add(n)
        queue.push(n)
      }
    }
    for (const r of ROOMS) {
      const idx = ROOM_INDEX.get(r.id)!
      expect(seen.has(idx)).toBe(true)
      expect(shortestPath(startRoom, idx).length === 0 ? idx === startRoom : true).toBe(true)
    }
  })

  it('chaque salle borde au moins un couloir', () => {
    for (const r of ROOMS) {
      const idx = ROOM_INDEX.get(r.id)!
      const touches = DIRS.some((d) => {
        const n = neighbor(idx, d)
        return n !== null && PLAN[n].kind === 'corridor'
      })
      expect(touches).toBe(true)
    }
  })
})

describe('géométrie (neighbor / walkable / step)', () => {
  it('neighbor renvoie null hors grille', () => {
    expect(neighbor(0, 'up')).toBeNull() // coin haut-gauche
    expect(neighbor(0, 'left')).toBeNull()
    expect(neighbor(0, 'right')).toBe(1)
    expect(neighbor(0, 'down')).toBe(GRID)
    expect(neighbor(24, 'down')).toBeNull() // coin bas-droit
    expect(neighbor(24, 'right')).toBeNull()
  })

  it('neighbor est symétrique sur les directions opposées', () => {
    const opp: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
    for (let idx = 0; idx < CELL_COUNT; idx++) {
      for (const dir of DIRS) {
        const n = neighbor(idx, dir)
        if (n !== null) expect(neighbor(n, opp[dir])).toBe(idx)
      }
    }
  })

  it('step ne traverse jamais un mur ni le bord', () => {
    for (let idx = 0; idx < CELL_COUNT; idx++) {
      if (!walkable(idx)) continue
      for (const dir of DIRS) {
        const after = step(idx, dir)
        expect(walkable(after)).toBe(true)
        const n = neighbor(idx, dir)
        if (n === null || !walkable(n)) expect(after).toBe(idx)
        else expect(after).toBe(n)
      }
    }
  })
})

describe('génération T0 (trouver) résoluble', () => {
  for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
    it(`niveau ${level} : 200 tirages désignent une vraie salle`, () => {
      for (let i = 0; i < 200; i++) {
        const item = generateFind(level)
        expect(item.mode).toBe('find')
        expect(roomIdAt(item.answerIdx)).toBe(item.roomId)
        expect(ROOM_INDEX.get(item.roomId)).toBe(item.answerIdx)
        expect(findCorrect(item, item.answerIdx)).toBe(true)
        expect(findCorrect(item, (item.answerIdx + 1) % CELL_COUNT)).toBe(false)
      }
    })
  }

  it('avoid ne répète pas la même salle', () => {
    let prev = generateFind(0).answerIdx
    for (let i = 0; i < 100; i++) {
      const next = generateFind(0, prev)
      expect(next.answerIdx).not.toBe(prev)
      prev = next.answerIdx
    }
  })
})

describe('génération T1 (voisin) résoluble', () => {
  for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
    it(`niveau ${level} : 200 tirages ont une réponse valide dans la grille`, () => {
      for (let i = 0; i < 200; i++) {
        const item = generateAdjacent(level)
        expect(item.mode).toBe('adjacent')
        expect(walkable(item.plumeIdx)).toBe(true)
        // la réponse est bien le voisin déclaré, dans la grille
        expect(item.answerIdx).toBeGreaterThanOrEqual(0)
        expect(item.answerIdx).toBeLessThan(CELL_COUNT)
        expect(neighbor(item.plumeIdx, item.dir)).toBe(item.answerIdx)
        expect(DIRS).toContain(item.dir)
        expect(adjacentCorrect(item, item.answerIdx)).toBe(true)
        expect(adjacentCorrect(item, item.plumeIdx)).toBe(false)
      }
    })
  }
})

describe('génération T2/T3 (guider) TOUJOURS résoluble', () => {
  for (const tier of [2, 3] as TierId[]) {
    for (let level = 0; level <= MAX_TUNER_LEVEL; level++) {
      it(`T${tier} niveau ${level} : 200 tirages ont un chemin praticable atteignant la salle`, () => {
        for (let i = 0; i < 200; i++) {
          const item = generateGuide(tier, level)
          expect(item.mode).toBe('guide')
          // départ praticable, cible = vraie salle, départ ≠ cible
          expect(walkable(item.startIdx)).toBe(true)
          expect(roomIdAt(item.targetIdx)).not.toBeNull()
          expect(item.startIdx).not.toBe(item.targetIdx)
          // chemin non vide, chaque pas praticable et contigu
          expect(item.path.length).toBeGreaterThanOrEqual(1)
          let cur = item.startIdx
          for (const cell of item.path) {
            expect(walkable(cell)).toBe(true)
            const isNeighbor = DIRS.some((d) => neighbor(cur, d) === cell)
            expect(isNeighbor).toBe(true)
            cur = cell
          }
          expect(cur).toBe(item.targetIdx)
          // le chemin BFS, joué comme suite de flèches, atteint bien la cible
          const dirs = pathToDirs(item.startIdx, item.path)
          expect(guideReaches(item, dirs)).toBe(true)
        }
      })
    }
  }

  it('T3 produit des trajets au moins aussi longs que T2', () => {
    let maxT2 = 0
    let maxT3 = 0
    for (let i = 0; i < 200; i++) {
      maxT2 = Math.max(maxT2, generateGuide(2, 1).path.length)
      maxT3 = Math.max(maxT3, generateGuide(3, 1).path.length)
    }
    expect(maxT3).toBeGreaterThan(maxT2)
  })
})

describe('generateItem aiguille selon le palier', () => {
  for (const tier of TIERS) {
    it(`T${tier} → mode ${modeForTier(tier)}`, () => {
      for (let i = 0; i < 50; i++) {
        const item = generateItem(tier, 0)
        expect(item.mode).toBe(modeForTier(tier))
        expect(item.tier).toBe(tier)
      }
    })
  }
})

describe('nextHint rapproche de la cible', () => {
  it('null quand on est déjà sur la cible', () => {
    const target = ROOM_INDEX.get(ROOMS[0].id)!
    expect(nextHint(target, target)).toBeNull()
  })

  it('200 tirages : suivre l’indice raccourcit toujours le chemin', () => {
    for (let i = 0; i < 200; i++) {
      const item = generateGuide(3, 1)
      let cur = item.startIdx
      let guard = 0
      while (!reached(cur, item.targetIdx) && guard < 50) {
        const before = shortestPath(cur, item.targetIdx).length
        const hint = nextHint(cur, item.targetIdx)
        expect(hint).not.toBeNull()
        const after = step(cur, hint as Dir)
        expect(after).not.toBe(cur) // l’indice ne pousse jamais dans un mur
        expect(shortestPath(after, item.targetIdx).length).toBe(before - 1)
        cur = after
        guard++
      }
      expect(reached(cur, item.targetIdx)).toBe(true)
    }
  })
})

describe('validation guider', () => {
  it('guideReaches : true seulement si l’itinéraire complet atteint la salle', () => {
    const item = generateGuide(2, 0)
    const dirs = pathToDirs(item.startIdx, item.path)
    expect(guideReaches(item, dirs)).toBe(true)
    // un itinéraire vide ne va nulle part (départ ≠ cible garanti)
    expect(guideReaches(item, [])).toBe(false)
    // un itinéraire tronqué n’atteint pas la cible
    if (dirs.length > 1) expect(guideReaches(item, dirs.slice(0, -1))).toBe(false)
  })
})

describe('score & progression', () => {
  it('starsFor : seuils 90 % / 70 %', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(6, 8)).toBe(2)
    expect(starsFor(4, 8)).toBe(1)
    expect(starsFor(0, 0)).toBe(1)
  })

  it('applyRun débloque le palier suivant à 2 étoiles, garde le meilleur score', () => {
    let p: PlumeProgress = { ...FRESH_PROGRESS }
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
    let p: PlumeProgress = { ...FRESH_PROGRESS, unlockedTier: last }
    p = applyRun(p, last, 3)
    expect(p.unlockedTier).toBe(last)
  })
})

describe('cohérence skill-map / manifest', () => {
  it('toutes les compétences des paliers existent dans le skill-map', () => {
    for (const id of TIER_SKILLS) expect(SKILLS_BY_ID.has(id)).toBe(true)
    expect(TIER_SKILLS).toHaveLength(ITEMS_PER_RUN > 0 ? TIER_COUNT : 0)
  })

  it('le manifest déclare exactement les compétences des paliers (dédupliquées)', () => {
    const meta = GAMES_BY_ID.get('ecole-plume')
    expect(meta).toBeDefined()
    expect(new Set(meta!.skills)).toEqual(new Set(TIER_SKILLS))
  })
})

// ---------- helper local ----------

/** Convertit un chemin (suite d'indices contigus) en suite de flèches. */
function pathToDirs(startIdx: number, path: readonly number[]): Dir[] {
  const dirs: Dir[] = []
  let cur = startIdx
  for (const cell of path) {
    const dir = DIRS.find((d) => neighbor(cur, d) === cell)
    if (dir === undefined) throw new Error('chemin non contigu')
    dirs.push(dir)
    cur = cell
  }
  return dirs
}
