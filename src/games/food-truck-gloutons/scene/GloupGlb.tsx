import { useEffect, useRef } from 'react'
import { Box3, type Group } from 'three'
import { useGlb } from '@/arcade/useGlb'
import type { GloutonClip } from '../store'
import { useBlobMotion } from './useBlobMotion'

/** GLB de Gloup : fiche personnage GPT Image 2.5 → Tripo H3.1 → gltf-transform (436 Ko, meshopt, webp). */
export const GLOUP_GLB = '/arcade/food-truck-gloutons/gloup-static.glb'
/** Le modèle est centré à l'origine et fait 1 m de haut : on le pose au sol. */
const GLB_LIFT = 0.5

export interface GloupGlbProps {
  clip: GloutonClip
  position?: readonly [number, number, number]
  /** hauteur finale ≈ scale (mètres monde) */
  scale?: number
  rotationY?: number
}

/**
 * Gloup en 3D « vrai » (un seul draw call) animé procéduralement (squash & stretch, sauts, hoquet).
 * Suspend pendant le chargement : à envelopper d'un <Suspense fallback={<Glouton3D …/>}>.
 */
export function GloupGlb({ clip, position = [0, 0, 0], scale = 1.6, rotationY = 0 }: GloupGlbProps) {
  const group = useRef<Group>(null)
  const body = useRef<Group>(null)
  const { scene } = useGlb(GLOUP_GLB)
  useBlobMotion(clip, group, body, position[1])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const box = new Box3().setFromObject(scene)
    console.info('[gloup] GLB local bounds', box.min.toArray().map((v) => v.toFixed(2)), box.max.toArray().map((v) => v.toFixed(2)))
  }, [scene])
  return (
    <group ref={group} name="gloup" position={[position[0], position[1], position[2]]} rotation={[0, rotationY, 0]} scale={scale}>
      <group ref={body}>
        <primitive object={scene} position={[0, GLB_LIFT, 0]} />
      </group>
    </group>
  )
}
