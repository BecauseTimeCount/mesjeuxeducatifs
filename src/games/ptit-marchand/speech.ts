// ============================================================
// Le P'tit Marchand — assemblage des séquences vocales.
// PURE (aucun import React/DOM) : transforme items et montants
// en listes de CorpusEntry à enchaîner avec say().
// Les euros entiers réutilisent les clips communs 'nombre.<n>'.
// ============================================================

import { numberEntry } from '@/content/numbers'
import type { CorpusEntry } from '@/engine/types'
import corpus from './corpus.json'
import type { Item } from './logic'
import { splitPrice } from './logic'

function toVoice(v: string | undefined): CorpusEntry['voice'] {
  switch (v) {
    case 'denise':
    case 'eloise':
    case 'henri':
      return v
    default:
      return undefined
  }
}

const ENTRIES: ReadonlyMap<string, CorpusEntry> = new Map(
  corpus.entries.map((e): [string, CorpusEntry] => [
    e.id,
    { id: e.id, text: e.text, voice: toVoice(e.voice) },
  ]),
)

/** Entrée du corpus du jeu, sans le préfixe : ptm('compte') → 'ptm.compte'. */
export function ptm(id: string): CorpusEntry {
  const full = `ptm.${id}`
  return ENTRIES.get(full) ?? { id: full, text: '' }
}

/**
 * Un montant en clips : « trois euros », « deux euros et cinquante centimes »,
 * « soixante-dix centimes ». Réutilise nombre.<n> pour les euros entiers.
 */
export function priceEntries(cents: number): CorpusEntry[] {
  const { euros, cents: c } = splitPrice(cents)
  const out: CorpusEntry[] = []
  if (euros > 0) {
    out.push(numberEntry(euros))
    out.push(ptm(euros === 1 ? 'euro' : 'euros'))
  }
  if (c > 0) {
    if (euros > 0) out.push(ptm('et'))
    out.push(ptm(`cents.${c}`))
  }
  return out
}

/** La commande complète du client pour un item (consigne audio-first). */
export function itemEntries(item: Item): CorpusEntry[] {
  if (item.kind === 'change') {
    return [
      ptm(`cmd.${item.article.id}`),
      ptm(`donne.${item.bill / 100}`),
      ptm('coute'),
      ...priceEntries(item.price),
      ptm('rends'),
    ]
  }
  if (item.articles.length === 2) {
    // T3 : le client énumère ses deux articles — les prix restent sur les étiquettes.
    return [
      ptm('veut-deux'),
      ptm(`art.${item.articles[0].id}`),
      ptm('et'),
      ptm(`art.${item.articles[1].id}`),
    ]
  }
  return [ptm(`cmd.${item.articles[0].id}`), ptm('ca-fait'), ...priceEntries(item.target)]
}
