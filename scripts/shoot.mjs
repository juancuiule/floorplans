// Renders the app in headless Chromium and saves screenshots of each view.
// Usage: node scripts/shoot.mjs [outDir] [baseUrl] [view:mode:light ...]
// Env: DECOR=<name> (?decor=), QUERY='sun=09:00&date=2026-06-21&facing=W' (extra params), TAG (file name suffix)
import { appUrl } from '../tests/e2e/space.mjs'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [outDir = 'test-results/shots', base = 'http://localhost:5173', ...rest] = process.argv.slice(2)
const shots = rest.length
  ? rest
  : [
      'iso-balcony:dollhouse',
      'iso-entry:dollhouse',
      'iso-balcony:xray',
      'top:dollhouse',
      'from-balcony:dollhouse',
      'from-entry:dollhouse',
    ]

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({
  // Reuse an already-downloaded Chromium when Playwright's pinned build is missing.
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: Number(process.env.DSF ?? 1),
})
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

for (const spec of shots) {
  // view:mode:light, or cam=x,y,z,tx,ty,tz[,fov]:mode:light for an exact camera
  const [view, mode = 'dollhouse', light = 'day'] = spec.split(':')
  const camera = view.startsWith('cam=') ? `cam=${view.slice(4)}` : `view=${view}`
  await page.goto(
    `${appUrl(base)}&${camera}&mode=${mode}&light=${light}&dims=0${process.env.DECOR ? `&decor=${process.env.DECOR}` : ''}${process.env.QUERY ? `&${process.env.QUERY}` : ''}`,
  )
  await page.waitForFunction(() => (window.__frames ?? 0) > 40, null, { timeout: 60000 })
  await page.waitForTimeout(1200) // let textures and decor load
  const name = view.startsWith('cam=') ? `cam-${shots.indexOf(spec)}` : view
  const file = join(outDir, `${name}-${mode}-${light}${process.env.TAG ? `-${process.env.TAG}` : ''}.png`)
  await page.screenshot({ path: file })
  console.log('saved', file)
}
await browser.close()
