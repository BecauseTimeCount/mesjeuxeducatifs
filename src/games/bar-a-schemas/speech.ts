// ============================================================
// Le Bar à Schémas — assemblage des séquences vocales.
// PURE (aucun import React/DOM) : transforme les fragments des
// templates en listes de CorpusEntry à enchaîner avec say().
// Les nombres réutilisent les clips communs 'nombre.<n>'.
// ============================================================

import { numberEntry } from '@/content/numbers'
import type { CorpusEntry } from '@/engine/types'
import corpus from './corpus.json'
import type { BscItem, Fragment, SlotRole } from './logic'

function toVoice(v: string | undefined): CorpusEntry['voice'] {
  return v === 'denise' || v === 'eloise' || v === 'henri' ? v : undefined
}

const ENTRIES: ReadonlyMap<string, CorpusEntry> = new Map(
  corpus.entries.map((e): [string, CorpusEntry] => [
    e.id,
    { id: e.id, text: e.text, voice: toVoice(e.voice) },
  ]),
)

/** Entrée du corpus du jeu, sans le préfixe : bsc('intro') → 'bsc.intro'. */
export function bsc(id: string): CorpusEntry {
  const full = `bsc.${id}`
  return ENTRIES.get(full) ?? { id: full, text: '' }
}

/** Tous les ids du corpus (préchargement). */
export const ALL_CLIP_IDS: readonly string[] = corpus.entries.map((e) => e.id)

/** Résout une liste de fragments en clips : texte fixe ou nombre de l'item. */
export function fragmentEntries(item: BscItem, fragments: readonly Fragment[]): CorpusEntry[] {
  return fragments.map((f) =>
    'clip' in f ? (ENTRIES.get(f.clip) ?? { id: f.clip, text: '' }) : numberEntry(item[f.num]),
  )
}

/** L'énoncé complet : l'histoire puis la question (phase ÉCOUTER). */
export function storyEntries(item: BscItem): CorpusEntry[] {
  return [
    ...fragmentEntries(item, item.template.fragments),
    ...fragmentEntries(item, item.template.question),
  ]
}

/** La phrase-réponse (phase RACONTER). */
export function answerEntries(item: BscItem): CorpusEntry[] {
  return fragmentEntries(item, item.template.answer)
}

/** Clip d'explication de placement par rôle : « huit… c'est tout… ». */
const PLACE_CLIP: Readonly<Record<SlotRole, string>> = {
  whole: 'place.whole',
  part1: 'place.part',
  part2: 'place.part',
  start: 'place.start',
  change: 'place.change',
  end: 'place.start',
  heroBar: 'place.bar',
  rivalBar: 'place.bar',
  diff: 'place.diff',
}

/** Feedback élaboratif de placement : le nombre, puis où il doit aller. */
export function placementHelpEntries(value: number, correctRole: SlotRole): CorpusEntry[] {
  return [numberEntry(value), bsc(PLACE_CLIP[correctRole])]
}
