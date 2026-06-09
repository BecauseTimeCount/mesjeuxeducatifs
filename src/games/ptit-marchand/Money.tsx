// ============================================================
// Pièces et billets euro en CSS pur (zéro asset image).
// Fidèle aux vraies couleurs : 10c cuivre, 20c/50c or,
// 1 € centre argent + anneau or, 2 € centre or + anneau argent,
// billets 5 € vert / 10 € rouge.
// ============================================================

import type { Denom } from './logic'
import { denomLabel } from './logic'

const COPPER = 'radial-gradient(circle at 35% 30%, #e8b186, #b87333 60%, #8f5524)'
const GOLD = 'radial-gradient(circle at 35% 30%, #ffeaa8, #e6c14d 55%, #b8902e)'
const SILVER = 'radial-gradient(circle at 35% 30%, #f6f7f8, #cfd5da 55%, #99a3ac)'

interface CoinSpec {
  size: number
  ring: string
  center?: string
  text: string
  color: string
}

const COIN_SPECS: Record<Exclude<Denom, 500 | 1000>, CoinSpec> = {
  10: { size: 48, ring: COPPER, text: '10c', color: '#fff7ef' },
  20: { size: 52, ring: GOLD, text: '20c', color: '#6b4d10' },
  50: { size: 58, ring: GOLD, text: '50c', color: '#6b4d10' },
  // 1 € : anneau laiton doré, centre cupronickel argenté.
  100: { size: 56, ring: GOLD, center: SILVER, text: '1 €', color: '#3c4650' },
  // 2 € : anneau argenté, centre doré.
  200: { size: 62, ring: SILVER, center: GOLD, text: '2 €', color: '#6b4d10' },
}

interface BillSpec {
  bg: string
  border: string
  text: string
}

const BILL_SPECS: Record<500 | 1000, BillSpec> = {
  500: { bg: 'linear-gradient(135deg, #e3f1dc, #a8cda4 70%, #86b585)', border: '#5f8f63', text: '5 €' },
  1000: { bg: 'linear-gradient(135deg, #fbe3df, #e8a8a0 70%, #d98a83)', border: '#b25f5b', text: '10 €' },
}

export interface MoneyViewProps {
  denom: Denom
  /** Échelle visuelle (1 = taille standard du tiroir). */
  scale?: number
}

/** Une pièce ou un billet, purement décoratif (le bouton parent gère le tap). */
export function MoneyView({ denom, scale = 1 }: MoneyViewProps) {
  if (denom === 500 || denom === 1000) {
    const b = BILL_SPECS[denom]
    return (
      <span
        role="img"
        aria-label={denomLabel(denom)}
        className="relative inline-flex items-center justify-center rounded-lg shadow-card"
        style={{
          width: 86 * scale,
          height: 48 * scale,
          background: b.bg,
          border: `2px solid ${b.border}`,
        }}
      >
        <span
          aria-hidden="true"
          className="absolute left-1.5 font-bold opacity-50"
          style={{ fontSize: 11 * scale, color: b.border }}
        >
          €
        </span>
        <span className="font-extrabold text-ink" style={{ fontSize: 19 * scale }}>
          {b.text}
        </span>
        <span
          aria-hidden="true"
          className="absolute right-1.5 bottom-1 font-bold opacity-50"
          style={{ fontSize: 11 * scale, color: b.border }}
        >
          €
        </span>
      </span>
    )
  }

  const c = COIN_SPECS[denom]
  const size = c.size * scale
  return (
    <span
      role="img"
      aria-label={denomLabel(denom)}
      className="relative inline-flex items-center justify-center rounded-full shadow-card"
      style={{ width: size, height: size, background: c.ring }}
    >
      {c.center && (
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{ inset: size * 0.17, background: c.center }}
        />
      )}
      <span
        className="relative font-extrabold"
        style={{ fontSize: size * 0.3, color: c.color }}
      >
        {c.text}
      </span>
    </span>
  )
}
