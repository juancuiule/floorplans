// Shared helpers for the browser tests (run with `pnpm test:e2e`, see playwright.config.ts).
import { planApi } from './space.mjs'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** The dev server under test; playwright.config.ts sets it. */
export const BASE_URL = (process.env.BASE_URL || 'http://localhost:5199').replace(/\/$/, '')
export const SHOTS = process.env.SHOTS_DIR || 'test-results/e2e'
mkdirSync(SHOTS, { recursive: true })

/** Collects page errors and console errors, minus benign noise (React unmount warnings, missing favicons). */
export function watchErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/unmount|favicon/i.test(t)) return
    errors.push(`console: ${t}`)
  })
  return errors
}

/**
 * Waits until the scene has rendered. Works with continuous rendering (window.__frames
 * keeps climbing), on-demand rendering (a few frames, then idle) and an explicit
 * window.__ready flag if the app ever sets one.
 */
export async function waitForScene(page, { timeout = 60000 } = {}) {
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout })
  await page
    .waitForFunction(() => window.__ready === true || (window.__frames ?? 0) >= 3, null, {
      timeout: Math.min(timeout, 20000),
    })
    .catch(() => {})
  // Let textures, decor and the first shadow maps settle.
  await page.waitForTimeout(800)
}

/**
 * Waits until the scene stops rendering: with on-demand rendering, no new frame
 * for `quiet` ms means every load, merge and animation has finished.
 */
export async function idle(page, { quiet = 500, timeout = 15000 } = {}) {
  const end = Date.now() + timeout
  let last = await page.evaluate(() => window.__frames ?? 0)
  while (Date.now() < end) {
    await page.waitForTimeout(quiet)
    const now = await page.evaluate(() => window.__frames ?? 0)
    if (now === last) return
    last = now
  }
  throw new Error(`The scene kept rendering for ${timeout} ms`)
}

/**
 * Jumps the pointer to (x, y) without passing over anything on the way (a draft
 * sticks to the last valid surface it crossed), then nudges it so hover-driven
 * placement and on-demand renders update.
 */
export async function hover(page, x, y) {
  await page.mouse.move(x, y, { steps: 1 })
  for (let i = 1; i < 3; i++) await page.mouse.move(x + i, y, { steps: 1 })
  await page.waitForTimeout(150)
}

export async function shot(page, name) {
  const path = join(SHOTS, `${name}.png`)
  await page.screenshot({ path })
  return path
}

export const api = {
  async readDecor(name) {
    const res = await fetch(`${planApi(BASE_URL)}/decor?file=${name}`)
    assert.equal(res.status, 200, `GET decor ${name}`)
    return res.json()
  },
  async resetDecor(name) {
    const res = await fetch(`${planApi(BASE_URL)}/decor?file=${name}`, {
      method: 'PUT',
      body: JSON.stringify({ version: 1, items: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    assert.equal(res.status, 200, `reset decor ${name}`)
  },
}

/** Polls `fn` until it returns a truthy value (or throws after `timeout`). */
export async function eventually(fn, { timeout = 5000, interval = 150, message = 'condition' } = {}) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
      if (last) return last
    } catch (e) {
      last = e
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`Timed out waiting for ${message}${last instanceof Error ? `: ${last.message}` : ''}`)
}
