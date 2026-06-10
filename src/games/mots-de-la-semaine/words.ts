// ============================================================
// Imagier des Mots de la Semaine — données PURES (zéro import).
// 8 thèmes alignés sur les corpus thématiques officiels GS
// (objectif 2 500 mots), 10 mots chacun. Le CONTENU est fixe
// (c'est un imagier) ; l'ORDRE et les sous-ensembles tirés à
// chaque partie sont procéduraux (voir logic.ts).
//
// Chaque mot porte :
//   slug  — id stable sans accent ([a-z0-9-]), sert aux clips audio
//   label — le mot AVEC son article (« la casserole ») : exposition
//           à l'écrit sur la carte, texte de secours pour le TTS
//   emoji — l'image de l'imagier (zéro asset image, identité V1)
// Les emojis sont UNIQUES au sein d'un thème (deux images
// identiques rendraient le quiz insoluble).
// ============================================================

export type ThemeId =
  | 'cuisine'
  | 'ferme'
  | 'jardin'
  | 'vetements'
  | 'meteo'
  | 'corps'
  | 'ecole'
  | 'vehicules'

export interface WordDef {
  /** Id stable sans accent : clip audio 'mds.mot.<slug>' */
  slug: string
  /** Le mot avec son article, en minuscules (« la casserole ») */
  label: string
  /** L'image de l'imagier */
  emoji: string
}

export interface ThemeDef {
  id: ThemeId
  /** Nom du thème côté enfant (« Les animaux de la ferme ») */
  name: string
  /** Emoji-onglet de la page du thème */
  emoji: string
  words: readonly WordDef[]
}

export const WORDS_PER_THEME = 10

function w(slug: string, label: string, emoji: string): WordDef {
  return { slug, label, emoji }
}

export const THEMES: readonly ThemeDef[] = [
  {
    id: 'cuisine',
    name: 'La cuisine',
    emoji: '🍲',
    words: [
      w('casserole', 'la casserole', '🥘'),
      w('fourchette', 'la fourchette', '🍴'),
      w('couteau', 'le couteau', '🔪'),
      w('cuillere', 'la cuillère', '🥄'),
      w('assiette', "l'assiette", '🍽️'),
      w('bol', 'le bol', '🥣'),
      w('poele', 'la poêle', '🍳'),
      w('verre', 'le verre', '🥛'),
      w('tasse', 'la tasse', '☕'),
      w('theiere', 'la théière', '🫖'),
    ],
  },
  {
    id: 'ferme',
    name: 'Les animaux de la ferme',
    emoji: '🐄',
    words: [
      w('vache', 'la vache', '🐮'),
      w('cochon', 'le cochon', '🐷'),
      w('poule', 'la poule', '🐔'),
      w('coq', 'le coq', '🐓'),
      w('mouton', 'le mouton', '🐑'),
      w('canard', 'le canard', '🦆'),
      w('cheval', 'le cheval', '🐴'),
      w('chevre', 'la chèvre', '🐐'),
      w('lapin', 'le lapin', '🐰'),
      w('dindon', 'le dindon', '🦃'),
    ],
  },
  {
    id: 'jardin',
    name: 'Le jardin',
    emoji: '🌻',
    words: [
      w('fleur', 'la fleur', '🌸'),
      w('arbre', "l'arbre", '🌳'),
      w('escargot', "l'escargot", '🐌'),
      w('papillon', 'le papillon', '🦋'),
      w('coccinelle', 'la coccinelle', '🐞'),
      w('salade', 'la salade', '🥬'),
      w('carotte', 'la carotte', '🥕'),
      w('tomate', 'la tomate', '🍅'),
      w('abeille', "l'abeille", '🐝'),
      w('champignon', 'le champignon', '🍄'),
    ],
  },
  {
    id: 'vetements',
    name: 'Les vêtements',
    emoji: '👒',
    words: [
      w('pantalon', 'le pantalon', '👖'),
      w('robe', 'la robe', '👗'),
      w('manteau', 'le manteau', '🧥'),
      w('chaussure', 'la chaussure', '👟'),
      w('casquette', 'la casquette', '🧢'),
      w('echarpe', "l'écharpe", '🧣'),
      w('gants', 'les gants', '🧤'),
      w('tee-shirt', 'le tee-shirt', '👕'),
      w('chaussettes', 'les chaussettes', '🧦'),
      w('bottes', 'les bottes', '👢'),
    ],
  },
  {
    id: 'meteo',
    name: 'La météo',
    emoji: '⛅',
    words: [
      w('soleil', 'le soleil', '☀️'),
      w('pluie', 'la pluie', '🌧️'),
      w('nuage', 'le nuage', '☁️'),
      w('neige', 'la neige', '❄️'),
      w('vent', 'le vent', '🌬️'),
      w('orage', "l'orage", '⛈️'),
      w('arc-en-ciel', "l'arc-en-ciel", '🌈'),
      w('eclair', "l'éclair", '⚡'),
      w('parapluie', 'le parapluie', '☂️'),
      w('tornade', 'la tornade', '🌪️'),
    ],
  },
  {
    id: 'corps',
    name: 'Le corps',
    emoji: '🧍',
    words: [
      w('oreille', "l'oreille", '👂'),
      w('nez', 'le nez', '👃'),
      w('oeil', "l'œil", '👁️'),
      w('bouche', 'la bouche', '👄'),
      w('dent', 'la dent', '🦷'),
      w('langue', 'la langue', '👅'),
      w('main', 'la main', '✋'),
      w('pied', 'le pied', '🦶'),
      w('bras', 'le bras', '💪'),
      w('jambe', 'la jambe', '🦵'),
    ],
  },
  {
    id: 'ecole',
    name: "L'école",
    emoji: '🏫',
    words: [
      w('cartable', 'le cartable', '🎒'),
      w('crayon', 'le crayon', '✏️'),
      w('livre', 'le livre', '📚'),
      w('ciseaux', 'les ciseaux', '✂️'),
      w('regle', 'la règle', '📏'),
      w('pinceau', 'le pinceau', '🖌️'),
      w('cahier', 'le cahier', '📓'),
      w('stylo', 'le stylo', '🖊️'),
      w('cloche', 'la cloche', '🔔'),
      w('globe', 'le globe', '🌍'),
    ],
  },
  {
    id: 'vehicules',
    name: 'Les véhicules',
    emoji: '🚦',
    words: [
      w('voiture', 'la voiture', '🚗'),
      w('camion', 'le camion', '🚚'),
      w('velo', 'le vélo', '🚲'),
      w('moto', 'la moto', '🏍️'),
      w('bus', 'le bus', '🚌'),
      w('train', 'le train', '🚂'),
      w('avion', "l'avion", '✈️'),
      w('bateau', 'le bateau', '⛵'),
      w('helicoptere', "l'hélicoptère", '🚁'),
      w('fusee', 'la fusée', '🚀'),
    ],
  },
]

export const THEMES_BY_ID: ReadonlyMap<ThemeId, ThemeDef> = new Map(
  THEMES.map((t) => [t.id, t]),
)

/** Id du clip audio d'un mot : « La casserole ! » */
export function wordClipId(slug: string): string {
  return `mds.mot.${slug}`
}

/** Id du clip audio du nom d'un thème : « La cuisine ! » */
export function themeClipId(id: ThemeId): string {
  return `mds.theme.${id}`
}
