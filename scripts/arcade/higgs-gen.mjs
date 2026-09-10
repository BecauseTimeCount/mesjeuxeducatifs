// Génère un asset Higgsfield via le CLI `higgs` (create --json → poll → téléchargement).
// Usage : node scripts/arcade/higgs-gen.mjs <out.png> <model> [--param value]... [--image ref.png]
// Acte d'atelier, jamais une étape de build. Retente SUBMIT_FAILED une fois.
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const [out, model, ...args] = process.argv.slice(2)
if (!out || !model) { console.error('usage: higgs-gen.mjs <out> <model> [--param value]...'); process.exit(2) }

function higgs(...a) {
  const r = spawnSync('higgs', a, { encoding: 'utf8', shell: true, windowsHide: true })
  return (r.stdout || '') + (r.stderr || '')
}
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`

function findKey(obj, keys) {
  if (obj == null || typeof obj !== 'object') return undefined
  for (const k of keys) if (typeof obj[k] === 'string') return obj[k]
  for (const v of Object.values(obj)) { const f = findKey(v, keys); if (f !== undefined) return f }
  return undefined
}
function findUrls(obj, acc = []) {
  if (typeof obj === 'string') { if (/^https?:\/\//.test(obj)) acc.push(obj); return acc }
  if (obj && typeof obj === 'object') for (const v of Object.values(obj)) findUrls(v, acc)
  return acc
}
function parseJson(txt) {
  const i = txt.search(/[\[{]/); if (i < 0) throw new Error('no json: ' + txt.slice(0, 300))
  return JSON.parse(txt.slice(i))
}

function submit() {
  const txt = higgs('generate', 'create', model, ...args.map(q), '--json')
  const j = parseJson(txt)
  const id = Array.isArray(j) ? j[0] : (j.id ?? findKey(j, ['id', 'job_id']))
  if (typeof id !== 'string') throw new Error('no id in ' + txt.slice(0, 300))
  return id
}

let id = submit()
console.log(`[${out}] job ${id}`)
const t0 = Date.now()
let retried = false
for (;;) {
  await new Promise((r) => setTimeout(r, 15000))
  const j = parseJson(higgs('generate', 'get', id, '--json'))
  const status = (findKey(j, ['status']) || '').toLowerCase()
  const urls = findUrls(j).filter((u) => /\.(png|jpe?g|webp|glb|gltf|mp4)(\?|$)/i.test(u) || /result|output|media/.test(u))
  process.stdout.write(`  ${Math.round((Date.now() - t0) / 1000)}s ${status}\n`)
  if (/fail|error|cancel/.test(status)) {
    if (!retried && /submit/.test(status)) { retried = true; id = submit(); console.log(`  retry → ${id}`); continue }
    console.error(JSON.stringify(j).slice(0, 1500)); process.exit(1)
  }
  if (/complet|succe|done|finish/.test(status) && urls.length) {
    const url = urls[0]
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download ${res.status}`)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, Buffer.from(await res.arrayBuffer()))
    console.log(`[${out}] OK ← ${url}`)
    process.exit(0)
  }
  if (Date.now() - t0 > 600000) { console.error('timeout'); process.exit(1) }
}
