// Smoke test e2e de la piste arcade (Chrome local via Playwright, aucun navigateur téléchargé).
//   pnpm e2e:arcade [--url http://localhost:5173] [--port 5199] [--out .e2e]
// Déroulé : profil enfant → plan de route → service 0 joué de bout en bout via la solution DEV →
// écran de fin ; captures sur 3 viewports ; échec si erreur console, draw calls > 60, ou flux bloqué.
// Piège headless : la compilation des shaders bloque les premières frames — on attend des frames stables.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const PORT = Number(opt('port', '5199'))
const OUT = opt('out', '.e2e')
let url = opt('url', '')
// Objectif arcade-direction.md : < 50 draw calls hors passe d'ombres ; gl.info compte AUSSI la passe d'ombres.
const MAX_CALLS = 70
const stripAnsi = (s) => s.replace(/\[[0-9;]*m/g, '')

mkdirSync(OUT, { recursive: true })

let server = null
if (!url) {
  server = spawn('pnpm.cmd', ['exec', 'vite', '--config', 'vite.test.config.ts', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
  url = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite ne démarre pas')), 45000)
    server.stdout.on('data', (d) => {
      const m = stripAnsi(String(d)).match(/Local:\s+(http:\/\/\S+)/)
      if (m) {
        clearTimeout(t)
        resolve(m[1].replace(/\/$/, ''))
      }
    })
    server.stderr.on('data', (d) => process.stderr.write(d))
  })
}
const killServer = () => {
  if (!server) return
  // synchrone : process.exit() suit immédiatement, un spawn asynchrone laisserait vite orphelin sur le port
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' })
  else server.kill('SIGTERM')
}

const VIEWPORTS = [
  { name: 'tablet-landscape', width: 1180, height: 820, hasTouch: true },
  { name: 'tablet-portrait', width: 820, height: 1180, hasTouch: true },
  { name: 'phone-landscape', width: 844, height: 390, hasTouch: true, isMobile: true },
]

const failures = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function settle(page) {
  // Attend des frames rendues puis deux rAF consécutifs < 700 ms (fin de compilation des shaders).
  await page.waitForFunction(() => (window.__app?.renderInfo().frames ?? 0) > 3, null, { timeout: 30000 })
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = performance.now()
        let ok = 0
        const start = performance.now()
        const tick = () => {
          const now = performance.now()
          ok = now - last < 700 ? ok + 1 : 0
          last = now
          if (ok >= 2 || now - start > 12000) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
}

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.hasTouch,
    isMobile: vp.isMobile ?? false,
    locale: 'fr-FR',
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error' && !/THREE\.Clock|WebSocket|X4122/.test(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  try {
    await page.goto(`${url}/jouer/#/jeu/food-truck-gloutons`, { waitUntil: 'domcontentloaded' })
    // Profil enfant (première visite)
    const setup = page.getByRole('button', { name: '🦊' })
    if (await setup.isVisible({ timeout: 3000 }).catch(() => false)) {
      await setup.dispatchEvent('click')
      await page.getByRole('textbox', { name: 'Ton prénom' }).fill('Test')
      await page.getByRole('button', { name: '6-7 ans' }).dispatchEvent('click')
      await page.getByRole('button', { name: 'C’est parti !' }).dispatchEvent('click')
      await page.getByRole('button', { name: '🦊' }).waitFor({ state: 'hidden', timeout: 10000 })
    }
    await page.getByTestId('ftg-service-0').dispatchEvent('click')
    await page.getByTestId('ftg-play').waitFor({ timeout: 15000 })
    await settle(page)
    // Gloup en GLB (Suspense) : attendre son chargement pour mesurer la scène finale
    await page.waitForFunction(() => window.__app.r3f('gloup')?.found === true, null, { timeout: 15000 }).catch(() => undefined)
    await page.waitForTimeout(300)
    const info = await page.evaluate(() => window.__app.renderInfo())
    await page.screenshot({ path: `${OUT}/${vp.name}-play.png` })
    if (info.calls > MAX_CALLS) failures.push(`${vp.name} : ${info.calls} draw calls > ${MAX_CALLS}`)

    // Cibles tactiles du HUD ≥ 56 px (kids-ux)
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button, a')]
        .filter((el) => el.offsetParent !== null && el.getAttribute('data-testid') !== 'ftg-solve')
        .map((el) => ({ label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20), r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.width < 56 || r.height < 56))
        .map(({ label, r }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`),
    )
    if (small.length) failures.push(`${vp.name} : cibles < 56 px → ${small.join(', ')}`)

    // Partie complète via la solution DEV
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.__app.applySolution())
      await page.waitForFunction((n) => window.__app.state().resolved >= n || window.__app.state().screen === 'end', i + 1, { timeout: 8000 })
    }
    await page.waitForFunction(() => window.__app.state().screen === 'end', null, { timeout: 8000 })
    await page.screenshot({ path: `${OUT}/${vp.name}-end.png` })
    const result = await page.evaluate(() => window.__app.state().result)
    if (!result || result.stars !== 3) failures.push(`${vp.name} : résultat inattendu ${JSON.stringify(result)}`)
    console.log(`✓ ${vp.name} — ${info.calls} draw calls, ${info.triangles} tris, ${result?.stars} ★`)
  } catch (e) {
    failures.push(`${vp.name} : ${e.message}`)
    await page.screenshot({ path: `${OUT}/${vp.name}-error.png` }).catch(() => undefined)
  }
  if (errors.length) failures.push(`${vp.name} : erreurs console → ${errors.slice(0, 3).join(' | ')}`)
  await context.close()
}

await browser.close()
killServer()
if (failures.length) {
  console.error('\nÉCHECS :\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('\ne2e arcade : OK')
