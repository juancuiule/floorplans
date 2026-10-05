import type { AccentWall, Finishes, FloorId, FloorZone, TileLayout } from '../model/finishes'
import { plan } from './plan'
import type { MaterialDef } from '../model/types'

// What each finish looks like, as material definitions the scene can build.
// Floors take their cue from the owner's Pinterest board: pale oak, warmer
// oak and walnut, herringbone, polished concrete, mixed-tone hexagons,
// terracotta for the balcony and blue/cream quarter-circle cement tiles.

export interface FloorFinish {
  label: string
  def: MaterialDef
}

export const FLOORS: Record<FloorId, FloorFinish> = {
  oakLight: {
    label: 'Light oak',
    def: { color: '#e2cba8', roughness: 0.7, pattern: { kind: 'planks', width: 0.19, length: 1.2, grain: 0.5 } },
  },
  oakNatural: {
    label: 'Natural oak',
    def: { color: '#cfa77b', roughness: 0.65, pattern: { kind: 'planks', width: 0.19, length: 1.4, grain: 0.8 } },
  },
  walnut: {
    label: 'Walnut',
    def: { color: '#7a5840', roughness: 0.55, pattern: { kind: 'planks', width: 0.16, length: 1.2, grain: 1 } },
  },
  herringbone: {
    label: 'Oak herringbone',
    def: { color: '#dcc19b', roughness: 0.65, pattern: { kind: 'herringbone', width: 0.1, length: 0.6, grain: 0.6 } },
  },
  concrete: {
    label: 'Polished concrete',
    def: { color: '#cdc9c2', roughness: 0.38, pattern: { kind: 'concrete' } },
  },
  hexGrey: {
    label: 'Grey hexagons',
    def: {
      color: '#c3bfb8',
      roughness: 0.55,
      pattern: {
        kind: 'hex',
        size: 0.2,
        grout: '#dcd8d0',
        tones: ['#d2cec7', '#c6c2bb', '#bab6af', '#aeaaa3', '#9d9993', '#86837e', '#6a6864'],
      },
    },
  },
  hexCharcoal: {
    label: 'Charcoal hexagons',
    def: {
      color: '#4a4947',
      roughness: 0.5,
      pattern: {
        kind: 'hex',
        size: 0.2,
        grout: '#b3aea6',
        tones: ['#3b3b3a', '#454443', '#2f2f2f', '#525150', '#5f5d5a', '#282828', '#6d6a66'],
      },
    },
  },
  terracotta: {
    label: 'Terracotta',
    def: {
      color: '#c47f5f',
      roughness: 0.85,
      pattern: {
        kind: 'tiles',
        width: 0.3,
        height: 0.3,
        grout: '#dccdbb',
        tones: ['#c47f5f', '#bb7353', '#cb8a69', '#b86f52', '#c8836a', '#be7a5c'],
      },
    },
  },
  cementQuarter: {
    label: 'Cement tiles, blue',
    def: {
      color: '#efe7d6',
      roughness: 0.6,
      pattern: { kind: 'quarter', size: 0.2, ink: '#4f6c93', grout: '#d9d1c2' },
    },
  },
  porcelainGrey: {
    label: 'Grey porcelain',
    def: { color: '#c4c1bb', roughness: 0.6, pattern: { kind: 'tiles', width: 0.6, height: 0.6, grout: '#a9a59e' } },
  },
  balconyGrey: {
    label: 'Grey tiles',
    def: { color: '#c9c4bb', roughness: 0.85, pattern: { kind: 'tiles', width: 0.45, height: 0.45, grout: '#aca79e' } },
  },
}

export const ZONE_LABELS: Record<FloorZone, string> = {
  main: 'Main room',
  hall: 'Hall and kitchen',
  bath: 'Bathroom',
  balcony: 'Balcony',
}

export const ACCENT_LABELS: Record<AccentWall, string> = { none: 'None', ...plan.walls.accent }

export const PAINTS = [
  { label: 'Warm white', color: '#f3f1ec' },
  { label: 'Chalk', color: '#f8f7f3' },
  { label: 'Bone', color: '#ece4d6' },
  { label: 'Greige', color: '#ddd6ca' },
  { label: 'Pale sage', color: '#dfe3d6' },
  { label: 'Mist', color: '#dfe4e6' },
  { label: 'Blush', color: '#f0e0d7' },
]

export const ACCENTS = [
  { label: 'Sage', color: '#9fae95' },
  { label: 'Olive', color: '#8d8b64' },
  { label: 'Terracotta', color: '#c98a6b' },
  { label: 'Ochre', color: '#d3aa62' },
  { label: 'Denim', color: '#7189a6' },
  { label: 'Clay pink', color: '#d8ab9d' },
  { label: 'Charcoal', color: '#5b5c5f' },
]

export const TILE_LAYOUT_LABELS: Record<TileLayout, string> = {
  stack: '60 × 30',
  subway: 'Subway',
  square: '10 × 10',
  vertical: 'Vertical',
}

export const TILE_COLORS = [
  { label: 'White', color: '#f6f6f4' },
  { label: 'Cream', color: '#efe7d8' },
  { label: 'Sage', color: '#bfcab5' },
  { label: 'Powder blue', color: '#b9c8d4' },
  { label: 'Blush', color: '#e8d2c8' },
  { label: 'Terracotta', color: '#c98a6b' },
  { label: 'Graphite', color: '#5d5e60' },
]

/** Grout that reads on the tile: darker on light tiles, lighter on dark ones. */
function groutFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return l < 0.45 ? '#b8b4ad' : '#9c9a96'
}

export function bathTileDef(tile: Finishes['bathTile']): MaterialDef {
  const grout = groutFor(tile.color)
  const base = { color: tile.color, roughness: 0.3 }
  switch (tile.layout) {
    case 'subway':
      return { ...base, pattern: { kind: 'tiles', width: 0.15, height: 0.075, grout, bond: 0.5, vary: 0.035 } }
    case 'square':
      return { ...base, pattern: { kind: 'tiles', width: 0.1, height: 0.1, grout, vary: 0.03 } }
    case 'vertical':
      return { ...base, pattern: { kind: 'tiles', width: 0.075, height: 0.3, grout, vary: 0.03 } }
    default:
      return { ...base, roughness: 0.35, pattern: { kind: 'tiles', width: 0.6, height: 0.3, grout } }
  }
}

/** Material ids whose look comes from the finishes instead of src/project/materials.ts. */
const ZONE_OF: Record<string, FloorZone> = {
  floorMain: 'main',
  floorHall: 'hall',
  bathFloor: 'bath',
  balconyFloor: 'balcony',
}

export const isFinishMaterial = (id: string) =>
  id in ZONE_OF ||
  id === 'plaster' ||
  id === 'ceiling' ||
  id === 'tile' ||
  id.startsWith('accent:') ||
  id.startsWith('paint:')

/**
 * The material definition for a finish-driven id under the given finishes, or
 * null for ids the finishes do not touch. `plaster` takes the paint color,
 * `paint:<face>` layers a face's own color (hidden when it has none), `ceiling`
 * the ceiling color, the
 * `accent:<wall>` layers the accent color on the chosen wall (and are hidden on
 * the others), `tile` is the bathroom wall tile and the floor ids follow their zone.
 */
export function finishDef(
  id: string,
  f: Finishes,
  base: Record<string, MaterialDef>,
): (MaterialDef & { hidden?: boolean }) | null {
  const zone = ZONE_OF[id]
  if (zone) return FLOORS[f.floors[zone]].def
  if (id === 'plaster') return { ...base.plaster, color: f.wallPaint }
  if (id === 'ceiling') return { ...base.ceiling, color: f.ceilingPaint }
  if (id.startsWith('paint:')) {
    const color = f.paint[id.slice('paint:'.length)]
    return { ...base.plaster, color: color ?? f.wallPaint, hidden: !color }
  }
  if (id === 'tile') return bathTileDef(f.bathTile)
  if (id.startsWith('accent:')) {
    const on = f.accentWall === id.slice('accent:'.length)
    return { ...base.plaster, color: on ? f.accentColor : f.wallPaint, hidden: !on }
  }
  return null
}
