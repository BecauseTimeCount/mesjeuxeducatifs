import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Mascot } from '@/ui/Mascot'

export interface ArcadeErrorBoundaryProps {
  children: ReactNode
  /** Remonte la scène (passer une `key` au boundary pour réinitialiser son état). */
  onRetry?: () => void
}

interface State {
  failed: boolean
}

/**
 * Filet de sécurité autour d'une scène 3D : WebGL absent, chunk hors-ligne manquant,
 * exception dans un composant R3F → Plume « Oups ! » + retour aux jeux, jamais d'écran blanc.
 */
export class ArcadeErrorBoundary extends Component<ArcadeErrorBoundaryProps, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[arcade] scène en erreur', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <Mascot mood="oops" size={120} />
        <p className="text-2xl font-extrabold text-ink">Oups ! La scène n’a pas pu s’afficher.</p>
        <div className="flex flex-wrap justify-center gap-3">
          {this.props.onRetry && (
            <button
              type="button"
              onClick={this.props.onRetry}
              className="tap-target rounded-full bg-lagoon-500 px-6 text-lg font-extrabold text-white shadow-card"
            >
              Encore
            </button>
          )}
          <a href="#/" className="tap-target flex items-center rounded-full bg-white px-6 text-lg font-extrabold text-ink shadow-card">
            Mes jeux
          </a>
        </div>
      </div>
    )
  }
}
