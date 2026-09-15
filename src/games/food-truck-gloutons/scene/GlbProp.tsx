import { useGlb } from '@/arcade/useGlb'

export interface GlbPropProps {
  url: string
  position?: readonly [number, number, number]
  rotation?: readonly [number, number, number]
  scale?: number
  /** nom d'objet (mesures DEV via window.__app.r3f(name)) */
  name?: string
}

/**
 * Décor / accessoire statique en GLB (truck, palmier, caisse…) : un seul draw call par mesh du modèle.
 * Suspend au chargement : à envelopper d'un <Suspense fallback={…procédural…}>.
 */
export function GlbProp({ url, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, name }: GlbPropProps) {
  const { scene } = useGlb(url)
  return (
    <group name={name} position={[position[0], position[1], position[2]]} rotation={[rotation[0], rotation[1], rotation[2]]} scale={scale}>
      <primitive object={scene} />
    </group>
  )
}
