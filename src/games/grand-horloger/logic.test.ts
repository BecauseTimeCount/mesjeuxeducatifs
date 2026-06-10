import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  ACTIVITIES,
  ACTIVITIES_PER_MOMENT,
  applyRun,
  clockPool,
  consigneClips,
  dayAnswer,
  dayPool,
  DAYS,
  dayVariantsFor,
  FRESH_PROGRESS,
  GAME_SKILLS,
  generateItem,
  hourAngle,
  hourClip,
  isClockSet,
  isCorrectDay,
  isCorrectMoment,
  isCorrectMonth,
  isCorrectSeason,
  ITEMS_PER_RUN,
  itemKey,
  MAX_TUNER_LEVEL,
  minuteAngle,
  MOMENTS,
  momentPool,
  monthAnswer,
  monthPool,
  MONTHS,
  SEASON_QUESTIONS,
  seasonPool,
  SEASONS,
  SKILL_CALENDRIER,
  SKILL_HEURES,
  SKILL_JOURNEE,
  SKILL_SEMAINE,
  skillFor,
  starsFor,
  teachClips,
  TIER_COUNT,
  tier3Half,
  tier3Kind,
} from './logic'
import type { DayItem, GhoItem, GhoProgress, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, 1, MAX_TUNER_LEVEL]
const CORPUS_IDS = new Set(corpus.entries.map((e) => e.id))

function draw(tier: TierId, n = DRAWS, index = 0, level = 0): GhoItem[] {
  return Array.from({ length: n }, () => generateItem(tier, index, [], level))
}

// ------------------------------------------------------------
// Génération — invariants par palier
// ------------------------------------------------------------

describe('generateItem — tier 0 (la journée)', () => {
  it('produit toujours un item moment dont l’activité appartient à la banque', () => {
    const byId = new Map(ACTIVITIES.map((a) => [a.id, a.moment]))
    for (const item of draw(0)) {
      expect(item.kind).toBe('moment')
      if (item.kind !== 'moment') continue
      expect(MOMENTS).toContain(item.moment)
      expect(byId.get(item.activityId)).toBe(item.moment)
    }
  })

  it('la banque offre au moins 6 activités par moment, ids uniques', () => {
    expect(ACTIVITIES_PER_MOMENT).toBeGreaterThanOrEqual(6)
    expect(new Set(ACTIVITIES.map((a) => a.id)).size).toBe(ACTIVITIES.length)
    for (const moment of MOMENTS) {
      expect(ACTIVITIES.filter((a) => a.moment === moment).length).toBeGreaterThanOrEqual(6)
    }
  })
})

describe('generateItem — tier 1 (la roue des jours)', () => {
  it('produit des items jour valides : ref 0..6 et réponse cohérente avec la variante', () => {
    for (const level of ALL_LEVELS) {
      for (const item of draw(1, DRAWS, 0, level)) {
        expect(item.kind).toBe('jour')
        if (item.kind !== 'jour') continue
        expect(item.ref).toBeGreaterThanOrEqual(0)
        expect(item.ref).toBeLessThanOrEqual(6)
        expect(item.answer).toBe(dayAnswer(item.variant, item.ref))
        expect(dayVariantsFor(level)).toContain(item.variant)
      }
    }
  })

  it('niveau 0 du Tuner : seulement « après » et « demain »', () => {
    for (const item of draw(1, DRAWS, 0, 0)) {
      if (item.kind !== 'jour') continue
      expect(['apres', 'demain']).toContain(item.variant)
    }
  })
})

describe('generateItem — tier 2 (les heures piles)', () => {
  it('heures piles uniquement, entre 1 et 11 (jamais 12 : les aiguilles partent de 12)', () => {
    for (const item of draw(2)) {
      expect(item.kind).toBe('heure')
      if (item.kind !== 'heure') continue
      expect(item.half).toBe(false)
      expect(item.hour).toBeGreaterThanOrEqual(1)
      expect(item.hour).toBeLessThanOrEqual(11)
    }
  })
})

describe('generateItem — tier 3 (heures et demies + calendrier)', () => {
  it('alternance déterministe : pairs → horloge, impairs → mois puis saison', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => tier3Kind(i))).toEqual([
      'heure', 'mois', 'heure', 'saison', 'heure', 'mois', 'heure', 'saison',
    ])
    expect([0, 2, 4, 6].map((i) => tier3Half(i))).toEqual([false, true, false, true])
  })

  it('chaque index génère le bon type d’item, avec la demie attendue', () => {
    for (let index = 0; index < ITEMS_PER_RUN; index++) {
      for (const item of draw(3, 30, index)) {
        expect(item.kind).toBe(tier3Kind(index))
        if (item.kind === 'heure') {
          expect(item.half).toBe(tier3Half(index))
          expect(item.hour).toBeGreaterThanOrEqual(1)
          expect(item.hour).toBeLessThanOrEqual(11)
        }
        if (item.kind === 'mois') {
          expect(item.ref).toBeGreaterThanOrEqual(0)
          expect(item.ref).toBeLessThanOrEqual(11)
          expect(item.answer).toBe(monthAnswer(item.variant, item.ref))
        }
        if (item.kind === 'saison') {
          const q = SEASON_QUESTIONS.find((s) => s.id === item.questionId)
          expect(q).toBeDefined()
          expect(item.answer).toBe(q?.answer)
          expect(SEASONS).toContain(item.answer)
        }
      }
    }
  })

  it('la banque saisons couvre les 4 saisons, au moins 2 questions chacune', () => {
    for (const season of SEASONS) {
      expect(SEASON_QUESTIONS.filter((q) => q.answer === season).length).toBeGreaterThanOrEqual(2)
    }
  })
})

// ------------------------------------------------------------
// Relations avant/après — cycliques
// ------------------------------------------------------------

describe('dayAnswer / monthAnswer — relations cycliques', () => {
  it('après mardi → mercredi, avant lundi → dimanche, après dimanche → lundi', () => {
    expect(dayAnswer('apres', 1)).toBe(2)
    expect(dayAnswer('avant', 0)).toBe(6)
    expect(dayAnswer('apres', 6)).toBe(0)
    expect(dayAnswer('demain', 6)).toBe(0)
    expect(dayAnswer('hier', 0)).toBe(6)
  })

  it('demain ≡ après et hier ≡ avant pour tous les jours', () => {
    for (let ref = 0; ref < 7; ref++) {
      expect(dayAnswer('demain', ref)).toBe(dayAnswer('apres', ref))
      expect(dayAnswer('hier', ref)).toBe(dayAnswer('avant', ref))
    }
  })

  it('après décembre → janvier, avant janvier → décembre, après mars → avril', () => {
    expect(monthAnswer('apres', 11)).toBe(0)
    expect(monthAnswer('avant', 0)).toBe(11)
    expect(monthAnswer('apres', 2)).toBe(3)
    expect(monthAnswer('avant', 2)).toBe(1)
  })
})

describe('dayVariantsFor — le Tuner élargit, jamais ne rétrécit', () => {
  it('2 variantes au niveau 0, 3 au niveau 1, 4 au niveau 2', () => {
    expect(dayVariantsFor(0)).toEqual(['apres', 'demain'])
    expect(dayVariantsFor(1)).toEqual(['apres', 'demain', 'avant'])
    expect(dayVariantsFor(2)).toEqual(['apres', 'demain', 'avant', 'hier'])
  })

  it('chaque niveau contient les variantes du précédent', () => {
    for (let level = 1; level <= MAX_TUNER_LEVEL; level++) {
      for (const v of dayVariantsFor(level - 1)) {
        expect(dayVariantsFor(level)).toContain(v)
      }
    }
  })

  it('niveaux hors bornes ou fractionnaires : clampés et tronqués', () => {
    expect(dayVariantsFor(-2)).toEqual(dayVariantsFor(0))
    expect(dayVariantsFor(99)).toEqual(dayVariantsFor(MAX_TUNER_LEVEL))
    expect(dayVariantsFor(1.9)).toEqual(dayVariantsFor(1))
  })
})

// ------------------------------------------------------------
// Anti-répétition
// ------------------------------------------------------------

describe('anti-répétition — itemKey + avoid', () => {
  it('une partie de 8 items ne répète jamais une clé (tous paliers × niveaux × 50 parties)', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (let run = 0; run < 50; run++) {
          const used: string[] = []
          for (let index = 0; index < ITEMS_PER_RUN; index++) {
            const item = generateItem(tier, index, used, level)
            expect(used).not.toContain(itemKey(item))
            used.push(itemKey(item))
          }
          expect(new Set(used).size).toBe(ITEMS_PER_RUN)
        }
      }
    }
  })

  it('chaque pool suffit à une partie : clés uniques et assez nombreuses', () => {
    expect(momentPool().length).toBeGreaterThanOrEqual(ITEMS_PER_RUN)
    expect(dayPool(0).length).toBeGreaterThanOrEqual(ITEMS_PER_RUN)
    expect(clockPool(false).length).toBeGreaterThanOrEqual(ITEMS_PER_RUN)
    // Tier 3 : au pire 2 items par catégorie (heure pile/demie, mois, saison)
    expect(clockPool(true).length).toBeGreaterThanOrEqual(2)
    expect(monthPool().length).toBeGreaterThanOrEqual(2)
    expect(seasonPool().length).toBeGreaterThanOrEqual(2)
    for (const pool of [
      momentPool(), dayPool(MAX_TUNER_LEVEL), clockPool(false), clockPool(true), monthPool(), seasonPool(),
    ] as readonly GhoItem[][]) {
      expect(new Set(pool.map(itemKey)).size).toBe(pool.length)
    }
  })

  it('avoid couvrant tout le pool : retombe sur le pool complet, jamais bloqué', () => {
    const allKeys = momentPool().map(itemKey)
    for (let i = 0; i < 50; i++) {
      expect(allKeys).toContain(itemKey(generateItem(0, 0, allKeys)))
    }
  })

  it('tout le pool sauf un item force cet item (tier 2)', () => {
    const avoid = clockPool(false)
      .filter((c) => c.hour !== 7)
      .map(itemKey)
    for (let i = 0; i < 50; i++) {
      const item = generateItem(2, 0, avoid)
      expect(item.kind === 'heure' && item.hour).toBe(7)
    }
  })

  it('les heures piles et demies ont des clés distinctes', () => {
    expect(itemKey({ kind: 'heure', hour: 7, half: false })).not.toBe(
      itemKey({ kind: 'heure', hour: 7, half: true }),
    )
  })
})

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

describe('validateurs — moment, jour, mois, saison', () => {
  it('isCorrectMoment : seul le moment de l’activité est accepté', () => {
    const item = generateItem(0, 0)
    if (item.kind !== 'moment') throw new Error('item moment attendu')
    for (const m of MOMENTS) {
      expect(isCorrectMoment(item, m)).toBe(m === item.moment)
    }
  })

  it('isCorrectDay : seule la réponse est acceptée, jamais le jour de référence', () => {
    const item: DayItem = { kind: 'jour', variant: 'apres', ref: 1, answer: 2 }
    expect(isCorrectDay(item, 2)).toBe(true)
    expect(isCorrectDay(item, 1)).toBe(false)
    expect(isCorrectDay(item, 3)).toBe(false)
  })

  it('isCorrectMonth et isCorrectSeason', () => {
    expect(isCorrectMonth({ kind: 'mois', variant: 'apres', ref: 11, answer: 0 }, 0)).toBe(true)
    expect(isCorrectMonth({ kind: 'mois', variant: 'apres', ref: 11, answer: 0 }, 11)).toBe(false)
    expect(isCorrectSeason({ kind: 'saison', questionId: 'gho.q.saison.neige', answer: 'hiver' }, 'hiver')).toBe(true)
    expect(isCorrectSeason({ kind: 'saison', questionId: 'gho.q.saison.neige', answer: 'hiver' }, 'ete')).toBe(false)
  })
})

describe('isClockSet — réglage des aiguilles', () => {
  it('heure pile : petite aiguille sur la cible, grande sur 12', () => {
    const item = { kind: 'heure', hour: 7, half: false } as const
    expect(isClockSet(item, 7, 12)).toBe(true)
    expect(isClockSet(item, 7, 6)).toBe(false)
    expect(isClockSet(item, 8, 12)).toBe(false)
    expect(isClockSet(item, 12, 12)).toBe(false)
  })

  it('et demie : la grande aiguille doit pointer le 6', () => {
    const item = { kind: 'heure', hour: 7, half: true } as const
    expect(isClockSet(item, 7, 6)).toBe(true)
    expect(isClockSet(item, 7, 12)).toBe(false)
    expect(isClockSet(item, 6, 6)).toBe(false)
  })
})

describe('hourAngle / minuteAngle — géométrie des aiguilles', () => {
  it('positions exactes : 12 → 0°, 3 → 90°, 7 et demie → 225°', () => {
    expect(hourAngle(12, 12)).toBe(0)
    expect(hourAngle(3, 12)).toBe(90)
    expect(hourAngle(6, 12)).toBe(180)
    expect(hourAngle(7, 6)).toBe(225)
    expect(minuteAngle(12)).toBe(0)
    expect(minuteAngle(6)).toBe(180)
    expect(minuteAngle(3)).toBe(90)
  })

  it('la demie avance la petite aiguille d’une demi-graduation (15°)', () => {
    for (let h = 1; h <= 11; h++) {
      expect(hourAngle(h, 6) - hourAngle(h, 12)).toBe(15)
    }
  })
})

// ------------------------------------------------------------
// Séquences audio — tout clip référencé DOIT exister dans le corpus
// ------------------------------------------------------------

describe('consigneClips / teachClips — couverture corpus', () => {
  it('tous les clips de tous les items générés existent (tous paliers × index × niveaux)', () => {
    for (const tier of ALL_TIERS) {
      for (let index = 0; index < ITEMS_PER_RUN; index++) {
        for (const level of ALL_LEVELS) {
          for (const item of draw(tier, 20, index, level)) {
            for (const id of [...consigneClips(item), ...teachClips(item)]) {
              expect(CORPUS_IDS.has(id), `clip manquant : ${id}`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('consigne jour : « après mardi » se compose en 3 clips ordonnés', () => {
    expect(consigneClips({ kind: 'jour', variant: 'apres', ref: 1, answer: 2 })).toEqual([
      'gho.consigne.jour.apres',
      'gho.jour.mardi',
      'gho.consigne.jour.tape',
    ])
    expect(consigneClips({ kind: 'jour', variant: 'demain', ref: 6, answer: 0 })).toEqual([
      'gho.consigne.jour.aujourdhui',
      'gho.jour.dimanche',
      'gho.consigne.jour.demain',
    ])
  })

  it('consigne heure : pile en 2 clips, demie ajoute le coup de pouce grande aiguille', () => {
    expect(consigneClips({ kind: 'heure', hour: 7, half: false })).toEqual([
      'gho.consigne.heure',
      'gho.heure.7',
    ])
    expect(consigneClips({ kind: 'heure', hour: 7, half: true })).toEqual([
      'gho.consigne.heure',
      'gho.heure.7.demie',
      'gho.aiguille.grande',
    ])
    expect(hourClip(3, false)).toBe('gho.heure.3')
    expect(hourClip(3, true)).toBe('gho.heure.3.demie')
  })

  it('le feedback d’enseignement NOMME toujours la bonne réponse et invite à réessayer', () => {
    expect(teachClips({ kind: 'jour', variant: 'avant', ref: 0, answer: 6 })).toEqual([
      'gho.regarde.jour',
      'gho.jour.dimanche',
      'gho.reessaie',
    ])
    expect(teachClips({ kind: 'saison', questionId: 'gho.q.saison.neige', answer: 'hiver' })).toEqual([
      'gho.regarde.saison',
      'gho.saison.hiver',
      'gho.reessaie',
    ])
    expect(teachClips({ kind: 'mois', variant: 'apres', ref: 11, answer: 0 })).toEqual([
      'gho.regarde.mois',
      'gho.mois.janvier',
      'gho.reessaie',
    ])
  })
})

describe('corpus audio — hygiène, préfixe gho.', () => {
  it('ids valides, uniques, préfixés gho., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('gho.')).toBe(true)
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

  it('couverture complète : jours, mois, heures (piles + demies), moments, saisons, niveaux', () => {
    const expected = [
      'gho.intro',
      'gho.bien-joue',
      'gho.oups',
      'gho.reessaie',
      'gho.indice',
      'gho.valide-heure',
      'gho.aiguille.grande',
      ...[0, 1, 2, 3].map((t) => `gho.niveau.${t}`),
      ...DAYS.map((d) => `gho.jour.${d}`),
      ...MONTHS.map((m) => `gho.mois.${m}`),
      ...MOMENTS.map((m) => `gho.moment.${m}`),
      ...SEASONS.map((s) => `gho.saison.${s}`),
      ...Array.from({ length: 12 }, (_, i) => `gho.heure.${i + 1}`),
      ...Array.from({ length: 12 }, (_, i) => `gho.heure.${i + 1}.demie`),
      ...ACTIVITIES.map((a) => a.id),
      ...SEASON_QUESTIONS.map((q) => q.id),
    ]
    for (const id of expected) {
      expect(CORPUS_IDS.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

// ------------------------------------------------------------
// Score & progression
// ------------------------------------------------------------

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, ITEMS_PER_RUN)).toBe(3)
    expect(starsFor(7, ITEMS_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, ITEMS_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, ITEMS_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, ITEMS_PER_RUN)).toBe(1)
    expect(starsFor(0, 0)).toBe(1)
  })
})

describe('applyRun — progression et déblocage des ateliers', () => {
  it('FRESH_PROGRESS : 4 paliers à zéro, tier 0 seul débloqué', () => {
    expect(FRESH_PROGRESS).toEqual({ bestStars: [0, 0, 0, 0], unlockedTier: 0, runs: 0 })
  })

  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1).unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: GhoProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars).toEqual([3, 0, 0, 0])
    expect(p.runs).toBe(2)
  })

  it('rejouer un palier déjà passé ne reverrouille jamais', () => {
    const p = applyRun({ bestStars: [3, 0, 0, 0], unlockedTier: 2, runs: 3 }, 0, 1)
    expect(p.unlockedTier).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà de T3', () => {
    const p = applyRun({ bestStars: [0, 0, 0, 0], unlockedTier: 3, runs: 0 }, 3, 3)
    expect(p.unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: GhoProgress = { bestStars: [1, 0, 0, 0], unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: [1, 0, 0, 0], unlockedTier: 0, runs: 1 })
  })
})

// ------------------------------------------------------------
// Cohérence skill-map / manifest
// ------------------------------------------------------------

describe('skillFor — chaque item crédite la bonne compétence', () => {
  it('moment → journée, jour → semaine, heure → heures, mois/saison → calendrier', () => {
    expect(skillFor({ kind: 'moment', moment: 'matin', activityId: 'gho.act.matin.1' })).toBe(SKILL_JOURNEE)
    expect(skillFor({ kind: 'jour', variant: 'apres', ref: 0, answer: 1 })).toBe(SKILL_SEMAINE)
    expect(skillFor({ kind: 'heure', hour: 7, half: true })).toBe(SKILL_HEURES)
    expect(skillFor({ kind: 'mois', variant: 'avant', ref: 0, answer: 11 })).toBe(SKILL_CALENDRIER)
    expect(skillFor({ kind: 'saison', questionId: 'gho.q.saison.neige', answer: 'hiver' })).toBe(SKILL_CALENDRIER)
  })

  it('toutes les compétences du jeu existent dans le skill-map', () => {
    for (const id of GAME_SKILLS) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('le manifest déclare exactement les compétences du jeu', () => {
    const meta = GAMES_BY_ID.get('grand-horloger')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(meta.skills).toEqual([...GAME_SKILLS])
    expect(meta.island).toBe('monde')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('🕰️')
    expect(meta.accent).toBe('#9b59b6')
  })
})
