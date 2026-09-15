import { r3fDebug, renderInfo } from '@/arcade/RenderProbe'
import { useFtg, type FtgState } from './store'

export interface FtgDevHook {
  game: 'food-truck-gloutons'
  state(): FtgState
  applySolution(): void
  startRun(service: number): void
  renderInfo(): { calls: number; triangles: number; frames: number }
  r3f(name?: string): Record<string, unknown> | null
}

declare global {
  interface Window {
    __app?: FtgDevHook
  }
}

/** Hook DEV / e2e (import.meta.env.DEV uniquement) : window.__app. Retourne le nettoyage. */
export function installDevHook(): () => void {
  window.__app = {
    game: 'food-truck-gloutons',
    state: () => useFtg.getState(),
    applySolution: () => useFtg.getState().applySolution(),
    startRun: (service) => useFtg.getState().startRun(service, true),
    renderInfo: () => ({ ...renderInfo }),
    r3f: (name) => r3fDebug(name),
  }
  return () => {
    delete window.__app
  }
}
