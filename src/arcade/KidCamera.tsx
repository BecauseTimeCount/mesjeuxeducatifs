import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { MathUtils } from 'three'
import { OrbitControls } from '@react-three/drei/core/OrbitControls'
import { PerspectiveCamera } from '@react-three/drei/core/PerspectiveCamera'

export interface KidCameraProps {
  position?: readonly [number, number, number]
  target?: readonly [number, number, number]
  /** Fov vertical de référence en paysage (degrés). */
  fov?: number
  /**
   * En portrait (aspect < 1), conserve le champ horizontal d'un écran 4:3 : le fov vertical s'élargit
   * (jusqu'à `maxFov`) puis la caméra recule le long de l'axe position→cible. La scène n'est jamais coupée
   * sur les côtés. Défaut true.
   */
  keepHorizontalFov?: boolean
  /** Fov vertical maximal avant de reculer la caméra (degrés, défaut 72). */
  maxFov?: number
  /** Largeur de scène (unités monde, au niveau de la cible) qui doit tenir dans l'écran. */
  fitWidth?: number
  /** En portrait, abaisse la cible (unités monde) pour laisser la place au HUD bas. */
  portraitLift?: number
  /** En paysage bas (< 520 px de haut), abaisse la cible. */
  shortLift?: number
  /** Orbite tactile autorisée (légère). */
  enableRotate?: boolean
  minPolar?: number
  maxPolar?: number
  /** Amplitude d'azimut autorisée autour de la position initiale (radians). */
  azimuthRange?: number
  rotateSpeed?: number
}

const REF_ASPECT = 4 / 3
const SHORT_HEIGHT = 520

/**
 * Caméra perspective + OrbitControls bornés (pas de pan, pas de zoom) : l'enfant ne perd jamais la scène.
 * Portrait / téléphone : champ horizontal conservé, recul automatique, cible abaissée.
 * Port de polyjay (skill r3f-web-game).
 */
export function KidCamera({
  position = [0, 10, 14],
  target = [0, 0, 0],
  fov = 42,
  keepHorizontalFov = true,
  maxFov = 72,
  fitWidth,
  portraitLift = 0,
  shortLift = 0,
  enableRotate = true,
  minPolar = Math.PI * 0.2,
  maxPolar = Math.PI * 0.46,
  azimuthRange = Math.PI * 0.22,
  rotateSpeed = 0.45,
}: KidCameraProps) {
  const size = useThree((s) => s.size)
  const aspect = size.height > 0 ? size.width / size.height : 1
  const [px, py, pz] = position
  const [tx, ty, tz] = target
  const portrait = aspect < 1
  const short = !portrait && size.height < SHORT_HEIGHT

  const { fovV, camPos, camTarget } = useMemo(() => {
    const lift = portrait ? portraitLift : short ? shortLift : 0
    const camTarget: [number, number, number] = [tx, ty - lift, tz]
    const dx = px - camTarget[0]
    const dy = py - camTarget[1]
    const dz = pz - camTarget[2]
    const dist = Math.hypot(dx, dy, dz) || 1
    let k = 1
    let fovV = fov
    const halfV = MathUtils.degToRad(fov) / 2

    if (keepHorizontalFov && portrait) {
      const wantedHalfH = Math.atan(Math.tan(halfV) * REF_ASPECT)
      const neededFov = MathUtils.radToDeg(2 * Math.atan(Math.tan(wantedHalfH) / aspect))
      fovV = Math.min(neededFov, maxFov)
      const actualHalfH = Math.atan(Math.tan(MathUtils.degToRad(fovV) / 2) * aspect)
      if (actualHalfH < wantedHalfH) k = Math.tan(wantedHalfH) / Math.tan(actualHalfH)
    }
    if (fitWidth) {
      const halfH = Math.atan(Math.tan(MathUtils.degToRad(fovV) / 2) * aspect)
      const needed = fitWidth / 2 / Math.tan(halfH)
      k = Math.max(k, needed / dist)
    }
    const camPos: [number, number, number] =
      k > 1 ? [camTarget[0] + dx * k, camTarget[1] + dy * k, camTarget[2] + dz * k] : [px, py, pz]
    return { fovV, camPos, camTarget }
  }, [fov, keepHorizontalFov, maxFov, portrait, short, aspect, tx, ty, tz, px, py, pz, portraitLift, shortLift, fitWidth])

  const azimuth = useMemo(
    () => Math.atan2(camPos[0] - camTarget[0], camPos[2] - camTarget[2]),
    [camPos, camTarget],
  )

  return (
    <>
      <PerspectiveCamera makeDefault fov={fovV} near={0.5} far={900} position={camPos} />
      <OrbitControls
        makeDefault
        target={camTarget}
        enablePan={false}
        enableZoom={false}
        enableRotate={enableRotate}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={rotateSpeed}
        minPolarAngle={minPolar}
        maxPolarAngle={maxPolar}
        minAzimuthAngle={azimuth - azimuthRange}
        maxAzimuthAngle={azimuth + azimuthRange}
      />
    </>
  )
}
