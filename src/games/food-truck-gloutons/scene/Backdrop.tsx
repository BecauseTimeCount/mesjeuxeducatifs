import { useTexture } from '@react-three/drei/core/Texture'
import { SRGBColorSpace, type Texture } from 'three'

export interface BackdropProps {
  /** webp 21:9 (public/arcade/<jeu>/…) */
  url: string
  /** largeur monde du plan (hauteur déduite du ratio 21:9) */
  width?: number
  position?: readonly [number, number, number]
}

/**
 * Décor de fond : panorama IA (arcade-direction.md §6.4) plaqué sur un grand plan derrière la scène,
 * sans éclairage (meshBasicMaterial) pour garder les couleurs de l'illustration. Suspend au chargement.
 */
export function Backdrop({ url, width = 60, position = [0, 9, -22] }: BackdropProps) {
  const tex = useTexture(url) as Texture
  tex.colorSpace = SRGBColorSpace
  const height = width * (9 / 21)
  return (
    <mesh position={[position[0], position[1], position[2]]} renderOrder={-10}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} fog={false} />
    </mesh>
  )
}

export function preloadBackdrop(url: string): void {
  useTexture.preload(url)
}
