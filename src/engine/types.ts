// ============================================================
// Types partagés du moteur — LA référence commune.
// Toute modification ici doit être répercutée dans ENGINE.md.
// ============================================================

// ---------- Îles / monde ----------
export type IslandId = 'sons' | 'nombres' | 'robots' | 'monde' | 'ailleurs'

export interface IslandDef {
  id: IslandId
  name: string
  emoji: string
  tagline: string
  /** Couleur d'accent CSS (hex) utilisée pour les cartes et l'île */
  accent: string
}

// ---------- Jeux ----------
export type GameStatus = 'v2' | 'classique'

export interface GameMeta {
  /** slug url-safe, ex: 'train-des-syllabes' */
  id: string
  title: string
  /** Phrase courte côté enfant/parent, en français */
  tagline: string
  /** Emoji représentant le jeu (identité visuelle V1 conservée : zéro asset image) */
  icon: string
  island: IslandId
  /** Couleur d'accent CSS du jeu */
  accent: string
  /** Compétences du skill-map exercées (jeux v2 uniquement) */
  skills: SkillId[]
  status: GameStatus
  /** Jeux classiques : chemin relatif vers la page V1, ex: 'v1/calcul-aventure.html' */
  href?: string
}

// ---------- Compétences (skill-map) ----------
export type SkillId = string
export type Domain = 'francais' | 'maths' | 'logique' | 'monde' | 'anglais' | 'arts'
export type LevelBand = 'gs' | 'cp' | 'ce1'

export interface SkillDef {
  id: SkillId
  /** Libellé court lisible par un parent */
  label: string
  /** Libellé/attendu officiel (programmes 2025) */
  official: string
  domain: Domain
  level: LevelBand
  /** Période scolaire indicative P1..P5 */
  period?: 1 | 2 | 3 | 4 | 5
  prereqs?: SkillId[]
}

// ---------- Maîtrise ----------
export type MasteryState = 'decouverte' | 'en-cours' | 'maitrise' | 'consolide'

export interface SkillProgress {
  /** Fenêtre glissante des 10 dernières réponses AU PREMIER ESSAI */
  window: { ok: boolean; ts: number }[]
  state: MasteryState
  /** Boîte de Leitner allégée : 0 = à revoir, 3 = consolidé */
  box: 0 | 1 | 2 | 3
  /** Timestamp de la prochaine révision suggérée */
  nextReview?: number
  totalAttempts: number
}

// ---------- Profils ----------
export interface Profile {
  id: string
  name: string
  emoji: string
  ageBand: '4-5' | '6-7'
  createdAt: number
}

// ---------- Audio ----------
/** Une entrée de corpus : id stable -> texte français. Les clips mp3 pré-générés
 *  portent le nom <id>.mp3 ; si absent du manifest audio, fallback Web Speech. */
export interface CorpusEntry {
  id: string
  text: string
  /** voix edge-tts : denise (consignes, défaut), eloise (mascotte/enfant), henri,
   *  sonia (anglais, en-GB) */
  voice?: 'denise' | 'eloise' | 'henri' | 'sonia'
}

export type SfxName =
  | 'tap'
  | 'correct'
  | 'wrong'
  | 'levelup'
  | 'whoosh'
  | 'coin'
  | 'pop'
  | 'slide'
  | 'fanfare'
  | 'magic'

// ---------- Sessions / fin de niveau ----------
export interface LevelResult {
  gameId: string
  /** Étoiles 1..3 calculées sur les PREMIERS essais uniquement */
  stars: 1 | 2 | 3
  firstTryCorrect: number
  total: number
}
