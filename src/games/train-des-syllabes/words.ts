// ============================================================
// Lexique du Train des Syllabes — données PURES (zéro import).
// Découpage syllabique ORAL (le e muet final reste collé :
// « tor-tue » = 2 syllabes, « ba-nane » = 2 syllabes).
//
// Chaque syllabe porte :
//   g      — la graphie affichée sur le wagon (concat des g = le mot exact)
//   say    — le texte prononcé isolément. Quand la graphie seule se lirait
//            mal (« bot » → /bɔt/), on choisit une graphie qui sonne juste
//            (« beau » → /bo/). Par défaut say = g.
//   clipId — 'tds.syl.<say sans accent>' : l'id du clip audio pré-généré.
// Deux graphies au même son partagent le même clip (« cha » / « châ »).
// ============================================================

export interface Syllable {
  /** Graphie affichée sur le wagon */
  g: string
  /** Texte prononcé (clip / TTS) — graphie choisie pour bien sonner seule */
  say: string
  /** Id du clip audio : 'tds.syl.<clé sans accent ni espace>' */
  clipId: string
}

export interface Word {
  word: string
  emoji: string
  syllables: readonly Syllable[]
  /** Id du clip du mot entier : 'tds.mot.<mot sans accent>' */
  clipId: string
}

const ACCENT_MAP: Readonly<Record<string, string>> = {
  à: 'a', â: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i',
  ô: 'o', ö: 'o',
  ù: 'u', û: 'u', ü: 'u',
  ç: 'c',
}

/** Minuscules, sans accents, uniquement [a-z0-9] — pour les ids de clips. */
export function sanitize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àâäéèêëîïôöùûüç]/g, (c) => ACCENT_MAP[c] ?? '')
    .replace(/[^a-z0-9]/g, '')
}

// Format : [mot, emoji, ...syllabes] — syllabe : 'graphie' ou 'graphie=prononciation'
const RAW: ReadonlyArray<readonly [string, string, ...string[]]> = [
  // ---------- 2 syllabes orales ----------
  ['chapeau', '🎩', 'cha', 'peau'],
  ['bateau', '⛵', 'ba', 'teau'],
  ['gâteau', '🍰', 'gâ=ga', 'teau'],
  ['lapin', '🐰', 'la', 'pin'],
  ['mouton', '🐑', 'mou', 'ton'],
  ['cheval', '🐴', 'che', 'val'],
  ['maison', '🏠', 'mai', 'son=zon'],
  ['souris', '🐭', 'sou', 'ris=ri'],
  ['tortue', '🐢', 'tor', 'tue'],
  ['fusée', '🚀', 'fu', 'sée=zé'],
  ['robot', '🤖', 'ro', 'bot=beau'],
  ['vélo', '🚲', 'vé', 'lo'],
  ['ballon', '🎈', 'bal', 'lon'],
  ['cadeau', '🎁', 'ca', 'deau'],
  ['château', '🏰', 'châ=cha', 'teau'],
  ['cochon', '🐷', 'co', 'chon'],
  ['canard', '🦆', 'ca', 'nard=nar'],
  ['dauphin', '🐬', 'dau', 'phin=fin'],
  ['panda', '🐼', 'pan', 'da'],
  ['girafe', '🦒', 'gi', 'rafe'],
  ['banane', '🍌', 'ba', 'nane'],
  ['tomate', '🍅', 'to', 'mate'],
  ['carotte', '🥕', 'ca', 'rotte'],
  ['citron', '🍋', 'ci', 'tron'],
  ['melon', '🍈', 'me', 'lon'],
  ['bonbon', '🍬', 'bon', 'bon'],
  ['café', '☕', 'ca', 'fé'],
  ['bébé', '👶', 'bé', 'bé'],
  ['jardin', '🌻', 'jar', 'din=daim'],
  ['pirate', '🏴‍☠️', 'pi', 'rate'],
  ['trésor', '💎', 'tré', 'sor=zor'],
  ['dragon', '🐉', 'dra', 'gon'],
  ['moto', '🛵', 'mo', 'to'],
  ['bouton', '🔘', 'bou', 'ton'],
  ['requin', '🦈', 're', 'quin'],
  ['fourmi', '🐜', 'four', 'mi'],
  ['hibou', '🦉', 'hi', 'bou'],
  ['lutin', '🧝', 'lu', 'tin=teint'],
  ['sapin', '🌲', 'sa', 'pin'],
  ['savon', '🧼', 'sa', 'von'],
  ['micro', '🎤', 'mi', 'cro'],
  ['judo', '🥋', 'ju', 'do'],
  ['moustique', '🦟', 'mous', 'tique'],
  ['poulet', '🐔', 'pou', 'let=lait'],
  ['cabane', '🛖', 'ca', 'bane'],
  ['fourchette', '🍴', 'four', 'chette'],
  ['princesse', '👑', 'prin', 'cesse'],
  ['licorne', '🦄', 'li', 'corne'],
  ['tipi', '⛺', 'ti', 'pi'],
  ['salade', '🥗', 'sa', 'lade'],
  // ---------- 3 syllabes orales ----------
  ['chocolat', '🍫', 'cho', 'co', 'lat=la'],
  ['éléphant', '🐘', 'é', 'lé', 'phant=fan'],
  ['papillon', '🦋', 'pa', 'pil=pi', 'lon=yon'],
  ['pyjama', '🛌', 'py=pi', 'ja', 'ma'],
  ['kangourou', '🦘', 'kan', 'gou', 'rou'],
  ['domino', '🎲', 'do', 'mi', 'no'],
  ['ananas', '🍍', 'a', 'na', 'nas'],
  ['crocodile', '🐊', 'cro', 'co', 'dile'],
  ['pantalon', '👖', 'pan', 'ta', 'lon'],
  ['confiture', '🍓', 'con', 'fi', 'ture'],
  ['parapluie', '☔', 'pa', 'ra', 'pluie'],
  ['hélico', '🚁', 'hé', 'li', 'co'],
  ['lavabo', '🚿', 'la', 'va', 'bo'],
  ['escargot', '🐌', 'es', 'car', 'got=go'],
  ['champignon', '🍄', 'cham=chan', 'pi', 'gnon'],
  ['caramel', '🍮', 'ca', 'ra', 'mel'],
  ['koala', '🐨', 'ko', 'a', 'la'],
  ['magicien', '🧙', 'ma', 'gi', 'cien=sien'],
]

function buildSyllable(spec: string): Syllable {
  const eq = spec.indexOf('=')
  const g = eq === -1 ? spec : spec.slice(0, eq)
  const say = eq === -1 ? spec : spec.slice(eq + 1)
  return { g, say, clipId: `tds.syl.${sanitize(say)}` }
}

/** Tout le lexique du jeu (~68 mots familiers, 2 ou 3 syllabes orales). */
export const WORDS: readonly Word[] = RAW.map(([word, emoji, ...specs]) => ({
  word,
  emoji,
  syllables: specs.map(buildSyllable),
  clipId: `tds.mot.${sanitize(word)}`,
}))

/** Formes sans accent de tous les mots — les pseudo-mots ne doivent pas y tomber. */
export const LEXICON_KEYS: ReadonlySet<string> = new Set(WORDS.map((w) => sanitize(w.word)))

// ------------------------------------------------------------
// Équivalences de SON entre graphies différentes : un distracteur
// homophone d'une bonne syllabe serait injuste à l'oreille
// (« ko » sonne comme « co »). Clés = sanitize(say).
// ------------------------------------------------------------
const HOMOPHONE_CANON: Readonly<Record<string, string>> = {
  ko: 'co',
  deau: 'do',
  teau: 'to',
  beau: 'bo',
  lait: 'le',
}

/** Clé de SON d'une syllabe : deux syllabes de même clé sonnent pareil. */
export function soundKey(s: Syllable): string {
  const k = sanitize(s.say)
  return HOMOPHONE_CANON[k] ?? k
}

// ------------------------------------------------------------
// Syllabes uniques
// ------------------------------------------------------------

function dedupeBy<T>(items: readonly T[], key: (t: T) => string): T[] {
  const seen = new Map<string, T>()
  for (const it of items) {
    if (!seen.has(key(it))) seen.set(key(it), it)
  }
  return [...seen.values()]
}

const ALL_OCCURRENCES: readonly Syllable[] = WORDS.flatMap((w) => w.syllables)

/** Syllabes uniques par clip (pour générer le corpus audio). */
export const SYLLABLES_BY_CLIP: readonly Syllable[] = dedupeBy(ALL_OCCURRENCES, (s) => s.clipId)

/**
 * Candidates distracteurs : une syllabe par graphie distincte. Quand une même
 * graphie a plusieurs sons (« lon » de ballon /lɔ̃/ vs papillon /jɔ̃/), on garde
 * la variante canonique (say === g) pour que le wagon dise ce qu'il montre.
 */
export const DISTRACTOR_CANDIDATES: readonly Syllable[] = dedupeBy(
  [...ALL_OCCURRENCES].sort((x, y) => Number(y.say === y.g) - Number(x.say === x.g)),
  (s) => s.g,
)

// ------------------------------------------------------------
// Entrées de corpus propres au jeu (consignes, feedback)
// ------------------------------------------------------------

export interface GameEntry {
  id: string
  text: string
  voice?: 'denise' | 'eloise' | 'henri'
}

export const GAME_ENTRIES: readonly GameEntry[] = [
  {
    id: 'tds.consigne.intro',
    text: 'Bienvenue dans le Train des Syllabes ! Écoute bien les mots, et construis-les avec les wagons.',
    voice: 'eloise',
  },
  {
    id: 'tds.consigne.t0',
    text: 'Écoute le mot, puis tape sur le tambour : un coup pour chaque syllabe ! Quand tu as fini, appuie sur : c’est tout !',
  },
  {
    id: 'tds.consigne.t1',
    text: 'Écoute le mot, puis accroche les bons wagons derrière la locomotive, dans l’ordre !',
  },
  {
    id: 'tds.consigne.t2',
    text: 'Maintenant, les mots ont trois syllabes ! Écoute bien, et méfie-toi des wagons pièges.',
  },
  {
    id: 'tds.consigne.t3',
    text: 'Ici, Plume invente des mots rigolos, et parfois on enlève une syllabe ! Écoute bien.',
  },
  { id: 'tds.jeu.ecoute', text: 'Écoute bien le mot !' },
  { id: 'tds.jeu.en-route', text: 'En route !', voice: 'eloise' },
  { id: 'tds.t3.pseudo-intro', text: 'J’invente un mot rigolo ! Écoute :', voice: 'eloise' },
  { id: 'tds.t3.pseudo-construis', text: 'Construis ce mot rigolo avec les wagons !' },
  { id: 'tds.t3.suppr-enleve', text: 'Maintenant, enlève la syllabe :' },
  { id: 'tds.t3.suppr-reste', text: 'Que reste-t-il ? Construis ce qui reste avec les wagons !' },
  { id: 'tds.fb.deraille', text: 'Oh là là, le train déraille !', voice: 'eloise' },
  { id: 'tds.fb.mais-dit', text: 'Mais moi, j’ai dit :', voice: 'eloise' },
  { id: 'tds.fb.reecoute', text: 'Réécoute bien le mot :' },
  { id: 'tds.fb.indice', text: 'Regarde, un wagon clignote pour t’aider !', voice: 'eloise' },
  { id: 'tds.fb.indice-tambour', text: 'Écoute ! Je tape les syllabes avec toi.', voice: 'eloise' },
  { id: 'tds.fb.parti', text: 'Et le train s’en va ! Tchou, tchou !', voice: 'eloise' },
]
