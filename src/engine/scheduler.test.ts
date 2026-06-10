import { describe, expect, it } from 'vitest'
import type { GameMeta, SkillDef, SkillProgress } from '@/engine/types'
import { buildDailyPath, type DailyPathInput, type DailyPick } from '@/engine/scheduler'

const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

/** choose déterministe : toujours le premier candidat. */
const first = <T>(arr: readonly T[]): T => arr[0]

function game(id: string, skills: string[], status: GameMeta['status'] = 'v2'): GameMeta {
  return { id, title: id, tagline: '', icon: '🎲', island: 'nombres', accent: '#000000', skills, status }
}

function skill(id: string, opts: Partial<Omit<SkillDef, 'id'>> = {}): SkillDef {
  return { id, label: id, official: id, domain: 'maths', level: 'cp', ...opts }
}

function prog(opts: Partial<SkillProgress> = {}): SkillProgress {
  return { window: [], state: 'en-cours', box: 1, totalAttempts: 5, ...opts }
}

/** Fenêtre se terminant à lastTs, un élément par booléen (1 s d'écart). */
function winAt(lastTs: number, ...oks: boolean[]): SkillProgress['window'] {
  return oks.map((ok, i) => ({ ok, ts: lastTs - (oks.length - 1 - i) * 1000 }))
}

function build(partial: Partial<DailyPathInput>): DailyPick[] {
  return buildDailyPath({
    summary: {},
    skills: [],
    games: [],
    now: NOW,
    period: 1,
    choose: first,
    ...partial,
  })
}

describe('buildDailyPath — révision', () => {
  it('sélectionne la révision la plus en retard (un seul pick de révision)', () => {
    const skills = [skill('s1'), skill('s2')]
    const games = [game('g1', ['s1', 's2'])]
    const summary = {
      s1: prog({ state: 'maitrise', nextReview: NOW - 2 * DAY }),
      s2: prog({ state: 'maitrise', nextReview: NOW - DAY }),
    }
    expect(build({ skills, games, summary })).toEqual([
      { kind: 'revision', skillId: 's1', gameId: 'g1' },
    ])
  })

  it('rotation : sert un jeu différent du dernier servi pour ce skill', () => {
    const skills = [skill('s1')]
    const games = [game('gA', ['s1']), game('gB', ['s1'])]
    const summary = { s1: prog({ state: 'maitrise', nextReview: NOW - DAY }) }
    const state = { lastServed: { s1: { gameId: 'gA', ts: NOW - DAY } } }
    // choose=first prendrait gA sans la rotation.
    expect(build({ skills, games, summary, state })).toEqual([
      { kind: 'revision', skillId: 's1', gameId: 'gB' },
    ])
  })

  it('rotation impossible (un seul jeu) : ressert le même jeu', () => {
    const skills = [skill('s1')]
    const games = [game('gA', ['s1'])]
    const summary = { s1: prog({ state: 'maitrise', nextReview: NOW - DAY }) }
    const state = { lastServed: { s1: { gameId: 'gA', ts: NOW - DAY } } }
    expect(build({ skills, games, summary, state })).toEqual([
      { kind: 'revision', skillId: 's1', gameId: 'gA' },
    ])
  })

  it('révision pas encore due (nextReview > now) → aucun pick', () => {
    const skills = [skill('s1')]
    const games = [game('gA', ['s1'])]
    const summary = { s1: prog({ state: 'maitrise', nextReview: NOW + DAY }) }
    expect(build({ skills, games, summary })).toEqual([])
  })
})

describe('buildDailyPath — fragile', () => {
  it('choisit le pire ratio de réussite', () => {
    const skills = [skill('s1'), skill('s2')]
    const games = [game('g1', ['s1', 's2'])]
    const summary = {
      s1: prog({ window: winAt(NOW - DAY, true, true, false) }), // 2/3
      s2: prog({ window: winAt(NOW - DAY, false, false, true) }), // 1/3
    }
    expect(build({ skills, games, summary })).toEqual([
      { kind: 'fragile', skillId: 's2', gameId: 'g1' },
    ])
  })

  it('égalité de ratio → la tentative la plus ancienne', () => {
    const skills = [skill('s1'), skill('s2')]
    const games = [game('g1', ['s1', 's2'])]
    const summary = {
      s1: prog({ window: winAt(NOW - DAY, true, false, false) }),
      s2: prog({ window: winAt(NOW - 3 * DAY, true, false, false) }), // plus ancien
    }
    expect(build({ skills, games, summary })).toEqual([
      { kind: 'fragile', skillId: 's2', gameId: 'g1' },
    ])
  })

  it('fenêtre trop courte (< 3) → pas de pick fragile', () => {
    const skills = [skill('s1')]
    const games = [game('g1', ['s1'])]
    const summary = { s1: prog({ window: winAt(NOW - DAY, false, false) }) }
    expect(build({ skills, games, summary })).toEqual([])
  })

  it('le skill pris en révision est exclu du choix fragile', () => {
    const skills = [skill('s1'), skill('s2')]
    const games = [game('g1', ['s1', 's2']), game('g2', ['s1', 's2'])]
    const summary = {
      // s1 : le plus fragile (1/3) MAIS dû en révision → la révision le prend.
      s1: prog({ window: winAt(NOW - DAY, false, false, true), nextReview: NOW - DAY }),
      s2: prog({ window: winAt(NOW - DAY, true, true, false) }), // 2/3
    }
    expect(build({ skills, games, summary })).toEqual([
      { kind: 'fragile', skillId: 's2', gameId: 'g2' },
      { kind: 'revision', skillId: 's1', gameId: 'g1' },
    ])
  })
})

describe('buildDailyPath — nouvelle', () => {
  it('respecte les prérequis directs (prérequis non acquis → bloqué)', () => {
    const skills = [skill('base'), skill('next', { prereqs: ['base'] }), skill('libre')]
    const games = [game('g1', ['base', 'next', 'libre'])]
    const summary = {
      base: prog({ state: 'decouverte', window: winAt(NOW - DAY, true, true), totalAttempts: 2 }),
    }
    expect(build({ skills, games, summary })).toEqual([
      { kind: 'nouvelle', skillId: 'libre', gameId: 'g1' },
    ])
  })

  it('prérequis maîtrisé → la suite devient éligible, la période courante gagne', () => {
    const skills = [skill('base'), skill('next', { prereqs: ['base'], period: 2 }), skill('libre')]
    const games = [game('g1', ['base', 'next', 'libre'])]
    const summary = { base: prog({ state: 'maitrise', nextReview: NOW + DAY }) }
    expect(build({ skills, games, summary, period: 2 })).toEqual([
      { kind: 'nouvelle', skillId: 'next', gameId: 'g1' },
    ])
  })

  it('préférence : période courante, puis antérieure, puis gs avant cp', () => {
    const p4 = skill('p4', { period: 4 })
    const p1 = skill('p1', { period: 1 })
    const gsx = skill('gsx', { level: 'gs' })
    const games = [game('g1', ['p4', 'p1', 'gsx'])]
    // Période 3 : p1 (antérieure) bat gsx (sans période) et p4 (future).
    expect(build({ skills: [p4, p1, gsx], games, period: 3 })[0].skillId).toBe('p1')
    // Sans p1 : gs avant cp parmi le reste.
    expect(build({ skills: [p4, gsx], games, period: 3 })[0].skillId).toBe('gsx')
  })

  it('choose départage les ex æquo', () => {
    const skills = [skill('a', { level: 'gs' }), skill('b', { level: 'gs' })]
    const games = [game('g1', ['a', 'b'])]
    const last = <T>(arr: readonly T[]): T => arr[arr.length - 1]
    expect(build({ skills, games, choose: last })[0].skillId).toBe('b')
  })

  it('déjà tentée (totalAttempts > 0) → plus jamais « nouvelle »', () => {
    const skills = [skill('s1')]
    const games = [game('g1', ['s1'])]
    const summary = { s1: prog({ state: 'decouverte', window: winAt(NOW - DAY, true), totalAttempts: 1 }) }
    expect(build({ skills, games, summary })).toEqual([])
  })

  it('un prérequis qu’aucun jeu v2 n’exerce ne bloque pas la découverte', () => {
    // « orphan » est défini dans la carte mais n'est exercé par aucun jeu :
    // il ne peut jamais être maîtrisé, il ne doit donc pas verrouiller « next »
    // (cas réel : fr.gs.lettres.valeur, prérequis de toute la branche CGP du CP).
    const skills = [skill('orphan'), skill('next', { prereqs: ['orphan'] })]
    const games = [game('g1', ['next'])]
    expect(build({ skills, games })).toEqual([
      { kind: 'nouvelle', skillId: 'next', gameId: 'g1' },
    ])
  })

  it('un prérequis exercé par un jeu v2 reste bloquant tant que non maîtrisé', () => {
    const skills = [skill('base'), skill('next', { prereqs: ['base'] })]
    const games = [game('g1', ['base', 'next'])]
    // base jamais tentée : elle est éligible « nouvelle », next reste bloquée.
    expect(build({ skills, games })).toEqual([
      { kind: 'nouvelle', skillId: 'base', gameId: 'g1' },
    ])
  })
})

describe('buildDailyPath — garde-fous', () => {
  it('ignore les skills non exercés par un jeu v2', () => {
    const skills = [skill('s1'), skill('orphan')]
    const games = [game('g1', ['s1'], 'classique')] // pas de jeu v2 du tout
    const summary = { s1: prog({ state: 'maitrise', nextReview: NOW - DAY }) }
    expect(build({ skills, games, summary })).toEqual([])
  })

  it('au plus 3 picks, ordonnés [fragile, nouvelle, revision], skills et jeux tous différents', () => {
    const skills = [skill('sR'), skill('sF'), skill('sN')]
    const games = [
      game('gA', ['sR', 'sF', 'sN']),
      game('gB', ['sR', 'sF', 'sN']),
      game('gC', ['sN']),
    ]
    const summary = {
      sR: prog({ state: 'maitrise', nextReview: NOW - DAY }),
      sF: prog({ window: winAt(NOW - DAY, false, false, true) }),
    }
    const path = build({ skills, games, summary })
    expect(path).toEqual([
      { kind: 'fragile', skillId: 'sF', gameId: 'gB' },
      { kind: 'nouvelle', skillId: 'sN', gameId: 'gC' },
      { kind: 'revision', skillId: 'sR', gameId: 'gA' },
    ])
    expect(new Set(path.map((p) => p.skillId)).size).toBe(3)
    expect(new Set(path.map((p) => p.gameId)).size).toBe(3)
  })

  it('un seul jeu pour tout : la duplication de jeu est alors tolérée', () => {
    const skills = [skill('sR'), skill('sF'), skill('sN')]
    const games = [game('gA', ['sR', 'sF', 'sN'])]
    const summary = {
      sR: prog({ state: 'maitrise', nextReview: NOW - DAY }),
      sF: prog({ window: winAt(NOW - DAY, false, false, true) }),
    }
    const path = build({ skills, games, summary })
    expect(path.map((p) => p.kind)).toEqual(['fragile', 'nouvelle', 'revision'])
    expect(path.map((p) => p.gameId)).toEqual(['gA', 'gA', 'gA'])
  })
})

describe('buildDailyPath — cas vides', () => {
  it('summary vide → uniquement une nouvelle notion (sans prérequis)', () => {
    const skills = [skill('libre'), skill('verrouille', { prereqs: ['libre'] })]
    const games = [game('g1', ['libre', 'verrouille'])]
    expect(build({ skills, games })).toEqual([
      { kind: 'nouvelle', skillId: 'libre', gameId: 'g1' },
    ])
  })

  it('aucun skill, aucun jeu → parcours vide', () => {
    expect(build({})).toEqual([])
  })
})
