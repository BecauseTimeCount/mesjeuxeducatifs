import { Html } from '@react-three/drei/web/Html'
import type { Order } from '../logic'

export interface OrderBubbleProps {
  order: Order
  /** point d'ancrage monde (au-dessus de la tête du client) */
  position: readonly [number, number, number]
}

/**
 * Bulle de commande accrochée au client : le nombre demandé en très gros (DOM via drei <Html>,
 * jamais de texte dans le canvas), et « déjà … » en dessous. pointer-events none : ne vole aucun tap.
 */
export function OrderBubble({ order, position }: OrderBubbleProps) {
  const q = order.question
  let big = ''
  let small = ''
  let icon = '🍢'
  switch (q.type) {
    case 'complement':
      big = String(q.target)
      small = q.given > 0 ? `déjà ${q.given}` : order.factor === 2 ? 'à deux' : ''
      break
    case 'exact':
      big = String(q.target)
      break
    case 'times':
      big = `${q.n} × ${q.k}`
      icon = '📦'
      break
    case 'howmany':
      big = String(q.total)
      small = `paquets de ${q.k} ?`
      icon = '📦'
      break
    case 'double':
      big = `2 × ${q.n}`
      break
    case 'half':
      big = `${q.n} ÷ 2`
      break
  }
  return (
    <Html position={[position[0], position[1], position[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="animate-bounce-in relative flex flex-col items-center rounded-3xl bg-white px-5 py-2 shadow-card ring-4 ring-sun" data-testid="ftg-bubble">
        <span className="text-4xl font-extrabold leading-none text-ink sm:text-5xl">
          <span aria-hidden className="mr-1 text-3xl">{icon}</span>
          {big}
        </span>
        {small && <span className="mt-1 text-base font-bold text-ink-soft sm:text-lg">{small}</span>}
        <span aria-hidden className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 bg-white" />
      </div>
    </Html>
  )
}
