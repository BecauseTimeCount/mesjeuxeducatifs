import { describe, expect, it } from 'vitest'
import corpus from './corpus.json'

// Smoke test : le module du jeu (et tout son graphe d'imports : engine,
// kit UI, manifest, corpus) se charge sans erreur et exporte un composant.
describe('calcul-aventure — module', () => {
  it('exporte un composant React par défaut', async () => {
    const mod = await import('./index')
    expect(typeof mod.default).toBe('function')
  })

  it('le corpus déclare la voix par défaut denise et des ids valides préfixés cav.', () => {
    expect(corpus['voice-default']).toBe('denise')
    const ids = corpus.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^cav\.[a-z0-9.-]+$/)
      expect(id).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
    }
  })

  it('les clips attendus par le jeu existent dans le corpus', () => {
    const ids = new Set(corpus.entries.map((e) => e.id))
    const required = [
      'cav.intro',
      'cav.niveau.0',
      'cav.niveau.1',
      'cav.niveau.2',
      'cav.niveau.3',
      'cav.consigne.et-encore',
      'cav.consigne.panier',
      'cav.consigne.tu-as',
      'cav.consigne.singe',
      'cav.consigne.donne',
      'cav.consigne.boite',
      'cav.consigne.tete',
      'cav.op.plus',
      'cav.op.moins',
      'cav.tape.total',
      'cav.tape.reste',
      'cav.boite.magique',
      'cav.singe.merci',
      'cav.oups',
      'cav.feedback.comptons',
      'cav.feedback.boite',
      'cav.feedback.ca-fait',
      'cav.feedback.atoi',
      'cav.indice',
      'cav.obj.coquillages',
      'cav.obj.ananas',
      'cav.obj.papillons',
      'cav.obj.champignons',
      'cav.obj.poissons',
      'cav.obj.cailloux',
      'cav.obj.diamants',
      'cav.obj.bijoux',
    ]
    for (const id of required) {
      expect(ids.has(id), `clip manquant : ${id}`).toBe(true)
    }
  })
})
