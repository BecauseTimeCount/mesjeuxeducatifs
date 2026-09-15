import { preloadGlb } from '@/arcade/useGlb'
import type { ActId } from './logic'

// ============================================================
// Assets 3D du jeu (public/arcade/food-truck-gloutons/) — générés par le pipeline
// arcade-direction.md §6 (GPT Image 2.5 → Tripo → ingest-glb.mjs). Tout est optionnel :
// chaque consommateur a un repli procédural en <Suspense fallback>.
// ============================================================

const BASE = '/arcade/food-truck-gloutons'

export const ASSETS = {
  gloup: `${BASE}/gloup-static.glb`,
  truck: `${BASE}/truck.glb`,
  palm: `${BASE}/palm.glb`,
  crate10: `${BASE}/crate10.glb`,
  backdropBeach: `${BASE}/backdrop-beach.webp`,
  clients: {
    purple: `${BASE}/client-purple.glb`,
    teal: `${BASE}/client-teal.glb`,
    coral: `${BASE}/client-coral.glb`,
    yellow: `${BASE}/client-yellow.glb`,
  },
} as const

export type ClientKind = keyof typeof ASSETS.clients
/** Clients dont le GLB est livré dans public/arcade (les autres tombent sur le glouton procédural). */
export const CLIENT_KINDS: readonly ClientKind[] = ['purple', 'teal', 'coral', 'yellow']

/** Précharge (au clic « Jouer ») les GLB de l'acte pour éviter les apparitions en cours de partie. */
export function preloadAct(act: ActId): void {
  preloadGlb(ASSETS.gloup)
  preloadGlb(ASSETS.truck)
  for (const kind of CLIENT_KINDS) preloadGlb(ASSETS.clients[kind])
  if (act === 1) preloadGlb(ASSETS.palm)
  if (act === 2 || act === 3) preloadGlb(ASSETS.crate10)
}
