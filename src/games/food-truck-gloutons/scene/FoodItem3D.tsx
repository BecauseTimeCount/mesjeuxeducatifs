import { useLayoutEffect, useRef } from 'react'
import { AssetBoundary } from '@/arcade/AssetBoundary'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { MathUtils, Object3D, type Group, type InstancedMesh } from 'three'
import { ASSETS } from '../assets'
import type { FoodItem } from '../logic'
import { GlbProp } from './GlbProp'
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
/** GLB Tripo de la caisse : ~1 unité, centré → posé au sol à +0.5 ; largeur monde ≈ 0.9. */
const CRATE_SCALE = 0.9
const CRATE_LIFT = 0.26

/** Caisse procédurale (repli, et caisse de 100 / 1000) : boîte bois + couvercle lagon. */
function CrateBox({ kind, material }: { kind: FoodItem['kind']; material: ReturnType<typeof mat> }) {
  const small = kind === 'caisse10'
  return (
    <group>
      <mesh position={[0, 0.22, 0]} material={material} castShadow>
        <boxGeometry args={[small ? 0.7 : 0.95, 0.44, small ? 0.5 : 0.7]} />
      </mesh>
      <mesh position={[0, 0.46, 0]} material={mat(small ? PALETTE.lagoon : PALETTE.lagoonDeep)}>
        <boxGeometry args={[small ? 0.62 : 0.86, 0.06, small ? 0.42 : 0.62]} />
      </mesh>
    </group>
  )
}

/** N boulettes empilées en UN draw call (InstancedMesh). */
function Balls({ count, material }: { count: number; material: ReturnType<typeof mat> }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0.22 + i * 0.13, 0)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  }, [count])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} material={material}>
      <sphereGeometry args={[0.135, 16, 12]} />
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
      <mesh position={[0, 0.7, 0]} visible={false} onPointerDown={handle}>
        <boxGeometry args={[1.2, 1.7, 1.2]} />
      </mesh>
      {item.kind === 'brochette' ? (
        <group>
          <mesh position={[0, 0.72, 0]} material={mat(PALETTE.woodDark)} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 1.45, 8]} />
          </mesh>
          <Balls key={`${item.value}-${glow ? 'g' : 'n'}`} count={item.value} material={material} />
        </group>
      ) : item.kind === 'caisse10' ? (
        /* caisse de 10 brochettes : GLB Tripo (planche « aliments »), repli boîte pendant le chargement */
        <AssetBoundary fallback={<CrateBox kind={item.kind} material={material} />}>
          <GlbProp url={ASSETS.crate10} position={[0, CRATE_LIFT * CRATE_SCALE, 0]} scale={CRATE_SCALE} />
          {glow && (
            <mesh position={[0, 0.3, 0]} material={mat(PALETTE.sun, { emissive: PALETTE.sun })}>
              <torusGeometry args={[0.55, 0.04, 8, 32]} />
            </mesh>
          )}
        </AssetBoundary>
      ) : (
        <CrateBox kind={item.kind} material={material} />
      )}
    </group>
  )
}
