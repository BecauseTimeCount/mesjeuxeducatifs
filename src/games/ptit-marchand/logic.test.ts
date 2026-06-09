// ============================================================
// Le P'tit Marchand — tests de la logique pure.
// Leçon n°1 de la V1 : la palette plafonnée à 4,40 € rendait des
// items IMPAYABLES. Ces tests prouvent que chaque montant généré
// (prix OU monnaie à rendre) est composable avec la palette du
// palier, sur 500 tirages par palier + un balayage exhaustif.
// ============================================================

import { describe, expect, it } from 'vitest'
import corpus from './corpus.json'
import type { ChangeItem, PayItem, Tier, Wallet } from './logic'
import {
  DENOMS,
  DRAWER,
  SHELVES,
  TIER_SKILLS,
  canPay,
  coinsTotal,
  denomLabel,
  formatPrice,
  genItem,
  minCoinsFor,
  paletteForTier,
  removeFromWallet,
  splitPrice,
  walletCount,
  walletTotal,
} from './logic'
import { itemEntries, priceEntries, ptm } from './speech'

const N_DRAWS = 500
const TIERS: readonly Tier[] = [0, 1, 2, 3]

/** Niveau du Tuner qui tourne sur 1..3 pour couvrir tous les plafonds. */
const lvl = (i: number): number => 1 + (i % 3)

function emptyWallet(): Wallet {
  return { 1000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0 }
}

// ------------------------------------------------------------
// Tiroir-caisse et palettes
// ------------------------------------------------------------

describe('tiroir-caisse', () => {
  it('contient 35,20 € répartis sur 23 pièces et billets', () => {
    expect(walletTotal({ ...DRAWER })).toBe(3520)
    expect(walletCount({ ...DRAWER })).toBe(23)
  })

  it('DENOMS est trié de la plus grande à la plus petite valeur', () => {
    expect([...DENOMS]).toEqual([1000, 500, 200, 100, 50, 20, 10])
  })

  it('T0 : palette réduite aux pièces de 1 € et 2 € uniquement', () => {
    const p = paletteForTier(0)
    expect(p[200]).toBe(4)
    expect(p[100]).toBe(4)
    expect(p[1000] + p[500] + p[50] + p[20] + p[10]).toBe(0)
  })

  it('T1, T2, T3 : palette complète identique au tiroir', () => {
    for (const t of [1, 2, 3] as const) {
      expect(paletteForTier(t)).toEqual(DRAWER)
    }
  })
})

// ------------------------------------------------------------
// Solveur minCoinsFor
// ------------------------------------------------------------

describe('solveur minCoinsFor', () => {
  it('0 centime → composition vide', () => {
    expect(minCoinsFor(0, { ...DRAWER })).toEqual([])
  })

  it('montants invalides → null (négatif, pas multiple de 10, non entier)', () => {
    expect(minCoinsFor(-10, { ...DRAWER })).toBeNull()
    expect(minCoinsFor(15, { ...DRAWER })).toBeNull()
    expect(minCoinsFor(100.5, { ...DRAWER })).toBeNull()
  })

  it('montant supérieur au total du stock → null', () => {
    expect(minCoinsFor(3530, { ...DRAWER })).toBeNull()
  })

  it('trouve la composition à nombre minimal de pièces', () => {
    expect(minCoinsFor(400, { ...DRAWER })).toEqual([200, 200])
    expect(minCoinsFor(380, { ...DRAWER })).toEqual([200, 100, 50, 20, 10])
    expect(minCoinsFor(1000, { ...DRAWER })).toEqual([1000])
  })

  it('respecte les stocks limités', () => {
    const w = { ...emptyWallet(), 200: 2, 100: 1 }
    expect(minCoinsFor(500, w)).toEqual([200, 200, 100])
    expect(minCoinsFor(600, w)).toBeNull()
  })

  it('ne tombe pas dans le piège glouton (50 d’abord → impasse)', () => {
    const w = { ...emptyWallet(), 50: 1, 20: 3 }
    expect(minCoinsFor(60, w)).toEqual([20, 20, 20])
  })

  it('la composition rendue totalise exactement le montant demandé', () => {
    for (let i = 0; i < 100; i++) {
      const amount = 10 * (1 + Math.floor(Math.random() * 100))
      const sol = minCoinsFor(amount, { ...DRAWER })
      expect(sol).not.toBeNull()
      if (sol) expect(coinsTotal(sol)).toBe(amount)
    }
  })
})

// ------------------------------------------------------------
// RÉGRESSION bug V1 : palette plafonnée → items impayables
// ------------------------------------------------------------

describe('régression bug V1 (palette plafonnée à 4,40 €)', () => {
  it('TOUT montant multiple de 10 c entre 10 c et 10 € est payable avec le tiroir complet', () => {
    for (let amount = 10; amount <= 1000; amount += 10) {
      expect(canPay(amount, { ...DRAWER }), `montant impayable : ${amount} c`).toBe(true)
    }
  })
})

// ------------------------------------------------------------
// Génération par palier : 500 tirages, tout est payable
// ------------------------------------------------------------

describe('T0 — reconnaître et payer simple (500 tirages)', () => {
  it('prix entiers 1..5 €, total visible, 1 article, toujours payable avec 1 €/2 €', () => {
    const palette = paletteForTier(0)
    for (let i = 0; i < N_DRAWS; i++) {
      const item = genItem(0, lvl(i)) as PayItem
      expect(item.kind).toBe('pay')
      expect(item.articles).toHaveLength(1)
      expect(item.showTotal).toBe(true)
      expect(item.target % 100).toBe(0)
      expect(item.target).toBeGreaterThanOrEqual(100)
      expect(item.target).toBeLessThanOrEqual(500)
      expect(item.target).toBe(item.prices[0])
      expect(canPay(item.target, palette), `T0 impayable : ${item.target} c`).toBe(true)
    }
  })

  it('niveau 1 du Tuner : prix plafonnés à 3 €', () => {
    for (let i = 0; i < N_DRAWS; i++) {
      expect(genItem(0, 1).target).toBeLessThanOrEqual(300)
    }
  })
})

describe('T1 — payer, total masqué (500 tirages)', () => {
  it('prix en X € ou X € 50 de 1 € à 9 € 50, toujours payable avec la palette complète', () => {
    const palette = paletteForTier(1)
    for (let i = 0; i < N_DRAWS; i++) {
      const item = genItem(1, lvl(i)) as PayItem
      expect(item.kind).toBe('pay')
      expect(item.showTotal).toBe(false)
      expect(item.target).toBeGreaterThanOrEqual(100)
      expect(item.target).toBeLessThanOrEqual(950)
      expect([0, 50]).toContain(item.target % 100)
      expect(canPay(item.target, palette), `T1 impayable : ${item.target} c`).toBe(true)
    }
  })
})

describe('T2 — rendre la monnaie (500 tirages)', () => {
  it('billet 5 € ou 10 €, article moins cher, monnaie toujours composable', () => {
    const palette = paletteForTier(2)
    for (let i = 0; i < N_DRAWS; i++) {
      const item = genItem(2, lvl(i)) as ChangeItem
      expect(item.kind).toBe('change')
      expect([500, 1000]).toContain(item.bill)
      expect(item.price).toBeGreaterThanOrEqual(100)
      expect(item.price).toBeLessThan(item.bill)
      expect([0, 50]).toContain(item.price % 100)
      expect(item.target).toBe(item.bill - item.price)
      expect(item.target).toBeGreaterThanOrEqual(50)
      expect(canPay(item.target, palette), `T2 monnaie impayable : ${item.target} c`).toBe(true)
    }
  })

  it('niveau 1 du Tuner : toujours un billet de 5 €', () => {
    for (let i = 0; i < N_DRAWS; i++) {
      expect((genItem(2, 1) as ChangeItem).bill).toBe(500)
    }
  })
})

describe('T3 — deux articles à additionner (500 tirages)', () => {
  it('2 articles DISTINCTS, prix entiers 1..5 €, somme ≤ 10 € toujours payable', () => {
    const palette = paletteForTier(3)
    for (let i = 0; i < N_DRAWS; i++) {
      const item = genItem(3, lvl(i)) as PayItem
      expect(item.kind).toBe('pay')
      expect(item.articles).toHaveLength(2)
      expect(item.articles[0].id).not.toBe(item.articles[1].id)
      expect(item.showTotal).toBe(false)
      for (const p of item.prices) {
        expect(p % 100).toBe(0)
        expect(p).toBeGreaterThanOrEqual(100)
        expect(p).toBeLessThanOrEqual(500)
      }
      expect(item.target).toBe(item.prices[0] + item.prices[1])
      expect(item.target).toBeLessThanOrEqual(1000)
      expect(canPay(item.target, palette), `T3 impayable : ${item.target} c`).toBe(true)
    }
  })
})

// ------------------------------------------------------------
// Palette restante après composition optimale : jamais bloquante
// ------------------------------------------------------------

describe('palette restante après composition optimale', () => {
  it('sur chaque palier, retirer la solution optimale ne vide jamais la caisse', () => {
    for (const tier of TIERS) {
      const palette = paletteForTier(tier)
      for (let i = 0; i < 200; i++) {
        const item = genItem(tier, lvl(i))
        const sol = minCoinsFor(item.target, palette)
        expect(sol, `palier T${tier} : ${item.target} c sans solution`).not.toBeNull()
        if (sol === null) continue
        const rest = removeFromWallet(palette, sol)
        expect(rest, `palier T${tier} : stock dépassé pour ${item.target} c`).not.toBeNull()
        if (rest === null) continue
        expect(walletCount(rest)).toBeGreaterThan(0)
      }
    }
  })
})

// ------------------------------------------------------------
// Cas limites et contraintes diverses
// ------------------------------------------------------------

describe('cas limites de génération', () => {
  it('le niveau du Tuner hors bornes est borné à 1..3', () => {
    for (let i = 0; i < 50; i++) {
      expect(genItem(0, -5).target).toBeLessThanOrEqual(300)
      expect(genItem(1, 99).target).toBeLessThanOrEqual(950)
    }
  })

  it('avec un seul rayon débloqué, les articles viennent du rayon Fruits', () => {
    const fruitIds = new Set(SHELVES[0].articles.map((a) => a.id))
    for (let i = 0; i < 100; i++) {
      const item = genItem(1, lvl(i), 1)
      if (item.kind === 'pay') {
        for (const a of item.articles) expect(fruitIds.has(a.id)).toBe(true)
      }
    }
  })

  it('T3 avec un seul rayon (4 articles) trouve quand même 2 articles distincts', () => {
    for (let i = 0; i < 100; i++) {
      const item = genItem(3, lvl(i), 1) as PayItem
      expect(item.articles).toHaveLength(2)
      expect(item.articles[0].id).not.toBe(item.articles[1].id)
    }
  })

  it('shelvesUnlocked hors bornes est toléré (0 → 1 rayon, 99 → tous)', () => {
    expect(() => genItem(1, 1, 0)).not.toThrow()
    expect(() => genItem(1, 1, 99)).not.toThrow()
  })
})

describe('formats d’affichage', () => {
  it('formatPrice : étiquettes enfant', () => {
    expect(formatPrice(300)).toBe('3 €')
    expect(formatPrice(250)).toBe('2 € 50')
    expect(formatPrice(50)).toBe('50 c')
    expect(formatPrice(0)).toBe('0 €')
    expect(formatPrice(1000)).toBe('10 €')
  })

  it('splitPrice : euros + centimes', () => {
    expect(splitPrice(950)).toEqual({ euros: 9, cents: 50 })
    expect(splitPrice(70)).toEqual({ euros: 0, cents: 70 })
    expect(splitPrice(200)).toEqual({ euros: 2, cents: 0 })
  })

  it('denomLabel couvre les 7 valeurs', () => {
    for (const d of DENOMS) {
      expect(denomLabel(d).length).toBeGreaterThan(0)
    }
  })
})

describe('compétences par palier', () => {
  it('les 4 paliers exercent les 4 compétences du manifest', () => {
    expect(TIER_SKILLS).toEqual([
      'ma.cp.monnaie.pieces',
      'ma.cp.monnaie.payer',
      'ma.cp.monnaie.rendre',
      'ma.cp.add10',
    ])
  })
})

// ------------------------------------------------------------
// Corpus : couverture complète des clips nécessaires
// ------------------------------------------------------------

describe('corpus audio', () => {
  const ids = new Set(corpus.entries.map((e) => e.id))

  it('ids uniques, préfixés ptm., conformes au format ENGINE.md', () => {
    expect(ids.size).toBe(corpus.entries.length)
    for (const e of corpus.entries) {
      expect(e.id.startsWith('ptm.')).toBe(true)
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.text.trim().length).toBeGreaterThan(0)
      expect(['denise', 'henri', 'eloise']).toContain(e.voice)
    }
  })

  it('chaque article du catalogue a sa commande ET son nom parlé (texte exact)', () => {
    const byId = new Map(corpus.entries.map((e) => [e.id, e]))
    for (const shelf of SHELVES) {
      for (const a of shelf.articles) {
        expect(ids.has(`ptm.cmd.${a.id}`), `clip manquant : ptm.cmd.${a.id}`).toBe(true)
        const art = byId.get(`ptm.art.${a.id}`)
        expect(art, `clip manquant : ptm.art.${a.id}`).toBeDefined()
        if (art) expect(art.text).toBe(a.name)
      }
    }
  })

  it('les clips de centimes 10..90 existent (comptage cumulé)', () => {
    for (let c = 10; c <= 90; c += 10) {
      expect(ids.has(`ptm.cents.${c}`), `clip manquant : ptm.cents.${c}`).toBe(true)
    }
  })

  it('clips fixes : intros, billets, mercis, rayon', () => {
    for (const id of [
      'ptm.intro.accueil', 'ptm.intro.t0', 'ptm.intro.t1', 'ptm.intro.t2', 'ptm.intro.t3',
      'ptm.ca-fait', 'ptm.coute', 'ptm.rends', 'ptm.donne.5', 'ptm.donne.10', 'ptm.veut-deux',
      'ptm.et', 'ptm.euro', 'ptm.euros', 'ptm.compte', 'ptm.il-fallait', 'ptm.plateau-vide',
      'ptm.merci.1', 'ptm.merci.2', 'ptm.merci.3', 'ptm.merci.4', 'ptm.merci.5', 'ptm.rayon',
    ]) {
      expect(ids.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

// ------------------------------------------------------------
// Séquences vocales (speech.ts)
// ------------------------------------------------------------

describe('séquences vocales', () => {
  it('priceEntries enchaîne nombre.N + euros + centimes', () => {
    expect(priceEntries(250).map((e) => e.id)).toEqual([
      'nombre.2', 'ptm.euros', 'ptm.et', 'ptm.cents.50',
    ])
    expect(priceEntries(100).map((e) => e.id)).toEqual(['nombre.1', 'ptm.euro'])
    expect(priceEntries(70).map((e) => e.id)).toEqual(['ptm.cents.70'])
    expect(priceEntries(1000).map((e) => e.id)).toEqual(['nombre.10', 'ptm.euros'])
  })

  it('toutes les entrées de priceEntries ont un texte de fallback TTS', () => {
    for (let amount = 10; amount <= 1000; amount += 10) {
      for (const e of priceEntries(amount)) {
        expect(e.text.trim().length, `texte vide pour ${e.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('itemEntries T2 : commande + billet + prix + consigne de rendu', () => {
    const item = genItem(2, 2) as ChangeItem
    const seq = itemEntries(item).map((e) => e.id)
    expect(seq[0]).toBe(`ptm.cmd.${item.article.id}`)
    expect(seq).toContain(`ptm.donne.${item.bill / 100}`)
    expect(seq).toContain('ptm.coute')
    expect(seq[seq.length - 1]).toBe('ptm.rends')
  })

  it('itemEntries T3 : énumère les deux articles sans donner le total', () => {
    const item = genItem(3, 2) as PayItem
    const seq = itemEntries(item).map((e) => e.id)
    expect(seq).toEqual([
      'ptm.veut-deux',
      `ptm.art.${item.articles[0].id}`,
      'ptm.et',
      `ptm.art.${item.articles[1].id}`,
    ])
  })

  it('ptm() est défensif : id inconnu → texte vide, pas de crash', () => {
    expect(ptm('nexiste.pas').text).toBe('')
  })
})
