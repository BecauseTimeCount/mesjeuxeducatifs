import { describe, expect, it } from 'vitest'
import {
  EMPTY_SAVE,
  MAX_BARS_ON_BOARD,
  MAX_CUBES_ON_BOARD,
  TIERS,
  allowedBars,
  applyRunToSave,
  boardTotal,
  canAddBar,
  canAddCube,
  canBreak,
  canSolder,
  canonical,
  countingSteps,
  deliveryDiff,
  generateOrder,
  isOrderSolvable,
  solveOrder,
  starsFor,
  validateDelivery,
} from './logic'
import type { BoardState, Order, TierId } from './logic'

const DRAWS = 200

function draw(tier: TierId, level: number, itemIndex = 0, recent: number[] = []): Order {
  return generateOrder(tier, level, itemIndex, recent)
}

// ------------------------------------------------------------
// Utilitaires de base
// ------------------------------------------------------------

describe('canonical / boardTotal', () => {
  it('décompose en dizaines et unités', () => {
    expect(canonical(47)).toEqual({ tens: 4, units: 7 })
    expect(canonical(5)).toEqual({ tens: 0, units: 5 })
    expect(canonical(90)).toEqual({ tens: 9, units: 0 })
    expect(canonical(19)).toEqual({ tens: 1, units: 9 })
  })

  it('calcule le total du plateau', () => {
    expect(boardTotal({ bars: 0, cubes: 0 })).toBe(0)
    expect(boardTotal({ bars: 4, cubes: 7 })).toBe(47)
    expect(boardTotal({ bars: 0, cubes: 15 })).toBe(15)
  })
})

// ------------------------------------------------------------
// (a) Chaque item généré est RÉSOLUBLE — la leçon n°1 de la V1
// ------------------------------------------------------------

describe('résolubilité — tous paliers, tous niveaux, toutes variantes', () => {
  it('400 tirages aléatoires : la solution proposée passe toujours la validation', () => {
    for (let i = 0; i < 400; i++) {
      const tier = (i % 4) as TierId
      const level = i % 3
      const order = draw(tier, level, i)
      expect(isOrderSolvable(order), `commande insoluble : ${JSON.stringify(order)}`).toBe(true)
    }
  })

  it('la solution reste dans les limites physiques du plateau', () => {
    for (let i = 0; i < DRAWS; i++) {
      const order = draw(3, i % 3, i)
      const sol = solveOrder(order)
      expect(sol.bars).toBeGreaterThanOrEqual(0)
      expect(sol.bars).toBeLessThanOrEqual(MAX_BARS_ON_BOARD)
      expect(sol.cubes).toBeGreaterThanOrEqual(0)
      expect(sol.cubes).toBeLessThanOrEqual(MAX_CUBES_ON_BOARD)
    }
  })
})

// ------------------------------------------------------------
// (b) Contraintes de chaque palier respectées
// ------------------------------------------------------------

describe('génération T0 (5-19, palette libre)', () => {
  it('reste dans la plage du palier et sans contrainte', () => {
    for (let i = 0; i < DRAWS; i++) {
      const order = draw(0, i % 3)
      expect(order.target).toBeGreaterThanOrEqual(5)
      expect(order.target).toBeLessThanOrEqual(19)
      expect(order.constraint).toBeUndefined()
    }
  })

  it('suit les bandes du Tuner (niveau 0 facile, niveau 2 plus dur)', () => {
    for (let i = 0; i < 50; i++) {
      expect(draw(0, 0).target).toBeLessThanOrEqual(9)
      expect(draw(0, 2).target).toBeGreaterThanOrEqual(15)
    }
  })
})

describe('génération T1 (20-59) et T2 (60-99)', () => {
  it('T1 : cibles 20-59, sans contrainte', () => {
    for (let i = 0; i < DRAWS; i++) {
      const order = draw(1, i % 3)
      expect(order.target).toBeGreaterThanOrEqual(20)
      expect(order.target).toBeLessThanOrEqual(59)
      expect(order.constraint).toBeUndefined()
    }
  })

  it('T2 : cibles 60-99, sans contrainte', () => {
    for (let i = 0; i < DRAWS; i++) {
      const order = draw(2, i % 3)
      expect(order.target).toBeGreaterThanOrEqual(60)
      expect(order.target).toBeLessThanOrEqual(99)
      expect(order.constraint).toBeUndefined()
    }
  })

  it('un niveau de Tuner hors bornes est ramené dans [0..2]', () => {
    expect(draw(1, -5).target).toBeLessThanOrEqual(32)
    expect(draw(1, 99).target).toBeGreaterThanOrEqual(46)
  })
})

describe('génération T3 — défis « max-bars » (itemIndex % 3 === 0)', () => {
  it('quota jamais absurde : 1 <= quota < chiffre des dizaines (le défi force l’échange)', () => {
    for (let i = 0; i < DRAWS; i++) {
      const order = draw(3, i % 3, 0)
      const c = order.constraint
      expect(c?.kind).toBe('max-bars')
      if (c?.kind !== 'max-bars') continue
      const { tens } = canonical(order.target)
      expect(c.value).toBeGreaterThanOrEqual(1)
      expect(c.value).toBeLessThan(tens)
    }
  })

  it('il existe toujours une combinaison qui respecte le quota', () => {
    for (let i = 0; i < DRAWS; i++) {
      const order = draw(3, i % 3, 0)
      const sol = solveOrder(order)
      expect(sol.bars).toBeLessThanOrEqual(allowedBars(order))
      expect(boardTotal(sol)).toBe(order.target)
      expect(sol.cubes).toBeLessThanOrEqual(MAX_CUBES_ON_BOARD)
    }
  })
})

describe('génération T3 — défis « no-bars » (itemIndex % 3 === 1)', () => {
  it('cible bornée 10-20 (poser N cubes doit rester jouable)', () => {
    for (let i = 0; i < DRAWS; i++) {
      const order = draw(3, i % 3, 1)
      expect(order.constraint?.kind).toBe('no-bars')
      expect(order.target).toBeGreaterThanOrEqual(10)
      expect(order.target).toBeLessThanOrEqual(20)
    }
  })

  it('la solution est « que des cubes »', () => {
    const order = draw(3, 1, 1)
    expect(solveOrder(order)).toEqual({ bars: 0, cubes: order.target })
  })
})

describe('génération T3 — défis « min-cubes » (itemIndex % 3 === 2)', () => {
  it('minimum toujours satisfaisable ET supérieur aux unités canoniques (il faut casser)', () => {
    for (let i = 0; i < DRAWS; i++) {
      const order = draw(3, i % 3, 2)
      const c = order.constraint
      expect(c?.kind).toBe('min-cubes')
      if (c?.kind !== 'min-cubes') continue
      const { units } = canonical(order.target)
      expect(c.value).toBeGreaterThan(units)
      expect(c.value).toBeLessThanOrEqual(order.target)
      const sol = solveOrder(order)
      expect(sol.cubes).toBeGreaterThanOrEqual(c.value)
      expect(boardTotal(sol)).toBe(order.target)
    }
  })
})

describe('anti-répétition des cibles', () => {
  it('évite les cibles récentes quand la bande le permet (déterministe)', () => {
    // Bande T1 niveau 1 : [33..45]. On interdit tout sauf 45.
    const recent = [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44]
    for (let i = 0; i < 30; i++) {
      expect(draw(1, 1, 0, recent).target).toBe(45)
    }
  })

  it('ne boucle pas si toute la bande est récente', () => {
    const recent = Array.from({ length: 13 }, (_, i) => 33 + i)
    const order = draw(1, 1, 0, recent)
    expect(order.target).toBeGreaterThanOrEqual(33)
    expect(order.target).toBeLessThanOrEqual(45)
  })
})

// ------------------------------------------------------------
// Résolution / validation
// ------------------------------------------------------------

describe('solveOrder', () => {
  it('sans contrainte : décomposition canonique', () => {
    expect(solveOrder({ target: 47 })).toEqual({ bars: 4, cubes: 7 })
    expect(solveOrder({ target: 8 })).toEqual({ bars: 0, cubes: 8 })
    expect(solveOrder({ target: 30 })).toEqual({ bars: 3, cubes: 0 })
  })

  it('max-bars : utilise le quota puis complète en cubes', () => {
    expect(solveOrder({ target: 43, constraint: { kind: 'max-bars', value: 3 } })).toEqual({
      bars: 3,
      cubes: 13,
    })
    expect(solveOrder({ target: 35, constraint: { kind: 'max-bars', value: 1 } })).toEqual({
      bars: 1,
      cubes: 25,
    })
  })

  it('no-bars : tout en cubes', () => {
    expect(solveOrder({ target: 17, constraint: { kind: 'no-bars', value: 0 } })).toEqual({
      bars: 0,
      cubes: 17,
    })
  })

  it('min-cubes : plus petit nb de cubes >= minimum, congru aux unités', () => {
    expect(solveOrder({ target: 26, constraint: { kind: 'min-cubes', value: 16 } })).toEqual({
      bars: 1,
      cubes: 16,
    })
    expect(solveOrder({ target: 40, constraint: { kind: 'min-cubes', value: 20 } })).toEqual({
      bars: 2,
      cubes: 20,
    })
    // value=12, unités=5 -> il faut 15 cubes (15 >= 12 et 15 ≡ 5 mod 10)
    expect(solveOrder({ target: 35, constraint: { kind: 'min-cubes', value: 12 } })).toEqual({
      bars: 2,
      cubes: 15,
    })
  })
})

describe('validateDelivery', () => {
  const order47: Order = { target: 47 }

  it('accepte le compte exact, quelle que soit la décomposition', () => {
    expect(validateDelivery(order47, { bars: 4, cubes: 7 }).ok).toBe(true)
    expect(validateDelivery(order47, { bars: 3, cubes: 17 }).ok).toBe(true)
    expect(validateDelivery(order47, { bars: 0, cubes: 47 }).ok).toBe(true)
  })

  it('signale ce qui manque', () => {
    expect(validateDelivery(order47, { bars: 3, cubes: 5 })).toEqual({
      ok: false,
      reason: 'missing',
      diff: 12,
    })
  })

  it('signale ce qui est en trop', () => {
    expect(validateDelivery(order47, { bars: 5, cubes: 2 })).toEqual({
      ok: false,
      reason: 'excess',
      diff: 5,
    })
  })

  it('signale un défi min-cubes non respecté (total pourtant juste)', () => {
    const order: Order = { target: 26, constraint: { kind: 'min-cubes', value: 16 } }
    const verdict = validateDelivery(order, { bars: 2, cubes: 6 })
    expect(verdict).toEqual({ ok: false, reason: 'constraint', constraint: order.constraint })
  })

  it('signale un quota de barres dépassé (défense en profondeur, l’UI verrouille déjà)', () => {
    const order: Order = { target: 43, constraint: { kind: 'max-bars', value: 3 } }
    const verdict = validateDelivery(order, { bars: 4, cubes: 3 })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('constraint')
  })

  it('le total prime sur la contrainte dans le feedback', () => {
    const order: Order = { target: 26, constraint: { kind: 'min-cubes', value: 16 } }
    const verdict = validateDelivery(order, { bars: 2, cubes: 2 })
    expect(verdict).toEqual({ ok: false, reason: 'missing', diff: 4 })
  })
})

// ------------------------------------------------------------
// Verrous d'interaction (palette / machine)
// ------------------------------------------------------------

describe('verrous de la palette et de la machine', () => {
  const free: Order = { target: 47 }
  const max2: Order = { target: 43, constraint: { kind: 'max-bars', value: 2 } }
  const noBars: Order = { target: 15, constraint: { kind: 'no-bars', value: 0 } }

  it('canAddBar respecte le quota du défi et la limite du plateau', () => {
    expect(canAddBar({ bars: 1, cubes: 0 }, max2)).toBe(true)
    expect(canAddBar({ bars: 2, cubes: 0 }, max2)).toBe(false)
    expect(canAddBar({ bars: 0, cubes: 0 }, noBars)).toBe(false)
    expect(canAddBar({ bars: MAX_BARS_ON_BOARD, cubes: 0 }, free)).toBe(false)
  })

  it('canAddCube respecte la limite du plateau', () => {
    expect(canAddCube({ bars: 0, cubes: MAX_CUBES_ON_BOARD - 1 })).toBe(true)
    expect(canAddCube({ bars: 0, cubes: MAX_CUBES_ON_BOARD })).toBe(false)
  })

  it('canBreak exige une barre et la place pour 10 cubes', () => {
    expect(canBreak({ bars: 1, cubes: 0 })).toBe(true)
    expect(canBreak({ bars: 0, cubes: 5 })).toBe(false)
    expect(canBreak({ bars: 2, cubes: MAX_CUBES_ON_BOARD - 9 })).toBe(false)
  })

  it('le total du plateau ne dépasse jamais 99 (les clips nombre.N s’arrêtent à 100)', () => {
    // Simulation : 60 actions aléatoires en respectant les verrous, sur 50 parties.
    for (let run = 0; run < 50; run++) {
      const order = draw((run % 4) as TierId, run % 3, run)
      const board: BoardState = { bars: 0, cubes: 0 }
      for (let step = 0; step < 60; step++) {
        const action = Math.floor(Math.random() * 4)
        if (action === 0 && canAddBar(board, order)) board.bars += 1
        else if (action === 1 && canAddCube(board)) board.cubes += 1
        else if (action === 2 && canBreak(board)) {
          board.bars -= 1
          board.cubes += 10
        } else if (action === 3 && canSolder(board, order)) {
          board.bars += 1
          board.cubes -= 10
        }
        expect(boardTotal(board)).toBeLessThanOrEqual(99)
        expect(board.cubes).toBeLessThanOrEqual(MAX_CUBES_ON_BOARD)
        expect(board.bars).toBeLessThanOrEqual(MAX_BARS_ON_BOARD)
      }
    }
  })

  it('canAddBar respecte aussi le plafond du total', () => {
    expect(canAddBar({ bars: 8, cubes: 9 }, free)).toBe(true) // 89 + 10 = 99
    expect(canAddBar({ bars: 9, cubes: 0 }, free)).toBe(false) // 90 + 10 = 100
  })

  it('canAddCube respecte aussi le plafond du total', () => {
    expect(canAddCube({ bars: 9, cubes: 8 })).toBe(true) // 98 -> 99
    expect(canAddCube({ bars: 9, cubes: 9 })).toBe(false) // 99 -> 100
  })

  it('canSolder exige 10 cubes et le droit d’avoir une barre de plus', () => {
    expect(canSolder({ bars: 0, cubes: 10 }, free)).toBe(true)
    expect(canSolder({ bars: 0, cubes: 9 }, free)).toBe(false)
    expect(canSolder({ bars: 2, cubes: 13 }, max2)).toBe(false)
    expect(canSolder({ bars: 0, cubes: 15 }, noBars)).toBe(false)
    expect(canSolder({ bars: MAX_BARS_ON_BOARD, cubes: 10 }, free)).toBe(false)
  })
})

// ------------------------------------------------------------
// Feedback élaboratif : plan de correction
// ------------------------------------------------------------

describe('deliveryDiff — fantômes et surplus', () => {
  it('manque simple : ajoute des pièces en pointillés', () => {
    expect(deliveryDiff({ target: 47 }, { bars: 3, cubes: 5 })).toEqual({
      addBars: 1,
      removeBars: 0,
      addCubes: 2,
      removeCubes: 0,
    })
  })

  it('surplus simple : marque les cubes en trop', () => {
    expect(deliveryDiff({ target: 47 }, { bars: 4, cubes: 9 })).toEqual({
      addBars: 0,
      removeBars: 0,
      addCubes: 0,
      removeCubes: 2,
    })
  })

  it('cas structurel : 5 barres pour 47 -> enlever 1 barre ET ajouter 7 cubes', () => {
    expect(deliveryDiff({ target: 47 }, { bars: 5, cubes: 0 })).toEqual({
      addBars: 0,
      removeBars: 1,
      addCubes: 7,
      removeCubes: 0,
    })
  })

  it('plateau vide : propose la décomposition canonique', () => {
    expect(deliveryDiff({ target: 15 }, { bars: 0, cubes: 0 })).toEqual({
      addBars: 1,
      removeBars: 0,
      addCubes: 5,
      removeCubes: 0,
    })
  })

  it('respecte la contrainte du défi dans le chemin proposé', () => {
    const order: Order = { target: 43, constraint: { kind: 'max-bars', value: 3 } }
    const plan = deliveryDiff(order, { bars: 3, cubes: 3 })
    // Interdit de proposer une 4e barre : il faut compléter en cubes.
    expect(plan.addBars).toBe(0)
    expect(plan.addCubes).toBe(10)
  })

  it('300 plans aléatoires : appliquer le plan donne toujours une livraison valide', () => {
    for (let i = 0; i < 300; i++) {
      const order = draw((i % 4) as TierId, i % 3, i)
      const board: BoardState = {
        bars: Math.floor(Math.random() * (Math.min(MAX_BARS_ON_BOARD, allowedBars(order)) + 1)),
        cubes: Math.floor(Math.random() * (MAX_CUBES_ON_BOARD + 1)),
      }
      const plan = deliveryDiff(order, board)
      const fixed: BoardState = {
        bars: board.bars + plan.addBars - plan.removeBars,
        cubes: board.cubes + plan.addCubes - plan.removeCubes,
      }
      expect(validateDelivery(order, fixed).ok, JSON.stringify({ order, board, plan })).toBe(true)
    }
  })
})

// ------------------------------------------------------------
// Comptage sonore
// ------------------------------------------------------------

describe('countingSteps', () => {
  it('compte les barres par dizaines puis les cubes un par un', () => {
    expect(countingSteps({ bars: 4, cubes: 7 })).toEqual([
      10, 20, 30, 40, 41, 42, 43, 44, 45, 46, 47,
    ])
  })

  it('que des cubes : compte 1, 2, 3…', () => {
    expect(countingSteps({ bars: 0, cubes: 3 })).toEqual([1, 2, 3])
  })

  it('que des barres : compte 10, 20…', () => {
    expect(countingSteps({ bars: 2, cubes: 0 })).toEqual([10, 20])
  })

  it('plateau vide : aucun pas', () => {
    expect(countingSteps({ bars: 0, cubes: 0 })).toEqual([])
  })
})

// ------------------------------------------------------------
// Étoiles + progression persistée
// ------------------------------------------------------------

describe('starsFor (premiers essais uniquement)', () => {
  it('>=90% -> 3, >=70% -> 2, sinon 1', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(7, 8)).toBe(2) // 87,5 %
    expect(starsFor(6, 8)).toBe(2) // 75 %
    expect(starsFor(5, 8)).toBe(1) // 62,5 %
    expect(starsFor(0, 8)).toBe(1)
  })
})

describe('applyRunToSave', () => {
  it('2 étoiles débloquent le palier suivant', () => {
    const next = applyRunToSave(EMPTY_SAVE, 0, 2)
    expect(next.unlockedTier).toBe(1)
    expect(next.bestStars[0]).toBe(2)
    expect(next.runs).toBe(1)
  })

  it('1 étoile ne débloque rien', () => {
    expect(applyRunToSave(EMPTY_SAVE, 0, 1).unlockedTier).toBe(0)
  })

  it('garde le meilleur score et ne reverrouille jamais', () => {
    const s1 = applyRunToSave(EMPTY_SAVE, 0, 3)
    const s2 = applyRunToSave(s1, 0, 1)
    expect(s2.bestStars[0]).toBe(3)
    expect(s2.unlockedTier).toBe(1)
    expect(s2.runs).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà', () => {
    const last = (TIERS.length - 1) as TierId
    expect(applyRunToSave(EMPTY_SAVE, last, 3).unlockedTier).toBe(0)
  })
})
