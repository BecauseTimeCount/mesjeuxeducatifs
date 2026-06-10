import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  applyDuo,
  applyRun,
  buildDuoText,
  buildSentenceItem,
  buildWordItem,
  computeMclm,
  computeWpm,
  countWords,
  DUO_SKILL,
  DUO_SUCCESS_MCLM,
  fillTemplate,
  FLUENCE_LOG_MAX,
  FRESH_PROGRESS,
  itemsPerRun,
  matchingScenes,
  MAX_TUNER_LEVEL,
  maxSyllablesFor,
  MCLM_GAUGE_MAX,
  MCLM_MARKS,
  pickDistractors,
  pushLog,
  sceneDiff,
  sceneEquals,
  SENTENCE_CHOICES,
  SENTENCE_ITEMS_PER_RUN,
  sentenceTextOf,
  starsFor,
  teachingText,
  TIER_COUNT,
  TIER_SKILLS,
  WORD_CHOICES,
  WORD_ITEMS_PER_RUN,
  wordBank,
  wordPoolFor,
  WPM_CAP,
} from './logic'
import type { FlxProgress, FluenceLogEntry, TierId } from './logic'
import {
  ACTIONS,
  DUO_ANIMAUX,
  DUO_FRUITS,
  DUO_LIEUX,
  DUO_PRENOMS,
  DUO_TEMPLATES,
  PLACES,
  SUBJECTS,
  WORDS,
} from './words'

const DRAWS = 200
const WORD_TIERS: ReadonlyArray<0 | 1> = [0, 1]
const ALL_LEVELS: readonly number[] = [0, 1, MAX_TUNER_LEVEL]

function findWord(word: string) {
  const entry = WORDS.find((w) => w.word === word)
  if (!entry) throw new Error(`mot absent de la banque : ${word}`)
  return entry
}

// ------------------------------------------------------------
// Banque de mots
// ------------------------------------------------------------

describe('WORDS — intégrité de la banque', () => {
  it('au moins 60 mots, répartis sur les deux paliers (≥ 20 chacun)', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(60)
    expect(wordBank(0).length).toBeGreaterThanOrEqual(20)
    expect(wordBank(1).length).toBeGreaterThanOrEqual(20)
  })

  it('mots uniques, emojis uniques (zéro ambiguïté visuelle possible)', () => {
    expect(new Set(WORDS.map((w) => w.word)).size).toBe(WORDS.length)
    expect(new Set(WORDS.map((w) => w.emoji)).size).toBe(WORDS.length)
  })

  it('le découpage syllabique recompose EXACTEMENT le mot', () => {
    for (const w of WORDS) {
      expect(w.syllables.join(''), w.word).toBe(w.word)
      expect(w.syllables.length).toBeGreaterThanOrEqual(2)
      for (const s of w.syllables) expect(s.length).toBeGreaterThan(0)
    }
  })

  it('chaque mot a un emoji et une famille phonique non vides', () => {
    for (const w of WORDS) {
      expect(w.emoji.trim().length).toBeGreaterThan(0)
      expect(w.famille.trim().length).toBeGreaterThan(0)
      expect([0, 1]).toContain(w.tier)
    }
  })
})

// ------------------------------------------------------------
// Tuner → longueur des mots
// ------------------------------------------------------------

describe('wordPoolFor — le Tuner règle la longueur des mots', () => {
  it('cran 0 → ≤ 2 syllabes, cran 1 → ≤ 3, cran 2 → tout', () => {
    expect(maxSyllablesFor(0)).toBe(2)
    expect(maxSyllablesFor(1)).toBe(3)
    expect(maxSyllablesFor(2)).toBeGreaterThan(3)
    expect(maxSyllablesFor(-5)).toBe(2)
    expect(maxSyllablesFor(99)).toBeGreaterThan(3)
  })

  it('pool jamais trop petit : ≥ 2 × le nombre de wagons, à tous les crans', () => {
    for (const tier of WORD_TIERS) {
      for (const level of ALL_LEVELS) {
        expect(wordPoolFor(tier, level).length).toBeGreaterThanOrEqual(WORD_CHOICES * 2)
      }
    }
  })

  it('les pools s’élargissent quand le niveau monte (jamais l’inverse)', () => {
    for (const tier of WORD_TIERS) {
      for (let level = 1; level <= MAX_TUNER_LEVEL; level++) {
        const prev = new Set(wordPoolFor(tier, level - 1).map((w) => w.word))
        const next = new Set(wordPoolFor(tier, level).map((w) => w.word))
        for (const w of prev) expect(next.has(w), w).toBe(true)
      }
    }
  })

  it('le pool d’un cran respecte la longueur maximale du cran', () => {
    for (const tier of WORD_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const w of wordPoolFor(tier, level)) {
          expect(w.syllables.length).toBeLessThanOrEqual(maxSyllablesFor(level))
        }
      }
    }
  })

  it('chaque pool suffit à une partie de 10 mots sans répétition', () => {
    for (const tier of WORD_TIERS) {
      for (const level of ALL_LEVELS) {
        expect(wordPoolFor(tier, level).length).toBeGreaterThanOrEqual(WORD_ITEMS_PER_RUN)
      }
    }
  })
})

// ------------------------------------------------------------
// Train des mots
// ------------------------------------------------------------

describe('buildWordItem — invariants (tous paliers × crans × 200 tirages)', () => {
  it('4 wagons uniques (mots ET emojis), la cible est dedans à answerIndex', () => {
    for (const tier of WORD_TIERS) {
      for (const level of ALL_LEVELS) {
        for (let i = 0; i < DRAWS / 2; i++) {
          const item = buildWordItem(tier, level)
          expect(item.choices).toHaveLength(WORD_CHOICES)
          expect(new Set(item.choices.map((c) => c.word)).size).toBe(WORD_CHOICES)
          expect(new Set(item.choices.map((c) => c.emoji)).size).toBe(WORD_CHOICES)
          expect(item.answerIndex).toBeGreaterThanOrEqual(0)
          expect(item.answerIndex).toBeLessThan(WORD_CHOICES)
          expect(item.choices[item.answerIndex].word).toBe(item.target.word)
          expect(item.target.tier).toBe(tier)
        }
      }
    }
  })

  it('la cible respecte la longueur du cran de Tuner', () => {
    for (const tier of WORD_TIERS) {
      for (const level of ALL_LEVELS) {
        for (let i = 0; i < 50; i++) {
          const item = buildWordItem(tier, level)
          expect(item.target.syllables.length).toBeLessThanOrEqual(maxSyllablesFor(level))
        }
      }
    }
  })

  it('les distracteurs viennent du même palier et ne sont jamais la cible', () => {
    for (const tier of WORD_TIERS) {
      for (let i = 0; i < 100; i++) {
        const item = buildWordItem(tier, 1)
        for (const c of item.choices) {
          expect(c.tier).toBe(tier)
          if (c.word !== item.target.word) expect(c.emoji).not.toBe(item.target.emoji)
        }
      }
    }
  })

  it('une partie de 10 mots ne répète jamais une cible (50 parties)', () => {
    for (const tier of WORD_TIERS) {
      for (let run = 0; run < 50; run++) {
        const used: string[] = []
        for (let i = 0; i < WORD_ITEMS_PER_RUN; i++) {
          const item = buildWordItem(tier, 1, used)
          expect(used).not.toContain(item.target.word)
          used.push(item.target.word)
        }
        expect(new Set(used).size).toBe(WORD_ITEMS_PER_RUN)
      }
    }
  })

  it('used couvrant tout le pool : retombe sur le pool, jamais bloqué', () => {
    const all = wordBank(0).map((w) => w.word)
    for (let i = 0; i < 30; i++) {
      const item = buildWordItem(0, 2, all)
      expect(all).toContain(item.target.word)
    }
  })
})

describe('pickDistractors — voisins orthographiques intelligents', () => {
  it('toujours 3 distracteurs, uniques, jamais la cible', () => {
    for (const tier of WORD_TIERS) {
      const bank = wordBank(tier)
      for (const target of bank) {
        const d = pickDistractors(target, bank)
        expect(d).toHaveLength(3)
        expect(new Set(d.map((x) => x.word)).size).toBe(3)
        for (const x of d) {
          expect(x.word).not.toBe(target.word)
          expect(x.emoji).not.toBe(target.emoji)
        }
      }
    }
  })

  it('« lavabo » attire ses voisins en attaque : tous commencent par l', () => {
    for (let i = 0; i < 30; i++) {
      const d = pickDistractors(findWord('lavabo'), wordBank(0))
      for (const x of d) expect(x.word.startsWith('l'), x.word).toBe(true)
    }
  })

  it('« gâteau » attire ses voisins en rime : tous finissent par eau', () => {
    for (let i = 0; i < 30; i++) {
      const d = pickDistractors(findWord('gâteau'), wordBank(1))
      for (const x of d) expect(x.word.endsWith('eau'), x.word).toBe(true)
    }
  })
})

describe('teachingText — relecture syllabée après erreur', () => {
  it('« la... va... bo... lavabo ! »', () => {
    expect(teachingText(findWord('lavabo'))).toBe('la... va... bo... lavabo !')
    expect(teachingText(findWord('chapeau'))).toBe('cha... peau... chapeau !')
  })
})

// ------------------------------------------------------------
// Phrases express
// ------------------------------------------------------------

describe('gabarits de phrases — parties', () => {
  it('au moins 12 gabarits de parties au total (8 sujets, 6 actions, 6 lieux)', () => {
    expect(SUBJECTS.length).toBeGreaterThanOrEqual(6)
    expect(ACTIONS.length).toBeGreaterThanOrEqual(4)
    expect(PLACES.length).toBeGreaterThanOrEqual(4)
    expect(SUBJECTS.length + ACTIONS.length + PLACES.length).toBeGreaterThanOrEqual(12)
  })

  it('emojis uniques DANS chaque catégorie (scènes jamais ambiguës)', () => {
    for (const parts of [SUBJECTS, ACTIONS, PLACES]) {
      expect(new Set(parts.map((p) => p.emoji)).size).toBe(parts.length)
      expect(new Set(parts.map((p) => p.text)).size).toBe(parts.length)
    }
  })

  it('le pool de phrases suffit largement à une partie de 8 items', () => {
    expect(SUBJECTS.length * ACTIONS.length * PLACES.length).toBeGreaterThanOrEqual(
      SENTENCE_ITEMS_PER_RUN * 4,
    )
  })
})

describe('buildSentenceItem — invariants (200 tirages)', () => {
  it('4 scènes uniques, la bonne à answerIndex, phrase terminée par un point', () => {
    for (let i = 0; i < DRAWS; i++) {
      const item = buildSentenceItem()
      expect(item.scenes).toHaveLength(SENTENCE_CHOICES)
      const keys = item.scenes.map((s) => `${s.subject}|${s.action}|${s.place}`)
      expect(new Set(keys).size).toBe(SENTENCE_CHOICES)
      expect(sceneEquals(item.scenes[item.answerIndex], item.correct)).toBe(true)
      expect(item.text.endsWith('.')).toBe(true)
      expect(item.text).toBe(`${item.subjectText} ${item.actionText} ${item.placeText}.`)
    }
  })

  it('validateur : UNE SEULE scène correspond à la phrase', () => {
    for (let i = 0; i < DRAWS; i++) {
      expect(matchingScenes(buildSentenceItem())).toBe(1)
    }
  })

  it('chaque distracteur ne diffère de la bonne scène que par UN élément', () => {
    for (let i = 0; i < DRAWS; i++) {
      const item = buildSentenceItem()
      for (const scene of item.scenes) {
        if (sceneEquals(scene, item.correct)) continue
        expect(sceneDiff(scene, item.correct)).toBe(1)
      }
    }
  })

  it('une partie de 8 phrases ne répète jamais un texte (50 parties)', () => {
    for (let run = 0; run < 50; run++) {
      const used: string[] = []
      for (let i = 0; i < SENTENCE_ITEMS_PER_RUN; i++) {
        const item = buildSentenceItem(used)
        expect(used).not.toContain(item.text)
        used.push(item.text)
      }
    }
  })

  it('used couvrant toutes les combinaisons : jamais bloqué', () => {
    const all: string[] = []
    for (const s of SUBJECTS) {
      for (const a of ACTIONS) {
        for (const p of PLACES) all.push(sentenceTextOf(s, a, p))
      }
    }
    const item = buildSentenceItem(all)
    expect(all).toContain(item.text)
  })
})

// ------------------------------------------------------------
// Lecture duo
// ------------------------------------------------------------

describe('countWords / fillTemplate', () => {
  it('compte les mots, ignore la ponctuation française détachée', () => {
    expect(countWords('Le chat dort sous la table.')).toBe(6)
    expect(countWords('Quel régal !')).toBe(2)
    expect(countWords("L'âne dort : il rêve !")).toBe(4)
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
  })

  it('fillTemplate remplace tous les slots', () => {
    expect(fillTemplate('{a} et {b} puis {a}', { a: 'X', b: 'Y' })).toBe('X et Y puis X')
  })
})

describe('DUO_TEMPLATES — textes 60-80 mots, slots sûrs', () => {
  it('au moins 6 gabarits, avec banques de slots fournies', () => {
    expect(DUO_TEMPLATES.length).toBeGreaterThanOrEqual(6)
    expect(DUO_PRENOMS.length).toBeGreaterThanOrEqual(4)
    expect(DUO_ANIMAUX.length).toBeGreaterThanOrEqual(4)
    expect(DUO_LIEUX.length).toBeGreaterThanOrEqual(4)
    expect(DUO_FRUITS.length).toBeGreaterThanOrEqual(4)
  })

  it('slots de longueur constante : prénoms/animaux/lieux 1 mot, fruits 2 mots', () => {
    for (const x of [...DUO_PRENOMS, ...DUO_ANIMAUX, ...DUO_LIEUX]) {
      expect(countWords(x), x).toBe(1)
    }
    for (const x of DUO_FRUITS) expect(countWords(x), x).toBe(2)
  })

  it('chaque gabarit rempli fait 60 à 80 mots, sans slot oublié (20 tirages)', () => {
    for (let t = 0; t < DUO_TEMPLATES.length; t++) {
      for (let i = 0; i < 20; i++) {
        const avoid = DUO_TEMPLATES.map((_, j) => j).filter((j) => j !== t)
        const duo = buildDuoText(avoid)
        expect(duo.templateIndex).toBe(t)
        expect(duo.text.includes('{'), duo.text).toBe(false)
        expect(duo.wordCount).toBe(countWords(duo.text))
        expect(duo.wordCount, `gabarit ${t} : ${duo.wordCount} mots`).toBeGreaterThanOrEqual(60)
        expect(duo.wordCount, `gabarit ${t} : ${duo.wordCount} mots`).toBeLessThanOrEqual(80)
      }
    }
  })

  it('évite le gabarit précédent quand une alternative existe', () => {
    for (let i = 0; i < 50; i++) {
      expect(buildDuoText([0]).templateIndex).not.toBe(0)
    }
  })

  it('tous les gabarits évités : retombe sur le pool complet, jamais bloqué', () => {
    const all = DUO_TEMPLATES.map((_, i) => i)
    const duo = buildDuoText(all)
    expect(all).toContain(duo.templateIndex)
  })
})

// ------------------------------------------------------------
// Chrono → mots/min
// ------------------------------------------------------------

describe('computeWpm — mots/min indicatifs', () => {
  it('50 mots en 1 minute → 50 ; 30 mots en 30 s → 60', () => {
    expect(computeWpm(50, 60_000)).toBe(50)
    expect(computeWpm(30, 30_000)).toBe(60)
  })

  it('arrondi à l’entier : 25 mots en 90 s → 17', () => {
    expect(computeWpm(25, 90_000)).toBe(17)
  })

  it('entrées dégénérées → 0, jamais NaN ni Infinity', () => {
    expect(computeWpm(0, 60_000)).toBe(0)
    expect(computeWpm(10, 0)).toBe(0)
    expect(computeWpm(-5, 60_000)).toBe(0)
    expect(computeWpm(10, -100)).toBe(0)
  })

  it('plafonné à WPM_CAP (taps accidentels ultra-rapides)', () => {
    expect(computeWpm(1000, 60_000)).toBe(WPM_CAP)
    expect(computeWpm(10, 1)).toBe(WPM_CAP)
  })
})

describe('computeMclm — mots correctement lus par minute', () => {
  it('66 mots, 3 erreurs, 1 min → 63 ; 70 mots sans erreur → 70', () => {
    expect(computeMclm(66, 3, 60_000)).toBe(63)
    expect(computeMclm(70, 0, 60_000)).toBe(70)
  })

  it('texte de 65 mots lu en 2 minutes avec 5 erreurs → 30', () => {
    expect(computeMclm(65, 5, 120_000)).toBe(30)
  })

  it('erreurs ≥ mots ou erreurs négatives : clampé, jamais négatif', () => {
    expect(computeMclm(5, 10, 60_000)).toBe(0)
    expect(computeMclm(60, -3, 60_000)).toBe(60)
  })

  it('repères de la jauge : 30, 50 et 70, dans la jauge', () => {
    expect(MCLM_MARKS.map((m) => m.value)).toEqual([30, 50, 70])
    for (const m of MCLM_MARKS) {
      expect(m.label.trim().length).toBeGreaterThan(0)
      expect(m.value).toBeLessThanOrEqual(MCLM_GAUGE_MAX)
    }
    expect(DUO_SUCCESS_MCLM).toBe(30)
  })
})

// ------------------------------------------------------------
// Score & progression
// ------------------------------------------------------------

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1 (parties de 10 et de 8)', () => {
    expect(starsFor(10, 10)).toBe(3)
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(8, 10)).toBe(2)
    expect(starsFor(7, 10)).toBe(2)
    expect(starsFor(6, 10)).toBe(1)
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(7, 8)).toBe(2) // 87,5 %
    expect(starsFor(6, 8)).toBe(2) // 75 %
    expect(starsFor(5, 8)).toBe(1) // 62,5 %
    expect(starsFor(0, 8)).toBe(1)
  })
})

function soloEntry(wpm = 42): FluenceLogEntry {
  return { ts: 1_700_000_000_000, wpm, mode: 'solo' }
}

describe('pushLog — journal plafonné à 20 entrées (FIFO)', () => {
  it('ajoute en fin et conserve l’ordre', () => {
    const log = pushLog([soloEntry(10)], soloEntry(20))
    expect(log.map((e) => e.wpm)).toEqual([10, 20])
  })

  it('au-delà de 20 : la plus ANCIENNE entrée sort', () => {
    let log: FluenceLogEntry[] = []
    for (let i = 1; i <= 25; i++) log = pushLog(log, soloEntry(i))
    expect(log).toHaveLength(FLUENCE_LOG_MAX)
    expect(log[0].wpm).toBe(6)
    expect(log[log.length - 1].wpm).toBe(25)
  })

  it('ne mute pas le journal d’entrée', () => {
    const before = [soloEntry(1)]
    pushLog(before, soloEntry(2))
    expect(before).toHaveLength(1)
  })
})

describe('applyRun — progression solo (contrat dashboard parent)', () => {
  it('FRESH_PROGRESS a la forme exacte du contrat', () => {
    expect(FRESH_PROGRESS).toEqual({
      bestStars: [0, 0, 0],
      unlockedTier: 0,
      runs: 0,
      fluenceLog: [],
    })
  })

  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2, soloEntry()).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1, soloEntry()).unlockedTier).toBe(0)
  })

  it('le dernier palier ne débloque rien au-delà de TIER_COUNT − 1', () => {
    const p: FlxProgress = { bestStars: [3, 3, 0], unlockedTier: 2, runs: 5, fluenceLog: [] }
    expect(applyRun(p, 2, 3, soloEntry()).unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('rejouer un palier déjà passé ne reverrouille jamais', () => {
    const p: FlxProgress = { bestStars: [3, 0, 0], unlockedTier: 2, runs: 3, fluenceLog: [] }
    expect(applyRun(p, 0, 1, soloEntry()).unlockedTier).toBe(2)
  })

  it('bestStars garde le meilleur score par palier, runs s’incrémente', () => {
    let p: FlxProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 1, 3, soloEntry())
    p = applyRun(p, 1, 1, soloEntry())
    expect(p.bestStars).toEqual([0, 3, 0])
    expect(p.runs).toBe(2)
  })

  it('chaque partie solo ajoute UNE entrée wpm mode solo au journal', () => {
    const p = applyRun({ ...FRESH_PROGRESS }, 0, 2, soloEntry(37))
    expect(p.fluenceLog).toHaveLength(1)
    expect(p.fluenceLog[0]).toEqual({ ts: 1_700_000_000_000, wpm: 37, mode: 'solo' })
  })

  it('le journal reste plafonné à 20 après de nombreuses parties', () => {
    let p: FlxProgress = { ...FRESH_PROGRESS }
    for (let i = 0; i < 30; i++) p = applyRun(p, 0, 3, soloEntry(i))
    expect(p.fluenceLog).toHaveLength(FLUENCE_LOG_MAX)
    expect(p.fluenceLog[0].wpm).toBe(10)
  })

  it('répare un bestStars hérité trop court, sans muter l’entrée', () => {
    const before: FlxProgress = { bestStars: [2], unlockedTier: 1, runs: 1, fluenceLog: [] }
    const after = applyRun(before, 2, 3, soloEntry())
    expect(after.bestStars).toEqual([2, 0, 3])
    expect(before).toEqual({ bestStars: [2], unlockedTier: 1, runs: 1, fluenceLog: [] })
  })
})

describe('applyDuo — lecture duo (journal MCLM, sans étoiles)', () => {
  it('ajoute une entrée mode duo, incrémente runs, ne touche ni étoiles ni paliers', () => {
    const p: FlxProgress = { bestStars: [3, 2, 0], unlockedTier: 2, runs: 4, fluenceLog: [] }
    const after = applyDuo(p, { ts: 123, wpm: 55, mode: 'duo' })
    expect(after.bestStars).toEqual([3, 2, 0])
    expect(after.unlockedTier).toBe(2)
    expect(after.runs).toBe(5)
    expect(after.fluenceLog).toEqual([{ ts: 123, wpm: 55, mode: 'duo' }])
  })

  it('le journal duo respecte aussi le plafond FIFO', () => {
    let p: FlxProgress = { ...FRESH_PROGRESS }
    for (let i = 0; i < 25; i++) p = applyDuo(p, { ts: i, wpm: i, mode: 'duo' })
    expect(p.fluenceLog).toHaveLength(FLUENCE_LOG_MAX)
    expect(p.fluenceLog[0].ts).toBe(5)
  })
})

// ------------------------------------------------------------
// Corpus audio & cohérence manifest / skill-map
// ------------------------------------------------------------

describe('corpus audio — préfixe flx., couverture complète', () => {
  it('ids valides, uniques, préfixés flx., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('flx.')).toBe(true)
      expect(['denise', 'eloise', 'henri']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('aucune collision avec les clips communs ui.* ni nombre.*', () => {
    for (const e of corpus.entries) {
      expect(e.id.startsWith('ui.')).toBe(false)
      expect(e.id.startsWith('nombre.')).toBe(false)
    }
  })

  it('tous les clips fixes utilisés par le jeu existent', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const id of [
      'flx.intro',
      'flx.consigne.mots',
      'flx.consigne.phrases',
      'flx.depart',
      'flx.accelere',
      'flx.bien-lu',
      'flx.presque',
      'flx.reessaie',
      'flx.indice',
      'flx.phrase.regarde',
      'flx.phrase.reessaie',
      'flx.terminus',
      'flx.niveau.0',
      'flx.niveau.1',
      'flx.niveau.2',
      'flx.duo.passe',
      'flx.duo.parent',
      'flx.duo.lis',
      'flx.duo.bravo',
      'flx.gare',
    ]) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('un skill par palier, le duo en bonus, tous connus du skill-map', () => {
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect([...TIER_SKILLS]).toEqual(['fr.cp.fluence', 'fr.cp.fluence', 'fr.ce1.fluence'])
    expect(DUO_SKILL).toBe('fr.ce1.fluence')
    for (const id of [...TIER_SKILLS, DUO_SKILL]) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('itemsPerRun : 10 mots aux paliers 0-1, 8 phrases au palier 2', () => {
    const perRun: Record<TierId, number> = { 0: 10, 1: 10, 2: 8 }
    for (const tier of [0, 1, 2] as const) expect(itemsPerRun(tier)).toBe(perRun[tier])
  })

  it('le manifest déclare exactement les skills des paliers', () => {
    const meta = GAMES_BY_ID.get('fluence-express')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(meta.skills).toEqual([...new Set(TIER_SKILLS)])
    expect(meta.island).toBe('sons')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('🚄')
    expect(meta.accent).toBe('#c62828')
  })
})
