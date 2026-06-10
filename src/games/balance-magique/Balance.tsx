import type { CSSProperties, ReactNode } from 'react'
import type { Tilt, TokenKind } from './logic'

// ============================================================
// La balance du magicien — 100 % CSS/SVG (zéro asset image) :
// fléau doré qui s'incline, chaînes en pointillés, plateaux
// suspendus, joyau-verrou au centre (le sortilège), étincelles.
// ============================================================

/** demi-fléau en px (centre → point d'accroche d'un plateau) */
const HALF = 104
/** inclinaison du fléau quand un côté est plus lourd */
const TILT_DEG = 9
const DY = Math.round(Math.sin((TILT_DEG * Math.PI) / 180) * HALF)
const BEAM_Y = 30
const PLATE_W = 124
const CHAIN_H = 68

const SWING = 'transform 0.7s cubic-bezier(0.34, 1.46, 0.64, 1)'

const GOLD = 'linear-gradient(180deg, #ffe08a 0%, #e8b73c 45%, #a8791c 100%)'

/** Keyframes locales du jeu — à monter UNE fois dans l'écran de jeu. */
export function BmaStyles() {
  return (
    <style>{`
@keyframes bma-spark {
  0% { transform: translateY(0) scale(0.4); opacity: 0; }
  25% { opacity: 1; }
  100% { transform: translateY(-46px) scale(1.3); opacity: 0; }
}
.bma-spark { animation: bma-spark 1.2s ease-out both; pointer-events: none; }
@keyframes bma-glow {
  0%, 100% { opacity: 0.65; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.25); }
}
.bma-glow { animation: bma-glow 2s ease-in-out infinite; }
`}</style>
  )
}

// ------------------------------------------------------------
// Rendu d'un jeton (fruit, poids chiffré, barre de dix, cube)
// ------------------------------------------------------------

export interface TokenFaceProps {
  kind: TokenKind
  value: number
  emoji: string
  scale?: number
}

export function TokenFace({ kind, value, emoji, scale = 1 }: TokenFaceProps) {
  if (kind === 'weight') {
    // Gros poids du magicien : anse + corps en pierre, chiffre énorme.
    return (
      <span className="flex flex-col items-center" aria-hidden="true">
        <span
          className="block rounded-t-full border-[5px] border-b-0"
          style={{ width: 26 * scale, height: 14 * scale, borderColor: '#46586a' }}
        />
        <span
          className="flex items-center justify-center font-extrabold text-white"
          style={{
            width: 58 * scale,
            height: 48 * scale,
            fontSize: 27 * scale,
            borderRadius: `${10 * scale}px ${10 * scale}px ${14 * scale}px ${14 * scale}px`,
            background: 'linear-gradient(160deg, #6b7f92 0%, #46586a 55%, #2f3e4e 100%)',
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.35), 0 2px 5px rgba(30,58,76,0.35)',
          }}
        >
          {value}
        </span>
      </span>
    )
  }
  if (kind === 'bar') {
    // Barre de dix : 10 encoches visibles (l'équivalence se VOIT).
    return (
      <span
        className="flex overflow-hidden"
        style={{
          width: 58 * scale,
          height: 16 * scale,
          borderRadius: 5 * scale,
          background: 'linear-gradient(180deg, #42a5f5, #1565c0)',
          border: '1px solid rgba(13, 47, 92, 0.55)',
        }}
        aria-hidden="true"
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className="h-full flex-1"
            style={{ borderRight: i < 9 ? '1px solid rgba(255,255,255,0.55)' : 'none' }}
          />
        ))}
      </span>
    )
  }
  if (kind === 'cube') {
    return (
      <span
        className="block"
        style={{
          width: 15 * scale,
          height: 15 * scale,
          borderRadius: 4 * scale,
          background: 'linear-gradient(160deg, #ffb74d, #f57c00)',
          border: '1px solid rgba(120, 60, 0, 0.45)',
        }}
        aria-hidden="true"
      />
    )
  }
  return (
    <span aria-hidden="true" style={{ fontSize: 23 * scale, lineHeight: 1 }}>
      {emoji}
    </span>
  )
}

// ------------------------------------------------------------
// La balance
// ------------------------------------------------------------

export interface BalanceProps {
  /** côté qui descend — 'level' = à plat */
  tilt: Tilt
  /** le sortilège verrouille le fléau (joyau qui scintille) */
  locked: boolean
  /** incrémenter → pluie d'étincelles ✨ (équilibre réussi) */
  burst: number
  /** contenu du plateau gauche (magicien, non interactif) */
  left: ReactNode
  /** contenu du plateau droit (l'enfant pose/retire ici) */
  right: ReactNode
}

const SPARKS: ReadonlyArray<{ style: CSSProperties; delay: number; glyph: string }> = [
  { style: { left: '50%', top: 6 }, delay: 0, glyph: '✨' },
  { style: { left: '28%', top: 18 }, delay: 0.12, glyph: '⭐' },
  { style: { left: '70%', top: 16 }, delay: 0.2, glyph: '✨' },
  { style: { left: '14%', top: 40 }, delay: 0.3, glyph: '✨' },
  { style: { left: '84%', top: 38 }, delay: 0.38, glyph: '⭐' },
  { style: { left: '50%', top: 44 }, delay: 0.48, glyph: '🌟' },
]

function Plate({ side, tilt, children }: { side: 'left' | 'right'; tilt: Tilt; children: ReactNode }) {
  const dy = tilt === 'level' ? 0 : tilt === side ? DY : -DY
  return (
    <div
      className="absolute"
      style={{
        top: BEAM_Y + 7,
        left: `calc(50% ${side === 'left' ? '-' : '+'} ${HALF}px)`,
        width: PLATE_W,
        transform: `translate(-50%, ${dy}px)`,
        transition: SWING,
      }}
    >
      {/* Chaînes en pointillés + anneau d'accroche */}
      <svg width={PLATE_W} height={CHAIN_H} aria-hidden="true" className="block">
        <circle cx={PLATE_W / 2} cy={5} r={4} fill="none" stroke="#8a6d2f" strokeWidth={2.5} />
        <line
          x1={PLATE_W / 2} y1={8} x2={10} y2={CHAIN_H - 2}
          stroke="rgba(30,58,76,0.55)" strokeWidth={2.5} strokeDasharray="3 4" strokeLinecap="round"
        />
        <line
          x1={PLATE_W / 2} y1={8} x2={PLATE_W - 10} y2={CHAIN_H - 2}
          stroke="rgba(30,58,76,0.55)" strokeWidth={2.5} strokeDasharray="3 4" strokeLinecap="round"
        />
      </svg>
      {/* L'assiette du plateau */}
      <div
        className="h-[13px] w-full"
        style={{
          background: GOLD,
          borderRadius: '4px 4px 18px 18px',
          boxShadow: '0 3px 6px rgba(30,58,76,0.25)',
        }}
      />
      {/* Les jetons posés (empilés juste au-dessus de l'assiette) */}
      <div className="absolute inset-x-0 bottom-[11px] flex flex-wrap items-end justify-center gap-1 px-0.5">
        {children}
      </div>
    </div>
  )
}

export function Balance({ tilt, locked, burst, left, right }: BalanceProps) {
  const angle = tilt === 'left' ? -TILT_DEG : tilt === 'right' ? TILT_DEG : 0
  return (
    <div className="relative h-[215px] w-[340px] shrink-0 select-none">
      {/* Pied et socle */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 w-[12px] -translate-x-1/2 rounded-t-md"
        style={{ top: BEAM_Y + 8, bottom: 10, background: 'linear-gradient(90deg, #a07be0, #6c3fae 60%, #54307f)' }}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 h-[14px] w-[128px] -translate-x-1/2 rounded-full"
        style={{ background: 'linear-gradient(180deg, #8e44ad, #5e2d7a)', boxShadow: '0 3px 8px rgba(30,58,76,0.3)' }}
      />

      {/* Fléau */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 h-[12px] -translate-x-1/2 rounded-full"
        style={{
          top: BEAM_Y,
          width: HALF * 2 + 26,
          background: GOLD,
          boxShadow: '0 2px 5px rgba(30,58,76,0.3)',
          transform: `translateX(-50%) rotate(${angle}deg)`,
          transition: SWING,
        }}
      />

      {/* Joyau central : le sortilège qui bloque la balance */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: BEAM_Y - 4 }}
      >
        <div
          className="flex h-5 w-5 rotate-45 items-center justify-center rounded-[6px] border-2 border-white"
          style={{ background: 'radial-gradient(circle at 32% 30%, #c39bdf, #8e44ad 70%)' }}
        />
        {locked && (
          <span className="bma-glow absolute -top-5 left-1/2 -translate-x-1/2 text-base">✨</span>
        )}
      </div>

      {/* Plateaux */}
      <Plate side="left" tilt={tilt}>{left}</Plate>
      <Plate side="right" tilt={tilt}>{right}</Plate>

      {/* Pluie d'étincelles à l'équilibre */}
      {burst > 0 && (
        <div key={burst} aria-hidden="true" className="pointer-events-none absolute inset-0">
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className="bma-spark absolute text-2xl"
              style={{ ...s.style, animationDelay: `${s.delay}s` }}
            >
              {s.glyph}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
