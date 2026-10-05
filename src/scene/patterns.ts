import * as THREE from 'three'
import { FLOOR_ORIGIN_Z } from '../project/derived'
import type { MaterialDef, PatternDef } from '../model/types'

// Procedural canvas textures, kept pale on purpose. Each texture covers a
// known real-world size so it can be repeated per surface in meters, and is
// seamless: shapes that cross an edge are drawn again on the opposite side.
//
// Canvases are power-of-two sized (clean mipmaps), at most 2048 px a side,
// and drawn in meters (the context is scaled), so the pixel density can
// differ slightly per axis without distorting anything.

export interface Pattern {
  texture: THREE.CanvasTexture
  /** Real-world size one texture repeat covers: [along x, along z]. */
  size: [number, number]
}

/** Target density; the canvas side is rounded to a power of two. */
const PX_PER_M = 850
const MAX_PX = 2048
/** Full-size canvases kept around; each one is a few MB. Evicted ones stay alive while a material uses them. */
const CACHE_LIMIT = 8
const cache = new Map<string, Pattern>()

type Ctx = CanvasRenderingContext2D
type Size = [number, number]

export function rand(seed: number) {
  let s = seed % 2147483647 || 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Deterministic 0–1 noise for integer coordinates (used where drawing order must not matter). */
export function hash(a: number, b: number, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483587)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const mod = (a: number, n: number) => ((a % n) + n) % n

export function shade(hex: string, amount: number) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)))
  return `#${c.getHexString()}`
}

export const pow2 = (px: number) => Math.min(MAX_PX, Math.max(64, 2 ** Math.round(Math.log2(Math.max(1, px)))))

/** Calls `draw` at every copy of a shape (bounding box x, y, w, h) that overlaps the canvas. */
function wrapped(size: Size, x: number, y: number, w: number, h: number, draw: (dx: number, dy: number) => void) {
  for (const dx of [-size[0], 0, size[0]])
    for (const dy of [-size[1], 0, size[1]]) {
      if (x + dx >= size[0] || x + dx + w <= 0 || y + dy >= size[1] || y + dy + h <= 0) continue
      draw(dx, dy)
    }
}

// ---------- the patterns ----------

/** Real-world size of one repeat. */
export function patternSize(p: PatternDef): Size {
  switch (p.kind) {
    case 'planks':
      return [p.length * 2, p.width * 5]
    case 'tiles': {
      const [nx, ny] = tileCounts(p)
      return [p.width * nx, p.height * ny]
    }
    case 'herringbone': {
      const k = Math.max(1, Math.round(p.length / p.width))
      const side = 2 * k * p.width * Math.SQRT2
      return [side, side]
    }
    case 'hex':
      return [HEX_COLS * p.size, HEX_ROWS * p.size * (Math.sqrt(3) / 2)]
    case 'concrete':
      return [2, 2]
    case 'quarter':
      return [p.size * 4, p.size * 4]
  }
}

function tileCounts(p: Extract<PatternDef, { kind: 'tiles' }>): [number, number] {
  const nx = Math.max(2, Math.round(1.2 / p.width))
  let ny = Math.max(2, Math.round(1.2 / p.height))
  if (p.bond && ny % 2) ny++
  return [nx, ny]
}

function draw(g: Ctx, def: MaterialDef, size: Size) {
  const p = def.pattern!
  switch (p.kind) {
    case 'planks':
      return drawPlanks(g, size, def.color, p.width, p.length, p.grain ?? 0.5)
    case 'tiles':
      return drawTiles(g, size, def.color, p)
    case 'herringbone':
      return drawHerringbone(g, def.color, p.width, p.length, p.grain ?? 0.5)
    case 'hex':
      return drawHex(g, size, p)
    case 'concrete':
      return drawConcrete(g, size, def.color)
    case 'quarter':
      return drawQuarter(g, size, def.color, p)
  }
}

/** Oak planks running along x, staggered, with grain. */
function drawPlanks(g: Ctx, size: Size, base: string, pw: number, pl: number, grain: number) {
  const r = rand(7)
  const rows = Math.round(size[1] / pw)
  const offsets = [0, 0.5, 0.25, 0.75, 0.4, 0.9, 0.15]
  const joint = shade(base, -0.16)
  for (let row = 0; row < rows; row++) {
    const y = row * pw
    for (let x = -offsets[row % offsets.length] * pl; x < size[0]; x += pl) {
      const tone = shade(base, (r() - 0.5) * 0.07)
      const bands = Array.from({ length: 3 }, () => [r() * pw, pw * (0.08 + r() * 0.25), r() < 0.5 ? -1 : 1] as const)
      const streaks = Array.from(
        { length: 16 },
        () => [r() * pw, 0.0006 + r() * 0.0014, r() * 0.4 * pl, pl * (0.4 + r() * 0.6)] as const,
      )
      wrapped(size, x, y, pl, pw, (dx) => {
        const x0 = x + dx
        g.globalAlpha = 1
        g.fillStyle = tone
        g.fillRect(x0, y, pl, pw)
        // Broad lengthwise bands, then fine grain lines.
        for (const [by, bh, sign] of bands) {
          g.globalAlpha = 0.05 * grain
          g.fillStyle = shade(base, sign * 0.1)
          g.fillRect(x0, y + by, pl, Math.min(bh, pw - by))
        }
        g.fillStyle = shade(base, -0.28)
        for (const [sy, sh, sx, sl] of streaks) {
          g.globalAlpha = (0.05 + 0.05 * grain) * (0.5 + (sy / pw) * 0.5)
          g.fillRect(x0 + sx, y + sy, Math.min(sl, pl - sx), sh)
        }
        g.globalAlpha = 0.85
        g.fillStyle = joint
        g.fillRect(x0, y, 0.0025, pw)
      })
    }
    g.globalAlpha = 0.85
    g.fillStyle = joint
    g.fillRect(0, y, size[0], 0.0022)
  }
  g.globalAlpha = 1
}

/** Rectangular tiles with grout; optional running bond and tile-by-tile tones. */
function drawTiles(g: Ctx, size: Size, base: string, p: Extract<PatternDef, { kind: 'tiles' }>) {
  const r = rand(3)
  const [nx, ny] = tileCounts(p)
  const gw = Math.min(0.004, Math.max(0.002, Math.min(p.width, p.height) * 0.03))
  const vary = p.vary ?? 0.012
  g.fillStyle = p.grout
  g.fillRect(0, 0, size[0], size[1])
  for (let j = 0; j < ny; j++) {
    const shift = j % 2 ? (p.bond ?? 0) * p.width : 0
    for (let i = 0; i < nx; i++) {
      const tone = p.tones ? p.tones[Math.floor(r() * p.tones.length)] : base
      const fill = shade(tone, (r() - 0.5) * vary * 2)
      const blobs = p.tones
        ? Array.from({ length: 4 }, () => [r(), r(), 0.2 + r() * 0.35, r() < 0.5 ? -1 : 1] as const)
        : []
      const x = i * p.width + shift
      const y = j * p.height
      wrapped(size, x, y, p.width, p.height, (dx) => {
        const x0 = x + dx + gw / 2
        const w = p.width - gw
        const h = p.height - gw
        g.globalAlpha = 1
        g.fillStyle = fill
        g.fillRect(x0, y + gw / 2, w, h)
        // Handmade tiles (terracotta) get soft patches of color.
        for (const [bx, by, br, sign] of blobs) {
          g.globalAlpha = 0.09
          g.fillStyle = shade(fill, sign * 0.05)
          const bw = Math.min(w * br * 2, w * (1 - bx))
          g.fillRect(x0 + w * bx, y + gw / 2 + h * by * 0.7, bw, Math.min(h * br, h * (1 - by * 0.7)))
        }
        // A faint bevel: lighter top edge, darker bottom edge.
        g.globalAlpha = 0.18
        g.fillStyle = shade(fill, 0.06)
        g.fillRect(x0, y + gw / 2, w, Math.min(0.004, h * 0.1))
        g.fillStyle = shade(fill, -0.06)
        g.fillRect(x0, y + gw / 2 + h - Math.min(0.004, h * 0.1), w, Math.min(0.004, h * 0.1))
      })
    }
  }
  g.globalAlpha = 1
}

/** Boards in a 45° herringbone. Plank length is a whole number of widths. */
function drawHerringbone(g: Ctx, base: string, width: number, length: number, grain: number) {
  const k = Math.max(1, Math.round(length / width))
  const W = width
  const L = k * W
  const nPer = 2 * k
  const s = Math.SQRT1_2
  const joint = shade(base, -0.17)
  // Lattice n·(W, W) + m·(L, −L), turned 45°: n steps W√2 along v, m steps L√2 along u.
  for (let n = -k - 2; n <= nPer + k + 2; n++)
    for (let m = -2; m <= 3; m++) {
      const u0 = m * L * Math.SQRT2
      const v0 = n * W * Math.SQRT2
      for (const vertical of [false, true]) {
        const seed = mod(n, nPer) * 7 + mod(m, 2) * 3 + (vertical ? 1 : 0)
        const tone = shade(base, (hash(seed, 11) - 0.5) * 0.08)
        g.save()
        // Plank space (x along the rows before turning) to canvas meters.
        g.transform(s, s, -s, s, u0, v0)
        if (vertical) g.transform(0, 1, -1, 0, W, W) // V plank: [0, W] × [W, W + L]
        g.globalAlpha = 1
        g.fillStyle = tone
        g.fillRect(0, 0, L, W)
        g.fillStyle = shade(base, (hash(seed, 5) - 0.5) * 0.2)
        g.globalAlpha = 0.05 * grain
        g.fillRect(0, W * hash(seed, 6) * 0.6, L, W * 0.3)
        g.fillStyle = shade(base, -0.28)
        for (let i = 0; i < 9; i++) {
          g.globalAlpha = (0.05 + 0.05 * grain) * hash(seed, i, 2)
          const sx = hash(seed, i, 3) * 0.3 * L
          g.fillRect(
            sx,
            hash(seed, i, 4) * W,
            L * (0.5 + hash(seed, i, 5) * 0.5) - sx,
            0.0006 + hash(seed, i, 6) * 0.0012,
          )
        }
        g.globalAlpha = 0.85
        g.strokeStyle = joint
        g.lineWidth = 0.002
        g.strokeRect(0, 0, L, W)
        g.restore()
      }
    }
  g.globalAlpha = 1
}

const HEX_COLS = 7
/** Rows of hexagons per repeat (even, so odd rows stay offset across the seam). */
const HEX_ROWS = 8

/** Pointy-top hexagon cells of a hex pattern: center in pattern meters and its tone. */
export function hexCell(p: Extract<PatternDef, { kind: 'hex' }>, col: number, row: number) {
  const s = p.size
  const cx = col * s + (mod(row, 2) ? s / 2 : 0)
  const cy = row * s * (Math.sqrt(3) / 2)
  const tone = p.tones[Math.floor(hash(mod(col, HEX_COLS), mod(row, HEX_ROWS), 17) * p.tones.length)]
  return { cx, cy, tone, seed: mod(col, HEX_COLS) * 31 + mod(row, HEX_ROWS) }
}

/** One hexagon tile at (cx, cy) with its mottling; the grout shows around it. */
function hexTile(g: Ctx, p: Extract<PatternDef, { kind: 'hex' }>, cx: number, cy: number, tone: string, seed: number) {
  const R = (p.size - 0.004) / Math.sqrt(3)
  g.beginPath()
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3
    const x = cx + R * Math.cos(a)
    const y = cy + R * Math.sin(a)
    if (k) g.lineTo(x, y)
    else g.moveTo(x, y)
  }
  g.closePath()
  g.globalAlpha = 1
  g.fillStyle = tone
  g.fill()
  g.save()
  g.clip()
  for (let i = 0; i < 5; i++) {
    g.globalAlpha = 0.07
    g.fillStyle = shade(tone, (hash(seed, i, 1) - 0.5) * 0.14)
    g.beginPath()
    g.arc(
      cx + (hash(seed, i, 2) - 0.5) * p.size,
      cy + (hash(seed, i, 3) - 0.5) * p.size,
      p.size * (0.15 + hash(seed, i, 4) * 0.3),
      0,
      Math.PI * 2,
    )
    g.fill()
  }
  g.restore()
  g.globalAlpha = 1
}

function drawHex(g: Ctx, size: Size, p: Extract<PatternDef, { kind: 'hex' }>) {
  g.fillStyle = p.grout
  g.fillRect(0, 0, size[0], size[1])
  for (let row = -1; row <= HEX_ROWS; row++)
    for (let col = -1; col <= HEX_COLS; col++) {
      const c = hexCell(p, col, row)
      hexTile(g, p, c.cx, c.cy, c.tone, c.seed)
    }
}

/** Polished concrete: broad soft clouds, then fine aggregate specks. */
function drawConcrete(g: Ctx, size: Size, base: string) {
  const r = rand(11)
  g.fillStyle = base
  g.fillRect(0, 0, size[0], size[1])
  const blob = (x: number, y: number, rad: number, color: string, alpha: number) =>
    wrapped(size, x - rad, y - rad, rad * 2, rad * 2, (dx, dy) => {
      g.globalAlpha = alpha
      g.fillStyle = color
      g.beginPath()
      g.arc(x + dx, y + dy, rad, 0, Math.PI * 2)
      g.fill()
    })
  for (let i = 0; i < 260; i++)
    blob(r() * size[0], r() * size[1], 0.06 + r() * 0.34, shade(base, (r() - 0.5) * 0.08), 0.06)
  for (let i = 0; i < 90; i++)
    blob(r() * size[0], r() * size[1], 0.01 + r() * 0.04, shade(base, (r() - 0.5) * 0.12), 0.1)
  for (let i = 0; i < 7000; i++) {
    g.globalAlpha = 0.12 + r() * 0.2
    g.fillStyle = shade(base, r() < 0.6 ? -0.1 - r() * 0.12 : 0.06)
    const d = 0.0008 + r() * 0.0018
    g.fillRect(r() * size[0], r() * size[1], d, d)
  }
  g.globalAlpha = 1
}

/** Cement tiles, each with a quarter circle in one corner; 2×2 blocks alternate circles and their negatives. */
function drawQuarter(g: Ctx, size: Size, ground: string, p: Extract<PatternDef, { kind: 'quarter' }>) {
  const s = p.size
  const gw = 0.002
  g.fillStyle = p.grout
  g.fillRect(0, 0, size[0], size[1])
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const toCenter = ((i >> 1) + (j >> 1)) % 2 === 0
      const cxl = toCenter ? 1 - (i & 1) : i & 1
      const cyl = toCenter ? 1 - (j & 1) : j & 1
      const x0 = i * s
      const y0 = j * s
      const cx = x0 + cxl * s
      const cy = y0 + cyl * s
      const seed = j * 4 + i
      g.save()
      g.beginPath()
      g.rect(x0 + gw / 2, y0 + gw / 2, s - gw, s - gw)
      g.clip()
      g.globalAlpha = 1
      g.fillStyle = shade(ground, (hash(seed, 1) - 0.5) * 0.03)
      g.fillRect(x0, y0, s, s)
      const ring = (rad: number, color: string) => {
        g.fillStyle = color
        g.beginPath()
        g.arc(cx, cy, rad, 0, Math.PI * 2)
        g.fill()
      }
      const ink = shade(p.ink, (hash(seed, 2) - 0.5) * 0.04)
      ring(s * 0.9, ink)
      ring(s * 0.62, ground)
      ring(s * 0.52, ink)
      // Pigment is never perfectly even in cement tiles.
      for (let k = 0; k < 5; k++) {
        g.globalAlpha = 0.06
        g.fillStyle = shade(ground, (hash(seed, k, 3) - 0.5) * 0.2)
        g.beginPath()
        g.arc(x0 + hash(seed, k, 4) * s, y0 + hash(seed, k, 5) * s, s * (0.1 + hash(seed, k, 6) * 0.25), 0, Math.PI * 2)
        g.fill()
      }
      g.restore()
    }
  g.globalAlpha = 1
}

// ---------- canvases and textures ----------

function canvasOf(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

function finish(canvas: HTMLCanvasElement, size: Size): Pattern {
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  // Power-of-two canvases: full trilinear mipmaps.
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return { texture, size }
}

const keyOf = (def: MaterialDef) => `${def.color}|${JSON.stringify(def.pattern)}`

/** The repeating texture for a patterned material (cached; clone before changing repeat or offset). */
export function patternFor(def: MaterialDef): Pattern | null {
  if (!def.pattern) return null
  const key = keyOf(def)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const size = patternSize(def.pattern)
  const canvas = canvasOf(pow2(size[0] * PX_PER_M), pow2(size[1] * PX_PER_M))
  const g = canvas.getContext('2d')!
  g.scale(canvas.width / size[0], canvas.height / size[1])
  draw(g, def, size)
  const p = finish(canvas, size)
  cache.set(key, p)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  return p
}

/** Oak planks running along x, staggered. */
export function planks(base: string, plankW = 0.19, plankL = 1.2, grain = 0.5): Pattern {
  return patternFor({ color: base, pattern: { kind: 'planks', width: plankW, length: plankL, grain } })!
}

/** Square or rectangular tiles with thin grout lines. */
export function tiles(base: string, grout: string, tileW: number, tileH: number): Pattern {
  return patternFor({ color: base, pattern: { kind: 'tiles', width: tileW, height: tileH, grout } })!
}

const thumbs = new Map<string, string>()

/**
 * A small square picture of a finish (a data URL) for the finishes panel,
 * drawn at low resolution so it costs next to nothing. `meters` is the side
 * of the patch it shows.
 */
export function patternThumb(def: MaterialDef, px = 112, meters = 0.8): string {
  const key = `${keyOf(def)}|${px}|${meters}`
  const hit = thumbs.get(key)
  if (hit !== undefined) return hit
  let url = ''
  try {
    const canvas = canvasOf(px, px)
    const g = canvas.getContext('2d')!
    g.fillStyle = def.color
    g.fillRect(0, 0, px, px)
    if (def.pattern) {
      const size = patternSize(def.pattern)
      g.scale(px / meters, px / meters)
      // Offset into the repeat so the patch does not start on a seam.
      g.translate(-size[0] * 0.13, -size[1] * 0.21)
      g.beginPath()
      g.rect(size[0] * 0.13, size[1] * 0.21, meters, meters)
      g.clip()
      for (const dx of [0, size[0]])
        for (const dy of [0, size[1]]) {
          g.save()
          g.translate(dx, dy)
          draw(g, def, size)
          g.restore()
        }
    }
    url = canvas.toDataURL('image/png')
  } catch {
    /* no 2D canvas (tests): the swatch color shows instead */
  }
  thumbs.set(key, url)
  return url
}

/**
 * Transparent canvas with the hall's hexagons scattered into the main-room
 * floor. `rect` is the plan rect it covers ([x0, z0, x1, z1]); hexagons sit
 * where the hall's repeating pattern puts them (world-aligned, see
 * makeMaterial's `origin`), kept where `keep(x, z)` says so.
 */
export function hexScatter(
  def: MaterialDef,
  rect: [number, number, number, number],
  keep: (x: number, z: number, col: number, row: number) => boolean,
) {
  const p = def.pattern
  if (p?.kind !== 'hex') return null
  const [x0, z0, x1, z1] = rect
  const size = patternSize(p)
  const canvas = canvasOf(pow2((x1 - x0) * PX_PER_M), pow2((z1 - z0) * PX_PER_M))
  const g = canvas.getContext('2d')!
  g.scale(canvas.width / (x1 - x0), canvas.height / (z1 - z0))
  // Canvas meters: x from x0; y (down the canvas) is plan z from z0 (see Floors: v runs from +z to −z, flipped).
  // The hall pattern puts pattern (px, py) at plan x = px + i·size.x, z = FLOOR_Z1 + py + j·size.y.
  const colFrom = Math.floor(x0 / p.size) - 2
  const colTo = Math.ceil(x1 / p.size) + 2
  const rowH = p.size * (Math.sqrt(3) / 2)
  const zBase = FLOOR_Z1 - Math.ceil(FLOOR_Z1 / size[1]) * size[1]
  const rowFrom = Math.floor((z0 - zBase) / rowH) - 2
  const rowTo = Math.ceil((z1 - zBase) / rowH) + 2
  for (let row = rowFrom; row <= rowTo; row++)
    for (let col = colFrom; col <= colTo; col++) {
      const c = hexCell(p, col, row)
      const x = c.cx
      const z = zBase + c.cy
      if (x < x0 - p.size || x > x1 + p.size || z < z0 - p.size || z > z1 + p.size) continue
      if (!keep(x, z, col, row)) continue
      // Grout ring first so a lone hexagon reads as a tile set into the wood.
      g.globalAlpha = 1
      g.fillStyle = p.grout
      g.beginPath()
      const Rg = (p.size + 0.004) / Math.sqrt(3)
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3
        g.lineTo(x - x0 + Rg * Math.cos(a), z - z0 + Rg * Math.sin(a))
      }
      g.closePath()
      g.fill()
      hexTile(g, p, x - x0, z - z0, c.tone, c.seed)
    }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Plan z of the kitchen-side edge of the floors: world-aligned floor patterns start there (see Floors). */
export const FLOOR_Z1 = FLOOR_ORIGIN_Z
