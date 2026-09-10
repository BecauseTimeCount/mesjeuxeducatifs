import { Instanced } from './Instanced'
import { mat, PALETTE } from './materials'

const STRIPES_TEAL = [0, 2, 4, 6].map((i) => ({ position: [-1.75 + i * 0.5, 0, 0] as const }))
const STRIPES_CREAM = [1, 3, 5, 7].map((i) => ({ position: [-1.75 + i * 0.5, 0, 0] as const }))
const WHEELS = [-2.4, 2.4].flatMap((x) =>
  [-1.35, 1.35].map((z) => ({ position: [x, 0.42, z] as const, rotation: [Math.PI / 2, 0, 0] as const })),
)

/** Food-truck procédural (repli sans GLB) : carrosserie orange, toit crème, auvent rayé, roues, comptoir. ~11 draw calls. */
export function Truck3D() {
  return (
    <group position={[0, 0, -3.2]}>
      {/* carrosserie */}
      <mesh position={[0, 1.25, 0]} material={mat(PALETTE.truck)} castShadow receiveShadow>
        <boxGeometry args={[6.4, 2.3, 2.6]} />
      </mesh>
      <mesh position={[0, 2.5, 0]} material={mat(PALETTE.cream)} castShadow>
        <boxGeometry args={[6.6, 0.3, 2.8]} />
      </mesh>
      {/* fenêtre de service (encre douce) */}
      <mesh position={[0.4, 1.55, 1.31]} material={mat('#4a6b80')}>
        <boxGeometry args={[3.6, 1.1, 0.04]} />
      </mesh>
      {/* cabine + pare-brise */}
      <mesh position={[-3.5, 0.9, 0]} material={mat(PALETTE.truck)} castShadow>
        <boxGeometry args={[1.4, 1.6, 2.4]} />
      </mesh>
      <mesh position={[-3.5, 1.5, 0]} material={mat(PALETTE.sky, { roughness: 0.35 })}>
        <boxGeometry args={[1.2, 0.6, 2.2]} />
      </mesh>
      {/* auvent rayé lagon / crème, haut et court pour ne pas cacher Gloup vu d'en haut */}
      <group position={[0.4, 2.85, 2.0]} rotation={[0.22, 0, 0]}>
        <Instanced items={STRIPES_TEAL} material={mat(PALETTE.lagoon)} castShadow>
          <boxGeometry args={[0.5, 0.08, 1.3]} />
        </Instanced>
        <Instanced items={STRIPES_CREAM} material={mat(PALETTE.cream)} castShadow>
          <boxGeometry args={[0.5, 0.08, 1.3]} />
        </Instanced>
      </group>
      {/* roues */}
      <Instanced items={WHEELS} material={mat(PALETTE.ink)} castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.3, 20]} />
      </Instanced>
      {/* comptoir en bois devant la fenêtre */}
      <mesh position={[0.4, 0.95, 1.75]} material={mat(PALETTE.wood)} castShadow receiveShadow>
        <boxGeometry args={[4.2, 0.16, 0.9]} />
      </mesh>
      <mesh position={[0.4, 0.45, 1.75]} material={mat(PALETTE.woodDark)} receiveShadow>
        <boxGeometry args={[4.0, 0.9, 0.7]} />
      </mesh>
    </group>
  )
}
