import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import type { GloutonClip } from '../store'
import { Instanced } from './Instanced'
import { mat, PALETTE } from './materials'
import { useBlobMotion } from './useBlobMotion'

export interface Glouton3DProps {
  color?: string
  clip: GloutonClip
  position?: readonly [number, number, number]
  /** hauteur ≈ 1.25 × scale */
  scale?: number
  /** toque de chef (Gloup) */
  chef?: boolean
  /** lunettes de soleil (clients de la plage) */
  sunglasses?: boolean
  /** orientation (radians autour de Y) */
  rotationY?: number
}

const MOUTH_BASE: readonly [number, number, number] = [0.11, 0.09, 0.05]
const EYE_X = 0.19
const EYE_Y = 0.78
const EYE_Z = 0.44
const EYES = [-EYE_X, EYE_X].map((x) => ({ position: [x, EYE_Y, EYE_Z] as const, scale: 0.105 }))
const PUPILS = [-EYE_X, EYE_X].map((x) => ({ position: [x, EYE_Y - 0.01, EYE_Z + 0.085] as const, scale: 0.048 }))
const CHEEKS = [-0.36, 0.36].map((x) => ({ position: [x, 0.66, 0.36] as const, scale: [0.07, 0.045, 0.03] as const }))
const ARMS = [-0.5, 0.5].map((x) => ({ position: [x, 0.5, 0.05] as const, scale: [0.09, 0.16, 0.09] as const }))
const FEET = [-0.2, 0.2].map((x) => ({ position: [x, 0.05, 0.12] as const, scale: [0.14, 0.06, 0.16] as const }))

/**
 * Glouton procédural (repli sans GLB, arcade-direction.md §4) : patate violette, yeux énormes,
 * bouche ronde, ventre clair. Paires (yeux, joues, bras, pieds) instanciées : ~8 draw calls.
 * Animation partagée avec le GLB (useBlobMotion) + bouche.
 */
export function Glouton3D({
  color = PALETTE.grape,
  clip,
  position = [0, 0, 0],
  scale = 1,
  chef = false,
  sunglasses = false,
  rotationY = 0,
}: Glouton3DProps) {
  const group = useRef<Group>(null)
  const body = useRef<Group>(null)
  const mouth = useRef<Mesh>(null)
  const mouthS = useBlobMotion(clip, group, body, position[1])

  useFrame(() => {
    const m = mouth.current
    if (!m) return
    const s = mouthS.current
    m.scale.set(MOUTH_BASE[0] * s, MOUTH_BASE[1] * s, MOUTH_BASE[2] * s)
  })

  return (
    <group ref={group} position={[position[0], position[1], position[2]]} rotation={[0, rotationY, 0]} scale={scale}>
      <group ref={body}>
        {/* corps patate (origine au sol) */}
        <mesh position={[0, 0.62, 0]} scale={[0.5, 0.62, 0.48]} material={mat(color)} castShadow>
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
        {/* ventre clair */}
        <mesh position={[0, 0.42, 0.28]} scale={[0.3, 0.26, 0.2]} material={mat(PALETTE.cream)}>
          <sphereGeometry args={[1, 24, 16]} />
        </mesh>
        <Instanced items={EYES} material={mat(PALETTE.white, { roughness: 0.4 })}>
          <sphereGeometry args={[1, 20, 16]} />
        </Instanced>
        <Instanced items={PUPILS} material={mat(PALETTE.inkDeep)}>
          <sphereGeometry args={[1, 16, 12]} />
        </Instanced>
        {sunglasses && (
          <mesh position={[0, EYE_Y, EYE_Z + 0.08]} material={mat(PALETTE.ink, { roughness: 0.35 })}>
            <boxGeometry args={[0.62, 0.15, 0.06]} />
          </mesh>
        )}
        <Instanced items={CHEEKS} material={mat(PALETTE.cheek)}>
          <sphereGeometry args={[1, 12, 8]} />
        </Instanced>
        {/* bouche ronde */}
        <mesh ref={mouth} position={[0, 0.6, 0.47]} scale={MOUTH_BASE} material={mat(PALETTE.inkDeep)}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
        <Instanced items={ARMS} material={mat(color)}>
          <sphereGeometry args={[1, 12, 10]} />
        </Instanced>
        <Instanced items={FEET} material={mat(color)}>
          <sphereGeometry args={[1, 12, 8]} />
        </Instanced>
        {chef && (
          <group position={[0.06, 1.2, 0.02]} rotation={[0, 0, -0.12]}>
            <mesh position={[0, 0.06, 0]} material={mat(PALETTE.white, { roughness: 0.7 })}>
              <cylinderGeometry args={[0.22, 0.25, 0.14, 20]} />
            </mesh>
            <mesh position={[0, 0.24, 0]} scale={[0.3, 0.2, 0.3]} material={mat(PALETTE.white, { roughness: 0.7 })}>
              <sphereGeometry args={[1, 20, 14]} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  )
}
