import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Object3D, type InstancedMesh, type Material } from 'three'

export interface InstanceSpec {
  position: readonly [number, number, number]
  scale?: readonly [number, number, number] | number
  rotation?: readonly [number, number, number]
}

export interface InstancedProps {
  items: readonly InstanceSpec[]
  material: Material
  /** la géométrie (élément JSX <sphereGeometry …/>) */
  children: ReactNode
  castShadow?: boolean
  receiveShadow?: boolean
}

const dummy = new Object3D()

/** N copies d'une même géométrie/matériau en UN draw call (arcade-direction.md §7 : < 50 draw calls). */
export function Instanced({ items, material, children, castShadow = false, receiveShadow = false }: InstancedProps) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    items.forEach((it, i) => {
      dummy.position.set(it.position[0], it.position[1], it.position[2])
      const r = it.rotation ?? [0, 0, 0]
      dummy.rotation.set(r[0], r[1], r[2])
      const s = it.scale ?? 1
      if (typeof s === 'number') dummy.scale.setScalar(s)
      else dummy.scale.set(s[0], s[1], s[2])
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
    })
    im.instanceMatrix.needsUpdate = true
    im.computeBoundingSphere()
  }, [items])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} material={material} castShadow={castShadow} receiveShadow={receiveShadow}>
      {children}
    </instancedMesh>
  )
}
