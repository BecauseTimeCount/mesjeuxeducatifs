// ============================================================
// Goutte 2.0 — la mascotte du Laboratoire de l'Eau en SVG riggé
// (gabarit Plume 2.0 : groupes nommés, clignement CSS, zéro asset).
// Sa teinte suit sa forme : eau, glace ou vapeur.
// ============================================================

export type GoutteTint = 'eau' | 'glace' | 'vapeur'

const SKY = '#5ab8f5'
const LAGOON = '#14a098'
const ICE = '#cdeefb'
const ICE_DEEP = '#8fd0ee'
const INK = '#1e3a4c'
const CORAL = '#ff7866'

const TINTS: Readonly<Record<GoutteTint, { top: string; bottom: string; opacity: number }>> = {
  eau: { top: SKY, bottom: LAGOON, opacity: 1 },
  glace: { top: ICE, bottom: ICE_DEEP, opacity: 1 },
  vapeur: { top: SKY, bottom: SKY, opacity: 0.75 },
}

export interface GoutteSvgProps {
  tint?: GoutteTint
  /** Goutte attend d'être touchée : yeux grands ouverts, sourire d'attente. */
  excited?: boolean
}

/** Goutte, nue (sans bouton) — le parent gère taille et interaction. */
export function GoutteSvg({ tint = 'eau', excited = false }: GoutteSvgProps) {
  const c = TINTS[tint]
  const gradId = `goutte-grad-${tint}`
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true" opacity={c.opacity}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.top} />
          <stop offset="100%" stopColor={c.bottom} />
        </linearGradient>
      </defs>

      {/* corps en larme */}
      <g data-part="body" className="plume-part animate-plume-breathe">
        <path
          d="M50,6 C50,6 20,44 20,63 a30,30 0 0 0 60,0 C80,44 50,6 50,6 Z"
          fill={`url(#${gradId})`}
        />
        {/* reflet */}
        <ellipse cx="38" cy="42" rx="7" ry="12" fill="white" opacity="0.35" transform="rotate(18 38 42)" />
        {tint === 'glace' && (
          <g stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.8">
            <path d="M62,38 v10 M57,43 h10" fill="none" />
          </g>
        )}
      </g>

      {/* visage */}
      <g data-part="face">
        <circle cx="40" cy="60" r={excited ? 8 : 7} fill="white" />
        <circle cx="60" cy="60" r={excited ? 8 : 7} fill="white" />
        <g data-part="pupils">
          <circle cx="40.5" cy="61" r="3.2" fill={INK} />
          <circle cx="60.5" cy="61" r="3.2" fill={INK} />
          <circle cx="41.7" cy="59.8" r="1" fill="white" />
          <circle cx="61.7" cy="59.8" r="1" fill="white" />
        </g>
        <g data-part="eyelids">
          <circle cx="40" cy="60" r="8.2" fill={c.top} className="plume-part plume-lid animate-plume-blink" />
          <circle cx="60" cy="60" r="8.2" fill={c.top} className="plume-part plume-lid animate-plume-blink" />
        </g>
        {/* joues */}
        <circle cx="31" cy="68" r="3.5" fill={CORAL} opacity="0.4" />
        <circle cx="69" cy="68" r="3.5" fill={CORAL} opacity="0.4" />
        {/* sourire */}
        <path
          d={excited ? 'M43,72 Q50,79 57,72' : 'M45,72 Q50,76 55,72'}
          stroke={INK}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  )
}
