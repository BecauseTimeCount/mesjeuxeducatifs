// Post-traitement d'un asset généré (IA) vers le gabarit webp de la bible graphique.
// Usage : node scripts/art-to-webp.mjs --in <source.png> --out public/art/<île>/<nom>.webp --type decor|object|card
// Gabarits (art-direction.md §6) : decor 1600x900 q75 ≤60Ko · object 512x512 q80 alpha ≤15Ko · card 640x360 q75 ≤25Ko
import { statSync } from 'node:fs'
import { parseArgs } from 'node:util'
import sharp from 'sharp'

const GABARITS = {
  decor: { width: 1600, height: 900, quality: 75, maxKo: 60 },
  object: { width: 512, height: 512, quality: 80, maxKo: 15 },
  card: { width: 640, height: 360, quality: 75, maxKo: 25 },
}

const { values } = parseArgs({
  options: {
    in: { type: 'string' },
    out: { type: 'string' },
    type: { type: 'string', default: 'decor' },
  },
})

const gabarit = GABARITS[values.type]
if (!values.in || !values.out || !gabarit) {
  console.error('Usage : node scripts/art-to-webp.mjs --in <src> --out <dest.webp> --type decor|object|card')
  process.exit(1)
}

await sharp(values.in)
  .resize(gabarit.width, gabarit.height, { fit: 'cover', position: 'attention' })
  .webp({ quality: gabarit.quality })
  .toFile(values.out)

const ko = statSync(values.out).size / 1024
console.log(`${values.out} — ${ko.toFixed(1)} Ko (budget ${gabarit.maxKo} Ko)`)
if (ko > gabarit.maxKo) {
  console.error(
    `DÉPASSEMENT : ${ko.toFixed(1)} Ko > ${gabarit.maxKo} Ko. ` +
      'Simplifier l’image à la source (moins de détails), ne pas monter la compression.',
  )
  process.exit(1)
}
