import { useLayoutEffect, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { MathUtils, Object3D, type Group, type InstancedMesh } from 'three'
import type { FoodItem } from '../logic'
import { mat, PALETTE } from './materials'

export interface FoodItem3DProps {
  item: FoodItem
  /** position sur le comptoir (non servi) */
  home: readonly [number, number, number]
  /** position dans le plateau (servi) */
  tray: readonly [number, number, number]
  selected: boolean
  glow: boolean
  disabled: boolean
  onTap: (id: number) => void
}

const dummy = new Object3D()

/** N boulettes empilées en UN draw call (InstancedMesh). */
function Balls({ count, material }: { count: number; material: ReturnType<typeof mat> }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0.16 + i * 0.1, 0)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  }, [count])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} material={material}>
      <sphereGeometry args={[0.1, 14, 10]} />
    </instancedMesh>
  )
}

/**
 * Plat tapable : brochette (bâton + N boulettes = la valeur, lisible sans chiffre),
 * caisse de 10 / 100 (boîte). Un hit-mesh invisible plus large que l'objet garantit
 * une cible ≥ 64 px à l'écran avec la caméra fixée. Glisse vers le plateau quand servi.
 */
export function FoodItem3D({ item, home, tray, selected, glow, disabled, onTap }: FoodItem3DProps) {
  const group = useRef<Group>(null)
  const pop = useRef(0)

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const target = selected ? tray : home
    g.position.x = MathUtils.damp(g.position.x, target[0], 9, delta)
    g.position.y = MathUtils.damp(g.position.y, target[1] + pop.current, 9, delta)
    g.position.z = MathUtils.damp(g.position.z, target[2], 9, delta)
    pop.current = MathUtils.damp(pop.current, 0, 6, delta)
    const s = glow ? 1 + Math.sin(performance.now() / 180) * 0.06 : 1
    g.scale.setScalar(MathUtils.damp(g.scale.x, s, 10, delta))
  })

  const handle = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    if (disabled) return
    pop.current = 0.35
    onTap(item.id)
  }

  const body = item.kind === 'brochette' ? PALETTE.meatball : PALETTE.wood
  const material = glow ? mat(body, { emissive: PALETTE.sun }) : mat(body)

  return (
    <group ref={group} position={[home[0], home[1], home[2]]}>
      {/* hit-mesh invisible : 1,4× la taille visible */}
      <mesh position={[0, 0.5, 0]} visible={false} onPointerDown={handle}>
        <boxGeometry args={[1.1, 1.3, 1.1]} />
      </mesh>
      {item.kind === 'brochette' ? (
        <group>
          <mesh position={[0, 0.5, 0]} material={mat(PALETTE.woodDark)} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 1.05, 8]} />
          </mesh>
          <Balls key={`${item.value}-${glow ? 'g' : 'n'}`} count={item.value} material={material} />
        </group>
      ) : (
        <group>
          <mesh position={[0, 0.22, 0]} material={material} castShadow>
            <boxGeometry args={[item.kind === 'caisse10' ? 0.7 : 0.95, 0.44, item.kind === 'caisse10' ? 0.5 : 0.7]} />
          </mesh>
          {/* couvercle lagon : une caisse = dix (ou cent) d'un coup */}
          <mesh position={[0, 0.46, 0]} material={mat(item.kind === 'caisse10' ? PALETTE.lagoon : PALETTE.lagoonDeep)}>
            <boxGeometry args={[item.kind === 'caisse10' ? 0.62 : 0.86, 0.06, item.kind === 'caisse10' ? 0.42 : 0.62]} />
          </mesh>
        </group>
      )}
    </group>
  )
}
