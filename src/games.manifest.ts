import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameMeta, IslandDef, IslandId } from '@/engine/types'

// ============================================================
// LA source unique de vérité : génère le hub, les routes,
// et la carte de compétences du dashboard parent.
// Ajouter un jeu = ajouter une entrée ici (+ dossier src/games/<id>).
// ============================================================

export const ISLANDS: IslandDef[] = [
  {
    id: 'sons',
    name: 'L’Île aux Sons',
    emoji: '🔊',
    tagline: 'Lire, écouter, écrire',
    accent: '#ff7866',
  },
  {
    id: 'nombres',
    name: 'L’Île aux Nombres',
    emoji: '🔢',
    tagline: 'Compter, calculer, payer',
    accent: '#5ab8f5',
  },
  {
    id: 'robots',
    name: 'L’Île des Robots',
    emoji: '🤖',
    tagline: 'Logique et petits programmes',
    accent: '#58c472',
  },
  {
    id: 'monde',
    name: 'L’Île du Monde',
    emoji: '🌋',
    tagline: 'Le temps, l’espace, la nature',
    accent: '#ffc94d',
  },
  {
    id: 'ailleurs',
    name: 'L’Île d’Ailleurs',
    emoji: '🛶',
    tagline: 'English, musique et couleurs',
    accent: '#9b7ede',
  },
]

export const ISLANDS_BY_ID: ReadonlyMap<IslandId, IslandDef> = new Map(
  ISLANDS.map((i) => [i.id, i]),
)

// ---------- Jeux V2 (lazy chunks) ----------
export const V2_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {
  'robo-pilote': lazy(() => import('@/games/robo-pilote')),
  'train-des-syllabes': lazy(() => import('@/games/train-des-syllabes')),
  'gloutons-du-dix': lazy(() => import('@/games/gloutons-du-dix')),
  'fabrique-de-nombres': lazy(() => import('@/games/fabrique-de-nombres')),
  'machine-a-ecrire': lazy(() => import('@/games/machine-a-ecrire')),
  'ptit-marchand': lazy(() => import('@/games/ptit-marchand')),
}

export const GAMES: GameMeta[] = [
  // ======================= JEUX V2 =======================
  {
    id: 'robo-pilote',
    title: 'Robo-Pilote',
    tagline: 'Programme le robot jusqu’au trésor !',
    icon: '🤖',
    island: 'robots',
    accent: '#00897b',
    skills: ['lo.gs.directions', 'lo.cp.code.sequence', 'lo.cp.code.boucles'],
    status: 'v2',
  },
  {
    id: 'train-des-syllabes',
    title: 'Le Train des Syllabes',
    tagline: 'Écoute le mot, assemble les wagons !',
    icon: '🚂',
    island: 'sons',
    accent: '#2e7d32',
    skills: [
      'fr.gs.phono.scander',
      'fr.gs.phono.fusion',
      'fr.gs.phono.suppression',
      'fr.cp.decodage.syllabes',
    ],
    status: 'v2',
  },
  {
    id: 'gloutons-du-dix',
    title: 'Les Gloutons du Dix',
    tagline: 'Nourris les gloutons avec le bon compte !',
    icon: '🪄',
    island: 'nombres',
    accent: '#7e57c2',
    skills: ['ma.gs.decompo5', 'ma.gs.decompo10', 'ma.cp.complements10', 'ma.cp.doubles'],
    status: 'v2',
  },
  {
    id: 'fabrique-de-nombres',
    title: 'La Fabrique de Nombres',
    tagline: 'Fabrique les nombres avec barres et cubes !',
    icon: '🏗️',
    island: 'nombres',
    accent: '#1565c0',
    skills: [
      'ma.cp.num.lire59',
      'ma.cp.num.dizaines',
      'ma.cp.num.echange',
      'ma.cp.num.decompo100',
    ],
    status: 'v2',
  },
  {
    id: 'machine-a-ecrire',
    title: 'La Machine à Écrire Magique',
    tagline: 'Écoute le son, écris-le avec les touches !',
    icon: '⌨️',
    island: 'sons',
    accent: '#ad1457',
    skills: [
      'fr.cp.cgp.voyelles',
      'fr.cp.cgp.consonnes1',
      'fr.cp.cgp.digraphes1',
      'fr.cp.encodage.syllabes',
      'fr.cp.encodage.mots',
    ],
    status: 'v2',
  },
  {
    id: 'ptit-marchand',
    title: 'Le P’tit Marchand',
    tagline: 'Sers les clients et rends la monnaie !',
    icon: '🏪',
    island: 'nombres',
    accent: '#f9a825',
    skills: ['ma.cp.monnaie.pieces', 'ma.cp.monnaie.payer', 'ma.cp.monnaie.rendre', 'ma.cp.add10'],
    status: 'v2',
  },

  // ==================== JEUX CLASSIQUES (V1) ====================
  // Servis tels quels depuis public/v1/ — retirés un par un quand
  // leur refonte V2 est validée avec l'enfant.
  { id: 'v1-calcul-aventure', title: 'Calcul Aventure', tagline: 'Additions et soustractions', icon: '🔢', island: 'nombres', accent: '#3498db', skills: [], status: 'classique', href: 'v1/calcul-aventure.html' },
  { id: 'v1-trouve-la-lettre', title: 'Trouve la Lettre', tagline: 'Retrouve les lettres de l’alphabet', icon: '🔤', island: 'sons', accent: '#e74c3c', skills: [], status: 'classique', href: 'v1/trouve-la-lettre.html' },
  { id: 'v1-premiere-lettre', title: 'Première Lettre', tagline: 'Par quelle lettre commence le mot ?', icon: '🖼️', island: 'sons', accent: '#2ecc71', skills: [], status: 'classique', href: 'v1/premiere-lettre.html' },
  { id: 'v1-mots-et-images', title: 'Mots et Images', tagline: 'Associe les mots aux images', icon: '📖', island: 'sons', accent: '#00bcd4', skills: [], status: 'classique', href: 'v1/mots-et-images.html' },
  { id: 'v1-les-syllabes', title: 'Les Syllabes', tagline: 'Découpe et recompose les mots', icon: '🔊', island: 'sons', accent: '#ff7043', skills: [], status: 'classique', href: 'v1/les-syllabes.html' },
  { id: 'v1-le-train-des-mots', title: 'Le Train des Mots', tagline: 'Assemble les syllabes en wagons', icon: '🚂', island: 'sons', accent: '#2e7d32', skills: [], status: 'classique', href: 'v1/le-train-des-mots.html' },
  { id: 'v1-la-dictee-des-sons', title: 'La Dictée des Sons', tagline: 'Écoute le son, trouve la lettre', icon: '🎧', island: 'sons', accent: '#ad1457', skills: [], status: 'classique', href: 'v1/la-dictee-des-sons.html' },
  { id: 'v1-qui-parle', title: 'Qui Parle ?', tagline: 'Comprends l’histoire, trouve qui parle', icon: '🔍', island: 'sons', accent: '#1b5e20', skills: [], status: 'classique', href: 'v1/qui-parle.html' },
  { id: 'v1-la-machine-a-phrases', title: 'La Machine à Phrases', tagline: 'Construis des phrases', icon: '⚙️', island: 'sons', accent: '#e65100', skills: [], status: 'classique', href: 'v1/la-machine-a-phrases.html' },
  { id: 'v1-la-fabrique-de-nombres', title: 'La Fabrique de Nombres (classique)', tagline: 'Dizaines et unités', icon: '🏗️', island: 'nombres', accent: '#1565c0', skills: [], status: 'classique', href: 'v1/la-fabrique-de-nombres.html' },
  { id: 'v1-le-ptit-marchand', title: 'Le P’tit Marchand (classique)', tagline: 'Paye et rends la monnaie', icon: '🏪', island: 'nombres', accent: '#f9a825', skills: [], status: 'classique', href: 'v1/le-ptit-marchand.html' },
  { id: 'v1-le-bar-a-schemas', title: 'Le Bar à Schémas', tagline: 'Résous des problèmes en barres', icon: '📊', island: 'nombres', accent: '#00796b', skills: [], status: 'classique', href: 'v1/le-bar-a-schemas.html' },
  { id: 'v1-le-miroir-pixel', title: 'Le Miroir Pixel', tagline: 'Complète le symétrique', icon: '🪞', island: 'robots', accent: '#4527a0', skills: [], status: 'classique', href: 'v1/le-miroir-pixel.html' },
  { id: 'v1-pixel-art-geometrique', title: 'Pixel Art Géométrique', tagline: 'Reproduis les figures', icon: '🎨', island: 'robots', accent: '#1a237e', skills: [], status: 'classique', href: 'v1/pixel-art-geometrique.html' },
  { id: 'v1-robot-quadrillage', title: 'Robot Quadrillage (classique)', tagline: 'Programme le robot', icon: '🤖', island: 'robots', accent: '#00897b', skills: [], status: 'classique', href: 'v1/robot-quadrillage.html' },
  { id: 'v1-suite-logique', title: 'Suite Logique', tagline: 'Trouve la suite', icon: '🧠', island: 'robots', accent: '#5c6bc0', skills: [], status: 'classique', href: 'v1/suite-logique.html' },
  { id: 'v1-sudoku-des-petits', title: 'Sudoku des Petits', tagline: 'Complète les grilles', icon: '🧩', island: 'robots', accent: '#e91e63', skills: [], status: 'classique', href: 'v1/sudoku-des-petits.html' },
  { id: 'v1-le-temps-qui-passe', title: 'Le Temps qui Passe', tagline: 'Les heures et la journée', icon: '🕐', island: 'monde', accent: '#9b59b6', skills: [], status: 'classique', href: 'v1/le-temps-qui-passe.html' },
  { id: 'v1-ma-semaine-en-ordre', title: 'Ma Semaine en Ordre', tagline: 'Jours, mois et saisons', icon: '📅', island: 'monde', accent: '#8e24aa', skills: [], status: 'classique', href: 'v1/ma-semaine-en-ordre.html' },
  { id: 'v1-la-journee-de-leo', title: 'La Journée de Léo', tagline: 'Les moments de la journée', icon: '🌅', island: 'monde', accent: '#f57c00', skills: [], status: 'classique', href: 'v1/la-journee-de-leo.html' },
  { id: 'v1-le-plan-de-lecole', title: 'Le Plan de l’École', tagline: 'Gauche, droite, repère-toi !', icon: '🗺️', island: 'monde', accent: '#43a047', skills: [], status: 'classique', href: 'v1/le-plan-de-lecole.html' },
  { id: 'v1-le-restaurant-des-animaux', title: 'Le Restaurant des Animaux', tagline: 'Sers le bon repas', icon: '🍽️', island: 'monde', accent: '#e65100', skills: [], status: 'classique', href: 'v1/le-restaurant-des-animaux.html' },
  { id: 'v1-leau-magique', title: 'L’Eau Magique', tagline: 'Les 3 états de l’eau', icon: '💧', island: 'monde', accent: '#0277bd', skills: [], status: 'classique', href: 'v1/leau-magique.html' },
  { id: 'v1-le-jardin-des-emotions', title: 'Le Jardin des Émotions', tagline: 'Reconnais les émotions', icon: '🌸', island: 'monde', accent: '#558b2f', skills: [], status: 'classique', href: 'v1/le-jardin-des-emotions.html' },
  { id: 'v1-hello-english', title: 'Hello English!', tagline: 'Colours, numbers, animals', icon: '🇬🇧', island: 'ailleurs', accent: '#1565c0', skills: [], status: 'classique', href: 'v1/hello-english.html' },
  { id: 'v1-colour-catcher', title: 'Colour Catcher', tagline: 'Attrape les ballons en anglais', icon: '🎈', island: 'ailleurs', accent: '#0d47a1', skills: [], status: 'classique', href: 'v1/colour-catcher.html' },
  { id: 'v1-simon-says', title: 'Simon Says', tagline: 'Jacques a dit… en anglais', icon: '🙋', island: 'ailleurs', accent: '#2e7d32', skills: [], status: 'classique', href: 'v1/simon-says.html' },
  { id: 'v1-le-chef-dorchestre', title: 'Le Chef d’Orchestre', tagline: 'Rythme et instruments', icon: '🎵', island: 'ailleurs', accent: '#4a148c', skills: [], status: 'classique', href: 'v1/le-chef-dorchestre.html' },
  { id: 'v1-latelier-des-couleurs', title: 'L’Atelier des Couleurs', tagline: 'Mélange les couleurs et peins', icon: '🖌️', island: 'ailleurs', accent: '#bf360c', skills: [], status: 'classique', href: 'v1/latelier-des-couleurs.html' },
]

export const GAMES_BY_ID: ReadonlyMap<string, GameMeta> = new Map(GAMES.map((g) => [g.id, g]))

export const V2_GAMES = GAMES.filter((g) => g.status === 'v2')
export const CLASSIC_GAMES = GAMES.filter((g) => g.status === 'classique')
