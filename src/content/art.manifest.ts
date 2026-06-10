import type { IslandId } from '@/engine/types'

// ============================================================
// Manifest des assets illustrés (bible : art-direction.md).
// Tout webp livré dans public/art/<île>/ est déclaré ici —
// c'est l'accès typé aux assets et la source du précache par île.
// ============================================================

export type ArtKind = 'decor' | 'object' | 'card'

export interface ArtAsset {
  /** Chemin sous BASE_URL — ex. 'art/nombres/nombres.hub.decor.webp' */
  path: string
  kind: ArtKind
  island: IslandId
  /** Id du jeu, ou 'hub' pour l'écran d'archipel. */
  game: string
}

export const ART_ASSETS: ArtAsset[] = [
  { path: 'art/nombres/nombres.hub.decor.webp', kind: 'decor', island: 'nombres', game: 'hub' },
]

export function artUrl(asset: ArtAsset): string {
  return import.meta.env.BASE_URL + asset.path
}

/** Décor d'un écran (jeu ou hub d'île), ou undefined si pas encore illustré. */
export function decorFor(island: IslandId, game = 'hub'): ArtAsset | undefined {
  return ART_ASSETS.find((a) => a.kind === 'decor' && a.island === island && a.game === game)
}
