import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  activeAnimals,
  addCompo,
  ANIMAL_COUNT,
  ANIMALS,
  applyRun,
  COMPOSE_SKILL,
  COMPOSE_TEMPOS,
  deserializeGrid,
  emptyGrid,
  filledCells,
  FRESH_PROGRESS,
  generateSequence,
  GRID_STEPS,
  isComposeValid,
  lengthFor,
  MAX_COMPOS,
  MAX_SEQ_LENGTH,
  MAX_TUNER_LEVEL,
  MIN_SEQ_LENGTH,
  nextCompoName,
  NO_REPEAT_MAX_LENGTH,
  padsForTier,
  REPRODUCE_SKILL,
  SEQUENCES_PER_RUN,
  serializeGrid,
  starsFor,
  TEACH_TEMPO_FACTOR,
  tempoForTier,
  TIER_COUNT,
  toggleCell,
  verdict,
} from './logic'
import type { OdaProgress, SavedCompo, TierId } from './logic'

const DRAWS = 300
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]

/** Générateur déterministe (LCG) pour des tirages reproductibles. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('paliers — musiciens et tempo', () => {
  it('3, 4, 6, 6 musiciens selon le palier', () => {
    expect(padsForTier(0)).toBe(3)
    expect(padsForTier(1)).toBe(4)
    expect(padsForTier(2)).toBe(6)
    expect(padsForTier(3)).toBe(6)
  })

  it('jamais plus de pads que d’animaux', () => {
    for (const tier of ALL_TIERS) {
      expect(padsForTier(tier)).toBeLessThanOrEqual(ANIMAL_COUNT)
      expect(padsForTier(tier)).toBeGreaterThanOrEqual(2)
    }
  })

  it('le palier 3 est plus rapide, les autres au même tempo', () => {
    expect(tempoForTier(3)).toBeLessThan(tempoForTier(0))
    expect(tempoForTier(0)).toBe(tempoForTier(1))
    expect(tempoForTier(1)).toBe(tempoForTier(2))
  })

  it('la réécoute enseignante est RALENTIE', () => {
    expect(TEACH_TEMPO_FACTOR).toBeGreaterThan(1)
  })
})

describe('lengthFor — longueur de séquence pilotée par le Tuner', () => {
  it('2 au cran 0, 6 au cran max, monotone croissante', () => {
    expect(lengthFor(0)).toBe(MIN_SEQ_LENGTH)
    expect(lengthFor(MAX_TUNER_LEVEL)).toBe(MAX_SEQ_LENGTH)
    for (let level = 1; level <= MAX_TUNER_LEVEL; level++) {
      expect(lengthFor(level)).toBeGreaterThanOrEqual(lengthFor(level - 1))
    }
  })

  it('crans hors bornes ou fractionnaires : clampés et tronqués', () => {
    expect(lengthFor(-5)).toBe(MIN_SEQ_LENGTH)
    expect(lengthFor(99)).toBe(MAX_SEQ_LENGTH)
    expect(lengthFor(1.9)).toBe(3)
  })
})

describe('generateSequence — invariants (300 tirages × configurations)', () => {
  it('longueur exacte, pads dans les bornes du palier', () => {
    for (const tier of ALL_TIERS) {
      const pads = padsForTier(tier)
      for (let len = MIN_SEQ_LENGTH; len <= MAX_SEQ_LENGTH; len++) {
        for (let i = 0; i < 50; i++) {
          const seq = generateSequence(len, pads)
          expect(seq).toHaveLength(len)
          for (const p of seq) {
            expect(Number.isInteger(p)).toBe(true)
            expect(p).toBeGreaterThanOrEqual(0)
            expect(p).toBeLessThan(pads)
          }
        }
      }
    }
  })

  it('longueurs courtes (≤ 4) : jamais deux fois le même pad d’affilée', () => {
    for (let len = MIN_SEQ_LENGTH; len <= NO_REPEAT_MAX_LENGTH; len++) {
      for (const pads of [3, 4, 6]) {
        for (let i = 0; i < DRAWS; i++) {
          const seq = generateSequence(len, pads)
          for (let j = 1; j < seq.length; j++) {
            expect(seq[j], `répétition immédiate dans ${seq.join(',')}`).not.toBe(seq[j - 1])
          }
        }
      }
    }
  })

  it('longueurs longues : jamais TROIS fois le même pad d’affilée', () => {
    for (const len of [5, 6]) {
      for (let i = 0; i < DRAWS; i++) {
        const seq = generateSequence(len, 6)
        for (let j = 2; j < seq.length; j++) {
          const triple = seq[j] === seq[j - 1] && seq[j] === seq[j - 2]
          expect(triple, `triple répétition dans ${seq.join(',')}`).toBe(false)
        }
      }
    }
  })

  it('toute séquence de longueur ≥ 2 utilise au moins 2 pads distincts', () => {
    for (const len of [2, 3, 4, 5, 6]) {
      for (let i = 0; i < DRAWS; i++) {
        expect(new Set(generateSequence(len, 6)).size).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('même avec un rand pathologique (toujours 0) : variété garantie', () => {
    const zero = (): number => 0
    for (const len of [2, 4, 6]) {
      const seq = generateSequence(len, 3, zero)
      expect(seq).toHaveLength(len)
      expect(new Set(seq).size).toBeGreaterThanOrEqual(2)
      for (const p of seq) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThan(3)
      }
    }
  })

  it('tirages variés : 6 pads sur 300 séquences de 4 → tous les pads apparaissent', () => {
    const rand = lcg(42)
    const seen = new Set<number>()
    for (let i = 0; i < DRAWS; i++) {
      for (const p of generateSequence(4, 6, rand)) seen.add(p)
    }
    expect(seen.size).toBe(6)
  })

  it('déterministe avec un rand injecté', () => {
    expect(generateSequence(5, 6, lcg(7))).toEqual(generateSequence(5, 6, lcg(7)))
  })

  it('entrées dégénérées : clampées, jamais de crash', () => {
    expect(generateSequence(0, 6)).toHaveLength(1)
    expect(generateSequence(99, 6)).toHaveLength(MAX_SEQ_LENGTH)
    const seq = generateSequence(3, 1) // padCount clampé à 2 minimum
    for (const p of seq) expect(p).toBeLessThan(2)
    for (const p of generateSequence(3, 99)) expect(p).toBeLessThan(ANIMAL_COUNT)
  })
})

describe('verdict — validation pas-à-pas (préfixe)', () => {
  const seq = [0, 2, 1, 2]

  it('saisie vide → progress, préfixe correct → progress', () => {
    expect(verdict(seq, [])).toBe('progress')
    expect(verdict(seq, [0])).toBe('progress')
    expect(verdict(seq, [0, 2])).toBe('progress')
    expect(verdict(seq, [0, 2, 1])).toBe('progress')
  })

  it('séquence entièrement rejouée → complete', () => {
    expect(verdict(seq, [0, 2, 1, 2])).toBe('complete')
  })

  it('un pad faux n’importe où → mistake, dès le pad fautif', () => {
    expect(verdict(seq, [1])).toBe('mistake')
    expect(verdict(seq, [0, 1])).toBe('mistake')
    expect(verdict(seq, [0, 2, 1, 0])).toBe('mistake')
  })

  it('saisie plus longue que la séquence → mistake', () => {
    expect(verdict(seq, [0, 2, 1, 2, 0])).toBe('mistake')
  })

  it('toute séquence générée se valide elle-même (complete) et chaque préfixe est progress', () => {
    for (let i = 0; i < 100; i++) {
      const s = generateSequence(5, 6)
      expect(verdict(s, s)).toBe('complete')
      for (let cut = 0; cut < s.length; cut++) {
        expect(verdict(s, s.slice(0, cut))).toBe('progress')
      }
    }
  })
})

describe('séquenceur — grille 6 × 8', () => {
  it('emptyGrid : 6 rangées × 8 pas, tout éteint', () => {
    const g = emptyGrid()
    expect(g).toHaveLength(ANIMAL_COUNT)
    for (const row of g) {
      expect(row).toHaveLength(GRID_STEPS)
      expect(row.every((c) => c === false)).toBe(true)
    }
    expect(filledCells(g)).toBe(0)
    expect(activeAnimals(g)).toBe(0)
  })

  it('toggleCell pose puis retire, sans muter la grille d’origine', () => {
    const g0 = emptyGrid()
    const g1 = toggleCell(g0, 2, 5)
    expect(g1[2][5]).toBe(true)
    expect(g0[2][5]).toBe(false)
    expect(filledCells(g1)).toBe(1)
    const g2 = toggleCell(g1, 2, 5)
    expect(g2[2][5]).toBe(false)
    expect(filledCells(g2)).toBe(0)
  })

  it('toggleCell hors bornes : grille inchangée', () => {
    const g = toggleCell(emptyGrid(), 0, 0)
    expect(toggleCell(g, -1, 0)).toBe(g)
    expect(toggleCell(g, ANIMAL_COUNT, 0)).toBe(g)
    expect(toggleCell(g, 0, -1)).toBe(g)
    expect(toggleCell(g, 0, GRID_STEPS)).toBe(g)
    expect(toggleCell(g, 0.5, 3)).toBe(g)
  })

  it('activeAnimals compte les animaux DIFFÉRENTS, pas les cases', () => {
    let g = emptyGrid()
    g = toggleCell(g, 1, 0)
    g = toggleCell(g, 1, 4)
    g = toggleCell(g, 1, 7)
    expect(activeAnimals(g)).toBe(1)
    expect(filledCells(g)).toBe(3)
    g = toggleCell(g, 4, 2)
    expect(activeAnimals(g)).toBe(2)
  })

  it('isComposeValid : il faut au moins 2 animaux différents', () => {
    let g = emptyGrid()
    expect(isComposeValid(g)).toBe(false)
    g = toggleCell(g, 0, 0)
    expect(isComposeValid(g)).toBe(false) // un seul animal, même répété
    g = toggleCell(g, 0, 3)
    expect(isComposeValid(g)).toBe(false)
    g = toggleCell(g, 5, 1)
    expect(isComposeValid(g)).toBe(true)
  })

  it('deux tempos de boucle, le second plus rapide', () => {
    expect(COMPOSE_TEMPOS).toHaveLength(2)
    expect(COMPOSE_TEMPOS[1]).toBeLessThan(COMPOSE_TEMPOS[0])
  })
})

describe('sérialisation des compositions', () => {
  it('aller-retour exact serialize → deserialize', () => {
    let g = emptyGrid()
    g = toggleCell(g, 0, 0)
    g = toggleCell(g, 3, 7)
    g = toggleCell(g, 5, 4)
    const s = serializeGrid(g)
    expect(s.split('|')).toHaveLength(ANIMAL_COUNT)
    expect(deserializeGrid(s)).toEqual(g)
  })

  it('grille vide : sérialisée en zéros, restaurée vide', () => {
    const s = serializeGrid(emptyGrid())
    expect(s).toBe(Array.from({ length: ANIMAL_COUNT }, () => '0'.repeat(GRID_STEPS)).join('|'))
    expect(deserializeGrid(s)).toEqual(emptyGrid())
  })

  it('données corrompues → null, jamais de crash', () => {
    expect(deserializeGrid('')).toBeNull()
    expect(deserializeGrid('garbage')).toBeNull()
    expect(deserializeGrid('01010101|01010101')).toBeNull() // pas assez de rangées
    expect(deserializeGrid(serializeGrid(emptyGrid()).replace('0', '2'))).toBeNull()
    expect(deserializeGrid(serializeGrid(emptyGrid()) + '|00000000')).toBeNull()
  })
})

describe('galerie — noms automatiques et plafond', () => {
  const compo = (name: string): SavedCompo => ({ name, grid: serializeGrid(emptyGrid()), createdAt: 1 })

  it('« Ma musique 1 » sur galerie vide, plus petit numéro libre ensuite', () => {
    expect(nextCompoName([])).toBe('Ma musique 1')
    expect(nextCompoName([compo('Ma musique 1')])).toBe('Ma musique 2')
    expect(nextCompoName([compo('Ma musique 1'), compo('Ma musique 3')])).toBe('Ma musique 2')
    expect(nextCompoName([compo('Ma musique 2')])).toBe('Ma musique 1')
  })

  it('les noms hors gabarit sont ignorés', () => {
    expect(nextCompoName([compo('Symphonie'), compo('Ma musique X')])).toBe('Ma musique 1')
  })

  it('addCompo ajoute en fin, sans muter, et refuse au-delà de 10', () => {
    const list: SavedCompo[] = []
    let cur: SavedCompo[] = list
    for (let i = 0; i < MAX_COMPOS; i++) cur = addCompo(cur, compo(nextCompoName(cur)))
    expect(cur).toHaveLength(MAX_COMPOS)
    expect(list).toHaveLength(0)
    const full = addCompo(cur, compo('Ma musique 99'))
    expect(full).toHaveLength(MAX_COMPOS)
    expect(full.some((c) => c.name === 'Ma musique 99')).toBe(false)
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, SEQUENCES_PER_RUN)).toBe(3)
    expect(starsFor(7, SEQUENCES_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, SEQUENCES_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, SEQUENCES_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, SEQUENCES_PER_RUN)).toBe(1)
  })

  it('bornes exactes : 9/10 → 3 et 7/10 → 2 ; total nul → 1', () => {
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(7, 10)).toBe(2)
    expect(starsFor(0, 0)).toBe(1)
  })
})

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1).unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: OdaProgress = { ...FRESH_PROGRESS }
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
    const before: OdaProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

describe('corpus audio — couverture complète, préfixe oda.', () => {
  it('ids valides, uniques, tous préfixés oda., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('oda.')).toBe(true)
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

  it('tous les clips utilisés par le jeu existent, dont un par animal', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    const needed = [
      'oda.intro',
      'oda.mode.ecoute',
      'oda.mode.compose',
      'oda.ecoute-bien',
      'oda.a-toi',
      'oda.presque',
      'oda.regarde-lent',
      'oda.indice',
      'oda.bien-joue',
      'oda.niveau.0',
      'oda.niveau.1',
      'oda.niveau.2',
      'oda.niveau.3',
      'oda.compose.consigne',
      'oda.compose.bravo',
      'oda.compose.sauvee',
      'oda.compose.encore',
      'oda.compose.efface',
      'oda.galerie',
      ...ANIMALS.map((a) => `oda.animal.${a.id}`),
    ]
    for (const id of needed) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('les deux compétences existent dans le skill-map', () => {
    expect(SKILLS_BY_ID.has(REPRODUCE_SKILL)).toBe(true)
    expect(SKILLS_BY_ID.has(COMPOSE_SKILL)).toBe(true)
    expect(SKILLS_BY_ID.get(COMPOSE_SKILL)?.prereqs).toContain(REPRODUCE_SKILL)
  })

  it('le manifest déclare exactement ces compétences et les bons attributs', () => {
    const meta = GAMES_BY_ID.get('orchestre-des-animaux')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(meta.skills).toEqual([REPRODUCE_SKILL, COMPOSE_SKILL])
    expect(meta.island).toBe('ailleurs')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('🎵')
    expect(meta.accent).toBe('#4a148c')
  })
})
