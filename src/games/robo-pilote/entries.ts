import type { CorpusEntry } from '@/engine/types'
import corpus from './corpus.json'

// ============================================================
// Accès typé aux entrées du corpus local (préfixe 'rp.').
// Le JSON est typé large (voice: string) : on rétrécit ici
// proprement vers CorpusEntry, sans cast.
// ============================================================

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

/** Entrée du corpus Robo-Pilote (fallback défensif : texte vide). */
export function E(id: string): CorpusEntry {
  return ENTRIES.get(id) ?? { id, text: '' }
}
