// ============================================================
// Fluence Express — banques de contenu PURES.
// Mots déchiffrables CP/CE1 (avec emoji et syllabes), gabarits
// de phrases (sujet × action × lieu) et textes de lecture duo.
// Aucun import React/engine. Prouvé par logic.test.ts.
// ============================================================

export interface WordEntry {
  word: string
  emoji: string
  /** Famille phonique dominante (attaque ou graphème) — sert aux distracteurs */
  famille: string
  /** Découpage syllabique : join('') === word */
  syllables: string[]
  /** 0 = mots simples (graphèmes réguliers), 1 = digraphes / mots plus longs */
  tier: 0 | 1
}

// ------------------------------------------------------------
// Banque de mots — emojis tous UNIQUES (zéro ambiguïté visuelle)
// ------------------------------------------------------------

export const WORDS: readonly WordEntry[] = [
  // ---------------- Tier 0 : décodage simple ----------------
  { word: 'lavabo', emoji: '🚰', famille: 'la', syllables: ['la', 'va', 'bo'], tier: 0 },
  { word: 'lapin', emoji: '🐰', famille: 'la', syllables: ['la', 'pin'], tier: 0 },
  { word: 'lama', emoji: '🦙', famille: 'la', syllables: ['la', 'ma'], tier: 0 },
  { word: 'lune', emoji: '🌙', famille: 'lu', syllables: ['lu', 'ne'], tier: 0 },
  { word: 'vélo', emoji: '🚲', famille: 'vé', syllables: ['vé', 'lo'], tier: 0 },
  { word: 'moto', emoji: '🛵', famille: 'mo', syllables: ['mo', 'to'], tier: 0 },
  { word: 'judo', emoji: '🥋', famille: 'ju', syllables: ['ju', 'do'], tier: 0 },
  { word: 'tomate', emoji: '🍅', famille: 'to', syllables: ['to', 'ma', 'te'], tier: 0 },
  { word: 'banane', emoji: '🍌', famille: 'ba', syllables: ['ba', 'na', 'ne'], tier: 0 },
  { word: 'ananas', emoji: '🍍', famille: 'a', syllables: ['a', 'na', 'nas'], tier: 0 },
  { word: 'salade', emoji: '🥗', famille: 'sa', syllables: ['sa', 'la', 'de'], tier: 0 },
  { word: 'sapin', emoji: '🌲', famille: 'sa', syllables: ['sa', 'pin'], tier: 0 },
  { word: 'souris', emoji: '🐭', famille: 'sou', syllables: ['sou', 'ris'], tier: 0 },
  { word: 'sirène', emoji: '🧜‍♀️', famille: 'si', syllables: ['si', 'rè', 'ne'], tier: 0 },
  { word: 'pirate', emoji: '🏴‍☠️', famille: 'pi', syllables: ['pi', 'ra', 'te'], tier: 0 },
  { word: 'piano', emoji: '🎹', famille: 'pi', syllables: ['pi', 'a', 'no'], tier: 0 },
  { word: 'pomme', emoji: '🍎', famille: 'po', syllables: ['pom', 'me'], tier: 0 },
  { word: 'poule', emoji: '🐔', famille: 'pou', syllables: ['pou', 'le'], tier: 0 },
  { word: 'papa', emoji: '👨', famille: 'pa', syllables: ['pa', 'pa'], tier: 0 },
  { word: 'papi', emoji: '👴', famille: 'pa', syllables: ['pa', 'pi'], tier: 0 },
  { word: 'mamie', emoji: '👵', famille: 'ma', syllables: ['ma', 'mie'], tier: 0 },
  { word: 'bébé', emoji: '👶', famille: 'bé', syllables: ['bé', 'bé'], tier: 0 },
  { word: 'robot', emoji: '🤖', famille: 'ro', syllables: ['ro', 'bot'], tier: 0 },
  { word: 'café', emoji: '☕', famille: 'ca', syllables: ['ca', 'fé'], tier: 0 },
  { word: 'canari', emoji: '🐤', famille: 'ca', syllables: ['ca', 'na', 'ri'], tier: 0 },
  { word: 'caméra', emoji: '🎥', famille: 'ca', syllables: ['ca', 'mé', 'ra'], tier: 0 },
  { word: 'cinéma', emoji: '🎬', famille: 'ci', syllables: ['ci', 'né', 'ma'], tier: 0 },
  { word: 'tortue', emoji: '🐢', famille: 'to', syllables: ['tor', 'tue'], tier: 0 },
  { word: 'fusée', emoji: '🚀', famille: 'fu', syllables: ['fu', 'sée'], tier: 0 },
  { word: 'fourmi', emoji: '🐜', famille: 'fou', syllables: ['four', 'mi'], tier: 0 },
  { word: 'tulipe', emoji: '🌷', famille: 'tu', syllables: ['tu', 'li', 'pe'], tier: 0 },
  { word: 'kiwi', emoji: '🥝', famille: 'ki', syllables: ['ki', 'wi'], tier: 0 },
  { word: 'taxi', emoji: '🚕', famille: 'ta', syllables: ['ta', 'xi'], tier: 0 },
  { word: 'koala', emoji: '🐨', famille: 'ko', syllables: ['ko', 'a', 'la'], tier: 0 },
  { word: 'panda', emoji: '🐼', famille: 'pa', syllables: ['pan', 'da'], tier: 0 },

  // ------- Tier 1 : digraphes (ch, on, eau, oi, ouille…) -------
  { word: 'chapeau', emoji: '🎩', famille: 'ch', syllables: ['cha', 'peau'], tier: 1 },
  { word: 'château', emoji: '🏰', famille: 'ch', syllables: ['châ', 'teau'], tier: 1 },
  { word: 'chaton', emoji: '😺', famille: 'ch', syllables: ['cha', 'ton'], tier: 1 },
  { word: 'cheval', emoji: '🐴', famille: 'ch', syllables: ['che', 'val'], tier: 1 },
  { word: 'chemise', emoji: '👔', famille: 'ch', syllables: ['che', 'mi', 'se'], tier: 1 },
  { word: 'chaussure', emoji: '👟', famille: 'ch', syllables: ['chaus', 'su', 're'], tier: 1 },
  { word: 'chocolat', emoji: '🍫', famille: 'ch', syllables: ['cho', 'co', 'lat'], tier: 1 },
  { word: 'champignon', emoji: '🍄', famille: 'ch', syllables: ['cham', 'pi', 'gnon'], tier: 1 },
  { word: 'vache', emoji: '🐮', famille: 'ch', syllables: ['va', 'che'], tier: 1 },
  { word: 'mouton', emoji: '🐑', famille: 'on', syllables: ['mou', 'ton'], tier: 1 },
  { word: 'ballon', emoji: '🎈', famille: 'on', syllables: ['bal', 'lon'], tier: 1 },
  { word: 'melon', emoji: '🍈', famille: 'on', syllables: ['me', 'lon'], tier: 1 },
  { word: 'savon', emoji: '🧼', famille: 'on', syllables: ['sa', 'von'], tier: 1 },
  { word: 'bonbon', emoji: '🍬', famille: 'on', syllables: ['bon', 'bon'], tier: 1 },
  { word: 'papillon', emoji: '🦋', famille: 'on', syllables: ['pa', 'pil', 'lon'], tier: 1 },
  { word: 'poisson', emoji: '🐟', famille: 'on', syllables: ['pois', 'son'], tier: 1 },
  { word: 'maison', emoji: '🏠', famille: 'on', syllables: ['mai', 'son'], tier: 1 },
  { word: 'avion', emoji: '✈️', famille: 'on', syllables: ['a', 'vion'], tier: 1 },
  { word: 'camion', emoji: '🚚', famille: 'on', syllables: ['ca', 'mion'], tier: 1 },
  { word: 'cochon', emoji: '🐷', famille: 'on', syllables: ['co', 'chon'], tier: 1 },
  { word: 'dragon', emoji: '🐉', famille: 'on', syllables: ['dra', 'gon'], tier: 1 },
  { word: 'pantalon', emoji: '👖', famille: 'on', syllables: ['pan', 'ta', 'lon'], tier: 1 },
  { word: 'gâteau', emoji: '🍰', famille: 'eau', syllables: ['gâ', 'teau'], tier: 1 },
  { word: 'bateau', emoji: '⛵', famille: 'eau', syllables: ['ba', 'teau'], tier: 1 },
  { word: 'cadeau', emoji: '🎁', famille: 'eau', syllables: ['ca', 'deau'], tier: 1 },
  { word: 'oiseau', emoji: '🐦', famille: 'eau', syllables: ['oi', 'seau'], tier: 1 },
  { word: 'étoile', emoji: '⭐', famille: 'oi', syllables: ['é', 'toi', 'le'], tier: 1 },
  { word: 'voiture', emoji: '🚗', famille: 'oi', syllables: ['voi', 'tu', 're'], tier: 1 },
  { word: 'poire', emoji: '🍐', famille: 'oi', syllables: ['poi', 're'], tier: 1 },
  { word: 'fraise', emoji: '🍓', famille: 'ai', syllables: ['frai', 'se'], tier: 1 },
  { word: 'montagne', emoji: '🏔️', famille: 'gn', syllables: ['mon', 'ta', 'gne'], tier: 1 },
  { word: 'grenouille', emoji: '🐸', famille: 'ouille', syllables: ['gre', 'nouille'], tier: 1 },
  { word: 'citrouille', emoji: '🎃', famille: 'ouille', syllables: ['ci', 'trouille'], tier: 1 },
  { word: 'escargot', emoji: '🐌', famille: 'ar', syllables: ['es', 'car', 'got'], tier: 1 },
  { word: 'crocodile', emoji: '🐊', famille: 'cr', syllables: ['cro', 'co', 'di', 'le'], tier: 1 },
  { word: 'éléphant', emoji: '🐘', famille: 'an', syllables: ['é', 'lé', 'phant'], tier: 1 },
  { word: 'fenêtre', emoji: '🪟', famille: 'tr', syllables: ['fe', 'nê', 'tre'], tier: 1 },
  { word: 'renard', emoji: '🦊', famille: 'ar', syllables: ['re', 'nard'], tier: 1 },
  { word: 'canard', emoji: '🦆', famille: 'ar', syllables: ['ca', 'nard'], tier: 1 },
  { word: 'guitare', emoji: '🎸', famille: 'gu', syllables: ['gui', 'ta', 're'], tier: 1 },
  { word: 'girafe', emoji: '🦒', famille: 'gi', syllables: ['gi', 'ra', 'fe'], tier: 1 },
  { word: 'fantôme', emoji: '👻', famille: 'an', syllables: ['fan', 'tô', 'me'], tier: 1 },
]

// ------------------------------------------------------------
// Gabarits de phrases — sujet × action × lieu (rendu emoji
// déterministe : 1 partie = 1 emoji, uniques dans leur catégorie)
// ------------------------------------------------------------

export interface SentencePart {
  text: string
  emoji: string
}

export const SUBJECTS: readonly SentencePart[] = [
  { text: 'Le chat', emoji: '🐱' },
  { text: 'Le chien', emoji: '🐶' },
  { text: 'La poule', emoji: '🐔' },
  { text: 'Le lapin', emoji: '🐰' },
  { text: 'La souris', emoji: '🐭' },
  { text: 'Le cochon', emoji: '🐷' },
  { text: 'La vache', emoji: '🐮' },
  { text: 'Le canard', emoji: '🦆' },
]

export const ACTIONS: readonly SentencePart[] = [
  { text: 'dort', emoji: '😴' },
  { text: 'mange', emoji: '🍽️' },
  { text: 'chante', emoji: '🎶' },
  { text: 'court', emoji: '💨' },
  { text: 'saute', emoji: '🤸' },
  { text: 'lit', emoji: '📖' },
]

export const PLACES: readonly SentencePart[] = [
  { text: 'dans la maison', emoji: '🏠' },
  { text: 'dans le jardin', emoji: '🌻' },
  { text: 'sur le lit', emoji: '🛏️' },
  { text: "sous l'arbre", emoji: '🌳' },
  { text: "à l'école", emoji: '🏫' },
  { text: 'sur le bateau', emoji: '⛵' },
]

// ------------------------------------------------------------
// Textes de lecture duo — gabarits à trous (slots de longueur
// constante en mots : le compte de mots d'un gabarit est stable)
// ------------------------------------------------------------

/** Prénoms déchiffrables (1 mot chacun). */
export const DUO_PRENOMS: readonly string[] = [
  'Lila',
  'Tom',
  'Nina',
  'Sami',
  'Léo',
  'Mila',
  'Noé',
  'Zoé',
]

/** Animaux masculins (1 mot — aucun accord à gérer dans les gabarits). */
export const DUO_ANIMAUX: readonly string[] = [
  'lapin',
  'chaton',
  'canard',
  'mouton',
  'panda',
  'renard',
]

/** Lieux masculins compatibles « au {lieu} » (1 mot). */
export const DUO_LIEUX: readonly string[] = [
  'marché',
  'château',
  'village',
  'jardin',
  'pré',
  'bois',
]

/** Fruits avec leur déterminant (toujours 2 mots). */
export const DUO_FRUITS: readonly string[] = [
  'une banane',
  'une poire',
  'une fraise',
  'une tomate',
  'un kiwi',
  'un melon',
]

/**
 * Gabarits 60-80 mots, vocabulaire CP/CE1, phrases courtes.
 * Slots : {prenom} {animal} {lieu} {fruit}. Les slots ne sont JAMAIS
 * repris par un pronom accordé (animaux/lieux masculins, fruits en
 * groupe nominal complet) — n'importe quelle combinaison est correcte.
 */
export const DUO_TEMPLATES: readonly string[] = [
  '{prenom} a un petit {animal}. Ce matin, {prenom} va au {lieu} avec son {animal}. ' +
    'Le {animal} saute, court et fait des galipettes sur le chemin. Tout à coup, il trouve ' +
    '{fruit} sous une feuille. Quel régal ! {prenom} rit et partage le goûter avec lui. ' +
    'Puis ils rentrent à la maison, un peu fatigués, mais très contents de leur belle journée.',

  'Dans le train rouge, {prenom} regarde par la fenêtre. Le train roule vite, il file vers ' +
    'le {lieu}. Sur le quai, un {animal} attend avec une petite valise. Il monte, il salue ' +
    'tout le monde, puis il sort {fruit} de son sac. {prenom} sourit : quel drôle de voyage ! ' +
    "Le chef de gare siffle, le train repart, et tout le monde chante jusqu'au {lieu}.",

  '{prenom} et son ami {animal} préparent un pique-nique. Dans le panier, ils posent {fruit}, ' +
    "du pain et un peu de fromage. Ils marchent jusqu'au {lieu}, tout près de la rivière. " +
    'Le {animal} étale la nappe sous un grand arbre. Une fourmi arrive, puis deux, puis dix ! ' +
    '{prenom} rigole et lève le panier très haut. Ils mangent vite, puis font une longue sieste au soleil.',

  "Ce soir, il pleut sur le {lieu}. Le petit {animal} de {prenom} a peur de l'orage. " +
    'Alors {prenom} allume une lampe, prend un livre et lit une histoire à voix basse. ' +
    "Dans l'histoire, un dragon gourmand mange {fruit} et devient tout gentil. " +
    'Peu à peu, le {animal} ferme les yeux. {prenom} le borde dans son panier, souffle la lampe ' +
    'et murmure : à demain, petit dormeur.',

  "Au {lieu}, c'est jour de fête. {prenom} porte un chapeau pointu et un habit doré. " +
    'Sur la place, un {animal} savant fait un numéro : il saute, il danse, il marche sur deux pattes. ' +
    'Tout le monde applaudit très fort. Pour le féliciter, {prenom} lui offre {fruit} et une caresse. ' +
    "Le {animal} salue le public, puis tout le monde danse jusqu'à la nuit.",

  'Ce matin, {prenom} trouve une carte mystérieuse devant sa porte. Un trésor est caché au {lieu} ! ' +
    '{prenom} appelle son fidèle {animal}, et les voilà partis. Ils passent un pont, longent la rivière, ' +
    'comptent dix pas vers le grand chêne. Sous une pierre plate, ils trouvent une boîte avec {fruit} ' +
    'et un joli ruban rouge. Le {animal} bondit de joie : quelle belle aventure à raconter !',
]
