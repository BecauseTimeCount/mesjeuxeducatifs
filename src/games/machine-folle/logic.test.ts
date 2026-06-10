import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  allCombos,
  applyRun,
  ARTICLES,
  articleAgrees,
  buildGnFrame,
  buildSvFrame,
  closestFix,
  comboClipIds,
  comboOptions,
  distanceToValid,
  FRESH_PROGRESS,
  generateItem,
  GN_NOUNS,
  isValid,
  ITEMS_PER_RUN,
  MAX_TUNER_LEVEL,
  rotated,
  sentenceText,
  starsFor,
  SV_SUBJECTS,
  SV_VERBS,
  T0_FRAMES,
  T1_FRAMES,
  TIER_COUNT,
  TIER_SKILLS,
} from './logic'
import type { Gender, MfoFrame, MfoItem, MfoProgress, TierId } from './logic'

const DRAWS = 200
const ALL_TIERS: readonly TierId[] = [0, 1, 2, 3]
const ALL_LEVELS: readonly number[] = [0, MAX_TUNER_LEVEL]

const CORPUS_IDS = new Set(corpus.entries.map((e) => e.id))

function draws(tier: TierId, level: number, n = DRAWS): MfoItem[] {
  return Array.from({ length: n }, () => generateItem(tier, level))
}

/** Toutes les frames possibles de T2 (chaque nom × chaque distracteur × 1..3). */
function allGnFrames(): MfoFrame[] {
  const out: MfoFrame[] = []
  for (const noun of GN_NOUNS) {
    for (const distractor of GN_NOUNS) {
      if (distractor.id === noun.id) continue
      for (const count of [1, 2, 3]) out.push(buildGnFrame(noun, distractor, count))
    }
  }
  return out
}

/** Toutes les frames possibles de T3. */
function allSvFrames(): MfoFrame[] {
  const out: MfoFrame[] = []
  for (const animal of SV_SUBJECTS) {
    for (const distractor of SV_SUBJECTS) {
      if (distractor.id === animal.id) continue
      for (const verb of SV_VERBS) {
        for (const count of [1, 2, 3]) out.push(buildSvFrame(animal, distractor, verb, count))
      }
    }
  }
  return out
}

/** closestFix doit désigner un rouleau UTILE : le tourner peut réduire la distance. */
function fixIsUseful(frame: MfoFrame, combo: readonly number[]): boolean {
  const fix = closestFix(frame, combo)
  if (fix === null) return false
  const d = distanceToValid(frame, combo)
  for (let v = 0; v < frame.rollers[fix].length; v++) {
    const alt = combo.map((x, i) => (i === fix ? v : x))
    if (distanceToValid(frame, alt) === d - 1) return true
  }
  return false
}

// ------------------------------------------------------------
// Données statiques T0 / T1
// ------------------------------------------------------------

describe('frames statiques T0/T1 — intégrité des données', () => {
  it('au moins 6 frames par palier, 2 rouleaux en T0 et 3 en T1', () => {
    expect(T0_FRAMES.length).toBeGreaterThanOrEqual(6)
    expect(T1_FRAMES.length).toBeGreaterThanOrEqual(6)
    for (const f of T0_FRAMES) expect(f.rollers).toHaveLength(2)
    for (const f of T1_FRAMES) expect(f.rollers).toHaveLength(3)
  })

  it('combinaisons valides : non vides, dans les bornes, uniques, et jamais exhaustives', () => {
    for (const f of [...T0_FRAMES, ...T1_FRAMES]) {
      expect(f.valid.length).toBeGreaterThan(0)
      const seen = new Set<string>()
      for (const v of f.valid) {
        expect(v).toHaveLength(f.rollers.length)
        v.forEach((idx, r) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(f.rollers[r].length)
        })
        const key = v.join(',')
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
      // Il reste TOUJOURS des combinaisons absurdes (sinon pas de jeu).
      const total = f.rollers.reduce((n, opts) => n * opts.length, 1)
      expect(f.valid.length).toBeLessThan(total)
    }
  })

  it('chaque rouleau propose au moins 3 options, toutes avec texte et clip mfo.w.*', () => {
    for (const f of [...T0_FRAMES, ...T1_FRAMES]) {
      for (const opts of f.rollers) {
        expect(opts.length).toBeGreaterThanOrEqual(3)
        for (const o of opts) {
          expect(o.text.length).toBeGreaterThan(0)
          expect(o.clipId.startsWith('mfo.w.')).toBe(true)
        }
      }
    }
  })

  it('ids de frames uniques', () => {
    const ids = [...T0_FRAMES, ...T1_FRAMES].map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('les croisements plausibles sont acceptés (jamais « ça n’existe pas » à tort)', () => {
    const heros = T0_FRAMES.find((f) => f.id === 't0-heros')
    expect(heros).toBeDefined()
    // « La sorcière cherche un trésor » est une phrase qui existe.
    if (heros) expect(isValid(heros, [1, 0])).toBe(true)
    const gourmands = T1_FRAMES.find((f) => f.id === 't1-gourmands')
    expect(gourmands).toBeDefined()
    // « Le singe cache une banane » est une phrase qui existe.
    if (gourmands) expect(isValid(gourmands, [1, 2, 0])).toBe(true)
  })
})

// ------------------------------------------------------------
// Générateur — invariants sur tous paliers × niveaux × 200 tirages
// ------------------------------------------------------------

describe('generateItem — invariants communs', () => {
  it('démarre TOUJOURS sur une combinaison invalide, et une solution est atteignable', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level)) {
          const { frame, start } = item
          expect(start).toHaveLength(frame.rollers.length)
          start.forEach((idx, r) => {
            expect(idx).toBeGreaterThanOrEqual(0)
            expect(idx).toBeLessThan(frame.rollers[r].length)
          })
          // Jamais valide au départ.
          expect(isValid(frame, start)).toBe(false)
          // Une combinaison valide existe et est bien valide (atteignable en tournant).
          expect(frame.valid.length).toBeGreaterThan(0)
          expect(isValid(frame, frame.valid[0])).toBe(true)
        }
      }
    }
  })

  it('niveau 0 : un SEUL rouleau à corriger (distance 1)', () => {
    for (const tier of ALL_TIERS) {
      for (const item of draws(tier, 0)) {
        expect(distanceToValid(item.frame, item.start)).toBe(1)
      }
    }
  })

  it('niveau max : deux rouleaux à corriger quand la frame le permet', () => {
    for (const tier of ALL_TIERS) {
      for (const item of draws(tier, MAX_TUNER_LEVEL)) {
        const d = distanceToValid(item.frame, item.start)
        const hasD2 = allCombos(item.frame).some(
          (c) => !isValid(item.frame, c) && distanceToValid(item.frame, c) === 2,
        )
        expect(d).toBe(hasD2 ? 2 : 1)
      }
    }
  })

  it('closestFix désigne toujours un rouleau utile sur l’item généré', () => {
    for (const tier of ALL_TIERS) {
      for (const level of ALL_LEVELS) {
        for (const item of draws(tier, level, 100)) {
          expect(fixIsUseful(item.frame, item.start)).toBe(true)
        }
      }
    }
  })

  it('le niveau hors bornes est ramené dans [0, MAX_TUNER_LEVEL]', () => {
    for (const tier of ALL_TIERS) {
      const low = generateItem(tier, -3)
      expect(distanceToValid(low.frame, low.start)).toBeGreaterThanOrEqual(1)
      const item = generateItem(tier, 99)
      expect(isValid(item.frame, item.start)).toBe(false)
    }
  })
})

describe('generateItem — variété (avoid) et permutation des rouleaux', () => {
  it('T0/T1 : la frame évitée ne ressort jamais', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateItem(0, 0, 't0-animaux').frame.id).not.toBe('t0-animaux')
      expect(generateItem(1, 0, 't1-maison').frame.id).not.toBe('t1-maison')
    }
  })

  it('T2 : le nom évité ne ressort jamais — T3 : la paire animal+verbe évitée non plus', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateItem(2, 0, 'gn-chaussette').frame.id).not.toBe('gn-chaussette')
      expect(generateItem(3, 0, 'sv-chat-dormir').frame.id).not.toBe('sv-chat-dormir')
    }
  })

  it('avoid inconnu : la génération reste valide', () => {
    for (let i = 0; i < 50; i++) {
      const item = generateItem(0, 0, 'frame-inexistante')
      expect(isValid(item.frame, item.start)).toBe(false)
    }
  })

  it('T0/T1 : la permutation préserve exactement les phrases valides de la frame d’origine', () => {
    const originals = new Map([...T0_FRAMES, ...T1_FRAMES].map((f) => [f.id, f]))
    for (const tier of [0, 1] as const) {
      for (const item of draws(tier, 0, 100)) {
        const original = originals.get(item.frame.id)
        expect(original).toBeDefined()
        if (!original) continue
        const originalSentences = new Set(original.valid.map((v) => sentenceText(original, v)))
        expect(item.frame.valid.length).toBe(original.valid.length)
        for (const v of item.frame.valid) {
          expect(originalSentences.has(sentenceText(item.frame, v))).toBe(true)
        }
        // Mêmes options, juste réordonnées.
        item.frame.rollers.forEach((opts, r) => {
          const texts = opts.map((o) => o.text).sort()
          const originalTexts = [...original.rollers[r]].map((o) => o.text).sort()
          expect(texts).toEqual(originalTexts)
        })
      }
    }
  })
})

// ------------------------------------------------------------
// closestFix — exhaustif sur toutes les combinaisons
// ------------------------------------------------------------

describe('closestFix — le rouleau en conflit', () => {
  it('null sur une combinaison valide', () => {
    for (const f of [...T0_FRAMES, ...T1_FRAMES]) {
      for (const v of f.valid) expect(closestFix(f, v)).toBeNull()
    }
    const gn = buildGnFrame(GN_NOUNS[0], GN_NOUNS[1], 2)
    expect(closestFix(gn, gn.valid[0])).toBeNull()
  })

  it('exhaustif T0/T1 : toujours un rouleau utile sur chaque combinaison invalide', () => {
    for (const f of [...T0_FRAMES, ...T1_FRAMES]) {
      for (const combo of allCombos(f)) {
        if (isValid(f, combo)) continue
        expect(fixIsUseful(f, combo)).toBe(true)
      }
    }
  })

  it('exhaustif T2/T3 : toujours un rouleau utile sur chaque combinaison invalide', () => {
    for (const f of [...allGnFrames(), ...allSvFrames()]) {
      for (const combo of allCombos(f)) {
        if (isValid(f, combo)) continue
        expect(fixIsUseful(f, combo)).toBe(true)
      }
    }
  })
})

// ------------------------------------------------------------
// T2 — matrice d'accord du groupe nominal
// ------------------------------------------------------------

describe('palier T2 — accord article-nom (exhaustif)', () => {
  it('articleAgrees : table complète genre × nombre', () => {
    const byText = new Map(ARTICLES.map((a) => [a.text, a]))
    const expected: ReadonlyArray<[string, Gender, boolean, boolean]> = [
      ['le', 'm', false, true], ['le', 'f', false, false], ['le', 'm', true, false], ['le', 'f', true, false],
      ['la', 'f', false, true], ['la', 'm', false, false], ['la', 'f', true, false], ['la', 'm', true, false],
      ['un', 'm', false, true], ['un', 'f', false, false], ['un', 'm', true, false], ['un', 'f', true, false],
      ['une', 'f', false, true], ['une', 'm', false, false], ['une', 'f', true, false], ['une', 'm', true, false],
      ['les', 'm', true, true], ['les', 'f', true, true], ['les', 'm', false, false], ['les', 'f', false, false],
      ['des', 'm', true, true], ['des', 'f', true, true], ['des', 'm', false, false], ['des', 'f', false, false],
    ]
    for (const [text, gender, plural, ok] of expected) {
      const article = byText.get(text)
      expect(article).toBeDefined()
      if (article) expect(articleAgrees(article, gender, plural)).toBe(ok)
    }
  })

  it('chaque frame GN a exactement 2 étiquettes valides (le/un, la/une ou les/des)', () => {
    for (const f of allGnFrames()) {
      expect(f.valid).toHaveLength(2)
    }
  })

  it('exhaustif : une étiquette est valide SSI bon nom, bon nombre et bon accord', () => {
    for (const noun of GN_NOUNS) {
      for (const distractor of GN_NOUNS) {
        if (distractor.id === noun.id) continue
        for (const count of [1, 2, 3]) {
          const frame = buildGnFrame(noun, distractor, count)
          const plural = count >= 2
          const wantedText = plural ? noun.plural : noun.singular
          for (const combo of allCombos(frame)) {
            const article = ARTICLES[combo[0]]
            const form = frame.rollers[1][combo[1]]
            const shouldBeValid =
              form.text === wantedText &&
              form.emoji === noun.emoji &&
              articleAgrees(article, noun.gender, plural)
            expect(isValid(frame, combo)).toBe(shouldBeValid)
          }
        }
      }
    }
  })

  it('le rouleau des noms contient les 2 formes du nom de la caisse et du distracteur', () => {
    const frame = buildGnFrame(GN_NOUNS[0], GN_NOUNS[3], 3)
    const texts = frame.rollers[1].map((o) => o.text).sort()
    expect(texts).toEqual(
      [GN_NOUNS[0].singular, GN_NOUNS[0].plural, GN_NOUNS[3].singular, GN_NOUNS[3].plural].sort(),
    )
  })

  it('la scène dit la vérité : caisse avec le bon emoji et le bon compte', () => {
    for (const count of [1, 2, 3]) {
      const frame = buildGnFrame(GN_NOUNS[2], GN_NOUNS[5], count)
      expect(frame.scene).toEqual({ kind: 'caisse', emoji: GN_NOUNS[2].emoji, count })
    }
  })

  it('pluriels irréguliers : chapeaux en -x, mis en évidence', () => {
    const chapeau = GN_NOUNS.find((n) => n.id === 'chapeau')
    expect(chapeau?.plural).toBe('chapeaux')
    expect(chapeau?.pluralHi).toBe('x')
    // Toutes les formes plurielles affichent leur terminaison.
    for (const n of GN_NOUNS) {
      expect(n.plural.endsWith(n.pluralHi)).toBe(true)
      expect(n.plural).not.toBe(n.singular)
    }
  })
})

// ------------------------------------------------------------
// T3 — matrice d'accord sujet-verbe
// ------------------------------------------------------------

describe('palier T3 — accord sujet-verbe (exhaustif)', () => {
  it('tous les verbes s’entendent différemment au singulier et au pluriel', () => {
    const pairs = new Set(SV_VERBS.map((v) => `${v.singular}/${v.plural}`))
    for (const expected of [
      'est/sont', 'va/vont', 'fait/font', 'a/ont', 'lit/lisent',
      'dort/dorment', 'boit/boivent', 'dit/disent', 'écrit/écrivent',
    ]) {
      expect(pairs.has(expected)).toBe(true)
    }
    for (const v of SV_VERBS) {
      expect(v.singular).not.toBe(v.plural)
      expect(v.plural.endsWith(v.hiPlur)).toBe(true)
    }
  })

  it('exactement UNE combinaison valide par frame SV', () => {
    for (const f of allSvFrames()) expect(f.valid).toHaveLength(1)
  })

  it('exhaustif : valide SSI bon animal, bon nombre, et verbe accordé', () => {
    for (const animal of SV_SUBJECTS) {
      for (const distractor of SV_SUBJECTS) {
        if (distractor.id === animal.id) continue
        for (const verb of SV_VERBS) {
          for (const count of [1, 2, 3]) {
            const frame = buildSvFrame(animal, distractor, verb, count)
            const plural = count >= 2
            const wantedSubject = plural ? animal.plural : animal.singular
            const wantedVerb = plural ? verb.plural : verb.singular
            for (const combo of allCombos(frame)) {
              const subject = frame.rollers[0][combo[0]]
              const verbForm = frame.rollers[1][combo[1]]
              const shouldBeValid =
                subject.text === wantedSubject && verbForm.text === wantedVerb
              expect(isValid(frame, combo)).toBe(shouldBeValid)
            }
          }
        }
      }
    }
  })

  it('le complément fixe et la scène suivent le verbe', () => {
    const frame = buildSvFrame(SV_SUBJECTS[0], SV_SUBJECTS[1], SV_VERBS[5], 3)
    expect(frame.tail?.text).toBe(SV_VERBS[5].tailText)
    expect(frame.tail?.clipId).toBe(SV_VERBS[5].tailClip)
    expect(frame.scene).toEqual({
      kind: 'animaux',
      emoji: SV_SUBJECTS[0].emoji,
      count: 3,
      action: SV_VERBS[5].actionEmoji,
    })
  })

  it('le rouleau sujet propose les 2 nombres des 2 animaux (4 options)', () => {
    const frame = buildSvFrame(SV_SUBJECTS[2], SV_SUBJECTS[4], SV_VERBS[0], 1)
    const texts = frame.rollers[0].map((o) => o.text).sort()
    expect(texts).toEqual(
      [SV_SUBJECTS[2].singular, SV_SUBJECTS[2].plural, SV_SUBJECTS[4].singular, SV_SUBJECTS[4].plural].sort(),
    )
    expect(frame.rollers[1]).toHaveLength(2)
  })
})

// ------------------------------------------------------------
// Corpus — aucun clip manquant
// ------------------------------------------------------------

describe('corpus — chaque option référence une entrée existante', () => {
  it('ids corpus : uniques, préfixés mfo., format autorisé', () => {
    expect(CORPUS_IDS.size).toBe(corpus.entries.length)
    for (const e of corpus.entries) {
      expect(e.id.startsWith('mfo.')).toBe(true)
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.text.length).toBeGreaterThan(0)
    }
  })

  it('toutes les options de toutes les frames possibles ont leur clip', () => {
    const frames = [...T0_FRAMES, ...T1_FRAMES, ...allGnFrames(), ...allSvFrames()]
    for (const f of frames) {
      for (const opts of f.rollers) {
        for (const o of opts) expect(CORPUS_IDS.has(o.clipId), `clip manquant : ${o.clipId}`).toBe(true)
      }
      if (f.tail) expect(CORPUS_IDS.has(f.tail.clipId), `clip manquant : ${f.tail.clipId}`).toBe(true)
    }
  })

  it('les clips d’interface utilisés par le jeu existent', () => {
    const uiIds = [
      'mfo.intro',
      'mfo.consigne.tourne',
      'mfo.consigne.caisse',
      'mfo.consigne.scene',
      'mfo.lit',
      'mfo.gag.0',
      'mfo.gag.1',
      'mfo.gag.2',
      'mfo.gag.3',
      'mfo.regarde',
      'mfo.indice',
      'mfo.livre',
      'mfo.niveau.0',
      'mfo.niveau.1',
      'mfo.niveau.2',
      'mfo.niveau.3',
    ]
    for (const id of uiIds) expect(CORPUS_IDS.has(id), `clip manquant : ${id}`).toBe(true)
  })
})

// ------------------------------------------------------------
// Petits helpers : rotation, lecture, phrase
// ------------------------------------------------------------

describe('rotated / comboClipIds / sentenceText', () => {
  const frame = T0_FRAMES[0]

  it('rotated avance d’un cran et boucle, sans muter l’original', () => {
    const combo = [0, 2]
    expect(rotated(frame, combo, 0)).toEqual([1, 2])
    expect(rotated(frame, combo, 1)).toEqual([0, 0]) // 3 options → retour à 0
    expect(combo).toEqual([0, 2])
  })

  it('comboClipIds : les rouleaux dans l’ordre, puis le complément fixe', () => {
    expect(comboClipIds(frame, [0, 0])).toEqual(['mfo.w.le-chat', 'mfo.w.miaule'])
    const sv = buildSvFrame(SV_SUBJECTS[0], SV_SUBJECTS[1], SV_VERBS[5], 1)
    const ids = comboClipIds(sv, sv.valid[0])
    expect(ids).toHaveLength(3)
    expect(ids[2]).toBe(SV_VERBS[5].tailClip)
  })

  it('sentenceText assemble la phrase complète', () => {
    expect(sentenceText(frame, [0, 0])).toBe('Le chat miaule')
    const sv = buildSvFrame(SV_SUBJECTS[0], SV_SUBJECTS[1], SV_VERBS[5], 3)
    expect(sentenceText(sv, sv.valid[0])).toBe('Les chats dorment dans le panier')
  })

  it('comboOptions retourne l’option affichée par chaque rouleau', () => {
    const opts = comboOptions(frame, [1, 2])
    expect(opts).toHaveLength(2)
    expect(opts[0].text).toBe(frame.rollers[0][1].text)
    expect(opts[1].text).toBe(frame.rollers[1][2].text)
  })
})

// ------------------------------------------------------------
// Score honnête + progression
// ------------------------------------------------------------

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, ITEMS_PER_RUN)).toBe(3)
    expect(starsFor(7, ITEMS_PER_RUN)).toBe(2) // 87,5 %
    expect(starsFor(6, ITEMS_PER_RUN)).toBe(2) // 75 %
    expect(starsFor(5, ITEMS_PER_RUN)).toBe(1) // 62,5 %
    expect(starsFor(0, ITEMS_PER_RUN)).toBe(1)
  })

  it('bornes exactes : 9/10 → 3 et 7/10 → 2', () => {
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(7, 10)).toBe(2)
  })
})

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 2).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 3).unlockedTier).toBe(1)
    expect(applyRun({ ...FRESH_PROGRESS }, 0, 1).unlockedTier).toBe(0)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: MfoProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 0, 3)
    p = applyRun(p, 0, 1)
    expect(p.bestStars[0]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('le dernier palier ne débloque rien au-delà de T3', () => {
    const p = applyRun({ bestStars: {}, unlockedTier: 3, runs: 0 }, 3, 3)
    expect(p.unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('un palier déjà débloqué ne se reverrouille jamais', () => {
    const p = applyRun({ bestStars: { 0: 3 }, unlockedTier: 2, runs: 5 }, 0, 1)
    expect(p.unlockedTier).toBe(2)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: MfoProgress = { bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 }
    applyRun(before, 0, 3)
    expect(before).toEqual({ bestStars: { 0: 1 }, unlockedTier: 0, runs: 1 })
  })
})

// ------------------------------------------------------------
// Cohérence skills / manifest
// ------------------------------------------------------------

describe('cohérence avec le skill-map et le manifest', () => {
  it('chaque skill de TIER_SKILLS existe dans le SKILL_MAP', () => {
    for (const id of TIER_SKILLS) expect(SKILLS_BY_ID.has(id), `skill inconnu : ${id}`).toBe(true)
  })

  it('TIER_SKILLS couvre un palier par compétence (sens ×2, GN, SV)', () => {
    expect(TIER_SKILLS).toEqual([
      'fr.cp.phrase.sens',
      'fr.cp.phrase.sens',
      'fr.cp.phrase.accord-gn',
      'fr.cp.phrase.accord-sv',
    ])
  })

  it('si le jeu est câblé dans le manifest, les skills correspondent', () => {
    const meta = GAMES_BY_ID.get('machine-folle')
    if (meta) expect(meta.skills).toEqual([...new Set(TIER_SKILLS)])
  })
})
