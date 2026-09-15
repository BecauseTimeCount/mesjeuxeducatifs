import type { ReactNode } from 'react'
import { Canvas, type CanvasProps } from '@react-three/fiber'
import { NoToneMapping, PCFShadowMap } from 'three'

// ============================================================
// Piste arcade — moteur 3D partagé (arcade-direction.md).
// N'importer ce dossier QUE depuis un jeu chargé en lazy : three
// ne doit jamais entrer dans le chunk initial de l'application.
// ============================================================

export interface GameCanvasProps extends Omit<CanvasProps, 'children' | 'gl'> {
  children: ReactNode
  /** Canvas transparent : le papier crème du body reste visible derrière la scène. Défaut true. */
  transparent?: boolean
}

/**
 * Canvas préconfiguré : dpr [1, 1.5] fixe (pas d'AdaptiveDpr : flou/net à chaque geste),
 * ombres PCF, sans tone mapping (couleurs de la palette respectées), touch-action none,
 * plein cadre absolu dans un parent `relative`.
 */
export function GameCanvas({ children, transparent = true, style, ...rest }: GameCanvasProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      shadows={{ type: PCFShadowMap, enabled: true }}
      gl={{
        antialias: true,
        alpha: transparent,
        toneMapping: NoToneMapping,
        powerPreference: 'high-performance',
      }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none', ...style }}
      {...rest}
    >
      {children}
    </Canvas>
  )
}
