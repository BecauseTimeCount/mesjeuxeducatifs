// Boîte englobante d'un GLB (meshopt accepté) : node scripts/arcade/glb-bounds.mjs <fichier.glb>
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2])
const b = getBounds(doc.getRoot().listScenes()[0])
const f = (a) => a.map((v) => v.toFixed(2)).join(', ')
console.log(`min [${f(b.min)}]  max [${f(b.max)}]  taille [${f(b.max.map((v, i) => v - b.min[i]))}]`)
