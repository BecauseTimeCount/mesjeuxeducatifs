// Ingestion d'un GLB généré (Tripo / Meshy / rigging Higgsfield) vers un asset de jeu léger :
//   dedup → prune → simplify (meshopt) → textures webp ≤ 1024² (couleur seule par défaut) →
//   renommage des clips d'animation → quantize + meshopt (jamais Draco : offline garanti).
// Usage : node scripts/arcade/ingest-glb.mjs <in.glb> <out.glb> [--ratio 0.05] [--tex 1024] [--keep-pbr]
//         [--clip mixamo.com=idle --clip Armature|Eat=eat ...]
// Acte d'atelier, jamais une étape de build. Budget : ≤ 3 Mo par fichier (check-weight.mjs).
// sharp en PREMIER : importé après meshoptimizer (WASM), libvips échoue (« colourspace: parameter space not set »)
import sharp from 'sharp'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize, simplify, weld, meshopt } from '@gltf-transform/functions'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { statSync } from 'node:fs'

const args = process.argv.slice(2)
const [input, output] = args
if (!input || !output) {
  console.error('usage: ingest-glb.mjs <in.glb> <out.glb> [--ratio 0.05] [--tex 1024] [--keep-pbr] [--clip from=to]')
  process.exit(2)
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const ratio = Number(opt('ratio', '0.05'))
const texSize = Number(opt('tex', '1024'))
const keepPbr = args.includes('--keep-pbr')
const clipMap = new Map()
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--clip') {
    const [from, to] = (args[i + 1] ?? '').split('=')
    if (from && to) clipMap.set(from, to)
  }
}

await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(input)
const root = doc.getRoot()
// EXT_texture_webp : lu nativement par GLTFLoader (three), déclaré explicitement pour un GLB valide
doc.createExtension(EXTTextureWebP).setRequired(true)

const tris = () => {
  let n = 0
  for (const mesh of root.listMeshes())
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices()
      n += idx ? idx.getCount() / 3 : (p.getAttribute('POSITION')?.getCount() ?? 0) / 3
    }
  return Math.round(n)
}
const before = tris()

// Matériaux mats (arcade-direction.md §2) : on retire normal / ORM sauf --keep-pbr.
if (!keepPbr) {
  for (const m of root.listMaterials()) {
    m.setNormalTexture(null)
    m.setOcclusionTexture(null)
    m.setMetallicRoughnessTexture(null)
    m.setMetallicFactor(0)
    m.setRoughnessFactor(0.7)
  }
}

// Textures → webp ≤ texSize², AVANT la simplification (fait à la main : textureCompress() de gltf-transform
// casse avec sharp 0.34 sous Windows, « colourspace: parameter space not set »).
await doc.transform(dedup(), prune())
for (const tex of root.listTextures()) {
  const img = tex.getImage()
  if (!img) continue
  const buf = await sharp(Buffer.from(img)).resize({ width: texSize, height: texSize, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  tex.setImage(new Uint8Array(buf)).setMimeType('image/webp')
}

await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }), prune())

// Clips d'animation → contrat du jeu (idle | eat | happy | oops)
for (const a of root.listAnimations()) {
  const to = clipMap.get(a.getName())
  if (to) a.setName(to)
}

await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
await io.write(output, doc)

const ko = statSync(output).size / 1024
console.log(`${input} → ${output}`)
console.log(`  triangles ${before} → ${tris()} (ratio ${ratio})`)
console.log(`  textures ${root.listTextures().map((t) => `${t.getMimeType()} ${t.getSize()?.join('x')}`).join(', ') || 'aucune'}`)
console.log(`  animations ${root.listAnimations().map((a) => a.getName()).join(', ') || 'aucune'}`)
console.log(`  poids ${ko.toFixed(0)} Ko ${ko > 3072 ? '— DÉPASSE le budget de 3 Mo' : ''}`)
