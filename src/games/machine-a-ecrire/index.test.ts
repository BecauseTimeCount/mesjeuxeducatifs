import { describe, expect, it } from 'vitest'
import corpus from './corpus.json'

// Smoke test : le module du jeu (et tout son graphe d'imports : engine,
// kit UI, manifest, corpus) se charge sans erreur et exporte un composant.
describe('machine-a-ecrire — module', () => {
  it('exporte un composant React par défaut', async () => {
    const mod = await import('./index')
    expect(typeof mod.default).toBe('function')
  })

  it('le corpus du jeu déclare la voix par défaut denise', () => {
    expect(corpus['voice-default']).toBe('denise')
    expect(corpus.entries.length).toBeGreaterThanOrEqual(100)
  })
})
