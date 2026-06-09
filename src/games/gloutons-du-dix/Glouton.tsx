import type { ReactNode } from 'react'

// ============================================================
// Le Glouton — créature 100 % CSS (zéro asset image) :
// corps violet patate, grands yeux expressifs, bouche ronde
// qui mâche, ventre blanc qui affiche la cible, cœur roté.
// ============================================================

export type GloutonMood = 'idle' | 'chew' | 'happy' | 'grimace'

export interface GloutonProps {
  mood: GloutonMood
  /** largeur du glouton en pixels */
  size?: number
  /** contenu affiché sur le ventre (cible, déjà mangé…) */
  belly?: ReactNode
  /** incrémenter → un petit cœur 💜 s'échappe de la bouche */
  heartBurst?: number
  /** incrémenter → le ventre rebondit (avalage) */
  gulpKey?: number
}

const INK = '#2b1b4d'

function Eye({ size, mood, side }: { size: number; mood: GloutonMood; side: 'left' | 'right' }) {
  if (mood === 'happy') {
    // Yeux fermés de bonheur : deux arcs ^ ^
    return (
      <div
        style={{
          width: size * 0.16,
          height: size * 0.09,
          borderTop: `${Math.max(3, size * 0.035)}px solid ${INK}`,
          borderRadius: '50% 50% 0 0',
        }}
      />
    )
  }
  if (mood === 'grimace') {
    // Yeux plissés de dégoût : deux traits penchés
    return (
      <div
        style={{
          width: size * 0.15,
          height: Math.max(4, size * 0.045),
          background: INK,
          borderRadius: size,
          transform: side === 'left' ? 'rotate(16deg)' : 'rotate(-16deg)',
        }}
      />
    )
  }
  const wide = mood === 'chew'
  return (
    <div
      className="flex items-end justify-center"
      style={{
        width: size * (wide ? 0.19 : 0.17),
        height: size * (wide ? 0.19 : 0.17),
        background: 'white',
        borderRadius: '50%',
        boxShadow: 'inset 0 -2px 4px rgba(43, 27, 77, 0.15)',
      }}
    >
      <div
        style={{
          width: size * 0.08,
          height: size * 0.08,
          background: INK,
          borderRadius: '50%',
          marginBottom: size * 0.02,
        }}
      />
    </div>
  )
}

/** Keyframes locales du jeu — à monter UNE fois dans l'écran de jeu. */
export function GdxStyles() {
  return (
    <style>{`
@keyframes gdx-chomp {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.4); }
}
.gdx-chomp { animation: gdx-chomp 0.32s ease-in-out infinite; transform-origin: 50% 80%; }
@keyframes gdx-heart {
  0% { transform: translate(-50%, 0) scale(0.4); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translate(-50%, -84px) scale(1.4); opacity: 0; }
}
.gdx-heart { animation: gdx-heart 1.5s ease-out both; pointer-events: none; }
`}</style>
  )
}

export function Glouton({ mood, size = 170, belly, heartBurst = 0, gulpKey = 0 }: GloutonProps) {
  const wrapAnim =
    mood === 'grimace'
      ? 'animate-shake-soft'
      : mood === 'happy'
        ? 'animate-bounce-in'
        : mood === 'idle'
          ? 'animate-floaty'
          : ''
  const mouthW =
    size * (mood === 'chew' ? 0.42 : mood === 'happy' ? 0.36 : 0.3)
  const mouthH = mood === 'chew' ? size * 0.28 : mood === 'happy' ? size * 0.13 : size * 0.15

  return (
    <div
      className={`relative shrink-0 ${wrapAnim}`}
      style={{ width: size, height: size * 1.06 }}
      role="img"
      aria-label="Le glouton"
    >
      {/* Corps patate */}
      <div
        className="absolute inset-0"
        style={{
          borderRadius: '48% 48% 44% 44% / 54% 54% 42% 42%',
          background:
            'radial-gradient(circle at 32% 24%, #b39ddb 0%, #9575cd 40%, #7e57c2 72%, #5e35b1 100%)',
          boxShadow: 'var(--shadow-card)',
        }}
      />

      {/* Joues roses */}
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          top: size * 0.33,
          left: size * 0.07,
          width: size * 0.13,
          height: size * 0.09,
          background: 'rgba(255, 160, 180, 0.55)',
          borderRadius: '50%',
          filter: 'blur(1px)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          top: size * 0.33,
          right: size * 0.07,
          width: size * 0.13,
          height: size * 0.09,
          background: 'rgba(255, 160, 180, 0.55)',
          borderRadius: '50%',
          filter: 'blur(1px)',
        }}
      />

      {/* Yeux */}
      <div
        aria-hidden="true"
        className="absolute flex w-full items-center justify-center"
        style={{ top: size * 0.16, gap: size * 0.12 }}
      >
        <Eye size={size} mood={mood} side="left" />
        <Eye size={size} mood={mood} side="right" />
      </div>

      {/* Bouche ronde (mâche en mood 'chew') */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: size * 0.36 }}
      >
        <div
          className={mood === 'chew' ? 'gdx-chomp' : ''}
          style={{
            width: mouthW,
            height: mouthH,
            background: INK,
            borderRadius: mood === 'happy' ? `0 0 ${size}px ${size}px` : '50%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            overflow: 'hidden',
            transition: 'width 0.15s ease, height 0.15s ease',
          }}
        >
          {/* Langue */}
          <div
            style={{
              width: mouthW * 0.55,
              height: Math.max(6, mouthH * 0.45),
              background: '#ff8a9d',
              borderRadius: '50% 50% 0 0',
              marginBottom: -mouthH * 0.1,
            }}
          />
        </div>
        {mood === 'grimace' && (
          <div
            className="animate-pop absolute left-1/2 -translate-x-1/2"
            style={{ top: mouthH * 0.65, fontSize: size * 0.2, lineHeight: 1 }}
          >
            👅
          </div>
        )}
      </div>

      {/* Ventre blanc : la cible vit ici */}
      <div
        key={`belly-${gulpKey}`}
        className={`absolute left-1/2 flex -translate-x-1/2 items-center justify-center ${gulpKey > 0 ? 'animate-pop' : ''}`}
        style={{
          bottom: size * 0.03,
          width: size * 0.6,
          height: size * 0.43,
          background: 'rgba(255, 255, 255, 0.94)',
          borderRadius: '46%',
          color: 'var(--color-ink)',
          boxShadow: 'inset 0 2px 6px rgba(43, 27, 77, 0.12)',
          overflow: 'hidden',
        }}
      >
        {belly}
      </div>

      {/* Cœur roté après un GLOUP réussi */}
      {heartBurst > 0 && (
        <div
          key={`heart-${heartBurst}`}
          aria-hidden="true"
          className="gdx-heart absolute left-1/2"
          style={{ top: size * 0.3, fontSize: size * 0.22, lineHeight: 1 }}
        >
          💜
        </div>
      )}
    </div>
  )
}
