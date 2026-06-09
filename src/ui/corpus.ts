import corpusCommon from '@/content/corpus-common.json'
import type { CorpusEntry } from '@/engine/types'

// ============================================================
// Accès typé aux entrées `ui.*` du corpus commun.
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

const UI_ENTRIES: ReadonlyMap<string, CorpusEntry> = new Map(
  corpusCommon.entries.map((e): [string, CorpusEntry] => [
    e.id,
    { id: e.id, text: e.text, voice: toVoice(e.voice) },
  ]),
)

/** Récupère une entrée `ui.*` du corpus commun (fallback défensif : texte vide). */
export function uiEntry(id: string): CorpusEntry {
  return UI_ENTRIES.get(id) ?? { id, text: '' }
}
