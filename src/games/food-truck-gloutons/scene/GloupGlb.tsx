import { useEffect, useRef } from 'react'
import { Box3, type Group } from 'three'
import { useGlb } from '@/arcade/useGlb'
import type { GloutonClip } from '../store'
import { useBlobMotion } from './useBlobMotion'

/** GLB de Gloup : fiche personnage GPT Image 2.5 → Tripo H3.1 → gltf-transform (436 Ko, meshopt, webp). */
export const GLOUP_GLB = '/arcade/food-truck-gloutons/gloup-static.glb'

export interface BlobGlbProps {
  url: string
  clip: GloutonClip
  position?: readonly [number, number, number]
  /** hauteur finale ≈ scale (les modèles Tripo font 1 m de haut, centrés à l'origine) */
  scale?: number
  rotationY?: number
  /** décalage vertical local pour poser le modèle au sol (Tripo : centré → +0.5) */
  lift?: number
  name?: string
}

/**
 * Personnage-blob en GLB statique (un seul draw call) animé procéduralement :
 * squash & stretch, sauts, hoquet (useBlobMotion). Suspend pendant le chargement.
 */
export function BlobGlb({ url, clip, position = [0, 0, 0], scale = 1.6, rotationY = 0, lift = 0.5, name }: BlobGlbProps) {
  const group = useRef<Group>(null)
  const body = useRef<Group>(null)
  const { scene } = useGlb(url)
  useBlobMotion(clip, group, body, position[1])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const box = new Box3().setFromObject(scene)
    console.info(`[${name ?? url}] GLB local bounds`, box.min.toArray().map((v) => v.toFixed(2)), box.max.toArray().map((v) => v.toFixed(2)))
  }, [scene, name, url])
  return (
    <group ref={group} name={name} position={[position[0], position[1], position[2]]} rotation={[0, rotationY, 0]} scale={scale}>
      <group ref={body}>
        <primitive object={scene} position={[0, lift, 0]} />
      </group>
    </group>
  )
}

export type GloupGlbProps = Omit<BlobGlbProps, 'url' | 'name'>

/** Gloup, le chef. */
export function GloupGlb(props: GloupGlbProps) {
  return <BlobGlb url={GLOUP_GLB} name="gloup" scale={1.9} {...props} />
}
