// Render cost per view: draw calls, triangles, programs, fps under continuous rendering, idle fps.
// Usage: [DSF=2] node scripts/perf.mjs [baseUrl] [query ...]   (DSF: device pixel ratio)
//   node scripts/perf.mjs http://localhost:5173 "view=iso-balcony&decor=furn" "view=iso-balcony&decor=furn&light=evening"
import { appUrl } from '../tests/e2e/space.mjs'
import { chromium } from 'playwright'

const [base = 'http://localhost:5173', ...rest] = process.argv.slice(2)
const queries = rest.length
  ? rest
  : ['view=iso-balcony&decor=furn', 'view=iso-balcony&decor=furn&light=evening', 'view=iso-balcony&decor=empty']

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
  ],
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: Number(process.env.DSF ?? 1),
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

for (const q of queries) {
  await page.goto(`${appUrl(base)}&dims=0&${q}`)
  await page.waitForFunction(() => (window.__frames ?? 0) > 40, null, { timeout: 60000 })
  await page.waitForTimeout(2500)
  const result = await page.evaluate(async () => {
    // Idle: frames rendered while nothing changes (0 with frameloop="demand").
    const i0 = window.__frames
    await new Promise((r) => setTimeout(r, 2000))
    const idle = (window.__frames - i0) / 2
    // Busy: force a render every animation frame, like an orbiting camera.
    const f0 = window.__frames
    const t0 = performance.now()
    await new Promise((resolve) => {
      const tick = () => {
        window.__invalidate?.()
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
        else resolve()
      }
      tick()
    })
    const fps = ((window.__frames - f0) * 1000) / (performance.now() - t0)
    return { ...window.__stats, fps: +fps.toFixed(1), idleFps: +idle.toFixed(1) }
  })
  console.log(q.padEnd(52), JSON.stringify(result))
}
await browser.close()
