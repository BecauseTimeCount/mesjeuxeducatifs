import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, type Group } from 'three'
import type { GloutonClip } from '../store'

/**
 * Animation procédurale d'un glouton (GLB statique ou primitives) par refs, jamais de setState :
 * idle = respiration, eat = mâche (squash), happy = sauts, oops = hoquet (wobble).
 * `group` porte position/rotation, `body` porte l'échelle. Retourne le facteur bouche (1 = repos).
 */
export function useBlobMotion(
  clip: GloutonClip,
  group: RefObject<Group | null>,
  body: RefObject<Group | null>,
  baseY: number,
): RefObject<number> {
  const t = useRef(0)
  const mouth = useRef(1)
  useFrame((_, delta) => {
    t.current += delta
    const g = group.current
    const b = body.current
    if (!g || !b) return
    const tt = t.current
    let sy = 1
    let sx = 1
    let y = 0
    let rz = 0
    let mouthS = 1
    switch (clip) {
      case 'idle':
        sy = 1 + Math.sin(tt * 2.2) * 0.02
        sx = 1 - Math.sin(tt * 2.2) * 0.012
        break
      case 'eat':
        sy = 1 - Math.abs(Math.sin(tt * 11)) * 0.12
        sx = 1 + Math.abs(Math.sin(tt * 11)) * 0.08
        mouthS = 1 + Math.abs(Math.sin(tt * 11)) * 0.6
        break
      case 'happy':
        y = Math.abs(Math.sin(tt * 6)) * 0.35
        sy = 1 + Math.sin(tt * 12) * 0.05
        mouthS = 1.4
        break
      case 'oops':
        rz = Math.sin(tt * 14) * 0.12
        sy = 1 + Math.sin(tt * 14) * 0.06
        mouthS = 0.6
        break
    }
    b.scale.x = MathUtils.damp(b.scale.x, sx, 12, delta)
    b.scale.z = b.scale.x
    b.scale.y = MathUtils.damp(b.scale.y, sy, 12, delta)
    g.position.y = MathUtils.damp(g.position.y, baseY + y, 14, delta)
    g.rotation.z = MathUtils.damp(g.rotation.z, rz, 12, delta)
    mouth.current = MathUtils.damp(mouth.current, mouthS, 12, delta)
  })
  return mouth
}
