import { Component, Suspense, type ReactNode } from 'react'

export interface AssetBoundaryProps {
  /** rendu procédural pendant le chargement ET si l'asset manque (404, GLB corrompu) */
  fallback: ReactNode
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Asset 3D optionnel : Suspense pour le chargement + boundary local. Un GLB absent ou cassé
 * ne doit jamais faire tomber toute la scène (ArcadeErrorBoundary) : on garde le repli procédural.
 */
export class AssetBoundary extends Component<AssetBoundaryProps, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error): void {
    console.warn('[arcade] asset optionnel indisponible, repli procédural', error.message)
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>
  }
}
