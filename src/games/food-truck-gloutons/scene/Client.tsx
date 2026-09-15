import { AssetBoundary } from '@/arcade/AssetBoundary'
import { ASSETS, type ClientKind } from '../assets'
import type { GloutonClip } from '../store'
import { Glouton3D } from './Glouton3D'
import { BlobGlb } from './GloupGlb'

export interface ClientProps {
  /** GLB du client (planche « clients ») ; null = glouton procédural (boss, GLB non livré) */
  kind: ClientKind | null
  color: string
  clip: GloutonClip
  position: readonly [number, number, number]
  /** hauteur monde */
  scale: number
  sunglasses?: boolean
  rotationY?: number
}

/**
 * Client glouton : GLB Tripo quand il existe (chargement en Suspense, repli procédural pendant
 * le téléchargement et pour les boss), même animation par refs que Gloup.
 */
export function Client({ kind, color, clip, position, scale, sunglasses = false, rotationY = 0 }: ClientProps) {
  const fallback = (
    <Glouton3D color={color} clip={clip} position={position} scale={scale / 1.25} sunglasses={sunglasses} rotationY={rotationY} />
  )
  if (!kind) return fallback
  return (
    <AssetBoundary fallback={fallback}>
      <BlobGlb url={ASSETS.clients[kind]} name={`client-${kind}`} clip={clip} position={[position[0], position[1] + scale * 0.5, position[2]]} scale={scale} rotationY={rotationY} lift={0} />
    </AssetBoundary>
  )
}
