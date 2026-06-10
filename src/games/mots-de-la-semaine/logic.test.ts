import { describe, expect, it } from 'vitest'
import { SKILLS_BY_ID } from '@/content/skill-map'
import { GAMES_BY_ID } from '@/games.manifest'
import corpus from './corpus.json'
import {
  applyExplored,
  applyRun,
  ATTRAPE_REQUESTS,
  ATTRAPE_SKILL,
  attrapeKey,
  bestAttrapeStars,
  buildChoices,
  choicesFor,
  exploredCount,
  exploredThemes,
  FAMILLES_ITEMS,
  FAMILLES_KEY,
  FAMILLES_SKILL,
  famillesUnlocked,
  FRESH_PROGRESS,
  generateAttrapeRun,
  generateFamillesRun,
  isThemeExplored,
  MAX_TUNER_LEVEL,
  pickPartnerTheme,
  pickTargets,
  starsFor,
} from './logic'
import type { MdsProgress } from './logic'
import { THEMES, THEMES_BY_ID, themeClipId, WORDS_PER_THEME, wordClipId } from './words'
import type { ThemeDef, ThemeId } from './words'

const DRAWS = 200

function theme(id: ThemeId): ThemeDef {
  const t = THEMES_BY_ID.get(id)
  if (!t) throw new Error(`thème inconnu : ${id}`)
  return t
}

/** Progression où les thèmes donnés sont entièrement explorés. */
function exploredProgress(...ids: ThemeId[]): MdsProgress {
  let p: MdsProgress = { ...FRESH_PROGRESS }
  for (const id of ids) {
    for (const w of theme(id).words) p = applyExplored(p, w.slug)
  }
  return p
}

describe('imagier — intégrité des données', () => {
  it('8 thèmes officiels GS de 10 mots chacun', () => {
    expect(THEMES).toHaveLength(8)
    expect(THEMES.map((t) => t.id)).toEqual([
      'cuisine',
      'ferme',
      'jardin',
      'vetements',
      'meteo',
      'corps',
      'ecole',
      'vehicules',
    ])
    for (const t of THEMES) expect(t.words).toHaveLength(WORDS_PER_THEME)
  })

  it('slugs url/clip-safe, uniques sur TOUT l’imagier (80 mots)', () => {
    const slugs = THEMES.flatMap((t) => t.words.map((w) => w.slug))
    expect(slugs).toHaveLength(80)
    expect(new Set(slugs).size).toBe(80)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9][a-z0-9-]*$/)
  })

  it('chaque mot porte son article (exposition au déterminant)', () => {
    for (const t of THEMES) {
      for (const w of t.words) {
        expect(w.label, w.slug).toMatch(/^(le |la |les |l')/)
      }
    }
  })

  it('emojis uniques AU SEIN d’un thème (deux images identiques = quiz insoluble)', () => {
    for (const t of THEMES) {
      const emojis = t.words.map((w) => w.emoji)
      expect(new Set(emojis).size, t.id).toBe(emojis.length)
      expect(emojis.every((e) => e.length > 0)).toBe(true)
      // L'emoji-onglet du thème ne doit pas se confondre avec une carte
      expect(emojis).not.toContain(t.emoji)
    }
  })
})

describe('choicesFor — le Tuner règle le nombre d’images (4 → 8)', () => {
  it('crans 0/1/2 → 4/6/8 images', () => {
    expect(choicesFor(0)).toBe(4)
    expect(choicesFor(1)).toBe(6)
    expect(choicesFor(MAX_TUNER_LEVEL)).toBe(8)
  })

  it('niveaux hors bornes ou fractionnaires : clampés et tronqués', () => {
    expect(choicesFor(-5)).toBe(4)
    expect(choicesFor(99)).toBe(8)
    expect(choicesFor(1.9)).toBe(6)
  })
})

describe('pickTargets — cibles uniques, ordre procédural', () => {
  it('n cibles uniques, toutes issues du thème (tous thèmes × 50 tirages)', () => {
    for (const t of THEMES) {
      for (let i = 0; i < 50; i++) {
        const targets = pickTargets(t.words, ATTRAPE_REQUESTS)
        expect(targets).toHaveLength(ATTRAPE_REQUESTS)
        expect(new Set(targets.map((w) => w.slug)).size).toBe(ATTRAPE_REQUESTS)
        for (const w of targets) expect(t.words).toContain(w)
      }
    }
  })

  it('n > taille du pool : rend tout le pool, jamais plus', () => {
    const t = theme('cuisine')
    expect(pickTargets(t.words, 99)).toHaveLength(WORDS_PER_THEME)
    expect(pickTargets(t.words, 0)).toHaveLength(0)
  })

  it('jamais le même tirage : l’ordre varie d’une partie à l’autre', () => {
    const t = theme('ferme')
    const orders = new Set(
      Array.from({ length: 30 }, () =>
        pickTargets(t.words, WORDS_PER_THEME)
          .map((w) => w.slug)
          .join(','),
      ),
    )
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('buildChoices — la cible + des distracteurs du même thème', () => {
  it('contient la cible EXACTEMENT une fois, choix uniques, tous du thème', () => {
    for (const t of THEMES) {
      for (let i = 0; i < DRAWS / 4; i++) {
        const target = t.words[i % t.words.length]
        if (!target) throw new Error('mot manquant')
        for (const count of [4, 6, 8]) {
          const choices = buildChoices(t.words, target, count)
          expect(choices).toHaveLength(count)
          expect(choices.filter((w) => w.slug === target.slug)).toHaveLength(1)
          expect(new Set(choices.map((w) => w.slug)).size).toBe(count)
          for (const w of choices) expect(t.words).toContain(w)
        }
      }
    }
  })

  it('count démesuré : clampé à la taille du thème ; count minuscule : au moins 2', () => {
    const t = theme('jardin')
    const target = t.words[0]
    if (!target) throw new Error('mot manquant')
    expect(buildChoices(t.words, target, 99)).toHaveLength(WORDS_PER_THEME)
    const tiny = buildChoices(t.words, target, 0)
    expect(tiny).toHaveLength(2)
    expect(tiny.some((w) => w.slug === target.slug)).toBe(true)
  })

  it('la cible n’est pas toujours à la même position (mélange réel)', () => {
    const t = theme('ecole')
    const target = t.words[3]
    if (!target) throw new Error('mot manquant')
    const positions = new Set(
      Array.from({ length: 60 }, () =>
        buildChoices(t.words, target, 6).findIndex((w) => w.slug === target.slug),
      ),
    )
    expect(positions.size).toBeGreaterThan(1)
  })
})

describe('generateAttrapeRun — une partie complète', () => {
  it('8 demandes, cibles jamais répétées, chaque grille contient sa cible', () => {
    for (const t of THEMES) {
      for (let run = 0; run < 30; run++) {
        const items = generateAttrapeRun(t.words)
        expect(items).toHaveLength(ATTRAPE_REQUESTS)
        expect(new Set(items.map((i) => i.target.slug)).size).toBe(ATTRAPE_REQUESTS)
        for (const item of items) {
          expect(item.choices.map((w) => w.slug)).toContain(item.target.slug)
          for (const w of item.choices) expect(t.words).toContain(w)
        }
      }
    }
  })
})

describe('generateFamillesRun — mélange procédural de 2 thèmes', () => {
  it('10 items, 5 par panier, themeId toujours celui du thème propriétaire', () => {
    const a = theme('cuisine')
    const b = theme('jardin')
    for (let run = 0; run < 50; run++) {
      const items = generateFamillesRun(a, b)
      expect(items).toHaveLength(FAMILLES_ITEMS)
      expect(items.filter((i) => i.themeId === a.id)).toHaveLength(5)
      expect(items.filter((i) => i.themeId === b.id)).toHaveLength(5)
      expect(new Set(items.map((i) => i.word.slug)).size).toBe(FAMILLES_ITEMS)
      for (const i of items) {
        const owner = i.themeId === a.id ? a : b
        expect(owner.words).toContain(i.word)
      }
    }
  })

  it('l’ordre des items varie d’une partie à l’autre (jamais le même tirage)', () => {
    const a = theme('ferme')
    const b = theme('vehicules')
    const orders = new Set(
      Array.from({ length: 30 }, () =>
        generateFamillesRun(a, b)
          .map((i) => i.word.slug)
          .join(','),
      ),
    )
    expect(orders.size).toBeGreaterThan(1)
  })

  it('nombre impair d’items : un de plus pour le premier thème', () => {
    const items = generateFamillesRun(theme('corps'), theme('meteo'), 7)
    expect(items).toHaveLength(7)
    expect(items.filter((i) => i.themeId === 'corps')).toHaveLength(4)
    expect(items.filter((i) => i.themeId === 'meteo')).toHaveLength(3)
  })
})

describe('starsFor — score honnête sur les premiers essais', () => {
  it('seuils ≥90 % → 3, ≥70 % → 2, sinon 1', () => {
    expect(starsFor(8, ATTRAPE_REQUESTS)).toBe(3)
    expect(starsFor(7, ATTRAPE_REQUESTS)).toBe(2) // 87,5 %
    expect(starsFor(6, ATTRAPE_REQUESTS)).toBe(2) // 75 %
    expect(starsFor(5, ATTRAPE_REQUESTS)).toBe(1) // 62,5 %
    expect(starsFor(0, ATTRAPE_REQUESTS)).toBe(1)
    expect(starsFor(9, FAMILLES_ITEMS)).toBe(3)
    expect(starsFor(7, FAMILLES_ITEMS)).toBe(2)
    expect(starsFor(0, 0)).toBe(1)
  })
})

describe('mémoire d’exposition — applyExplored / exploredCount / isThemeExplored', () => {
  it('marque un mot, immutable, identité préservée si déjà exploré', () => {
    const p1 = applyExplored({ ...FRESH_PROGRESS }, 'vache')
    expect(p1.explored['vache']).toBe(true)
    expect(FRESH_PROGRESS.explored['vache']).toBeUndefined()
    const p2 = applyExplored(p1, 'vache')
    expect(p2).toBe(p1) // pas de réécriture inutile
  })

  it('exploredCount compte par thème, isThemeExplored exige les 10 mots', () => {
    let p: MdsProgress = { ...FRESH_PROGRESS }
    const words = theme('cuisine').words
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      if (!w) throw new Error('mot manquant')
      expect(isThemeExplored(p, 'cuisine')).toBe(false)
      expect(exploredCount(p, 'cuisine')).toBe(i)
      p = applyExplored(p, w.slug)
    }
    expect(exploredCount(p, 'cuisine')).toBe(WORDS_PER_THEME)
    expect(isThemeExplored(p, 'cuisine')).toBe(true)
    // les autres thèmes ne bougent pas
    expect(exploredCount(p, 'ferme')).toBe(0)
    expect(isThemeExplored(p, 'ferme')).toBe(false)
  })

  it('exploredThemes ne liste que les thèmes COMPLETS', () => {
    const p = applyExplored(exploredProgress('jardin', 'corps'), 'vache')
    expect(exploredThemes(p)).toEqual(['jardin', 'corps'])
  })
})

describe('applyRun — meilleures étoiles par mode', () => {
  it('conserve le meilleur score par clé et incrémente runs', () => {
    let p: MdsProgress = { ...FRESH_PROGRESS }
    p = applyRun(p, attrapeKey('cuisine'), 3)
    p = applyRun(p, attrapeKey('cuisine'), 1)
    p = applyRun(p, FAMILLES_KEY, 2)
    expect(p.bestStars[attrapeKey('cuisine')]).toBe(3)
    expect(p.bestStars[FAMILLES_KEY]).toBe(2)
    expect(p.runs).toBe(3)
  })

  it('ne mute jamais la progression passée en entrée', () => {
    const before: MdsProgress = { explored: { vache: true }, bestStars: {}, runs: 1 }
    applyRun(before, attrapeKey('ferme'), 3)
    expect(before).toEqual({ explored: { vache: true }, bestStars: {}, runs: 1 })
  })
})

describe('famillesUnlocked — tier débloqué à 2 étoiles ET 2 thèmes explorés', () => {
  it('verrouillé tant qu’il manque les étoiles OU le second thème', () => {
    expect(famillesUnlocked(FRESH_PROGRESS)).toBe(false)
    // 2 thèmes explorés mais 1 seule étoile
    const explored2 = applyRun(exploredProgress('cuisine', 'jardin'), attrapeKey('cuisine'), 1)
    expect(famillesUnlocked(explored2)).toBe(false)
    // 2 étoiles mais un seul thème exploré
    const oneTheme = applyRun(exploredProgress('cuisine'), attrapeKey('cuisine'), 2)
    expect(famillesUnlocked(oneTheme)).toBe(false)
    // les deux conditions réunies
    const ready = applyRun(exploredProgress('cuisine', 'jardin'), attrapeKey('cuisine'), 2)
    expect(famillesUnlocked(ready)).toBe(true)
    expect(bestAttrapeStars(ready)).toBe(2)
  })
})

describe('pickPartnerTheme — second panier parmi les thèmes explorés', () => {
  it('rend un AUTRE thème exploré, jamais le courant, null sinon', () => {
    const p = exploredProgress('cuisine', 'jardin', 'ferme')
    for (let i = 0; i < 50; i++) {
      const partner = pickPartnerTheme(p, 'cuisine')
      expect(partner).not.toBeNull()
      expect(partner).not.toBe('cuisine')
      expect(['jardin', 'ferme']).toContain(partner)
    }
    expect(pickPartnerTheme(exploredProgress('cuisine'), 'cuisine')).toBeNull()
    expect(pickPartnerTheme(FRESH_PROGRESS, 'cuisine')).toBeNull()
  })

  it('choose injecté : déterministe en test', () => {
    const p = exploredProgress('cuisine', 'jardin')
    const first = <T,>(arr: readonly T[]): T => {
      const v = arr[0]
      if (v === undefined) throw new Error('vide')
      return v
    }
    expect(pickPartnerTheme(p, 'cuisine', first)).toBe('jardin')
  })
})

describe('corpus audio — couverture complète, préfixe mds.', () => {
  it('ids valides, uniques, tous préfixés mds., voix connues, textes non vides', () => {
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of corpus.entries) {
      expect(e.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(e.id.startsWith('mds.')).toBe(true)
      expect(['denise', 'eloise']).toContain(e.voice)
      expect(e.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('aucun doublon des clips communs ui.* ni des nombres nombre.*', () => {
    for (const e of corpus.entries) {
      expect(e.id.startsWith('ui.')).toBe(false)
      expect(e.id.startsWith('nombre.')).toBe(false)
    }
  })

  it('chaque mot de l’imagier a SON clip mds.mot.<slug> (80 entrées)', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const t of THEMES) {
      for (const w of t.words) {
        expect(known.has(wordClipId(w.slug)), `clip manquant : ${wordClipId(w.slug)}`).toBe(true)
      }
    }
    expect(corpus.entries.filter((e) => e.id.startsWith('mds.mot.'))).toHaveLength(80)
  })

  it('chaque thème a son clip mds.theme.<id>, voix denise (mots et consignes)', () => {
    const byId = new Map(corpus.entries.map((e) => [e.id, e]))
    for (const t of THEMES) {
      const entry = byId.get(themeClipId(t.id))
      expect(entry, `clip manquant : ${themeClipId(t.id)}`).toBeDefined()
      expect(entry?.voice).toBe('denise')
    }
    for (const e of corpus.entries) {
      if (e.id.startsWith('mds.mot.')) expect(e.voice).toBe('denise')
    }
  })

  it('tous les clips de consigne utilisés par le jeu existent', () => {
    const known = new Set(corpus.entries.map((e) => e.id))
    for (const id of [
      'mds.intro',
      'mds.imagier',
      'mds.pret',
      'mds.trouve',
      'mds.ca-cest',
      'mds.bien-joue',
      'mds.indice',
      'mds.familles.intro',
      'mds.va-dans',
      'mds.panier-indice',
      'mds.bien-range',
    ]) {
      expect(known.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})

describe('cohérence avec le skill-map et le manifest', () => {
  it('les deux compétences existent dans le skill-map', () => {
    expect(SKILLS_BY_ID.has(ATTRAPE_SKILL)).toBe(true)
    expect(SKILLS_BY_ID.has(FAMILLES_SKILL)).toBe(true)
  })

  it('le manifest déclare exactement les skills, l’île et l’identité du jeu', () => {
    const meta = GAMES_BY_ID.get('mots-de-la-semaine')
    expect(meta).toBeDefined()
    if (!meta) return
    expect(meta.skills).toEqual([ATTRAPE_SKILL, FAMILLES_SKILL])
    expect(meta.island).toBe('sons')
    expect(meta.status).toBe('v2')
    expect(meta.icon).toBe('📖')
    expect(meta.accent).toBe('#00bcd4')
  })
})
