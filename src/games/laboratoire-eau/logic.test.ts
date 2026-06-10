import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  ACTIONS,
  addSouvenir,
  applyRun,
  applyTool,
  classifyAction,
  FRESH_PROGRESS,
  generateMission,
  GOAL_IDS,
  GOALS,
  gouttePos,
  INITIAL_STATE,
  MAX_MISSION_STEPS,
  MAX_SOUVENIRS,
  MAX_TUNER_LEVEL,
  minSteps,
  MISSIONS_PER_RUN,
  nextStep,
  reachableStates,
  solve,
  starsFor,
  stateEmojis,
  stateKey,
  stepsForTier,
  TIER_COUNT,
  TIER_SKILLS,
} from './logic'
import type { GoalId, LdeProgress, TierId, WaterState } from './logic'

const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const REACHABLE = reachableStates()

function S(lac: WaterState['lac'], ciel: WaterState['ciel'], sommet: WaterState['sommet']): WaterState {
  return { lac, ciel, sommet }
}

/** Rejoue une suite d'actions et rend l'état final (toutes doivent transformer). */
function replay(start: WaterState, path: ReadonlyArray<{ tool: 'chauffer' | 'refroidir'; zone: 'lac' | 'ciel' | 'sommet' }>): WaterState {
  let s = start
  for (const a of path) {
    const r = applyTool(s, a.tool, a.zone)
    expect(r.kind).toBe('transition')
    s = r.state
  }
  return s
}

describe('applyTool — transitions de la machine à états', () => {
  it('chauffer le lac gelé le fait fondre', () => {
    const r = applyTool(S('glace', 'vide', 'sec'), 'chauffer', 'lac')
    expect(r).toEqual({ kind: 'transition', state: S('liquide', 'vide', 'sec'), effect: 'fonte-lac' })
  })

  it('chauffer le lac liquide fait monter la vapeur', () => {
    const r = applyTool(INITIAL_STATE, 'chauffer', 'lac')
    expect(r).toEqual({ kind: 'transition', state: S('liquide', 'vapeur', 'sec'), effect: 'evaporation' })
  })

  it('chauffer encore le lac : la vapeur s’assemble en nuage', () => {
    const r = applyTool(S('liquide', 'vapeur', 'sec'), 'chauffer', 'lac')
    expect(r).toEqual({ kind: 'transition', state: S('liquide', 'nuage', 'sec'), effect: 'nuage-forme' })
  })

  it('refroidir la vapeur la condense en nuage (autre chemin valide)', () => {
    const r = applyTool(S('liquide', 'vapeur', 'sec'), 'refroidir', 'ciel')
    expect(r).toEqual({ kind: 'transition', state: S('liquide', 'nuage', 'sec'), effect: 'condensation' })
  })

  it('refroidir le nuage fait pleuvoir', () => {
    const r = applyTool(S('liquide', 'nuage', 'sec'), 'refroidir', 'ciel')
    expect(r).toEqual({ kind: 'transition', state: S('liquide', 'pluie', 'sec'), effect: 'pluie' })
  })

  it('refroidir la pluie (2e froid) : neige ET le sommet blanchit', () => {
    const r = applyTool(S('liquide', 'pluie', 'sec'), 'refroidir', 'ciel')
    expect(r).toEqual({ kind: 'transition', state: S('liquide', 'neige', 'neige'), effect: 'neige' })
  })

  it('refroidir le lac le gèle, chauffer la glace la fait fondre', () => {
    const gel = applyTool(INITIAL_STATE, 'refroidir', 'lac')
    expect(gel).toEqual({ kind: 'transition', state: S('glace', 'vide', 'sec'), effect: 'gel' })
    if (gel.kind === 'transition') {
      const fonte = applyTool(gel.state, 'chauffer', 'lac')
      expect(fonte.kind).toBe('transition')
      if (fonte.kind === 'transition') expect(fonte.state.lac).toBe('liquide')
    }
  })

  it('chauffer la neige du sommet : le ruisseau redescend (le cycle se boucle)', () => {
    const r = applyTool(S('liquide', 'vide', 'neige'), 'chauffer', 'sommet')
    expect(r).toEqual({ kind: 'transition', state: S('liquide', 'vide', 'ruisseau'), effect: 'fonte-neige' })
  })

  it('chauffer le ruisseau : toute l’eau est rentrée, sommet sec', () => {
    const r = applyTool(S('liquide', 'vide', 'ruisseau'), 'chauffer', 'sommet')
    expect(r).toEqual({ kind: 'transition', state: S('liquide', 'vide', 'sec'), effect: 'ruisseau-fini' })
  })

  it('chauffer le nuage le dissipe en vapeur, la pluie en éclaircie, la neige en pluie', () => {
    expect(applyTool(S('liquide', 'nuage', 'sec'), 'chauffer', 'ciel')).toMatchObject({
      kind: 'transition',
      effect: 'dissipation',
      state: { ciel: 'vapeur' },
    })
    expect(applyTool(S('liquide', 'pluie', 'sec'), 'chauffer', 'ciel')).toMatchObject({
      kind: 'transition',
      effect: 'eclaircie',
      state: { ciel: 'vide' },
    })
    expect(applyTool(S('liquide', 'neige', 'neige'), 'chauffer', 'ciel')).toMatchObject({
      kind: 'transition',
      effect: 'flocons-fondent',
      state: { ciel: 'pluie' },
    })
  })

  it('ne mute JAMAIS l’état passé en entrée', () => {
    const before = S('liquide', 'vapeur', 'sec')
    applyTool(before, 'refroidir', 'ciel')
    applyTool(before, 'chauffer', 'lac')
    expect(before).toEqual(S('liquide', 'vapeur', 'sec'))
  })
})

describe('applyTool — gags (action impossible, état inchangé, zéro pénalité)', () => {
  it('chauffer un ciel vide, refroidir un ciel vide', () => {
    expect(applyTool(INITIAL_STATE, 'chauffer', 'ciel')).toMatchObject({ kind: 'gag', gag: 'ciel-vide' })
    expect(applyTool(INITIAL_STATE, 'refroidir', 'ciel')).toMatchObject({ kind: 'gag', gag: 'ciel-vide-froid' })
  })

  it('le sommet sec ignore les deux outils', () => {
    expect(applyTool(INITIAL_STATE, 'chauffer', 'sommet')).toMatchObject({ kind: 'gag', gag: 'sommet-sec' })
    expect(applyTool(INITIAL_STATE, 'refroidir', 'sommet')).toMatchObject({ kind: 'gag', gag: 'sommet-froid' })
  })

  it('états déjà extrêmes : glace, neige, vapeur chaude…', () => {
    expect(applyTool(S('glace', 'vide', 'sec'), 'refroidir', 'lac')).toMatchObject({ kind: 'gag', gag: 'deja-glace' })
    expect(applyTool(S('liquide', 'neige', 'neige'), 'refroidir', 'ciel')).toMatchObject({ kind: 'gag', gag: 'deja-neige' })
    expect(applyTool(S('liquide', 'vapeur', 'sec'), 'chauffer', 'ciel')).toMatchObject({ kind: 'gag', gag: 'vapeur-chaude' })
    expect(applyTool(S('liquide', 'vide', 'neige'), 'refroidir', 'sommet')).toMatchObject({ kind: 'gag', gag: 'sommet-deja-neige' })
    expect(applyTool(S('liquide', 'vide', 'ruisseau'), 'refroidir', 'sommet')).toMatchObject({ kind: 'gag', gag: 'ruisseau-froid' })
  })

  it('chauffer le lac quand le ciel est plein (nuage, pluie ou neige)', () => {
    for (const ciel of ['nuage', 'pluie', 'neige'] as const) {
      expect(applyTool(S('liquide', ciel, 'sec'), 'chauffer', 'lac')).toMatchObject({ kind: 'gag', gag: 'ciel-plein' })
    }
  })

  it('tout gag laisse l’état strictement inchangé', () => {
    for (const s of REACHABLE) {
      for (const a of ACTIONS) {
        const r = applyTool(s, a.tool, a.zone)
        if (r.kind === 'gag') expect(r.state).toEqual(s)
        else expect(stateKey(r.state)).not.toBe(stateKey(s))
      }
    }
  })
})

describe('reachableStates — espace d’états sain', () => {
  it('l’état initial est atteignable et l’espace est borné (≤ 30)', () => {
    expect(REACHABLE.map(stateKey)).toContain(stateKey(INITIAL_STATE))
    expect(REACHABLE.length).toBeGreaterThanOrEqual(8)
    expect(REACHABLE.length).toBeLessThanOrEqual(30)
    expect(new Set(REACHABLE.map(stateKey)).size).toBe(REACHABLE.length)
  })

  it('aucun état piège : depuis tout état atteignable, TOUT objectif reste atteignable', () => {
    for (const s of REACHABLE) {
      for (const g of GOAL_IDS) {
        expect(minSteps(s, g), `objectif ${g} inatteignable depuis ${stateKey(s)}`).not.toBeNull()
      }
    }
  })
})

describe('solve / minSteps — solveur BFS', () => {
  it('distances canoniques depuis l’état initial', () => {
    expect(minSteps(INITIAL_STATE, 'lac-glace')).toBe(1)
    expect(minSteps(INITIAL_STATE, 'vapeur')).toBe(1)
    expect(minSteps(INITIAL_STATE, 'nuage')).toBe(2)
    expect(minSteps(INITIAL_STATE, 'pluie')).toBe(3)
    expect(minSteps(INITIAL_STATE, 'neige-sommet')).toBe(4)
    expect(minSteps(INITIAL_STATE, 'ruisseau')).toBe(5)
  })

  it('objectif déjà atteint → chemin vide', () => {
    expect(solve(INITIAL_STATE, 'lac-liquide')).toEqual([])
    expect(minSteps(S('glace', 'vide', 'sec'), 'lac-glace')).toBe(0)
  })

  it('rejouer le chemin rendu atteint VRAIMENT l’objectif (tous états × objectifs)', () => {
    for (const s of REACHABLE) {
      for (const g of GOAL_IDS) {
        const path = solve(s, g)
        expect(path).not.toBeNull()
        if (path === null || path.length === 0) continue
        const end = replay(s, path)
        expect(GOALS[g](end), `${g} non atteint depuis ${stateKey(s)}`).toBe(true)
        // Et aucun préfixe strict n'atteint déjà l'objectif (chemin minimal)
        let mid = s
        for (let i = 0; i < path.length - 1; i++) {
          const r = applyTool(mid, path[i].tool, path[i].zone)
          if (r.kind === 'transition') mid = r.state
          expect(GOALS[g](mid)).toBe(false)
        }
      }
    }
  })
})

describe('nextStep — l’indice après 2 erreurs', () => {
  it('depuis l’état initial, vers le nuage : on commence par chauffer le lac', () => {
    expect(nextStep(INITIAL_STATE, 'nuage')).toEqual({ tool: 'chauffer', zone: 'lac' })
  })

  it('suivre nextStep pas à pas atteint l’objectif en minSteps actions', () => {
    for (const s of REACHABLE) {
      for (const g of GOAL_IDS) {
        const expected = minSteps(s, g)
        if (expected === null || expected === 0) continue
        let cur = s
        for (let i = 0; i < expected; i++) {
          const step = nextStep(cur, g)
          expect(step).not.toBeNull()
          if (step === null) break
          const r = applyTool(cur, step.tool, step.zone)
          expect(r.kind).toBe('transition')
          if (r.kind === 'transition') cur = r.state
        }
        expect(GOALS[g](cur)).toBe(true)
      }
    }
  })

  it('objectif déjà atteint → null', () => {
    expect(nextStep(INITIAL_STATE, 'lac-liquide')).toBeNull()
  })
})

describe('generateMission — atteignabilité GARANTIE', () => {
  it('depuis TOUT état atteignable et toute difficulté 1..5 : mission valide', () => {
    for (const s of REACHABLE) {
      for (let desired = 1; desired <= MAX_MISSION_STEPS; desired++) {
        const m = generateMission(s, desired)
        expect(GOAL_IDS).toContain(m.goalId)
        expect(GOALS[m.goalId](s), 'mission déjà accomplie').toBe(false)
        expect(minSteps(s, m.goalId)).toBe(m.steps)
        expect(m.steps).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('la difficulté choisie est LA plus proche possible de la demande', () => {
    for (const s of REACHABLE) {
      for (let desired = 1; desired <= MAX_MISSION_STEPS; desired++) {
        const m = generateMission(s, desired)
        const dists = GOAL_IDS.map((g) => minSteps(s, g)).filter(
          (d): d is number => d !== null && d > 0,
        )
        const best = Math.min(...dists.map((d) => Math.abs(d - desired)))
        expect(Math.abs(m.steps - desired)).toBe(best)
      }
    }
  })

  it('avoid écarte les objectifs récents quand une alternative existe', () => {
    // Depuis l'initial, à 1 étape : lac-glace ET vapeur. En écartant l'un, l'autre sort.
    for (let i = 0; i < 30; i++) {
      expect(generateMission(INITIAL_STATE, 1, ['lac-glace']).goalId).toBe('vapeur')
      expect(generateMission(INITIAL_STATE, 1, ['vapeur']).goalId).toBe('lac-glace')
    }
  })

  it('avoid couvrant tous les objectifs : retombe sur le pool complet, jamais bloqué', () => {
    const m = generateMission(INITIAL_STATE, 2, [...GOAL_IDS])
    expect(GOAL_IDS).toContain(m.goalId)
  })

  it('choose injecté : génération déterministe', () => {
    const first = <T,>(arr: readonly T[]): T => arr[0]
    const a = generateMission(INITIAL_STATE, 2, [], first)
    const b = generateMission(INITIAL_STATE, 2, [], first)
    expect(a).toEqual(b)
    expect(a.steps).toBe(2)
  })
})

describe('classifyAction — utile / contre-productive / gag', () => {
  it('un gag n’est jamais compté contre l’enfant', () => {
    expect(classifyAction(INITIAL_STATE, 'nuage', 'chauffer', 'ciel')).toBe('gag')
    expect(classifyAction(INITIAL_STATE, 'nuage', 'refroidir', 'sommet')).toBe('gag')
  })

  it('mission nuage : chauffer le lac est utile, refroidir le lac est contre-productif', () => {
    expect(classifyAction(INITIAL_STATE, 'nuage', 'chauffer', 'lac')).toBe('utile')
    expect(classifyAction(INITIAL_STATE, 'nuage', 'refroidir', 'lac')).toBe('contre')
  })

  it('atteindre l’objectif est toujours utile', () => {
    expect(classifyAction(S('liquide', 'nuage', 'sec'), 'pluie', 'refroidir', 'ciel')).toBe('utile')
    expect(classifyAction(INITIAL_STATE, 'lac-glace', 'refroidir', 'lac')).toBe('utile')
  })

  it('une transformation qui n’avance pas (distance égale) est contre-productive', () => {
    // Mission lac-glace : dissiper le nuage ne change pas la distance (1).
    const s = S('liquide', 'nuage', 'sec')
    expect(minSteps(s, 'lac-glace')).toBe(1)
    expect(classifyAction(s, 'lac-glace', 'chauffer', 'ciel')).toBe('contre')
  })

  it('cohérence exhaustive : utile ⇔ la distance diminue strictement', () => {
    for (const s of REACHABLE) {
      for (const g of GOAL_IDS) {
        if (GOALS[g](s)) continue
        const before = minSteps(s, g)
        for (const a of ACTIONS) {
          const r = applyTool(s, a.tool, a.zone)
          const cls = classifyAction(s, g, a.tool, a.zone)
          if (r.kind === 'gag') {
            expect(cls).toBe('gag')
          } else {
            const after = minSteps(r.state, g)
            expect(cls).toBe(
              before !== null && after !== null && after < before ? 'utile' : 'contre',
            )
          }
        }
      }
    }
  })
})

describe('gouttePos — Goutte suit l’eau', () => {
  it('positions de base', () => {
    expect(gouttePos(INITIAL_STATE)).toBe('lac')
    expect(gouttePos(S('glace', 'vide', 'sec'))).toBe('glace')
    expect(gouttePos(S('liquide', 'vapeur', 'sec'))).toBe('vapeur')
    expect(gouttePos(S('liquide', 'nuage', 'sec'))).toBe('nuage')
    expect(gouttePos(S('liquide', 'pluie', 'sec'))).toBe('pluie')
    expect(gouttePos(S('liquide', 'neige', 'neige'))).toBe('neige')
    expect(gouttePos(S('liquide', 'vide', 'neige'))).toBe('sommet')
  })

  it('priorités : le ruisseau gagne (c’est là que ça bouge)', () => {
    expect(gouttePos(S('liquide', 'neige', 'ruisseau'))).toBe('ruisseau')
    expect(gouttePos(S('glace', 'nuage', 'sec'))).toBe('nuage')
  })

  it('toute position est définie pour tous les états atteignables', () => {
    const spots = ['lac', 'glace', 'vapeur', 'nuage', 'pluie', 'neige', 'sommet', 'ruisseau']
    for (const s of REACHABLE) expect(spots).toContain(gouttePos(s))
  })
})

describe('stepsForTier — Tuner sur la complexité', () => {
  it('paliers de base : 1, 2, 3, 4 étapes', () => {
    for (const t of ALL_TIERS) expect(stepsForTier(t, 0)).toBe(t + 1)
  })

  it('au cran max du Tuner, une étape de plus (plafonnée au cycle complet)', () => {
    expect(stepsForTier(0, MAX_TUNER_LEVEL)).toBe(2)
    expect(stepsForTier(3, MAX_TUNER_LEVEL)).toBe(MAX_MISSION_STEPS)
  })

  it('niveaux hors bornes ou fractionnaires : clampés et tronqués', () => {
    expect(stepsForTier(1, -5)).toBe(2)
    expect(stepsForTier(1, 99)).toBe(3)
    expect(stepsForTier(1, 1.9)).toBe(2)
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, MISSIONS_PER_RUN)).toBe(3)
    expect(starsFor(7, MISSIONS_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, MISSIONS_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, MISSIONS_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, MISSIONS_PER_RUN)).toBe(1)
  })
})

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1).unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: LdeProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('rejouer un palier déjà passé ne reverrouille jamais, T3 ne déborde pas', () => {
    expect(applyRun({ bestStars: { 0: 3 }, unlockedTier: 2, runs: 3 }, 0, 1).unlockedTier).toBe(2)
    expect(applyRun({ bestStars: {}, unlockedTier: 3, runs: 0 }, 3, 3).unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: LdeProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

describe('addSouvenir — album du bac à eau', () => {
  it('ajoute une COPIE de la scène en fin d’album', () => {
    const album = addSouvenir([], INITIAL_STATE)
    expect(album).toHaveLength(1)
    expect(album[0]).toEqual(INITIAL_STATE)
    expect(album[0]).not.toBe(INITIAL_STATE)
  })

  it('plafonné à 8 : la plus ancienne photo sort', () => {
    let album: WaterState[] = []
    for (let i = 0; i < MAX_SOUVENIRS; i++) album = addSouvenir(album, INITIAL_STATE)
    const marker = S('glace', 'nuage', 'neige')
    album = addSouvenir(album, marker)
    expect(album).toHaveLength(MAX_SOUVENIRS)
    expect(album[MAX_SOUVENIRS - 1]).toEqual(marker)
  })

  it('ne mute pas l’album passé en entrée', () => {
    const before: WaterState[] = [S('glace', 'vide', 'sec')]
    addSouvenir(before, INITIAL_STATE)
    expect(before).toHaveLength(1)
  })
})

describe('stateEmojis — résumé d’une photo', () => {
  it('rend [ciel, sommet, lac] pour quelques scènes', () => {
    expect(stateEmojis(INITIAL_STATE)).toEqual(['☀️', '⛰️', '🌊'])
    expect(stateEmojis(S('glace', 'neige', 'ruisseau'))).toEqual(['🌨️', '🏞️', '🧊'])
  })
})

describe('corpus audio — couverture complète, préfixe lde.', () => {
  it('ids valides, uniques, tous préfixés lde., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('lde.')).toBe(true)
      expect(['denise', 'eloise', 'henri']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('chaque transition, chaque gag et chaque mission a son clip', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    const effects = new Set<string>()
    const gags = new Set<string>()
    for (const s of REACHABLE) {
      for (const a of ACTIONS) {
        const r = applyTool(s, a.tool, a.zone)
        if (r.kind === 'transition') effects.add(r.effect)
        else gags.add(r.gag)
      }
    }
    for (const e of effects) expect(known.has(`lde.etat.${e}`), `clip manquant : lde.etat.${e}`).toBe(true)
    for (const g of gags) expect(known.has(`lde.gag.${g}`), `clip manquant : lde.gag.${g}`).toBe(true)
    for (const goal of GOAL_IDS) {
      expect(known.has(`lde.mission.${goal}`), `clip manquant : lde.mission.${goal}`).toBe(true)
    }
  })

  it('clips de structure du jeu présents', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const id of [
      'lde.intro',
      'lde.mode.bac',
      'lde.souvenir',
      'lde.mission.reussie',
      'lde.consigne.zone',
      'lde.outil.chauffer',
      'lde.outil.refroidir',
      'lde.contre.rappel',
      'lde.indice.chauffer',
      'lde.indice.refroidir',
      'lde.niveau.0',
      'lde.niveau.1',
      'lde.niveau.2',
      'lde.niveau.3',
    ]) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })

  it('aucun doublon des clips communs ui.* ni des nombres nombre.*', () => {
    for (const e of corpus.entries) {
      expect(e.id.startsWith('ui.')).toBe(false)
      expect(e.id.startsWith('nombre.')).toBe(false)
    }
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('un skill par palier, tous connus du skill-map', () => {
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect([...TIER_SKILLS]).toEqual([
      'mo.gs.eau.etats',
      'mo.gs.eau.etats',
      'mo.cp.eau.cycle',
      'mo.cp.eau.cycle',
    ])
    for (const id of TIER_SKILLS) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('le manifest déclare exactement les skills des paliers', () => {
    const meta = GAMES_BY_ID.get('laboratoire-eau')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(meta.skills).toEqual([...new Set(TIER_SKILLS)])
    expect(meta.island).toBe('monde')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('💧')
    expect(meta.accent).toBe('#0277bd')
  })

  it('le scénario du cycle complet se rejoue de bout en bout', () => {
    // chauffer lac → vapeur, refroidir ciel → nuage, refroidir → pluie,
    // refroidir → neige (sommet blanchi), chauffer sommet → ruisseau.
    const path = [
      { tool: 'chauffer', zone: 'lac' },
      { tool: 'refroidir', zone: 'ciel' },
      { tool: 'refroidir', zone: 'ciel' },
      { tool: 'refroidir', zone: 'ciel' },
      { tool: 'chauffer', zone: 'sommet' },
    ] as const
    const end = replay(INITIAL_STATE, path)
    expect(end.sommet).toBe('ruisseau')
    expect(GOALS['ruisseau'](end)).toBe(true)
  })
})

describe('simulation — une partie de 8 missions ne se bloque jamais', () => {
  it('résoudre chaque mission via nextStep, état persistant entre missions (tous paliers)', () => {
    for (const tier of ALL_TIERS) {
      let state = INITIAL_STATE
      const recent: GoalId[] = []
      for (let i = 0; i < MISSIONS_PER_RUN; i++) {
        const m = generateMission(state, stepsForTier(tier, 0), recent)
        expect(GOALS[m.goalId](state)).toBe(false)
        let guard = 0
        while (!GOALS[m.goalId](state)) {
          const step = nextStep(state, m.goalId)
          expect(step).not.toBeNull()
          if (step === null) break
          const r = applyTool(state, step.tool, step.zone)
          expect(r.kind).toBe('transition')
          if (r.kind === 'transition') state = r.state
          expect(++guard).toBeLessThanOrEqual(MAX_MISSION_STEPS + 1)
        }
        recent.unshift(m.goalId)
        recent.splice(2)
      }
    }
  })
})
