import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  ACTIONS,
  applyRun,
  ATTRIBUTES,
  badgeFor,
  CLUES_PER_ENQUETE,
  clueClipId,
  compatibleAfter,
  eliminatedAtClue,
  ENQUETES_PER_RUN,
  FRESH_PROGRESS,
  generateEnquete,
  generateStory,
  itemsPerRun,
  matchesPronoun,
  MAX_TUNER_LEVEL,
  MEFAITS,
  modeFor,
  PERSONNAGES,
  PERSONNAGES_BY_ID,
  pronounFor,
  pronounSpec,
  protestClipId,
  starsFor,
  STORIES_PER_RUN,
  SUITE_SUJET,
  suspectCountFor,
  TIER_COUNT,
  TIER_SKILLS,
  TRANSITIFS,
  validateEnquete,
  validateStory,
} from './logic'
import type { EnqueteItem, MavProgress, Pronoun, StoryItem, TierId } from './logic'

const DRAWS = 300
const CORPUS_IDS = new Set(corpus.entries.map((e) => e.id))
const ALL_PRONOUNS: readonly Pronoun[] = ['il', 'elle', 'ils', 'elles']

function stories(tier: 0 | 1, suspectCount: number, n = DRAWS): StoryItem[] {
  return Array.from({ length: n }, () => generateStory(tier, suspectCount))
}

function enquetes(tier: 2 | 3, n = DRAWS): EnqueteItem[] {
  return Array.from({ length: n }, () => generateEnquete(tier))
}

// ------------------------------------------------------------
// Banque de personnages
// ------------------------------------------------------------

describe('PERSONNAGES — la banque du village', () => {
  it('ids uniques, emojis et labels non vides, labels avec article minuscule', () => {
    const ids = PERSONNAGES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PERSONNAGES) {
      expect(p.emoji.length).toBeGreaterThan(0)
      expect(p.label).toMatch(/^(le |la |les )/)
      expect(PERSONNAGES_BY_ID.get(p.id)).toBe(p)
    }
  })

  it('tous les attributs déclarés sont connus de ATTRIBUTES', () => {
    for (const p of PERSONNAGES) {
      expect(new Set(p.attributs).size).toBe(p.attributs.length)
      for (const a of p.attributs) {
        expect(a in ATTRIBUTES, `attribut inconnu : ${a} (${p.id})`).toBe(true)
      }
    }
  })

  it('chaque pronom a au moins deux personnages (référent + distracteur possibles)', () => {
    for (const pronoun of ALL_PRONOUNS) {
      const matching = PERSONNAGES.filter((p) => matchesPronoun(p, pronoun))
      expect(matching.length, `pronom sans personnages : ${pronoun}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('assez de coupables possibles (singuliers, ≥ 3 attributs) pour 4 enquêtes', () => {
    const culprits = PERSONNAGES.filter((p) => p.nombre === 'sg' && p.attributs.length >= 3)
    expect(culprits.length).toBeGreaterThanOrEqual(ENQUETES_PER_RUN)
  })
})

// ------------------------------------------------------------
// Pronoms
// ------------------------------------------------------------

describe('pronounFor / pronounSpec / matchesPronoun — accords', () => {
  it('les quatre accords genre × nombre', () => {
    expect(pronounFor('m', 'sg')).toBe('il')
    expect(pronounFor('f', 'sg')).toBe('elle')
    expect(pronounFor('m', 'pl')).toBe('ils')
    expect(pronounFor('f', 'pl')).toBe('elles')
  })

  it('pronounSpec est l’inverse exact de pronounFor', () => {
    for (const pronoun of ALL_PRONOUNS) {
      const spec = pronounSpec(pronoun)
      expect(pronounFor(spec.genre, spec.nombre)).toBe(pronoun)
    }
  })

  it('matchesPronoun exige genre ET nombre', () => {
    const boulanger = PERSONNAGES_BY_ID.get('boulanger')
    const jumelles = PERSONNAGES_BY_ID.get('jumelles')
    if (!boulanger || !jumelles) throw new Error('banque incomplète')
    expect(matchesPronoun(boulanger, 'il')).toBe(true)
    expect(matchesPronoun(boulanger, 'ils')).toBe(false)
    expect(matchesPronoun(boulanger, 'elle')).toBe(false)
    expect(matchesPronoun(jumelles, 'elles')).toBe(true)
    expect(matchesPronoun(jumelles, 'elle')).toBe(false)
  })

  it('badgeFor : symbole de genre + nombre pédagogiques', () => {
    expect(badgeFor({ genre: 'f', nombre: 'sg' })).toEqual({ genre: '♀', nombre: '1' })
    expect(badgeFor({ genre: 'm', nombre: 'pl' })).toEqual({ genre: '♂', nombre: '2' })
  })
})

describe('protestClipId — l’erreur enseigne POURQUOI', () => {
  it('mauvais genre : le personnage proteste sur son genre', () => {
    const fermiere = PERSONNAGES_BY_ID.get('fermiere')
    if (!fermiere) throw new Error('banque incomplète')
    expect(protestClipId(fermiere, 'il')).toBe('mav.oups.genre.f')
  })

  it('bon genre mais mauvais nombre : protestation sur le nombre', () => {
    const jumeaux = PERSONNAGES_BY_ID.get('jumeaux')
    const boulanger = PERSONNAGES_BY_ID.get('boulanger')
    if (!jumeaux || !boulanger) throw new Error('banque incomplète')
    expect(protestClipId(jumeaux, 'il')).toBe('mav.oups.nombre.pl')
    expect(protestClipId(boulanger, 'ils')).toBe('mav.oups.nombre.sg')
  })

  it('genre et nombre corrects (cas transitif ambigu) : c’est le sens qui tranche', () => {
    const fermier = PERSONNAGES_BY_ID.get('fermier')
    if (!fermier) throw new Error('banque incomplète')
    expect(protestClipId(fermier, 'il')).toBe('mav.oups.sens')
  })

  it('tous les clips de protestation existent dans le corpus', () => {
    for (const p of PERSONNAGES) {
      for (const pronoun of ALL_PRONOUNS) {
        const clip = protestClipId(p, pronoun)
        expect(CORPUS_IDS.has(clip), `clip manquant : ${clip}`).toBe(true)
      }
    }
  })
})

// ------------------------------------------------------------
// Mode étiquette — génération des histoires
// ------------------------------------------------------------

describe('generateStory — invariants (300 tirages par palier)', () => {
  it('T0 : histoires valides, pronoms singuliers, référent unique', () => {
    for (const item of stories(0, 3)) {
      expect(validateStory(item)).toBe(true)
      expect(item.tier).toBe(0)
      expect(item.kind).toBe('simple')
      expect(['il', 'elle']).toContain(item.pronoun)
      expect(item.suspects).toHaveLength(3)
    }
  })

  it('T1 : histoires valides, mélange simple-pluriel ET transitif', () => {
    const items = stories(1, 4)
    const kinds = new Set(items.map((i) => i.kind))
    expect(kinds.has('simple')).toBe(true)
    expect(kinds.has('transitive')).toBe(true)
    for (const item of items) {
      expect(validateStory(item)).toBe(true)
      expect(item.suspects).toHaveLength(4)
      if (item.kind === 'simple') {
        expect(['ils', 'elles']).toContain(item.pronoun)
      }
    }
  })

  it('le référent affiché correspond toujours au pronom', () => {
    for (const tier of [0, 1] as const) {
      for (const item of stories(tier, 4, 100)) {
        const referent = item.suspects.find((s) => s.id === item.referentId)
        expect(referent).toBeDefined()
        if (referent) expect(matchesPronoun(referent, item.pronoun)).toBe(true)
      }
    }
  })

  it('aucun distracteur ne correspond au pronom — sauf le sujet du cas transitif ambigu', () => {
    for (const item of stories(1, 4)) {
      for (const s of item.suspects) {
        if (s.id === item.referentId) continue
        if (matchesPronoun(s, item.pronoun)) {
          expect(item.kind).toBe('transitive')
          expect(s.id).toBe(item.sujetId)
          expect(item.referentId).toBe(item.objetId)
        }
      }
    }
  })

  it('cas transitif ambigu : le référent est TOUJOURS l’objet (le sens tranche)', () => {
    let seen = 0
    for (const item of stories(1, 4, 600)) {
      if (item.kind !== 'transitive' || !item.sujetId || !item.objetId) continue
      const sujet = PERSONNAGES_BY_ID.get(item.sujetId)
      const objet = PERSONNAGES_BY_ID.get(item.objetId)
      if (!sujet || !objet) throw new Error('personnage inconnu')
      if (sujet.genre === objet.genre && sujet.nombre === objet.nombre) {
        seen++
        expect(item.referentId).toBe(item.objetId)
      }
    }
    expect(seen, 'le cas ambigu doit apparaître sur 600 tirages').toBeGreaterThan(0)
  })

  it('transitif : sujet humain singulier, objet = celui du gabarit', () => {
    for (const item of stories(1, 4)) {
      if (item.kind !== 'transitive' || !item.sujetId || !item.objetId) continue
      const sujet = PERSONNAGES_BY_ID.get(item.sujetId)
      if (!sujet) throw new Error('sujet inconnu')
      expect(sujet.nombre).toBe('sg')
      expect(TRANSITIFS.map((t) => t.objetId)).toContain(item.objetId)
      expect(item.suspects.map((s) => s.id)).toContain(item.sujetId)
      expect(item.suspects.map((s) => s.id)).toContain(item.objetId)
    }
  })

  it('phrase 2 : commence par le pronom capitalisé, clips pronom + suite', () => {
    for (const tier of [0, 1] as const) {
      for (const item of stories(tier, 3, 100)) {
        const cap = item.pronoun.charAt(0).toUpperCase() + item.pronoun.slice(1)
        expect(item.phrase2.text.startsWith(`${cap} `)).toBe(true)
        expect(item.phrase2.clips[0]).toBe(`mav.pr.${item.pronoun}`)
        expect(item.phrase2.clips).toHaveLength(2)
        expect(item.phrase1.clips).toHaveLength(2)
      }
    }
  })

  it('tous les clips des histoires existent dans le corpus', () => {
    for (const tier of [0, 1] as const) {
      for (const item of stories(tier, 4)) {
        for (const id of [...item.phrase1.clips, ...item.phrase2.clips]) {
          expect(CORPUS_IDS.has(id), `clip manquant : ${id}`).toBe(true)
        }
      }
    }
  })

  it('avoidReferents : le référent varie quand une alternative existe', () => {
    const sgIds = PERSONNAGES.filter((p) => p.nombre === 'sg').map((p) => p.id)
    const avoid = sgIds.slice(0, sgIds.length - 1)
    const only = sgIds[sgIds.length - 1]
    for (let i = 0; i < 50; i++) {
      expect(generateStory(0, 3, avoid).referentId).toBe(only)
    }
  })

  it('avoid couvrant tout le pool : retombe sur le pool complet, jamais bloqué', () => {
    const sgIds = PERSONNAGES.filter((p) => p.nombre === 'sg').map((p) => p.id)
    for (let i = 0; i < 50; i++) {
      const item = generateStory(0, 3, sgIds)
      expect(sgIds).toContain(item.referentId)
      expect(validateStory(item)).toBe(true)
    }
  })
})

describe('validateStory — rejette les histoires cassées', () => {
  it('rejette un référent absent des suspects ou en désaccord avec le pronom', () => {
    const base = generateStory(0, 3)
    expect(validateStory({ ...base, referentId: 'inconnu' })).toBe(false)
    const wrongPronoun: Pronoun = base.pronoun === 'il' ? 'elle' : 'il'
    expect(validateStory({ ...base, pronoun: wrongPronoun })).toBe(false)
  })

  it('rejette un doublon de suspects et un distracteur qui matche le pronom', () => {
    const base = generateStory(0, 3)
    const referent = base.suspects.find((s) => s.id === base.referentId)
    if (!referent) throw new Error('référent absent')
    expect(validateStory({ ...base, suspects: [...base.suspects, referent] })).toBe(false)
    const rival = PERSONNAGES.find(
      (p) => p.id !== referent.id && matchesPronoun(p, base.pronoun),
    )
    if (!rival) throw new Error('pas de rival pour ce pronom')
    expect(
      validateStory({ ...base, suspects: [...base.suspects.filter((s) => s.id !== rival.id), rival] }),
    ).toBe(false)
  })
})

// ------------------------------------------------------------
// Mode enquête
// ------------------------------------------------------------

describe('generateEnquete — invariants (300 tirages par palier)', () => {
  it('T2 : 4 suspects, indices directs, enquêtes toutes valides', () => {
    for (const item of enquetes(2)) {
      expect(validateEnquete(item)).toBe(true)
      expect(item.suspects).toHaveLength(4)
      expect(item.clueClips).toEqual(item.clueAttrs.map((a) => `mav.i.${a}`))
    }
  })

  it('T3 : 5 suspects, indices inférentiels, enquêtes toutes valides', () => {
    for (const item of enquetes(3)) {
      expect(validateEnquete(item)).toBe(true)
      expect(item.suspects).toHaveLength(5)
      expect(item.clueClips).toEqual(item.clueAttrs.map((a) => `mav.j.${a}`))
    }
  })

  it('le coupable est singulier et possède les 3 indices ; il est l’UNIQUE survivant', () => {
    for (const tier of [2, 3] as const) {
      for (const item of enquetes(tier, 100)) {
        const culprit = item.suspects.find((s) => s.id === item.culpritId)
        expect(culprit).toBeDefined()
        if (!culprit) continue
        expect(culprit.nombre).toBe('sg')
        expect(eliminatedAtClue(culprit, item.clueAttrs)).toBeNull()
        const survivors = item.suspects.filter(
          (s) => eliminatedAtClue(s, item.clueAttrs) === null,
        )
        expect(survivors.map((s) => s.id)).toEqual([item.culpritId])
      }
    }
  })

  it('chaque indice écarte au moins un suspect (l’enquête avance toujours)', () => {
    for (const tier of [2, 3] as const) {
      for (const item of enquetes(tier, 100)) {
        const eliminations = item.suspects
          .filter((s) => s.id !== item.culpritId)
          .map((s) => eliminatedAtClue(s, item.clueAttrs))
        for (let i = 0; i < CLUES_PER_ENQUETE; i++) {
          expect(eliminations, `indice ${i + 1} sans élimination`).toContain(i)
        }
        // … et chaque distracteur est écarté par exactement un indice.
        expect(eliminations.every((e) => e !== null)).toBe(true)
      }
    }
  })

  it('tous les clips des enquêtes existent dans le corpus (indices + méfaits)', () => {
    for (const tier of [2, 3] as const) {
      for (const item of enquetes(tier, 100)) {
        for (const id of [...item.clueClips, item.mefait.clip]) {
          expect(CORPUS_IDS.has(id), `clip manquant : ${id}`).toBe(true)
        }
      }
    }
  })

  it('chaque coupable possible peut porter une enquête valide (banque saine)', () => {
    const culprits = PERSONNAGES.filter((p) => p.nombre === 'sg' && p.attributs.length >= 3)
    for (const culprit of culprits) {
      const avoid = culprits.filter((c) => c.id !== culprit.id).map((c) => c.id)
      for (const tier of [2, 3] as const) {
        const item = generateEnquete(tier, avoid)
        expect(item.culpritId).toBe(culprit.id)
        expect(validateEnquete(item)).toBe(true)
      }
    }
  })

  it('avoidCulprits : 4 enquêtes d’une partie ont 4 coupables différents', () => {
    for (let run = 0; run < 30; run++) {
      const used: string[] = []
      for (let i = 0; i < ENQUETES_PER_RUN; i++) {
        const item = generateEnquete(2, used)
        expect(used).not.toContain(item.culpritId)
        used.push(item.culpritId)
      }
    }
  })

  it('avoid couvrant tous les coupables : retombe sur le pool complet, jamais bloqué', () => {
    const all = PERSONNAGES.filter((p) => p.nombre === 'sg' && p.attributs.length >= 3).map(
      (p) => p.id,
    )
    for (let i = 0; i < 30; i++) {
      const item = generateEnquete(3, all)
      expect(all).toContain(item.culpritId)
      expect(validateEnquete(item)).toBe(true)
    }
  })
})

describe('eliminatedAtClue / compatibleAfter — moteur d’élimination', () => {
  const chien = PERSONNAGES_BY_ID.get('chien')
  const chat = PERSONNAGES_BY_ID.get('chat')
  if (!chien || !chat) throw new Error('banque incomplète')
  const clues = ['quatre-pattes', 'moustaches', 'aime-les-os']

  it('premier indice manquant = indice d’élimination', () => {
    expect(eliminatedAtClue(chien, clues)).toBeNull()
    expect(eliminatedAtClue(chat, clues)).toBe(2) // pas d’os
    const poules = PERSONNAGES_BY_ID.get('poules')
    if (!poules) throw new Error('banque incomplète')
    expect(eliminatedAtClue(poules, clues)).toBe(0) // pas quatre pattes
  })

  it('compatibleAfter suit la révélation progressive des indices', () => {
    expect(compatibleAfter(chat, clues, 0)).toBe(true)
    expect(compatibleAfter(chat, clues, 1)).toBe(true)
    expect(compatibleAfter(chat, clues, 2)).toBe(true)
    expect(compatibleAfter(chat, clues, 3)).toBe(false)
    expect(compatibleAfter(chien, clues, 3)).toBe(true)
  })
})

describe('validateEnquete — rejette les enquêtes cassées', () => {
  it('rejette coupable pluriel, indice inconnu, distracteur jamais écarté', () => {
    const base = generateEnquete(2)
    expect(validateEnquete({ ...base, culpritId: 'absent' })).toBe(false)
    expect(validateEnquete({ ...base, clueAttrs: ['quatre-pattes', 'volant', 'miaule'] })).toBe(false)
    // Un suspect identique au coupable (donc jamais écarté) casse l’unicité.
    const culprit = base.suspects.find((s) => s.id === base.culpritId)
    if (!culprit) throw new Error('coupable absent')
    const clone = { ...culprit, id: 'sosie' }
    expect(
      validateEnquete({ ...base, suspects: [...base.suspects.slice(0, -1), clone, culprit] }),
    ).toBe(false)
  })

  it('rejette des indices en doublon', () => {
    const base = generateEnquete(2)
    const a = base.clueAttrs[0]
    expect(validateEnquete({ ...base, clueAttrs: [a, a, base.clueAttrs[2]] })).toBe(false)
  })
})

// ------------------------------------------------------------
// Paliers, Tuner, score, progression
// ------------------------------------------------------------

describe('paliers et Tuner', () => {
  it('modeFor / itemsPerRun : étiquette 8 items, enquête 4 enquêtes', () => {
    expect(modeFor(0)).toBe('etiquette')
    expect(modeFor(1)).toBe('etiquette')
    expect(modeFor(2)).toBe('enquete')
    expect(modeFor(3)).toBe('enquete')
    expect(itemsPerRun(0)).toBe(STORIES_PER_RUN)
    expect(itemsPerRun(1)).toBe(STORIES_PER_RUN)
    expect(itemsPerRun(2)).toBe(ENQUETES_PER_RUN)
    expect(itemsPerRun(3)).toBe(ENQUETES_PER_RUN)
  })

  it('suspectCountFor : 3→4 personnages au Tuner en étiquette, 4 puis 5 en enquête', () => {
    expect(suspectCountFor(0, 0)).toBe(3)
    expect(suspectCountFor(0, 1)).toBe(4)
    expect(suspectCountFor(1, MAX_TUNER_LEVEL)).toBe(4)
    for (const level of [0, 1, MAX_TUNER_LEVEL]) {
      expect(suspectCountFor(2, level)).toBe(4)
      expect(suspectCountFor(3, level)).toBe(5)
    }
  })

  it('niveaux hors bornes ou fractionnaires : clampés et tronqués', () => {
    expect(suspectCountFor(0, -3)).toBe(3)
    expect(suspectCountFor(0, 99)).toBe(4)
    expect(suspectCountFor(0, 0.9)).toBe(3)
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('étiquette (8 items) : seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, STORIES_PER_RUN)).toBe(3)
    expect(starsFor(7, STORIES_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, STORIES_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, STORIES_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, STORIES_PER_RUN)).toBe(1)
  })

  it('enquête (4 enquêtes) : 4/4 → 3 étoiles, 3/4 → 2, 2/4 → 1', () => {
    expect(starsFor(4, ENQUETES_PER_RUN)).toBe(3)
    expect(starsFor(3, ENQUETES_PER_RUN)).toBe(2)
    expect(starsFor(2, ENQUETES_PER_RUN)).toBe(1)
  })
})

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1).unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: MavProgress = { ...FRESH_PROGRESS }
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
    const before: MavProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

// ------------------------------------------------------------
// Corpus audio
// ------------------------------------------------------------

describe('corpus audio — couverture complète, préfixe mav.', () => {
  it('ids valides, uniques, tous préfixés mav., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('mav.')).toBe(true)
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

  it('toutes les briques composables existent : personnages, pronoms, actions, transitifs', () => {
    const required: string[] = []
    for (const p of PERSONNAGES) required.push(`mav.p.${p.id}`)
    for (const pr of ALL_PRONOUNS) required.push(`mav.pr.${pr}`)
    for (const a of ACTIONS) {
      for (const nb of ['sg', 'pl'] as const) {
        required.push(`mav.a.${a.id}.${nb}`, `mav.s.${a.id}.${nb}`)
      }
    }
    for (const t of TRANSITIFS) required.push(`mav.v.${t.id}`, `mav.so.${t.id}`)
    required.push(SUITE_SUJET.clip)
    for (const attr of Object.keys(ATTRIBUTES)) {
      required.push(clueClipId(attr, 2), clueClipId(attr, 3))
    }
    for (const m of MEFAITS) required.push(m.clip)
    for (const id of [
      'mav.intro',
      'mav.qui',
      'mav.prends',
      'mav.trouve',
      'mav.hint.etiquette',
      'mav.hint.enquete',
      'mav.oups.sens',
      'mav.enquete.intro',
      'mav.enquete.ecarte',
      'mav.enquete.designe',
      'mav.indice.1',
      'mav.indice.2',
      'mav.indice.3',
      'mav.pardon',
      'mav.pas-lui',
      'mav.coupable',
      'mav.niveau.0',
      'mav.niveau.1',
      'mav.niveau.2',
      'mav.niveau.3',
    ]) {
      required.push(id)
    }
    for (const id of required) {
      expect(CORPUS_IDS.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })

  it('zéro dérive texte/corpus : labels, actions et transitifs identiques', () => {
    const byId = new Map(corpus.entries.map((e) => [e.id, e.text]))
    for (const p of PERSONNAGES) {
      const expected = p.label.charAt(0).toUpperCase() + p.label.slice(1)
      expect(byId.get(`mav.p.${p.id}`)).toBe(expected)
    }
    for (const a of ACTIONS) {
      for (const nb of ['sg', 'pl'] as const) {
        expect(byId.get(`mav.a.${a.id}.${nb}`)).toBe(a.a[nb])
        expect(byId.get(`mav.s.${a.id}.${nb}`)).toBe(a.s[nb])
      }
    }
    for (const t of TRANSITIFS) {
      expect(byId.get(`mav.v.${t.id}`)).toBe(t.verbe)
      expect(byId.get(`mav.so.${t.id}`)).toBe(t.suiteObjet)
    }
    expect(byId.get(SUITE_SUJET.clip)).toBe(SUITE_SUJET.text)
  })
})

// ------------------------------------------------------------
// Cohérence skill-map / manifest
// ------------------------------------------------------------

describe('cohérence avec le skill-map et le manifest', () => {
  it('un skill par palier, tous connus du skill-map', () => {
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect([...TIER_SKILLS]).toEqual([
      'fr.cp.comp.anaphores',
      'fr.cp.comp.anaphores',
      'fr.cp.comp.inferences',
      'fr.cp.comp.inferences',
    ])
    for (const id of TIER_SKILLS) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('le manifest déclare exactement les skills des paliers', () => {
    const meta = GAMES_BY_ID.get('mysteres-au-village')
    if (!meta) return // entrée câblée par l'orchestrateur
    expect(meta.skills).toEqual([...new Set(TIER_SKILLS)])
    expect(meta.island).toBe('sons')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('🕵️')
    expect(meta.accent).toBe('#1b5e20')
  })
})

describe('tiers — TierId couvre bien 0..3', () => {
  it('chaque palier a un mode et un nombre d’items', () => {
    for (const tier of [0, 1, 2, 3] as TierId[]) {
      expect(['etiquette', 'enquete']).toContain(modeFor(tier))
      expect(itemsPerRun(tier)).toBeGreaterThan(0)
    }
  })
})
