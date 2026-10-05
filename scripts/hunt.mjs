// Exploratory bug hunt: drives many flows through the app and records what goes
// wrong (console errors and warnings, page errors, failed requests), with a
// screenshot per step and a few invariants (finite numbers, idle frames at 0,
// undo/redo round trips, persistence across a reload).
//
//   CHROME_PATH=... node scripts/hunt.mjs [outDir] [baseUrl]
//
// Works on a scratch copy of the workspace's main layout (test-hunt,
// git-ignored): the main layout is only read. Layouts it saves are test-* ones
// (hidden and git-ignored) and are deleted at the end.
import { appUrl, planApi } from '../tests/e2e/space.mjs'
import { chromium } from 'playwright'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [outDir = 'test-results/hunt', base = process.env.BASE_URL || 'http://localhost:5213'] = process.argv.slice(2)
const BASE = base.replace(/\/$/, '')
const DECOR = 'test-hunt'
// Screenshots of an earlier run would mix with this one's.
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const findings = []
const log = []
const printed = new Set()
const note = (step, kind, text) => {
  findings.push({ step, kind, text })
  // Each distinct message is printed once; findings.json keeps every occurrence.
  if (printed.has(kind + text)) return
  printed.add(kind + text)
  console.log(`  ! [${step}] ${kind}: ${text}`)
}

// Fresh copy of the main layout (only read).
const main = await (await fetch(`${planApi(BASE)}/decor`)).text()
await fetch(`${planApi(BASE)}/decor?file=${DECOR}`, {
  method: 'PUT',
  body: main,
  headers: { 'Content-Type': 'application/json' },
})
const readDecor = async (name = DECOR) => (await fetch(`${planApi(BASE)}/decor?file=${name}`)).json()

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: !process.env.HEADED,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})

let current = 'boot'
function watch(page) {
  page.on('pageerror', (e) => note(current, 'pageerror', e.message))
  page.on('console', (m) => {
    const t = m.type()
    if (t !== 'error' && t !== 'warning') return
    const text = m.text()
    if (/favicon|Download the React DevTools/i.test(text)) return
    note(current, `console.${t}`, text.slice(0, 300))
  })
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? ''
    if (/ERR_ABORTED/.test(f)) return
    note(current, 'requestfailed', `${r.method()} ${r.url()} ${f}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400) note(current, 'http', `${r.status()} ${r.request().method()} ${r.url()}`)
  })
}

async function newPage(viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  watch(page)
  return page
}

async function open(page, query = '') {
  await page.goto(`${appUrl(BASE)}&decor=${DECOR}&dims=0${query ? `&${query}` : ''}`)
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForFunction(() => (window.__frames ?? 0) >= 3, null, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

let shotN = 0
const shot = async (page, name) => {
  const p = join(outDir, `${String(++shotN).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: p })
  return p
}

async function step(name, fn) {
  current = name
  const t0 = Date.now()
  try {
    await fn()
    log.push({ name, ok: true })
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`)
  } catch (e) {
    log.push({ name, ok: false })
    note(
      name,
      'failed',
      String(e?.stack ?? e)
        .split('\n')
        .slice(0, 4)
        .join(' | '),
    )
  }
}

/** Runs code against the app's own modules (Vite serves them by path). */
const inApp = (page, fn, arg) =>
  page.evaluate(
    async ([src, a]) => {
      // The app's own store: importing store.ts here may give another instance after HMR.
      const store = { useDecor: window.__decor }
      const f = new Function('store', 'arg', `return (${src})(store, arg)`)
      return f(store, a)
    },
    [fn.toString(), arg],
  )

const state = (page) =>
  inApp(page, ({ useDecor }) => {
    const s = useDecor.getState()
    return {
      items: s.items,
      selectedId: s.selectedId,
      selectedIds: s.selectedIds,
      finishes: s.finishes,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      layout: s.layout,
      movingId: s.movingId,
      groupNames: s.groupNames,
    }
  })

/** Frames rendered while nothing changes: must be 0 with frameloop="demand". */
async function idleFrames(page, label, ms = 1500) {
  await page.mouse.move(5, 895)
  await page.waitForTimeout(900)
  const n = await page.evaluate(async (ms) => {
    const f0 = window.__frames
    await new Promise((r) => setTimeout(r, ms))
    return window.__frames - f0
  }, ms)
  if (n > 0) note(current, 'idle-frames', `${label}: ${n} frames in ${ms} ms while idle`)
  return n
}

function badNumbers(items) {
  const out = []
  const walk = (v, path) => {
    if (typeof v === 'number' && !Number.isFinite(v)) out.push(path)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
  }
  for (const i of items) walk(i, i.id)
  return out
}

const panelOf = (page) => page.getByRole('complementary', { name: /decor/i })
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

console.log(`hunt against ${BASE}, screenshots in ${outDir}`)
const page = await newPage()
const panel = panelOf(page)

await step('load the owner layout copy', async () => {
  await open(page, 'view=iso-balcony')
  await shot(page, 'loaded')
  const s = await state(page)
  const bad = badNumbers(s.items)
  if (bad.length) note(current, 'data', `non-finite numbers in the layout: ${bad.join(', ')}`)
  await idleFrames(page, 'after load')
})

await step('every tab', async () => {
  for (const tab of await panel.getByRole('tab').all()) {
    await tab.click()
    await page.waitForTimeout(250)
    await shot(page, `tab-${(await tab.innerText()).split('\n')[0].toLowerCase()}`)
  }
  await idleFrames(page, 'Room tab open')
})

await step('inspector for each kind and type', async () => {
  const s = await state(page)
  const seen = new Set()
  for (const i of s.items) {
    const key =
      i.kind === 'furniture'
        ? `f-${i.type}`
        : i.kind === 'lamp'
          ? `l-${i.type}`
          : i.kind === 'plant'
            ? `p-${i.species}`
            : 'artwork'
    if (seen.has(key) || i.at[1] < -50) continue
    seen.add(key)
    await inApp(page, ({ useDecor }, id) => useDecor.getState().select(id), i.id)
    await page.waitForTimeout(120)
    const insp = panel.locator('.inspector')
    if (!(await insp.count())) note(current, 'ui', `no inspector for ${key} (${i.id})`)
    else if (seen.size <= 6) await shot(page, `inspector-${key}`)
    // Range sliders showing NaN.
    const nanSliders = await panel
      .locator('input[type=range]')
      .evaluateAll((els) => els.filter((e) => e.value === '' || /NaN/.test(e.style.cssText)).length)
    if (nanSliders) note(current, 'ui', `${key}: ${nanSliders} slider(s) without a value`)
    const txt = await insp.innerText().catch(() => '')
    if (/NaN|undefined|Infinity/.test(txt))
      note(current, 'ui', `${key}: inspector text shows ${txt.match(/NaN|undefined|Infinity/)[0]}`)
  }
  await inApp(page, ({ useDecor }) => useDecor.getState().select(null))
  console.log(`    inspected ${seen.size} kinds/types`)
})

await step('number inputs reject nonsense', async () => {
  const s = await state(page)
  const f = s.items.find((i) => i.kind === 'furniture' && i.at[1] > -50 && i.at[1] < 0.05)
  const a = s.items.find((i) => i.kind === 'artwork' && i.at[1] > -50)
  for (const it of [f, a].filter(Boolean)) {
    await inApp(page, ({ useDecor }, id) => useDecor.getState().select(id), it.id)
    await page.waitForTimeout(150)
    const inputs = await panel.locator('.number input').all()
    for (const [n, input] of inputs.entries()) {
      for (const junk of ['abc', '12abc', '1e9', 'Infinity', '-5', '', '0x10', '1,5', '  ']) {
        const prev = (await state(page)).items.find((x) => x.id === it.id)
        await input.fill(junk)
        await input.press('Enter')
        const now = (await state(page)).items.find((x) => x.id === it.id)
        const bad = badNumbers([now])
        if (bad.length) note(current, 'NaN', `${it.kind} field ${n} with "${junk}": ${bad.join(', ')}`)
        // Text that is not a number must leave the item as it was ("-5" may clamp to the minimum).
        if (!['-5', '1,5'].includes(junk) && JSON.stringify(now) !== JSON.stringify(prev))
          note(current, 'input', `${it.kind} field ${n} took "${junk}" as a number`)
      }
    }
    // Put it back.
    await inApp(page, ({ useDecor }, [id, item]) => useDecor.getState().update(id, item), [it.id, it])
  }
  await inApp(page, ({ useDecor }) => useDecor.getState().select(null))
})

await step('undo/redo round trip for item edits', async () => {
  const s0 = await state(page)
  const f = s0.items.find((i) => i.kind === 'furniture' && i.at[1] > -50 && i.at[1] < 0.05)
  await inApp(page, ({ useDecor }, id) => useDecor.getState().select(id), f.id)
  await page.mouse.move(700, 880)
  const snap = async () => JSON.stringify((await state(page)).items)
  const edits = [
    [
      'nudge',
      async () => {
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(1100)
      },
    ],
    [
      'rotate',
      async () => {
        await page.keyboard.press('r')
        await page.waitForTimeout(300)
      },
    ],
    [
      'inspector finish',
      async () => {
        await panel.locator('.swatch-set [role=radio]').nth(1).click()
        await page.waitForTimeout(1100)
      },
    ],
    [
      'delete',
      async () => {
        await page.keyboard.press('Delete')
        await page.waitForTimeout(300)
      },
    ],
  ]
  for (const [name, act] of edits) {
    const before = await snap()
    await inApp(
      page,
      ({ useDecor }, id) => useDecor.getState().items.some((i) => i.id === id) && useDecor.getState().select(id),
      f.id,
    )
    await page.mouse.move(700, 880)
    await act()
    const after = await snap()
    if (after === before) {
      note(current, 'undo', `${name} changed nothing`)
      continue
    }
    await page.keyboard.press(`${mod}+z`)
    await page.waitForTimeout(200)
    if ((await snap()) !== before) note(current, 'undo', `undo after ${name} did not restore the items`)
    await page.keyboard.press(`${mod}+Shift+z`)
    await page.waitForTimeout(200)
    if ((await snap()) !== after) note(current, 'redo', `redo after ${name} did not re-apply it`)
    await page.keyboard.press(`${mod}+z`)
    await page.waitForTimeout(200)
  }
  await shot(page, 'after-undo-redo')
  if ((await snap()) !== JSON.stringify(s0.items))
    note(current, 'undo', 'items differ from the start after undoing every edit')
})

await step('undo after a finish change and a wall removal', async () => {
  const s0 = await state(page)
  await panel.getByRole('tab', { name: /^room/i }).click()
  await panel
    .getByRole('radiogroup', { name: /main room floor/i })
    .getByRole('radio', { name: /walnut/i })
    .click()
  await page.waitForTimeout(300)
  await page.mouse.move(700, 880)
  await page.keyboard.press(`${mod}+z`)
  await page.waitForTimeout(300)
  let s1 = await state(page)
  if (s1.finishes.floors.main === 'walnut') note(current, 'undo', 'Cmd+Z does not undo a floor change')
  if (JSON.stringify(s1.items) !== JSON.stringify(s0.items))
    note(current, 'undo', 'Cmd+Z after a floor change reverted an earlier item edit instead')
  // Wall removal.
  const sw = panel.locator('.wall-row[data-wall] [role=switch]').first()
  if (await sw.count()) {
    await sw.click()
    await page.waitForTimeout(500)
    await shot(page, 'wall-removed')
    const removed = (await state(page)).finishes.structure?.removedWalls ?? []
    if (!removed.length) note(current, 'walls', 'clicking a wall switch removed nothing')
    await page.mouse.move(700, 880)
    await page.keyboard.press(`${mod}+z`)
    await page.waitForTimeout(400)
    s1 = await state(page)
    if (s1.finishes.structure?.removedWalls?.length) note(current, 'undo', 'Cmd+Z does not put a removed wall back')
    await idleFrames(page, 'after wall removal + undo')
  }
  await shot(page, 'after-finish-undo')
})

await step('place one of each kind from the libraries', async () => {
  await open(page, 'view=top')
  for (const [tab, name] of [
    [/furniture/i, /sideboard/i],
    [/plant/i, /snake/i],
    [/light/i, /tripod/i],
  ]) {
    await panel.getByRole('tab', { name: tab }).click()
    const n0 = (await state(page)).items.length
    await panel.getByRole('button', { name }).first().click()
    for (const [x, y] of [
      [760, 450],
      [700, 480],
      [820, 430],
    ]) {
      await page.mouse.move(x, y)
      await page.mouse.move(x + 2, y)
      await page.waitForTimeout(150)
      await page.mouse.click(x + 2, y)
      await page.waitForTimeout(250)
      if (!(await state(page)).movingId) break
    }
    const s = await state(page)
    if (s.movingId) {
      note(current, 'place', `${name} still following the pointer`)
      await page.keyboard.press('Escape')
    } else if (s.items.length !== n0 + 1) note(current, 'place', `${name}: ${s.items.length - n0} items added`)
    await page.keyboard.press('Escape')
  }
  await shot(page, 'placed')
  await idleFrames(page, 'after placing')
})

await step('artwork: hang, change size, undo', async () => {
  await open(page, 'view=iso-balcony')
  await panel.getByRole('tab', { name: /art/i }).click()
  const thumbs = panel.locator('.thumb')
  await thumbs.first().waitFor({ timeout: 10000 })
  await thumbs.first().click()
  for (const [x, y] of [
    [520, 330],
    [560, 300],
    [480, 380],
  ]) {
    await page.mouse.move(x, y)
    await page.mouse.move(x + 2, y)
    await page.waitForTimeout(150)
    await page.mouse.click(x + 2, y)
    await page.waitForTimeout(250)
    if (!(await state(page)).movingId) break
  }
  const s = await state(page)
  if (s.movingId) {
    note(current, 'place', 'artwork not hung')
    await page.keyboard.press('Escape')
    return
  }
  await panel
    .getByRole('radio', { name: 'A3' })
    .click()
    .catch(() => note(current, 'ui', 'no A3 chip'))
  await panel
    .getByRole('radio', { name: /custom/i })
    .first()
    .click()
  await shot(page, 'artwork-custom')
})

await step('groups and gallery hanging', async () => {
  const s = await state(page)
  const arts = s.items.filter((i) => i.kind === 'artwork' && i.at[1] > -50)
  const byWall = {}
  for (const a of arts) (byWall[`${a.facing}:${a.host ?? ''}`] ??= []).push(a)
  const set = Object.values(byWall).sort((p, q) => q.length - p.length)[0]
  if (!set || set.length < 2) return note(current, 'skip', 'no wall with two artworks')
  await inApp(
    page,
    ({ useDecor }, ids) => useDecor.getState().selectMany(ids),
    set.map((a) => a.id),
  )
  await page.waitForTimeout(200)
  await shot(page, 'multi-select')
  await page.mouse.move(700, 880)
  await page.keyboard.press(`${mod}+g`)
  await page.waitForTimeout(200)
  let now = await state(page)
  const gid = now.items.find((i) => i.id === set[0].id)?.groupId
  if (!gid) note(current, 'group', 'Cmd+G did not group')
  const name = panel.getByRole('textbox', { name: /group name/i })
  if (await name.count()) {
    await name.fill('Hunt gallery')
    await name.press('Enter')
  }
  const hang = panel.getByRole('button', { name: /^hang \d+ pieces/i })
  if (await hang.count()) {
    await hang.click()
    await page.waitForTimeout(300)
    await shot(page, 'gallery-hung')
    now = await state(page)
    const bad = badNumbers(now.items)
    if (bad.length) note(current, 'NaN', `after hanging: ${bad.join(', ')}`)
    await page.keyboard.press(`${mod}+z`)
    await page.waitForTimeout(200)
  } else note(current, 'ui', 'no Hang button for artworks on one wall')
  await page.waitForTimeout(600)
  const saved = await readDecor()
  if (gid && saved.groups?.[gid]?.name !== 'Hunt gallery')
    note(current, 'save', `group name not saved: ${JSON.stringify(saved.groups)}`)
  // Ungroup via undo of the group step.
  await page.keyboard.press(`${mod}+z`)
  await page.waitForTimeout(200)
  await inApp(page, ({ useDecor }) => useDecor.getState().select(null))
})

await step('layouts: save as, rename, A/B, delete', async () => {
  const bar = page.getByRole('button', { name: /^layout/i })
  await bar.click()
  const menu = page.getByRole('dialog', { name: /layouts/i })
  await menu.getByLabel(/save a copy as/i).fill('test hunt b')
  await menu.getByRole('button', { name: /save as new/i }).click()
  await page.waitForFunction(() => new URL(location.href).searchParams.get('decor') === 'test-hunt-b', null, {
    timeout: 5000,
  })
  const b = await readDecor('test-hunt-b')
  const a = await readDecor()
  if (a.groups && JSON.stringify(a.groups) !== JSON.stringify(b.groups))
    note(
      current,
      'layouts',
      `Save as dropped group names: A ${JSON.stringify(a.groups)} vs B ${JSON.stringify(b.groups)}`,
    )
  if (b.items.length !== a.items.length)
    note(current, 'layouts', `copy has ${b.items.length} items, A has ${a.items.length}`)
  await shot(page, 'layout-b')
  await page.mouse.move(700, 880)
  await page.keyboard.press('b')
  await page.waitForFunction(() => new URL(location.href).searchParams.get('decor') === 'test-hunt', null, {
    timeout: 5000,
  })
  const s = await state(page)
  if (s.selectedIds.length || s.selectedId)
    note(current, 'layouts', `selection survives a layout switch: ${s.selectedIds.join(',')}`)
  await page.keyboard.press('b')
  await page.waitForFunction(() => new URL(location.href).searchParams.get('decor') === 'test-hunt-b', null, {
    timeout: 5000,
  })
  await bar.click()
  await menu.getByRole('button', { name: /^rename test hunt b/i }).click()
  const input = menu.getByRole('textbox', { name: /new name/i })
  await input.fill('test hunt c')
  await input.press('Enter')
  await page.waitForFunction(() => new URL(location.href).searchParams.get('decor') === 'test-hunt-c', null, {
    timeout: 5000,
  })
  await bar.click().catch(() => {})
  if (!(await menu.isVisible())) await bar.click()
  await menu.getByRole('button', { name: /^delete test hunt c/i }).click()
  await menu
    .getByRole('alertdialog')
    .getByRole('button', { name: /^delete$/i })
    .click()
  await page.waitForTimeout(800)
  const after = await state(page)
  const url = new URL(page.url()).searchParams.get('decor')
  console.log(`    after deleting the open layout: layout=${after.layout} url decor=${url}`)
  await shot(page, 'layout-deleted')
  await page.keyboard.press('Escape')
})

await step('walk, measure, sun play', async () => {
  await open(page, 'view=iso-balcony')
  await page.mouse.move(700, 880)
  await page.keyboard.press('w')
  // The camera glides into the walk pose for about 2 s.
  await page.waitForTimeout(2500)
  await shot(page, 'walk')
  await idleFrames(page, 'walk mode idle')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.keyboard.press('t')
  await page.waitForTimeout(300)
  await page.mouse.click(600, 500)
  await page.mouse.move(700, 520)
  await page.mouse.click(700, 520)
  await page.waitForTimeout(300)
  await shot(page, 'measure')
  await page.keyboard.press('Escape')
  await page.keyboard.press('t')
  await idleFrames(page, 'after measure')
  const play = page.getByRole('button', { name: /play the day/i }).first()
  if (await play.count()) {
    await play.click()
    await page.waitForTimeout(2000)
    await shot(page, 'sun-playing')
    const pause = page.getByRole('button', { name: /pause|stop/i }).first()
    if (await pause.count()) await pause.click()
    else await page.waitForTimeout(11000)
    await page.keyboard.press('Escape')
    await idleFrames(page, 'after sun play')
  } else note(current, 'ui', 'no sun play button')
})

await step('reload keeps edits', async () => {
  const s = await state(page)
  const f = s.items.find((i) => i.kind === 'furniture' && i.at[1] > -50)
  await inApp(page, ({ useDecor }, id) => useDecor.getState().nudge(id, [0.01, 0, 0]), f.id)
  await inApp(page, ({ useDecor }) => useDecor.getState().setFinishes({ wallPaint: '#eeeeee' }))
  await page.waitForTimeout(700)
  await open(page, 'view=iso-balcony')
  const s2 = await state(page)
  const f2 = s2.items.find((i) => i.id === f.id)
  if (Math.abs(f2.at[0] - (f.at[0] + 0.01)) > 1e-6) note(current, 'persist', 'nudge lost on reload')
  if (s2.finishes.wallPaint !== '#eeeeee') note(current, 'persist', 'paint lost on reload')
})

await step('narrow viewport (390 px)', async () => {
  const p = await newPage({ width: 390, height: 844 })
  current = 'narrow viewport (390 px)'
  await open(p, 'view=iso-balcony')
  await shot(p, 'narrow')
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 0) note(current, 'layout', `page scrolls sideways by ${overflow} px`)
  const pnl = panelOf(p)
  if (await pnl.count()) {
    for (const tab of await pnl.getByRole('tab').all()) await tab.click()
    await shot(p, 'narrow-room-tab')
    const clipped = await pnl.evaluate((el) => el.getBoundingClientRect().right - window.innerWidth)
    if (clipped > 1) note(current, 'layout', `panel runs ${Math.round(clipped)} px off screen`)
  }
  await p.close()
})

await step('wide viewport (1920 px)', async () => {
  const p = await newPage({ width: 1920, height: 1080 })
  current = 'wide viewport (1920 px)'
  await open(p, 'view=iso-entry')
  await shot(p, 'wide')
  await p.close()
})

await step('?plan=loft', async () => {
  const p = await newPage()
  current = '?plan=loft'
  await p.goto(`${appUrl(BASE)}&plan=loft&decor=test-hunt-loft&dims=0`)
  await p.locator('canvas').first().waitFor({ state: 'visible', timeout: 60000 })
  await p.waitForTimeout(2000)
  await shot(p, 'loft')
  const pnl = panelOf(p)
  for (const tab of await pnl.getByRole('tab').all()) {
    await tab.click()
    await p.waitForTimeout(200)
  }
  await shot(p, 'loft-room-tab')
  const svg = pnl.locator('svg.plan-diagram')
  if (await svg.count()) {
    const vb = await svg.getAttribute('viewBox')
    console.log(`    loft plan diagram viewBox ${vb}`)
    await svg.screenshot({ path: join(outDir, 'loft-diagram.png') })
  }
  await idleFrames(p, 'loft idle')
  await p.close()
})

await browser.close()
// Clean up layouts this run saved.
for (const slug of ['test-hunt-b', 'test-hunt-c'])
  await fetch(`${planApi(BASE)}/layouts?file=${slug}`, { method: 'DELETE' }).catch(() => {})

writeFileSync(join(outDir, 'findings.json'), JSON.stringify({ steps: log, findings }, null, 2))
const failed = log.filter((l) => !l.ok).length
console.log(
  `\nhunt: ${log.length} steps, ${failed} failed, ${findings.length} findings → ${join(outDir, 'findings.json')}`,
)
