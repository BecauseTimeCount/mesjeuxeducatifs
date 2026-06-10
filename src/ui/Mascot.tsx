import type { CSSProperties } from 'react'

export type MascotMood = 'idle' | 'happy' | 'cheer' | 'thinking' | 'oops'

export interface MascotProps {
  mood?: MascotMood
  /** Diamètre de la bulle en pixels (défaut : 96) */
  size?: number
}

const MOOD_ANIMATION: Record<MascotMood, string> = {
  idle: 'animate-floaty',
  happy: 'animate-wiggle',
  cheer: 'animate-bounce-in',
  thinking: '',
  oops: '',
}

const CHEER_STARS: ReadonlyArray<{ style: CSSProperties; delay: number }> = [
  { style: { top: '-12%', left: '-8%' }, delay: 0 },
  { style: { top: '-18%', right: '-4%' }, delay: 0.12 },
  { style: { bottom: '-8%', left: '-16%' }, delay: 0.24 },
  { style: { bottom: '-14%', right: '-10%' }, delay: 0.36 },
]

// Palette de Plume : elle porte les couleurs de l'archipel (art-direction.md §5).
const BODY = '#14a098'
const BODY_DEEP = '#0e7490'
const CREAM = '#fdf6ec'
const CORAL = '#ff7866'
const SUN = '#ffc94d'
const SUN_DEEP = '#f0a818'
const GRAPE = '#9b7ede'
const INK = '#1e3a4c'

/** Rotations des groupes par humeur : { head, wingL, wingR, pupilsY, lidScale } */
const POSES: Record<
  MascotMood,
  { head: number; wingL: number; wingR: number; pupilsY: number; lids: number }
> = {
  idle: { head: 0, wingL: 0, wingR: 0, pupilsY: 0, lids: 0 },
  happy: { head: -4, wingL: -24, wingR: 24, pupilsY: 0, lids: 0 },
  cheer: { head: -6, wingL: 0, wingR: 0, pupilsY: -1.5, lids: 0 },
  thinking: { head: -10, wingL: -6, wingR: 30, pupilsY: -2.2, lids: 0 },
  oops: { head: 7, wingL: 14, wingR: -14, pupilsY: 1.6, lids: 0.45 },
}

/** Plume 2.0 — le perroquet de l'archipel en SVG riggé (groupes nommés, animés en CSS). */
function PlumeSvg({ mood }: { mood: MascotMood }) {
  const pose = POSES[mood]
  const blinking = mood !== 'oops'
  const flapping = mood === 'cheer'

  return (
    <svg viewBox="0 0 100 100" className="h-[78%] w-[78%]" aria-hidden="true">
      {/* ---- queue : trois plumes corail / soleil / raisin ---- */}
      <g data-part="tail">
        <ellipse cx="36" cy="84" rx="5" ry="13" fill={CORAL} transform="rotate(34 36 84)" />
        <ellipse cx="44" cy="88" rx="5" ry="14" fill={SUN} transform="rotate(18 44 88)" />
        <ellipse cx="53" cy="89" rx="5" ry="13" fill={GRAPE} transform="rotate(2 53 89)" />
      </g>

      {/* ---- corps (respire) ---- */}
      <g data-part="body" className="plume-part animate-plume-breathe">
        <ellipse cx="50" cy="60" rx="23" ry="26" fill={BODY} />
        <ellipse cx="50" cy="68" rx="14" ry="15" fill={CREAM} />
      </g>

      {/* ---- ailes (se lèvent, battent, retombent) ---- */}
      <g
        data-part="wing-left"
        className={`plume-part plume-wing ${flapping ? 'animate-plume-flap-l' : ''}`}
        style={{ transform: flapping ? undefined : `rotate(${pose.wingL}deg)` }}
      >
        <ellipse cx="29" cy="58" rx="8.5" ry="17" fill={CORAL} transform="rotate(14 29 58)" />
      </g>
      <g
        data-part="wing-right"
        className={`plume-part plume-wing ${flapping ? 'animate-plume-flap-r' : ''}`}
        style={{ transform: flapping ? undefined : `rotate(${pose.wingR}deg)` }}
      >
        <ellipse cx="71" cy="58" rx="8.5" ry="17" fill={CORAL} transform="rotate(-14 71 58)" />
      </g>

      {/* ---- tête (s'incline selon l'humeur) ---- */}
      <g
        data-part="head"
        className="plume-part"
        style={{ transform: `rotate(${pose.head}deg)` }}
      >
        {/* houppette aux couleurs des îles */}
        <ellipse cx="42" cy="11" rx="3.6" ry="7" fill={CORAL} transform="rotate(-24 42 11)" />
        <ellipse cx="50" cy="8" rx="3.6" ry="8" fill={SUN} />
        <ellipse cx="58" cy="11" rx="3.6" ry="7" fill={GRAPE} transform="rotate(24 58 11)" />

        <circle cx="50" cy="31" r="21" fill={BODY} />
        {/* joues */}
        <circle cx="34" cy="38" r="4" fill={CORAL} opacity="0.45" />
        <circle cx="66" cy="38" r="4" fill={CORAL} opacity="0.45" />

        {/* yeux : blanc + pupilles (regard mobile) + paupières (clignement) */}
        <circle cx="41" cy="29" r="7" fill="white" />
        <circle cx="59" cy="29" r="7" fill="white" />
        <g
          data-part="pupils"
          className="plume-part"
          style={{ transform: `translateY(${pose.pupilsY}px)` }}
        >
          <circle cx="41.5" cy="30" r="3.1" fill={INK} />
          <circle cx="59.5" cy="30" r="3.1" fill={INK} />
          <circle cx="42.7" cy="28.8" r="1" fill="white" />
          <circle cx="60.7" cy="28.8" r="1" fill="white" />
        </g>
        <g data-part="eyelids">
          <circle
            cx="41"
            cy="29"
            r="7.3"
            fill={BODY}
            className={`plume-part plume-lid ${blinking ? 'animate-plume-blink' : ''}`}
            style={{ transform: blinking ? undefined : `scaleY(${pose.lids})` }}
          />
          <circle
            cx="59"
            cy="29"
            r="7.3"
            fill={BODY}
            className={`plume-part plume-lid ${blinking ? 'animate-plume-blink' : ''}`}
            style={{ transform: blinking ? undefined : `scaleY(${pose.lids})` }}
          />
        </g>

        {/* sourcils tristes, seulement pour « oups » (déception douce) */}
        {mood === 'oops' && (
          <g data-part="brows" stroke={BODY_DEEP} strokeWidth="2" strokeLinecap="round">
            <path d="M36,20 L46,23" fill="none" />
            <path d="M64,20 L54,23" fill="none" />
          </g>
        )}

        {/* bec : le bas s'ouvre quand Plume est contente */}
        <g data-part="beak">
          <path d="M43,38 Q50,34 57,38 Q54,46 50,47 Q46,46 43,38 Z" fill={SUN} />
          <path
            d="M45.5,44.5 Q50,47.5 54.5,44.5 Q52.5,50 50,50.5 Q47.5,50 45.5,44.5 Z"
            fill={SUN_DEEP}
            className="plume-part"
            style={{
              transform:
                mood === 'happy' || mood === 'cheer' ? 'translateY(2px)' : undefined,
            }}
          />
        </g>
      </g>
    </svg>
  )
}

/** Plume le perroquet — la mascotte de l'archipel (SVG riggé, voir art-direction.md §5). */
export function Mascot({ mood = 'idle', size = 96 }: MascotProps) {
  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Plume le perroquet"
    >
      <div
        className={`flex h-full w-full items-center justify-center rounded-full shadow-card ${MOOD_ANIMATION[mood]}`}
        style={{
          background:
            'linear-gradient(150deg, var(--color-lagoon-100) 0%, var(--color-lagoon-50) 60%, white 100%)',
        }}
      >
        <PlumeSvg mood={mood} />
      </div>

      {mood === 'cheer' &&
        CHEER_STARS.map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="animate-pop absolute"
            style={{ ...s.style, fontSize: size * 0.22, animationDelay: `${s.delay}s` }}
          >
            ✨
          </span>
        ))}

      {mood === 'thinking' && (
        <span
          aria-hidden="true"
          className="animate-floaty absolute"
          style={{ top: '-16%', right: '-12%', fontSize: size * 0.34 }}
        >
          💭
        </span>
      )}
    </div>
  )
}
