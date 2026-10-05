import type { Vec3 } from '../model/types'
import { isFlippable, mirrorCamera, sideOf } from '../project/cameraSides'
import { CAMERAS, CENTER_Z, SIDE_NAMES } from '../project/derived'
import type { ViewPreset } from '../store'

/** Vertical field of view, in degrees, for the overview presets. */
const WIDE_FOV = 38
/** Vertical field of view, in degrees, for eye-level views. */
export const EYE_FOV = 64

const FOV: Record<ViewPreset, number> = {
  'iso-balcony': WIDE_FOV,
  'iso-entry': WIDE_FOV,
  top: WIDE_FOV,
  'from-balcony': EYE_FOV,
  'from-entry': EYE_FOV,
}

/** The open plan's camera presets (src/project/derived.ts), with a lens each. */
export const PRESETS: Record<ViewPreset, { label: string; position: Vec3; target: Vec3; fov: number }> =
  Object.fromEntries((Object.keys(FOV) as ViewPreset[]).map((id) => [id, { ...CAMERAS[id], fov: FOV[id] }])) as Record<
    ViewPreset,
    { label: string; position: Vec3; target: Vec3; fov: number }
  >

type Preset = (typeof PRESETS)[ViewPreset]

/** A preset as seen from its own side, or (iso views) mirrored to the other long side. */
export function presetCamera(id: ViewPreset, flipped: boolean): Preset {
  const p = PRESETS[id]
  return flipped && isFlippable(id) ? mirrorCamera(p, CENTER_Z) : p
}

/** Name of the side an iso view looks from, e.g. "bathroom". */
export function viewSide(id: ViewPreset, flipped: boolean): string {
  return SIDE_NAMES[sideOf(presetCamera(id, flipped), CENTER_Z) < 0 ? 0 : 1]
}
