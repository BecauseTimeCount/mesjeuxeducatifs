// Génère les icônes PWA PNG depuis public/icons/icon.svg
// Usage : node scripts/make-icons.mjs
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const svg = await readFile(path.join(root, 'public/icons/icon.svg'))
const out = (name) => path.join(root, 'public/icons', name)

await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'))
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'))

// Maskable : l'icône doit tenir dans la "safe zone" (80% du canevas)
const inner = await sharp(svg).resize(410, 410).png().toBuffer()
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#7fd4e8' },
})
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(out('icon-512-maskable.png'))

console.log('Icônes générées : icon-192.png, icon-512.png, icon-512-maskable.png')
