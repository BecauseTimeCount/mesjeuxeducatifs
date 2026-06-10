// ============================================================
// La Lettre Magique — définitions des tracés (données pures).
//
// Coordonnées normalisées 0-100, y vers le bas (écran). Repères
// Seyès simplifiés :
//   y = 50 : ligne de base (les lettres sont posées dessus)
//   y = 30 : interligne (haut du corps des lettres)
//   y = 10 : sommet des grandes boucles (l) ; y ≈ 16-22 : t et d
//
// Chaque tracé est une polyligne ORDONNÉE (≥ 15 points) qui
// échantillonne le geste CONTINU — la cursive se trace sans lever
// le doigt. Le point [0] est le départ (l'étoile). Les courbes
// sont composées par générateurs (lignes + arcs) puis rééchantillonnées
// par longueur d'arc : continuité et sens de rotation garantis par
// construction. Les rondes (rond, c, o, a, d) tournent dans le sens
// de l'écriture : ANTI-HORAIRE à l'écran (aire signée négative).
// ============================================================

import { resample } from './logic'
import type { Atelier, Pt } from './logic'

export interface StrokeDef {
  id: string
  /** Nom côté enfant, en français (« la grande boucle », « la lettre e »). */
  name: string
  atelier: Atelier
  /** Famille de geste (déblocage des lettres famille par famille). */
  family: string
  points: Pt[]
}

// ------------------------------------------------------------
// Générateurs géométriques
// ------------------------------------------------------------

function line(a: Pt, b: Pt, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / n,
    y: a.y + ((b.y - a.y) * i) / n,
  }))
}

/**
 * Arc d'ellipse en degrés, convention écran (0° = droite, 90° = bas).
 * Angle DÉCROISSANT = anti-horaire visuellement (sens de l'écriture
 * des rondes), CROISSANT = horaire (sommet des ponts).
 */
function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fromDeg: number,
  toDeg: number,
  n: number,
): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / n) * Math.PI) / 180
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  })
}

/** Concatène des segments en supprimant les joints dupliqués. */
function path(...segs: Pt[][]): Pt[] {
  const out: Pt[] = []
  for (const seg of segs) {
    for (const p of seg) {
      const last = out[out.length - 1]
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.25) out.push(p)
    }
  }
  return out
}

function round1(p: Pt): Pt {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }
}

/** Polyligne finale : rééchantillonnée régulièrement, coordonnées arrondies. */
function pts(raw: Pt[], n = 28): Pt[] {
  return resample(raw, n).map(round1)
}

/**
 * La boucle cursive (e, l, formes boucles) : départ sur la ligne de base,
 * montée oblique vers la droite, boucle ANTI-HORAIRE au sommet, descente
 * qui croise la montée, petite courbe de sortie vers la droite.
 */
function boucle(sx: number, topY: number, w: number): Pt[] {
  const r = w * 0.3
  const joinY = topY + 3
  const downX = sx + w - 2 * r
  return path(
    line({ x: sx, y: 50 }, { x: sx + w, y: joinY }, 8),
    arc(sx + w - r, joinY, r, 3, 0, -180, 8),
    line({ x: downX, y: joinY }, { x: downX, y: 44 }, 5),
    arc(downX + 6, 44, 6, 6, 180, 70, 6),
  )
}

/** Arche de pont (sens HORAIRE au sommet, comme le geste du pont). */
function arche(cx: number, footY: number, rx: number, ry: number): Pt[] {
  return arc(cx, footY, rx, ry, 180, 360, 10)
}

// ------------------------------------------------------------
// Atelier « Formes magiques » (GS) — fr.gs.graphisme.formes
// ------------------------------------------------------------

export const FORME_STROKES: StrokeDef[] = [
  {
    id: 'grande-boucle',
    name: 'La grande boucle',
    atelier: 'formes',
    family: 'boucles',
    points: pts(boucle(28, 12, 20), 30),
  },
  {
    id: 'petite-boucle',
    name: 'La petite boucle',
    atelier: 'formes',
    family: 'boucles',
    points: pts(boucle(32, 30, 16), 24),
  },
  {
    id: 'pont',
    name: 'Le pont',
    atelier: 'formes',
    family: 'ponts',
    points: pts(
      path(
        line({ x: 35, y: 50 }, { x: 35, y: 38 }, 4),
        arc(43, 38, 8, 8, 180, 360, 10),
        line({ x: 51, y: 38 }, { x: 51, y: 50 }, 4),
      ),
      24,
    ),
  },
  {
    id: 'trois-ponts',
    name: 'Les trois ponts',
    atelier: 'formes',
    family: 'ponts',
    points: pts(path(arche(28, 50, 8, 20), arche(44, 50, 8, 20), arche(60, 50, 8, 20)), 32),
  },
  {
    id: 'vague',
    name: 'La vague',
    atelier: 'formes',
    family: 'vagues',
    points: pts(
      path(arc(30, 40, 8, 8, 180, 360, 10), arc(46, 40, 8, 8, 180, 0, 10)),
      24,
    ),
  },
  {
    id: 'trois-vagues',
    name: 'Les trois vagues',
    atelier: 'formes',
    family: 'vagues',
    points: pts(
      path(
        arc(20, 40, 6, 6, 180, 360, 8),
        arc(32, 40, 6, 6, 180, 0, 8),
        arc(44, 40, 6, 6, 180, 360, 8),
        arc(56, 40, 6, 6, 180, 0, 8),
        arc(68, 40, 6, 6, 180, 360, 8),
        arc(80, 40, 6, 6, 180, 0, 8),
      ),
      36,
    ),
  },
  {
    id: 'rond',
    name: 'Le rond',
    atelier: 'formes',
    family: 'rondes',
    // Départ en haut à droite, tour complet ANTI-HORAIRE (sens de l'écriture !)
    points: pts(arc(50, 40, 11, 10, -60, -420, 24), 28),
  },
  {
    id: 'canne',
    name: 'La canne',
    atelier: 'formes',
    family: 'cannes',
    // Grand trait montant, petit crochet vers la gauche au sommet.
    points: pts(path(line({ x: 30, y: 50 }, { x: 56, y: 24 }, 10), arc(52, 21, 5, 5, 37, -120, 8)), 22),
  },
]

// ------------------------------------------------------------
// Atelier « Lettres cursives » (CP) — fr.cp.ecriture.cursive
// Ordre d'apprentissage officiel, par familles de geste.
// ------------------------------------------------------------

/** Sortie standard d'une lettre : courbe douce qui remonte vers la droite. */
function sortie(fromX: number): Pt[] {
  return arc(fromX + 6, 44, 6, 6, 180, 70, 6)
}

export const LETTRE_STROKES: StrokeDef[] = [
  {
    id: 'e',
    name: 'la lettre e',
    atelier: 'lettres',
    family: 'boucles',
    points: pts(boucle(36, 30, 13), 22),
  },
  {
    id: 'l',
    name: 'la lettre l',
    atelier: 'lettres',
    family: 'boucles',
    points: pts(boucle(32, 12, 18), 30),
  },
  {
    id: 'i',
    name: 'la lettre i',
    atelier: 'lettres',
    family: 'coupes',
    points: pts(
      path(line({ x: 32, y: 50 }, { x: 45, y: 31 }, 7), line({ x: 45, y: 31 }, { x: 45, y: 44 }, 5), sortie(45)),
      20,
    ),
  },
  {
    id: 'u',
    name: 'la lettre u',
    atelier: 'lettres',
    family: 'coupes',
    points: pts(
      path(
        line({ x: 26, y: 50 }, { x: 38, y: 31 }, 6),
        line({ x: 38, y: 31 }, { x: 38, y: 42 }, 4),
        arc(45, 42, 7, 8, 180, 0, 10),
        line({ x: 52, y: 42 }, { x: 52, y: 31 }, 4),
        line({ x: 52, y: 31 }, { x: 52, y: 44 }, 5),
        sortie(52),
      ),
      30,
    ),
  },
  {
    id: 't',
    name: 'la lettre t',
    atelier: 'lettres',
    family: 'coupes',
    points: pts(
      path(line({ x: 30, y: 50 }, { x: 46, y: 22 }, 9), line({ x: 46, y: 22 }, { x: 46, y: 44 }, 7), sortie(46)),
      24,
    ),
  },
  {
    id: 'c',
    name: 'la lettre c',
    atelier: 'lettres',
    family: 'rondes',
    // Ouvert à droite, tracé anti-horaire, petite sortie.
    points: pts(path(arc(46, 40, 10, 10, -55, -295, 18), line({ x: 50.2, y: 49.1 }, { x: 56, y: 46 }, 3)), 24),
  },
  {
    id: 'o',
    name: 'la lettre o',
    atelier: 'lettres',
    family: 'rondes',
    points: pts(arc(46, 40, 10, 10, -55, -415, 22), 26),
  },
  {
    id: 'a',
    name: 'la lettre a',
    atelier: 'lettres',
    family: 'rondes',
    // Le rond anti-horaire, puis la petite canne à droite.
    points: pts(
      path(
        arc(43, 40, 9, 9, -50, -410, 18),
        line({ x: 48.8, y: 33.1 }, { x: 52, y: 31 }, 2),
        line({ x: 52, y: 31 }, { x: 52, y: 44 }, 5),
        sortie(52),
      ),
      30,
    ),
  },
  {
    id: 'd',
    name: 'la lettre d',
    atelier: 'lettres',
    family: 'rondes',
    // Le rond, puis la grande tige montée et redescendue.
    points: pts(
      path(
        arc(43, 40, 9, 9, -50, -410, 18),
        line({ x: 48.8, y: 33.1 }, { x: 52, y: 30 }, 2),
        line({ x: 52, y: 30 }, { x: 52, y: 16 }, 5),
        line({ x: 52, y: 16 }, { x: 52, y: 44 }, 9),
        sortie(52),
      ),
      34,
    ),
  },
  {
    id: 'm',
    name: 'la lettre m',
    atelier: 'lettres',
    family: 'ponts',
    points: pts(
      path(
        line({ x: 24, y: 50 }, { x: 24, y: 40 }, 3),
        arc(31, 40, 7, 10, 180, 360, 8),
        line({ x: 38, y: 40 }, { x: 38, y: 50 }, 3),
        line({ x: 38, y: 50 }, { x: 38, y: 40 }, 3),
        arc(45, 40, 7, 10, 180, 360, 8),
        line({ x: 52, y: 40 }, { x: 52, y: 50 }, 3),
        line({ x: 52, y: 50 }, { x: 52, y: 40 }, 3),
        arc(59, 40, 7, 10, 180, 360, 8),
        line({ x: 66, y: 40 }, { x: 66, y: 50 }, 3),
        line({ x: 66, y: 50 }, { x: 71, y: 46 }, 3),
      ),
      36,
    ),
  },
  {
    id: 'n',
    name: 'la lettre n',
    atelier: 'lettres',
    family: 'ponts',
    points: pts(
      path(
        line({ x: 32, y: 50 }, { x: 32, y: 40 }, 3),
        arc(39, 40, 7, 10, 180, 360, 8),
        line({ x: 46, y: 40 }, { x: 46, y: 50 }, 3),
        line({ x: 46, y: 50 }, { x: 46, y: 40 }, 3),
        arc(53, 40, 7, 10, 180, 360, 8),
        line({ x: 60, y: 40 }, { x: 60, y: 50 }, 3),
        line({ x: 60, y: 50 }, { x: 65, y: 46 }, 3),
      ),
      30,
    ),
  },
  {
    id: 's',
    name: 'la lettre s',
    atelier: 'lettres',
    family: 'serpent',
    // Montée oblique, descente bombée à droite, petit enroulé final.
    points: pts(
      [
        { x: 30, y: 50 },
        { x: 44, y: 31.5 },
        { x: 46.8, y: 34.5 },
        { x: 47.8, y: 38.5 },
        { x: 46.8, y: 43 },
        { x: 44, y: 47.5 },
        { x: 39.5, y: 49.5 },
        { x: 36.8, y: 47.5 },
        { x: 37.5, y: 44.8 },
        { x: 40, y: 43.8 },
      ],
      22,
    ),
  },
]

// ------------------------------------------------------------
// Familles & index
// ------------------------------------------------------------

export interface LetterFamily {
  id: string
  /** Nom côté enfant. */
  name: string
  emoji: string
  strokes: string[]
}

/** Ordre d'apprentissage : 2 étoiles sur une famille débloquent la suivante. */
export const LETTER_FAMILIES: LetterFamily[] = [
  { id: 'boucles', name: 'Les boucles', emoji: '🎀', strokes: ['e', 'l'] },
  { id: 'coupes', name: 'Les coupes', emoji: '⛷️', strokes: ['i', 'u', 't'] },
  { id: 'rondes', name: 'Les rondes', emoji: '🌕', strokes: ['c', 'o', 'a', 'd'] },
  { id: 'ponts', name: 'Les ponts', emoji: '🌉', strokes: ['m', 'n'] },
  { id: 'serpent', name: 'Le serpent', emoji: '🐍', strokes: ['s'] },
]

export const ALL_STROKES: StrokeDef[] = [...FORME_STROKES, ...LETTRE_STROKES]

export const STROKES_BY_ID: ReadonlyMap<string, StrokeDef> = new Map(
  ALL_STROKES.map((s) => [s.id, s]),
)
