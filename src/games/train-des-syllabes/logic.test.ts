import { describe, expect, it } from 'vitest'
import corpus from './corpus.json'
import {
  DEFAULT_SAVE,
  ITEMS_PER_RUN,
  SKILL_DECODAGE,
  SKILL_FUSION,
  SKILL_SCANDER,
  SKILL_SUPPRESSION,
  applyRunToSave,
  genFusion2,
  genFusion3,
  genItem,
  genPseudo,
  genScander,
  genSuppression,
  itemKey,
  pickDistractors,
  starsFor,
  t3Kinds,
  validateBuild,
  validateScander,
  type Item,
  type Tier,
} from './logic'
import {
  DISTRACTOR_CANDIDATES,
  GAME_ENTRIES,
  LEXICON_KEYS,
  SYLLABLES_BY_CLIP,
  WORDS,
  sanitize,
  soundKey,
  type Syllable,
} from './words'

const ITERATIONS = 300

// ------------------------------------------------------------
// Lexique : découpages cohérents
// ------------------------------------------------------------

describe('lexique', () => {
  it('la concaténation des graphies redonne exactement le mot (accents conservés)', () => {
    for (const w of WORDS) {
      expect(w.syllables.map((s) => s.g).join('')).toBe(w.word)
    }
  })

  it('chaque mot a 2 ou 3 syllabes orales et un emoji', () => {
    for (const w of WORDS) {
      expect(w.syllables.length).toBeGreaterThanOrEqual(2)
      expect(w.syllables.length).toBeLessThanOrEqual(3)
      expect(w.emoji.length).toBeGreaterThan(0)
    }
  })

  it('a assez de matière pour chaque palier (≥ 8 items sans répétition)', () => {
    const two = WORDS.filter((w) => w.syllables.length === 2)
    const three = WORDS.filter((w) => w.syllables.length === 3)
    expect(two.length).toBeGreaterThanOrEqual(ITEMS_PER_RUN)
    expect(three.length).toBeGreaterThanOrEqual(ITEMS_PER_RUN)
  })

  it('pas de mot en double', () => {
    expect(new Set(WORDS.map((w) => w.word)).size).toBe(WORDS.length)
  })

  it('un même clip de syllabe a toujours le même texte prononcé', () => {
    const byClip = new Map<string, string>()
    for (const w of WORDS) {
      for (const s of w.syllables) {
        const seen = byClip.get(s.clipId)
        if (seen !== undefined) expect(s.say).toBe(seen)
        else byClip.set(s.clipId, s.say)
      }
    }
  })

  it('sanitize : minuscules, sans accents, alphanumérique', () => {
    expect(sanitize('gâteau')).toBe('gateau')
    expect(sanitize('éléphant')).toBe('elephant')
    expect(sanitize('Châ')).toBe('cha')
    expect(sanitize('sée')).toBe('see')
    expect(sanitize("l'eau !")).toBe('leau')
  })
})

// ------------------------------------------------------------
// Corpus audio : chaque mot et chaque syllabe ont leur entrée
// ------------------------------------------------------------

describe('corpus.json', () => {
  const byId = new Map(corpus.entries.map((e) => [e.id, e]))

  it('ids uniques et bien formés (préfixe tds.)', () => {
    expect(byId.size).toBe(corpus.entries.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^tds\.[a-z0-9][a-z0-9.-]*$/)
      expect(e.text.length).toBeGreaterThan(0)
    }
  })

  it('chaque mot du lexique a son clip tds.mot.* avec le mot comme texte', () => {
    for (const w of WORDS) {
      const entry = byId.get(w.clipId)
      expect(entry, w.clipId).toBeDefined()
      expect(entry?.text).toBe(w.word)
    }
  })

  it('chaque syllabe de chaque mot a son clip tds.syl.* avec sa prononciation', () => {
    for (const w of WORDS) {
      for (const s of w.syllables) {
        const entry = byId.get(s.clipId)
        expect(entry, `${w.word} → ${s.g} (${s.clipId})`).toBeDefined()
        expect(entry?.text).toBe(s.say)
      }
    }
  })

  it('les consignes du jeu sont toutes présentes', () => {
    for (const e of GAME_ENTRIES) {
      expect(byId.get(e.id)?.text).toBe(e.text)
    }
  })

  it('pas d’entrée orpheline (tout vient des mots, syllabes ou consignes)', () => {
    const known = new Set<string>([
      ...GAME_ENTRIES.map((e) => e.id),
      ...WORDS.map((w) => w.clipId),
      ...SYLLABLES_BY_CLIP.map((s) => s.clipId),
    ])
    for (const e of corpus.entries) {
      expect(known.has(e.id), e.id).toBe(true)
    }
  })
})

// ------------------------------------------------------------
// Distracteurs
// ------------------------------------------------------------

describe('pickDistractors', () => {
  it('jamais égaux aux bonnes syllabes, ni en graphie ni en son (homophones)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const w = WORDS[i % WORDS.length]
      const distractors = pickDistractors(w.syllables, 3)
      const answerG = new Set(w.syllables.map((s) => s.g))
      const answerSound = new Set(w.syllables.map(soundKey))
      for (const d of distractors) {
        expect(answerG.has(d.g)).toBe(false)
        expect(answerSound.has(soundKey(d))).toBe(false)
      }
    }
  })

  it('distincts entre eux (graphie ET son) et au bon nombre', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const w = WORDS[i % WORDS.length]
      const distractors = pickDistractors(w.syllables, 3)
      expect(distractors.length).toBe(3)
      expect(new Set(distractors.map((d) => d.g)).size).toBe(3)
      expect(new Set(distractors.map(soundKey)).size).toBe(3)
    }
  })

  it('respecte les exclusions supplémentaires (syllabe retirée)', () => {
    const w = WORDS.find((x) => x.word === 'chapeau')
    if (!w) throw new Error('chapeau absent du lexique')
    const removed = w.syllables[0]
    for (let i = 0; i < 50; i++) {
      const distractors = pickDistractors([w.syllables[1]], 2, [removed])
      for (const d of distractors) {
        expect(d.g).not.toBe(removed.g)
        expect(soundKey(d)).not.toBe(soundKey(removed))
      }
    }
  })
})

// ------------------------------------------------------------
// Solvabilité : chaque item généré est résoluble
// ------------------------------------------------------------

/** Vérifie qu'on peut accrocher la réponse avec les wagons du pool (multiplicité). */
function isSolvable(answer: readonly Syllable[], pool: readonly Syllable[]): boolean {
  const available = new Map<string, number>()
  for (const s of pool) available.set(s.g, (available.get(s.g) ?? 0) + 1)
  for (const s of answer) {
    const n = available.get(s.g) ?? 0
    if (n === 0) return false
    available.set(s.g, n - 1)
  }
  return true
}

function checkBuildInvariants(answer: readonly Syllable[], pool: readonly Syllable[]): void {
  expect(isSolvable(answer, pool)).toBe(true)
  // Les wagons en trop (distracteurs) ne dupliquent jamais une bonne syllabe
  const answerG = new Set(answer.map((s) => s.g))
  const answerSound = new Set(answer.map(soundKey))
  const extras = [...pool]
  for (const s of answer) {
    const idx = extras.findIndex((p) => p.g === s.g)
    expect(idx).toBeGreaterThanOrEqual(0)
    extras.splice(idx, 1)
  }
  for (const d of extras) {
    expect(answerG.has(d.g)).toBe(false)
    expect(answerSound.has(soundKey(d))).toBe(false)
  }
}

describe('génération T0 (scander)', () => {
  it('niveau 0 : uniquement des mots de 2 syllabes', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const item = genScander(0, new Set())
      expect(item.word.syllables.length).toBe(2)
      expect(item.skillId).toBe(SKILL_SCANDER)
    }
  })

  it('niveau 1 : mots de 2 ou 3 syllabes, et les 3 syllabes finissent par sortir', () => {
    let saw3 = false
    for (let i = 0; i < ITERATIONS; i++) {
      const item = genScander(1, new Set())
      if (item.word.syllables.length === 3) saw3 = true
    }
    expect(saw3).toBe(true)
  })

  it('évite les mots déjà joués', () => {
    const used = new Set(
      WORDS.filter((w) => w.syllables.length === 2 && w.word !== 'chapeau').map((w) => w.word),
    )
    for (let i = 0; i < 30; i++) {
      expect(genScander(0, used).word.word).toBe('chapeau')
    }
  })
})

describe('génération T1 (fusion 2 syllabes)', () => {
  it('mot de 2 syllabes, pool de 3-4 wagons, résoluble, distracteurs honnêtes', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const level = i % 2
      const item = genFusion2(level, new Set())
      expect(item.word.syllables.length).toBe(2)
      expect(item.answer).toEqual(item.word.syllables)
      expect(item.pool.length).toBe(level <= 0 ? 3 : 4)
      expect(item.skillId).toBe(SKILL_FUSION)
      checkBuildInvariants(item.answer, item.pool)
    }
  })

  it('bonbon (syllabe doublée) : le pool contient bien DEUX wagons « bon »', () => {
    const used = new Set(WORDS.filter((w) => w.word !== 'bonbon').map((w) => w.word))
    for (let i = 0; i < 30; i++) {
      const item = genFusion2(1, used)
      expect(item.word.word).toBe('bonbon')
      expect(item.pool.filter((s) => s.g === 'bon').length).toBe(2)
      checkBuildInvariants(item.answer, item.pool)
    }
  })
})

describe('génération T2 (fusion 3 syllabes)', () => {
  it('mot de 3 syllabes, pool de 5-6 wagons, résoluble, skill décodage', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const level = i % 2
      const item = genFusion3(level, new Set())
      expect(item.word.syllables.length).toBe(3)
      expect(item.pool.length).toBe(level <= 0 ? 5 : 6)
      expect(item.skillId).toBe(SKILL_DECODAGE)
      checkBuildInvariants(item.answer, item.pool)
    }
  })
})

describe('génération T3a (pseudo-mots)', () => {
  it('2-3 syllabes, jamais un vrai mot du lexique, résoluble', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const item = genPseudo(new Set())
      expect(item.answer.length).toBeGreaterThanOrEqual(2)
      expect(item.answer.length).toBeLessThanOrEqual(3)
      expect(item.label).toBe(item.answer.map((s) => s.g).join(''))
      expect(LEXICON_KEYS.has(sanitize(item.label))).toBe(false)
      expect(item.skillId).toBe(SKILL_FUSION)
      expect(item.pool.length).toBe(item.answer.length + 2)
      checkBuildInvariants(item.answer, item.pool)
    }
  })

  it('ne rejoue pas un pseudo-mot déjà vu', () => {
    const used = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const item = genPseudo(used)
      expect(used.has(itemKey(item))).toBe(false)
      used.add(itemKey(item))
    }
  })
})

describe('génération T3b (suppression)', () => {
  it('retire la 1re ou la dernière syllabe, le pool contient le piège retiré', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const item = genSuppression(new Set())
      const n = item.word.syllables.length
      expect([0, n - 1]).toContain(item.removedIndex)
      expect(item.removed).toEqual(item.word.syllables[item.removedIndex])
      expect(item.answer.length).toBe(n - 1)
      expect(item.answer).toEqual(item.word.syllables.filter((_, j) => j !== item.removedIndex))
      // le piège (syllabe retirée) est bien proposé dans le pool
      expect(item.pool.some((s) => s.g === item.removed.g)).toBe(true)
      expect(item.skillId).toBe(SKILL_SUPPRESSION)
      expect(isSolvable(item.answer, item.pool)).toBe(true)
    }
  })

  it('jamais de mot à syllabes identiques (bonbon, bébé) — la suppression y est ambiguë', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const item = genSuppression(new Set())
      const gs = item.word.syllables.map((s) => s.g)
      expect(new Set(gs).size).toBe(gs.length)
    }
  })

  it('reconstruire le mot ENTIER (piège) est compté faux', () => {
    for (let i = 0; i < 50; i++) {
      const item = genSuppression(new Set())
      expect(validateBuild(item.answer, item.word.syllables)).toBe(false)
    }
  })
})

describe('genItem + t3Kinds', () => {
  it('route chaque palier vers le bon type d’item', () => {
    expect(genItem(0, 0, new Set()).kind).toBe('scander')
    expect(genItem(1, 0, new Set()).kind).toBe('fusion')
    expect(genItem(2, 0, new Set()).kind).toBe('fusion')
    expect(genItem(3, 0, new Set(), 'pseudo').kind).toBe('pseudo')
    expect(genItem(3, 0, new Set(), 'suppression').kind).toBe('suppression')
  })

  it('t3Kinds : 8 items, moitié pseudo / moitié suppression', () => {
    for (let i = 0; i < 50; i++) {
      const kinds = t3Kinds()
      expect(kinds.length).toBe(ITEMS_PER_RUN)
      expect(kinds.filter((k) => k === 'pseudo').length).toBe(4)
      expect(kinds.filter((k) => k === 'suppression').length).toBe(4)
    }
  })

  it('une partie complète ne rejoue jamais le même item', () => {
    for (const tier of [0, 1, 2, 3] as Tier[]) {
      const kinds = t3Kinds()
      const used = new Set<string>()
      for (let i = 0; i < ITEMS_PER_RUN; i++) {
        const item: Item = genItem(tier, 1, used, kinds[i])
        expect(used.has(itemKey(item))).toBe(false)
        used.add(itemKey(item))
      }
    }
  })
})

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

describe('validation', () => {
  const chapeau = WORDS.find((w) => w.word === 'chapeau')
  const chocolat = WORDS.find((w) => w.word === 'chocolat')
  if (!chapeau || !chocolat) throw new Error('mots témoins absents')

  it('validateScander : le bon nombre de frappes, ni plus ni moins', () => {
    expect(validateScander(chapeau, 2)).toBe(true)
    expect(validateScander(chapeau, 1)).toBe(false)
    expect(validateScander(chapeau, 3)).toBe(false)
    expect(validateScander(chapeau, 0)).toBe(false)
    expect(validateScander(chocolat, 3)).toBe(true)
    expect(validateScander(chocolat, 2)).toBe(false)
  })

  it('validateBuild : ordre exact requis', () => {
    const [cha, peau] = chapeau.syllables
    expect(validateBuild(chapeau.syllables, [cha, peau])).toBe(true)
    expect(validateBuild(chapeau.syllables, [peau, cha])).toBe(false)
    expect(validateBuild(chapeau.syllables, [cha])).toBe(false)
    expect(validateBuild(chapeau.syllables, [])).toBe(false)
    expect(validateBuild(chapeau.syllables, [cha, peau, cha])).toBe(false)
  })

  it('validateBuild : compare les graphies (deux wagons « bon » interchangeables)', () => {
    const bonbon = WORDS.find((w) => w.word === 'bonbon')
    if (!bonbon) throw new Error('bonbon absent')
    const [b1, b2] = bonbon.syllables
    expect(validateBuild(bonbon.syllables, [b2, b1])).toBe(true)
  })
})

// ------------------------------------------------------------
// Étoiles + sauvegarde des paliers
// ------------------------------------------------------------

describe('étoiles et progression', () => {
  it('starsFor : ≥90 % → 3, ≥70 % → 2, sinon 1 (sur 8 items)', () => {
    expect(starsFor(8, 8)).toBe(3)
    expect(starsFor(7, 8)).toBe(2) // 87,5 %
    expect(starsFor(6, 8)).toBe(2) // 75 %
    expect(starsFor(5, 8)).toBe(1) // 62,5 %
    expect(starsFor(0, 8)).toBe(1)
  })

  it('applyRunToSave : ≥2 étoiles débloque le palier suivant (plafonné à 3)', () => {
    let save = DEFAULT_SAVE
    save = applyRunToSave(save, 0, 2)
    expect(save.unlockedTier).toBe(1)
    expect(save.bestStars['0']).toBe(2)
    save = applyRunToSave(save, 1, 1) // 1 étoile : pas de déblocage
    expect(save.unlockedTier).toBe(1)
    save = applyRunToSave(save, 1, 3)
    expect(save.unlockedTier).toBe(2)
    save = applyRunToSave(save, 2, 3)
    save = applyRunToSave(save, 3, 3) // dernier palier : reste 3
    expect(save.unlockedTier).toBe(3)
    expect(save.runs).toBe(5)
  })

  it('applyRunToSave : ne dégrade jamais les meilleures étoiles', () => {
    let save = applyRunToSave(DEFAULT_SAVE, 0, 3)
    save = applyRunToSave(save, 0, 1)
    expect(save.bestStars['0']).toBe(3)
    expect(save.unlockedTier).toBe(1)
  })
})

// ------------------------------------------------------------
// Garde-fous données
// ------------------------------------------------------------

describe('candidats distracteurs', () => {
  it('une seule syllabe par graphie, et le wagon dit ce qu’il montre quand c’est possible', () => {
    const byG = new Map<string, Syllable>()
    for (const c of DISTRACTOR_CANDIDATES) {
      expect(byG.has(c.g)).toBe(false)
      byG.set(c.g, c)
    }
    // « lon » existe en deux sons (ballon /lon/, papillon /yon/) :
    // le candidat retenu doit être la variante canonique say === g.
    expect(byG.get('lon')?.say).toBe('lon')
  })
})
