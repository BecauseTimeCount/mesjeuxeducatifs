import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  ACTIONS,
  ANIMALS,
  actionClip,
  applyRun,
  chainLengthFor,
  COLOURS,
  CONFUSABLE,
  DONT_MOVE,
  expectedTaps,
  FRESH_PROGRESS,
  generateSimonChain,
  generateSimonRound,
  generateTapRound,
  isThemeExplored,
  ITEMS_PER_RUN,
  layoutSlots,
  lockReason,
  MAX_CHAIN,
  MAX_SLOTS,
  MAX_TAP_LEVEL,
  MIN_CHAIN,
  NUMBERS,
  optionCountFor,
  recordListen,
  SIMON_PROB,
  starsFor,
  stepOutcome,
  themeWords,
  TIER_COUNT,
  TIER_SKILLS,
  TIER_THEMES,
  tierPlayable,
  wordClip,
} from './logic'
import type { EngProgress, ThemeId, TierId } from './logic'

const DRAWS = 200
const TAP_TIERS: readonly (1 | 2 | 3)[] = [1, 2, 3]
const THEMES: readonly ThemeId[] = ['colours', 'numbers', 'animals']

/** rng déterministe pour les tests probabilistes. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

// ------------------------------------------------------------
// Lexique
// ------------------------------------------------------------

describe('lexique fixe — l’imagier est complet et sans doublon', () => {
  it('8 couleurs, 10 nombres (1..10), 10 animaux, 6 actions', () => {
    expect(COLOURS).toHaveLength(8)
    expect(NUMBERS).toHaveLength(10)
    expect(NUMBERS.map((n) => n.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(ANIMALS).toHaveLength(10)
    expect(ACTIONS).toHaveLength(6)
  })

  it('ids uniques au sein de chaque thème, mot et emoji non vides', () => {
    for (const theme of THEMES) {
      const words = themeWords(theme)
      expect(new Set(words.map((w) => w.id)).size).toBe(words.length)
      for (const w of words) {
        expect(w.word.length).toBeGreaterThan(0)
        expect(w.emoji.length).toBeGreaterThan(0)
      }
    }
  })

  it('wordClip / actionClip pointent vers le bon préfixe eng.', () => {
    expect(wordClip('colours', 'blue')).toBe('eng.mot.blue')
    expect(wordClip('numbers', '7')).toBe('eng.num.7')
    expect(wordClip('animals', 'monkey')).toBe('eng.mot.monkey')
    expect(actionClip('jump')).toBe('eng.mot.jump')
    expect(actionClip(DONT_MOVE.id)).toBe('eng.dontmove')
  })

  it('CONFUSABLE est symétrique et ne référence que des couleurs connues', () => {
    const ids = new Set(COLOURS.map((c) => c.id))
    for (const [a, near] of Object.entries(CONFUSABLE)) {
      expect(ids.has(a)).toBe(true)
      for (const b of near) {
        expect(ids.has(b)).toBe(true)
        expect(CONFUSABLE[b]).toContain(a)
      }
    }
  })
})

// ------------------------------------------------------------
// Rounds tap (ballons & animaux)
// ------------------------------------------------------------

describe('generateTapRound — invariants (tous paliers × 200 tirages)', () => {
  it('cible dans les options, options uniques, toutes du thème du palier', () => {
    for (const tier of TAP_TIERS) {
      const theme = TIER_THEMES[tier] as ThemeId
      const poolIds = new Set(themeWords(theme).map((w) => w.id))
      for (let i = 0; i < DRAWS; i++) {
        const r = generateTapRound(tier, 1)
        expect(r.kind).toBe('tap')
        expect(r.tier).toBe(tier)
        expect(r.theme).toBe(theme)
        expect(r.optionIds).toContain(r.targetId)
        expect(new Set(r.optionIds).size).toBe(r.optionIds.length)
        for (const id of r.optionIds) expect(poolIds.has(id)).toBe(true)
      }
    }
  })

  it('le nombre d’options suit le Tuner : 4, 5 puis 6', () => {
    expect(optionCountFor(0)).toBe(4)
    expect(optionCountFor(1)).toBe(5)
    expect(optionCountFor(MAX_TAP_LEVEL)).toBe(6)
    expect(optionCountFor(-2)).toBe(4)
    expect(optionCountFor(99)).toBe(6)
    for (const tier of TAP_TIERS) {
      for (const level of [0, 1, 2]) {
        for (let i = 0; i < 50; i++) {
          expect(generateTapRound(tier, level).optionIds).toHaveLength(4 + level)
        }
      }
    }
  })

  it('couleurs : AUCUN distracteur confusable avec la cible, même à 6 options', () => {
    for (let i = 0; i < DRAWS; i++) {
      const r = generateTapRound(1, MAX_TAP_LEVEL)
      const banned = CONFUSABLE[r.targetId] ?? []
      for (const id of r.optionIds) {
        if (id !== r.targetId) expect(banned).not.toContain(id)
      }
    }
  })

  it('le nombre de slots à l’écran ne dépasse jamais MAX_SLOTS', () => {
    expect(optionCountFor(MAX_TAP_LEVEL)).toBeLessThanOrEqual(MAX_SLOTS)
  })

  it('une partie de 8 items ne répète jamais une cible (tous paliers × 50 parties)', () => {
    for (const tier of TAP_TIERS) {
      for (let run = 0; run < 50; run++) {
        const used: string[] = []
        for (let i = 0; i < ITEMS_PER_RUN; i++) {
          const r = generateTapRound(tier, 2, used)
          expect(used).not.toContain(r.targetId)
          used.push(r.targetId)
        }
        expect(new Set(used).size).toBe(ITEMS_PER_RUN)
      }
    }
  })

  it('chaque pool suffit à 8 items sans répétition', () => {
    for (const tier of TAP_TIERS) {
      const theme = TIER_THEMES[tier] as ThemeId
      expect(themeWords(theme).length).toBeGreaterThanOrEqual(ITEMS_PER_RUN)
    }
  })

  it('avoid couvrant tout le pool : retombe sur le pool complet, jamais bloqué', () => {
    const all = COLOURS.map((c) => c.id)
    for (let i = 0; i < 50; i++) {
      const r = generateTapRound(1, 0, all)
      expect(all).toContain(r.targetId)
    }
  })

  it('tout le pool sauf une valeur force cette valeur', () => {
    const avoid = ANIMALS.map((a) => a.id).filter((id) => id !== 'duck')
    for (let i = 0; i < 50; i++) {
      expect(generateTapRound(3, 0, avoid).targetId).toBe('duck')
    }
  })
})

// ------------------------------------------------------------
// Placement procédural
// ------------------------------------------------------------

describe('layoutSlots — positions procédurales sûres', () => {
  it('autant de slots que demandé, dans les bornes du conteneur', () => {
    for (const count of [4, 5, 6]) {
      for (let i = 0; i < 100; i++) {
        const slots = layoutSlots(count)
        expect(slots).toHaveLength(count)
        for (const s of slots) {
          expect(s.left).toBeGreaterThanOrEqual(0)
          expect(s.left).toBeLessThanOrEqual(82)
          expect(s.top).toBeGreaterThanOrEqual(-3)
          expect(s.top).toBeLessThanOrEqual(70)
          expect(s.delay).toBeGreaterThanOrEqual(0)
          expect(s.dur).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  it('count dégénéré : clampé à [0, MAX_SLOTS]', () => {
    expect(layoutSlots(-2)).toHaveLength(0)
    expect(layoutSlots(99)).toHaveLength(MAX_SLOTS)
  })

  it('les slots d’un tirage ne se chevauchent pas (ancres distinctes)', () => {
    for (let i = 0; i < 100; i++) {
      const slots = layoutSlots(6)
      for (let a = 0; a < slots.length; a++) {
        for (let b = a + 1; b < slots.length; b++) {
          const apart =
            Math.abs(slots[a].left - slots[b].left) >= 10 ||
            Math.abs(slots[a].top - slots[b].top) >= 14
          expect(apart).toBe(true)
        }
      }
    }
  })
})

// ------------------------------------------------------------
// Simon Says
// ------------------------------------------------------------

describe('generateSimonChain — chaînes aléatoires', () => {
  it('longueur demandée, actions connues et JAMAIS répétées dans la chaîne', () => {
    const known = new Set(ACTIONS.map((a) => a.id))
    for (let len = MIN_CHAIN; len <= MAX_CHAIN; len++) {
      for (let i = 0; i < DRAWS; i++) {
        const chain = generateSimonChain(len)
        expect(chain.actions).toHaveLength(len)
        expect(new Set(chain.actions).size).toBe(len)
        for (const id of chain.actions) expect(known.has(id)).toBe(true)
      }
    }
  })

  it('longueur clampée à [1, 6] (jamais plus que d’actions disponibles)', () => {
    expect(generateSimonChain(0).actions).toHaveLength(1)
    expect(generateSimonChain(99).actions).toHaveLength(ACTIONS.length)
  })

  it('« Simon says » sort à ~70 % (rng déterministe, 2000 tirages)', () => {
    const rng = seededRng(42)
    let says = 0
    const n = 2000
    for (let i = 0; i < n; i++) {
      if (generateSimonChain(2, rng).simonSays) says++
    }
    expect(says / n).toBeGreaterThan(SIMON_PROB - 0.05)
    expect(says / n).toBeLessThan(SIMON_PROB + 0.05)
  })

  it('chainLengthFor suit le Tuner, borné à 1..4', () => {
    expect(chainLengthFor(1)).toBe(1)
    expect(chainLengthFor(3)).toBe(3)
    expect(chainLengthFor(0)).toBe(MIN_CHAIN)
    expect(chainLengthFor(99)).toBe(MAX_CHAIN)
  })
})

describe('expectedTaps — le twist du vrai Jacques a dit', () => {
  it('avec Simon says : taper toute la chaîne dans l’ordre', () => {
    const chain = { actions: ['jump', 'clap', 'sleep'], simonSays: true }
    expect(expectedTaps(chain)).toEqual(['jump', 'clap', 'sleep'])
  })

  it('sans Simon says : il faut taper UNIQUEMENT « Don’t move! »', () => {
    const chain = { actions: ['jump', 'clap'], simonSays: false }
    expect(expectedTaps(chain)).toEqual([DONT_MOVE.id])
  })

  it('ne mute jamais la chaîne d’origine', () => {
    const chain = { actions: ['jump'], simonSays: true }
    const taps = expectedTaps(chain)
    taps.push('clap')
    expect(chain.actions).toEqual(['jump'])
  })

  it('generateSimonRound câble chain → expected', () => {
    for (let i = 0; i < DRAWS; i++) {
      const r = generateSimonRound(3)
      expect(r.kind).toBe('simon')
      expect(r.expected).toEqual(expectedTaps(r.chain))
    }
  })
})

describe('stepOutcome — validateur de séquence (production, zéro QCM)', () => {
  const expected = ['jump', 'clap', 'dance']

  it('chaque bon tap progresse, le dernier complète', () => {
    expect(stepOutcome(expected, 0, 'jump')).toBe('progress')
    expect(stepOutcome(expected, 1, 'clap')).toBe('progress')
    expect(stepOutcome(expected, 2, 'dance')).toBe('complete')
  })

  it('un tap hors ordre est une erreur, même si l’action est dans la chaîne', () => {
    expect(stepOutcome(expected, 0, 'clap')).toBe('wrong')
    expect(stepOutcome(expected, 1, 'dance')).toBe('wrong')
  })

  it('le piège : taper une action quand il fallait Don’t move', () => {
    expect(stepOutcome([DONT_MOVE.id], 0, 'jump')).toBe('wrong')
    expect(stepOutcome([DONT_MOVE.id], 0, DONT_MOVE.id)).toBe('complete')
  })

  it('index hors bornes : toujours une erreur, jamais un crash', () => {
    expect(stepOutcome(expected, -1, 'jump')).toBe('wrong')
    expect(stepOutcome(expected, 3, 'jump')).toBe('wrong')
    expect(stepOutcome([], 0, 'jump')).toBe('wrong')
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
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(7, 10)).toBe(2)
  })
})

describe('recordListen — l’imagier débloque les quiz', () => {
  it('écouter tous les mots d’un thème le marque exploré', () => {
    let p: EngProgress = { ...FRESH_PROGRESS }
    for (const c of COLOURS) {
      expect(isThemeExplored(p, 'colours')).toBe(false)
      p = recordListen(p, 'colours', c.id)
    }
    expect(isThemeExplored(p, 'colours')).toBe(true)
    expect(isThemeExplored(p, 'numbers')).toBe(false)
  })

  it('réécouter un mot ne compte qu’une fois, mot inconnu ignoré', () => {
    let p: EngProgress = { ...FRESH_PROGRESS }
    p = recordListen(p, 'colours', 'red')
    p = recordListen(p, 'colours', 'red')
    expect(p.listened.colours).toEqual(['red'])
    expect(recordListen(p, 'colours', 'licorne')).toBe(p)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: EngProgress = { ...FRESH_PROGRESS, listened: { colours: ['red'] } }
    recordListen(before, 'colours', 'blue')
    expect(before.listened.colours).toEqual(['red'])
  })
})

describe('lockReason / tierPlayable — imagier obligatoire avant quiz', () => {
  it('l’imagier (palier 0) est toujours ouvert', () => {
    expect(tierPlayable(FRESH_PROGRESS, 0)).toBe(true)
  })

  it('au départ : ballons couleurs verrouillés par l’imagier, le reste par les étoiles', () => {
    expect(lockReason(FRESH_PROGRESS, 1)).toBe('explore')
    expect(lockReason(FRESH_PROGRESS, 2)).toBe('stars')
    expect(lockReason(FRESH_PROGRESS, 3)).toBe('stars')
    expect(lockReason(FRESH_PROGRESS, 4)).toBe('stars')
  })

  it('imagier exploré + étoiles suffisantes → jouable', () => {
    const p: EngProgress = {
      ...FRESH_PROGRESS,
      explored: { colours: true },
      unlockedTier: 2,
    }
    expect(tierPlayable(p, 1)).toBe(true)
    // palier 2 atteint par les étoiles mais imagier nombres pas exploré
    expect(lockReason(p, 2)).toBe('explore')
    expect(tierPlayable({ ...p, explored: { colours: true, numbers: true } }, 2)).toBe(true)
  })

  it('Simon (palier 4) n’exige pas de thème d’imagier, seulement les étoiles', () => {
    expect(TIER_THEMES[4]).toBeNull()
    const p: EngProgress = { ...FRESH_PROGRESS, unlockedTier: 4 }
    expect(tierPlayable(p, 4)).toBe(true)
  })
})

describe('applyRun — progression et déblocage des paliers', () => {
  it('2 étoiles débloquent le palier suivant, 1 étoile non', () => {
    const base: EngProgress = { ...FRESH_PROGRESS, explored: { colours: true } }
    expect(applyRun(base, 1, 2).unlockedTier).toBe(2)
    expect(applyRun(base, 1, 3).unlockedTier).toBe(2)
    expect(applyRun(base, 1, 1).unlockedTier).toBe(1)
  })

  it('bestStars conserve le meilleur score et runs s’incrémente', () => {
    let p: EngProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, 1, 3)
    p = applyRun(p, 1, 1)
    expect(p.bestStars[1]).toBe(3)
    expect(p.runs).toBe(2)
  })

  it('rejouer un palier déjà passé ne reverrouille jamais', () => {
    const p = applyRun({ ...FRESH_PROGRESS, unlockedTier: 4 }, 1, 1)
    expect(p.unlockedTier).toBe(4)
  })

  it('le dernier palier ne débloque rien au-delà de TIER_COUNT − 1', () => {
    const p = applyRun({ ...FRESH_PROGRESS, unlockedTier: 4 }, 4, 3)
    expect(p.unlockedTier).toBe(TIER_COUNT - 1)
  })

  it('préserve l’imagier (explored/listened) tel quel', () => {
    const base: EngProgress = {
      ...FRESH_PROGRESS,
      explored: { colours: true },
      listened: { colours: COLOURS.map((c) => c.id) },
    }
    const p = applyRun(base, 1, 2)
    expect(p.explored).toEqual(base.explored)
    expect(p.listened).toEqual(base.listened)
    expect(base.unlockedTier).toBe(1) // jamais muté
  })
})

// ------------------------------------------------------------
// Corpus audio
// ------------------------------------------------------------

describe('corpus audio — couverture complète, préfixe eng.', () => {
  it('ids valides, uniques, tous préfixés eng., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('eng.')).toBe(true)
      expect(['denise', 'eloise', 'henri', 'sonia']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('chaque mot du lexique a son clip anglais, en voix sonia', () => {
    const byId = new Map(corpus.entries.map((e) => [e.id, e]))
    const clips: string[] = [
      ...COLOURS.map((c) => wordClip('colours', c.id)),
      ...NUMBERS.map((n) => wordClip('numbers', n.id)),
      ...ANIMALS.map((a) => wordClip('animals', a.id)),
      ...ACTIONS.map((a) => actionClip(a.id)),
      actionClip(DONT_MOVE.id),
    ]
    for (const id of clips) {
      const entry = byId.get(id)
      expect(entry, `clip manquant : ${id}`).toBeDefined()
      expect(entry?.voice, `voix de ${id}`).toBe('sonia')
    }
  })

  it('les gabarits anglais sont en voix sonia, l’encadrement en denise/eloise', () => {
    const byId = new Map(corpus.entries.map((e) => [e.id, e]))
    for (const id of ['eng.pop', 'eng.popnum', 'eng.where', 'eng.simon', 'eng.thatone', 'eng.bravo']) {
      expect(byId.get(id)?.voice, id).toBe('sonia')
    }
    for (const id of [
      'eng.intro',
      'eng.mode.0',
      'eng.mode.1',
      'eng.mode.2',
      'eng.mode.3',
      'eng.mode.4',
      'eng.imagier.consigne',
      'eng.imagier.fini',
      'eng.imagier.theme.colours',
      'eng.imagier.theme.numbers',
      'eng.imagier.theme.animals',
      'eng.reecoute',
      'eng.simon.piege',
      'eng.indice',
      'eng.verrou.imagier',
      'eng.verrou.etoiles',
    ]) {
      const entry = byId.get(id)
      expect(entry, `clip manquant : ${id}`).toBeDefined()
      expect(['denise', 'eloise']).toContain(entry?.voice)
      expect(entry?.text).not.toMatch(/faux/i)
    }
  })

  it('aucun doublon des clips communs ui.* ni des nombres français nombre.*', () => {
    for (const e of corpus.entries) {
      expect(e.id.startsWith('ui.')).toBe(false)
      expect(e.id.startsWith('nombre.')).toBe(false)
    }
  })
})

// ------------------------------------------------------------
// Cohérence skill-map / manifest
// ------------------------------------------------------------

describe('cohérence avec le skill-map et le manifest', () => {
  it('un skill par palier noté, tous connus du skill-map', () => {
    expect(TIER_SKILLS).toHaveLength(TIER_COUNT)
    expect(TIER_SKILLS[0]).toBe('') // l'imagier n'est pas noté
    for (const id of TIER_SKILLS.slice(1)) {
      expect(SKILLS_BY_ID.has(id), `compétence inconnue : ${id}`).toBe(true)
    }
  })

  it('le manifest déclare exactement les skills des paliers, dans l’ordre', () => {
    const meta = GAMES_BY_ID.get('english-island')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(meta.skills).toEqual([...TIER_SKILLS.slice(1)])
    expect(meta.island).toBe('ailleurs')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('🏝️')
    expect(meta.accent).toBe('#1565c0')
  })

  it('chaque palier noté a un thème cohérent', () => {
    expect(TIER_THEMES).toEqual([null, 'colours', 'numbers', 'animals', null])
    for (const tier of [1, 2, 3] as const) {
      const theme = TIER_THEMES[tier] as ThemeId
      expect(themeWords(theme).length).toBeGreaterThanOrEqual(ITEMS_PER_RUN)
    }
  })

  it('tous les paliers sont couverts par un type TierId valide', () => {
    const tiers: TierId[] = [0, 1, 2, 3, 4]
    expect(tiers).toHaveLength(TIER_COUNT)
  })
})
