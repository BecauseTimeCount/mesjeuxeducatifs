import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei/core/Gltf'
import type { AnimationClip, Group, Object3D } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Meshopt (décodeur WASM embarqué, hors-ligne) — jamais Draco (drei pointe un CDN gstatic).
const USE_DRACO = false
const USE_MESHOPT = true

export interface GlbAsset {
  /** Clone indépendant de la scène (SkeletonUtils : squelettes clonés correctement). */
  scene: Object3D
  animations: AnimationClip[]
}

/**
 * Charge un GLB (suspend) et retourne un clone par appelant : plusieurs instances du même
 * personnage (jumeaux) peuvent coexister avec leurs propres animations.
 */
export function useGlb(url: string): GlbAsset {
  const gltf = useGLTF(url, USE_DRACO, USE_MESHOPT)
  const scene = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene as Group)
    cloned.traverse((o) => {
      // Les SkinnedMesh ne mettent pas à jour leur boîte englobante : jamais de culling intempestif.
      if ('isSkinnedMesh' in o && (o as { isSkinnedMesh?: boolean }).isSkinnedMesh) o.frustumCulled = false
      if ('castShadow' in o) o.castShadow = true
    })
    return cloned
  }, [gltf.scene])
  return { scene, animations: gltf.animations }
}

/** Précharge un GLB avant le montage du Canvas (au clic « Jouer »). */
export function preloadGlb(url: string): void {
  useGLTF.preload(url, USE_DRACO, USE_MESHOPT)
}
