// The shape of a furniture catalog entry, and the finishes every piece chooses from.

import type { FurnitureOption } from '../../model/decor'
import type { Vec3 } from '../../model/types'
import type { Mount } from '../catalog'

export type OptionSpec = (
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'chips'; choices: { id: FurnitureOption; label: string }[] }
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; unit?: string }
  | { key: string; label: string; kind: 'text'; placeholder?: string; hint?: string }
) & {
  /** Shown only while another option has this value. */
  when?: [key: string, value: FurnitureOption]
}

export interface FurnitureSpec {
  label: string
  note: string
  group:
    'Sleep' | 'Sit' | 'Work & dine' | 'Storage' | 'Kitchen & wall' | 'Balcony' | 'Decor' | 'Appliances & electronics'
  mount: Mount
  /**
   * Small pieces that stand on counters, desks and shelves (a mixer, mugs,
   * speakers): they settle onto other furniture, unlike floor pieces, which
   * slide along the floor underneath it.
   */
  tabletop?: boolean
  /** Default [w, h, d] in meters. */
  size: Vec3
  /** Wall pieces: the usual height of the bottom edge; placing near it settles there. */
  mountHeight?: number
  /** Pieces whose size follows their options (a speaker pair's spacing): the size for these options. */
  sizeFor?: (options: Record<string, FurnitureOption>, size: Vec3) => Vec3
  presets?: { label: string; size: Vec3 }[]
  /** Body colors to offer instead of the wood and paint finishes (appliances). */
  bodyColors?: { label: string; color: string }[]
  /** Which of the three finish colors the piece uses. */
  uses: ('body' | 'metal' | 'fabric')[]
  finish: { body: string; metal: string; fabric: string }
  options: Record<string, FurnitureOption>
  optionSpecs: OptionSpec[]
  /** Size fields the inspector shows (height is fixed for some pieces). */
  editable: ('w' | 'h' | 'd')[]
}

export const BODY_FINISHES = [
  { label: 'Birch plywood', color: '#dcc196' },
  { label: 'Oak', color: '#c49c6c' },
  { label: 'Walnut', color: '#6a4731' },
  { label: 'White', color: '#f0eee9' },
  { label: 'Black', color: '#262625' },
  { label: 'Anthracite', color: '#3d3f42' },
  { label: 'Navy', color: '#2e4270' },
]

export const METAL_FINISHES = [
  { label: 'Black steel', color: '#1d1d1d' },
  { label: 'White', color: '#eeeeec' },
  { label: 'Brass', color: '#b8963e' },
  { label: 'Steel', color: '#b7babd' },
]

export const FABRIC_FINISHES = [
  { label: 'Linen', color: '#e6e0d4' },
  { label: 'Oat', color: '#d3c3a6' },
  { label: 'Charcoal', color: '#56585c' },
  { label: 'Terracotta', color: '#b3664b' },
  { label: 'Sage', color: '#9aab8e' },
  { label: 'Blue', color: '#8ea5c3' },
  { label: 'Leather', color: '#8a5634' },
]

export const PLY = BODY_FINISHES[0].color
export const BLACK = METAL_FINISHES[0].color
export const LINEN = FABRIC_FINISHES[0].color

/** A piece's default finish colors. */
export const finish = (body = PLY, metal = BLACK, fabric = LINEN) => ({ body, metal, fabric })

/** Rounds meters to the millimeter. */
export const roundMm = (v: number) => Math.round(v * 1000) / 1000
