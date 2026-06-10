import { describe, expect, it } from 'vitest'
import corpus from './corpus.json'
import { OBJECTS } from './logic'

// Smoke test : le module du jeu (et tout son graphe d'imports : engine,
// kit UI, manifest, corpus) se charge sans erreur et exporte un composant.
describe('boites-a-nombres — module', () => {
  it('exporte un composant React par défaut', async () => {
    const mod = await import('./index')
    expect(typeof mod.default).toBe('function')
  })

  it('le corpus déclare la voix par défaut denise et des ids préfixés ban.', () => {
    expect(corpus['voice-default']).toBe('denise')
    expect(corpus.entries.length).toBeGreaterThanOrEqual(30)
    for (const entry of corpus.entries) {
      expect(entry.id).toMatch(/^ban\.[a-z0-9.-]+$/)
      expect(entry.text.length).toBeGreaterThan(0)
      expect(['denise', 'eloise', 'henri']).toContain(entry.voice)
    }
  })

  it('chaque objet expédiable a ses deux clips (une / des)', () => {
    const ids = new Set(corpus.entries.map((e) => e.id))
    for (const obj of OBJECTS) {
      expect(ids.has(`ban.obj.${obj.key}.une`)).toBe(true)
      expect(ids.has(`ban.obj.${obj.key}.des`)).toBe(true)
    }
  })
})
