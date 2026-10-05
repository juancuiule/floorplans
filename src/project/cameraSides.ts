import type { CameraDef, CameraId } from '../model/plan'
import type { Rect, Shell } from '../model/types'

// The iso views can look at the flat from either long side: the same view
// mirrored across the plan's center line (constant z), so from the other side.

/** Views that can be seen from either side. Top and the eye-level views stay put. */
export const FLIPPABLE = ['iso-balcony', 'iso-entry'] as const satisfies readonly CameraId[]
export type FlippableView = (typeof FLIPPABLE)[number]

export const isFlippable = (id: string): id is FlippableView => (FLIPPABLE as readonly string[]).includes(id)

/** The camera mirrored across the plane z = cz: same height and distance, from the other side. */
export function mirrorCamera<T extends Pick<CameraDef, 'position' | 'target'>>(cam: T, cz: number): T {
  const [px, py, pz] = cam.position
  const [tx, ty, tz] = cam.target
  return { ...cam, position: [px, py, 2 * cz - pz], target: [tx, ty, 2 * cz - tz] }
}

/** Which side of the center line a camera stands on: -1 toward z min, +1 toward z max. */
export const sideOf = (cam: Pick<CameraDef, 'position'>, cz: number): -1 | 1 => (cam.position[2] < cz ? -1 : 1)

/**
 * A name for each long side of the plan (z min, z max), from the rooms along
 * that edge that don't span the whole depth: "bathroom", "hall + kitchen".
 */
export function sideNames(shell: Pick<Shell, 'rooms' | 'baseFloors'>): [string, string] {
  const bounds = shell.baseFloors.reduce<Rect>(
    (u, f) => [
      Math.min(u[0], f.rect[0]),
      Math.min(u[1], f.rect[1]),
      Math.max(u[2], f.rect[2]),
      Math.max(u[3], f.rect[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
  const [, z0, , z1] = bounds
  const TOL = 0.15
  const area = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1])
  const pick = (edge: 0 | 1) => {
    const rooms = shell.rooms.filter((r) => {
      const atMin = Math.abs(r.rect[1] - z0) < TOL
      const atMax = Math.abs(r.rect[3] - z1) < TOL
      return (edge === 0 ? atMin : atMax) && !(atMin && atMax) && r.rect[1] < z1 && r.rect[3] > z0
    })
    const best = rooms.sort((a, b) => area(b.rect) - area(a.rect))[0]
    return best ? best.name.toLowerCase() : null
  }
  return [pick(0) ?? 'near', pick(1) ?? 'far']
}
