// ============================================================
// Génère corpus.json depuis words.ts (source de vérité unique).
// Usage :  node --experimental-strip-types make-corpus.mjs
// Le fichier produit est statique et versionné ; logic.test.ts
// vérifie qu'il reste cohérent avec les données.
// ============================================================

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { GAME_ENTRIES, SYLLABLES_BY_CLIP, WORDS } = await import('./words.ts')

const entries = [
  ...GAME_ENTRIES.map((e) => (e.voice ? { id: e.id, text: e.text, voice: e.voice } : { id: e.id, text: e.text })),
  ...WORDS.map((w) => ({ id: w.clipId, text: w.word })),
  ...[...SYLLABLES_BY_CLIP]
    .sort((a, b) => a.clipId.localeCompare(b.clipId))
    .map((s) => ({ id: s.clipId, text: s.say })),
]

const ids = new Set()
for (const e of entries) {
  if (ids.has(e.id)) throw new Error(`id en double : ${e.id}`)
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(e.id)) throw new Error(`id invalide : ${e.id}`)
  ids.add(e.id)
}

const corpus = { 'voice-default': 'denise', entries }
const out = join(dirname(fileURLToPath(import.meta.url)), 'corpus.json')
writeFileSync(out, JSON.stringify(corpus, null, 2) + '\n', 'utf-8')
console.log(`corpus.json : ${entries.length} entrées (${WORDS.length} mots, ${SYLLABLES_BY_CLIP.length} syllabes)`)
