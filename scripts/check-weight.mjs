// Garde-fou budgets de poids (art-direction.md §7) :
//   - un jeu = ≤ 250 Ko d'assets dans public/art/<île>/ (groupés par segment <jeu> du nom)
//   - précache total approximé (public/art + public/audio + public/icons) < 60 Mo
// Usage : node scripts/check-weight.mjs (échoue avec code 1 si un budget est dépassé)
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const GAME_BUDGET_KO = 250
const TOTAL_BUDGET_MO = 60
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) files = files.concat(walk(p))
    else files.push(p)
  }
  return files
}

function tryWalk(dir) {
  try {
    return walk(dir)
  } catch {
    return []
  }
}

let failed = false

// --- Budget par jeu (public/art/<île>/<île>.<jeu>.<asset>.webp) ---
const artFiles = tryWalk(join(ROOT, 'public', 'art')).filter((f) => f.endsWith('.webp'))
const byGame = new Map()
for (const f of artFiles) {
  const name = f.split(/[\\/]/).pop()
  const [island, game] = name.split('.')
  const key = `${island}/${game}`
  byGame.set(key, (byGame.get(key) ?? 0) + statSync(f).size)
}
for (const [game, bytes] of [...byGame].sort()) {
  const ko = bytes / 1024
  const over = ko > GAME_BUDGET_KO
  console.log(`${over ? 'DÉPASSÉ ' : 'ok      '} ${game} — ${ko.toFixed(1)} Ko / ${GAME_BUDGET_KO} Ko`)
  if (over) failed = true
}

// --- Budget précache global (approximation : art + audio + icons) ---
const totalBytes = ['art', 'audio', 'icons']
  .flatMap((d) => tryWalk(join(ROOT, 'public', d)))
  .reduce((sum, f) => sum + statSync(f).size, 0)
const totalMo = totalBytes / 1024 / 1024
console.log(`\nPrécache estimé (art+audio+icons) : ${totalMo.toFixed(1)} Mo / ${TOTAL_BUDGET_MO} Mo`)
if (totalMo > TOTAL_BUDGET_MO) failed = true

process.exit(failed ? 1 : 0)
