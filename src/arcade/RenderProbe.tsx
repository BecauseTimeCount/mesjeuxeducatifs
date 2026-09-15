import { useFrame, useThree } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import { Box3, Vector3 } from 'three'

/** Dernières statistiques de rendu (draw calls, triangles) — lues par le hook DEV et les tests e2e. */
export const renderInfo = { calls: 0, triangles: 0, frames: 0 }

/** Accès DEV à l'état interne R3F (frameloop, caméra, taille) pour diagnostiquer un canvas muet. */
let getState: (() => RootState) | null = null
export function r3fDebug(name?: string): Record<string, unknown> | null {
  if (!getState) return null
  const s = getState()
  if (name) {
    const obj = s.scene.getObjectByName(name)
    if (!obj) return { name, found: false }
    const box = new Box3().setFromObject(obj)
    return { name, found: true, min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new Vector3()).toArray() }
  }
  return {
    frameloop: s.frameloop,
    size: [s.size.width, s.size.height],
    camera: s.camera.position.toArray(),
    sceneChildren: s.scene.children.length,
    glFrame: s.gl.info.render.frame,
    calls: s.gl.info.render.calls,
  }
}

/** Composant vide à placer dans le Canvas : copie gl.info.render à chaque frame. */
export function RenderProbe() {
  getState = useThree((s) => s.get)
  useFrame(({ gl }) => {
    renderInfo.calls = gl.info.render.calls
    renderInfo.triangles = gl.info.render.triangles
    renderInfo.frames += 1
  })
  return null
}
