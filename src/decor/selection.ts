import type { ArtworkItem, DecorItem } from '../model/decor'
import type { Vec3 } from '../model/types'
import {
  align,
  distribute,
  hangGallery,
  matchSize,
  selectionFrame,
  type AlignMode,
  type GalleryOpts,
  type Patches,
} from './arrange'
import { screenAxes } from './edit'
import { backedBox, boxIn, isWallItem, unionBox } from './extent'
import { alongWall } from './placement'
import { settleMoved } from './rest'
import { useDecor } from './store'

// Commands on the current selection, shared by the edit bar, the inspector and
// the keyboard. Each one is a single undo step.

export const selectedItems = (s = useDecor.getState()): DecorItem[] =>
  s.items.filter((i) => s.selectedIds.includes(i.id))

/** The frame to arrange the selection in (null: mixed walls and floor, or nothing selected). */
export function arrangeFrame(items = selectedItems()) {
  const { right, away } = screenAxes()
  return selectionFrame(items, { right, away })
}

/** Patches that line pieces up on the floor plan, with each surface piece resting on what is under its new spot. */
function settled(items: DecorItem[], patches: Patches): Patches {
  const moved = items.filter((i) => patches[i.id]).map((i) => ({ ...i, ...patches[i.id] }) as DecorItem)
  if (!moved.length || moved.some(isWallItem)) return patches
  const out = { ...patches }
  for (const m of settleMoved(moved)) out[m.id] = { ...patches[m.id], at: m.at }
  return out
}

export function alignSelection(mode: AlignMode) {
  const s = useDecor.getState()
  const items = selectedItems(s)
  const frame = arrangeFrame(items)
  if (frame) s.applyPatches(settled(items, align(items, frame, mode, s.items)))
}

export function distributeSelection(axis: 'u' | 'v') {
  const s = useDecor.getState()
  const items = selectedItems(s)
  const frame = arrangeFrame(items)
  if (frame) s.applyPatches(settled(items, distribute(items, frame, axis, s.items)))
}

/** Every artwork in the selection takes the size and frame of the primary one. */
export function matchSelectionSize() {
  const s = useDecor.getState()
  const source =
    s.items.find((i) => i.id === s.selectedId && i.kind === 'artwork') ??
    selectedItems(s).find((i) => i.kind === 'artwork')
  if (source) s.applyPatches(matchSize(selectedItems(s), source as ArtworkItem))
}

/** Furniture standing against the selection's wall, under the selection's center (a sofa, a sideboard). */
export function pieceBelow(items = selectedItems()): { item: DecorItem; center: number } | null {
  const s = useDecor.getState()
  const frame = arrangeFrame(items)
  if (frame?.kind !== 'wall' || !items.length) return null
  const all = unionBox(items.map((i) => boxIn(i, frame)))
  const c = (all.u0 + all.u1) / 2
  for (const i of s.items) {
    const b = backedBox(i, frame)
    if (b && b.u0 <= c && c <= b.u1 && b.v1 < all.v0) return { item: i, center: (b.u0 + b.u1) / 2 }
  }
  return null
}

/** Hangs the selection as a gallery, centered over the piece below it if there is one. */
export function hangSelection(opts: GalleryOpts) {
  const s = useDecor.getState()
  const items = selectedItems(s)
  const frame = arrangeFrame(items)
  if (frame?.kind !== 'wall') return
  const below = pieceBelow(items)
  s.applyPatches(hangGallery(items, frame, { centerU: below?.center, ...opts }))
}

/** Arrow-key offset for one item: wall pieces slide along their wall (as seen on screen) or up; floor pieces follow the screen. */
export function nudgeDelta(item: DecorItem, key: string, d: number): Vec3 | null {
  if (isWallItem(item) && 'facing' in item && item.facing) {
    if (key === 'PageUp' || key === ']' || key === 'ArrowUp') return [0, d, 0]
    if (key === 'PageDown' || key === '[' || key === 'ArrowDown') return [0, -d, 0]
    const [ax, az] = alongWall(item.facing)
    const { right } = screenAxes()
    const sign = (ax * right[0] + az * right[1] >= 0 ? 1 : -1) * (key === 'ArrowRight' ? 1 : -1)
    return [ax * d * sign, 0, az * d * sign]
  }
  if (!key.startsWith('Arrow')) return null
  const { right, away } = screenAxes()
  const v =
    key === 'ArrowRight'
      ? right
      : key === 'ArrowLeft'
        ? [-right[0], -right[1]]
        : key === 'ArrowUp'
          ? away
          : [-away[0], -away[1]]
  return [v[0] * d, 0, v[1] * d]
}

/** What a multi-selection holds, e.g. "3 artworks" or "5 items". */
export function selectionSummary(items: DecorItem[]): string {
  const nouns: Record<DecorItem['kind'], [string, string]> = {
    artwork: ['artwork', 'artworks'],
    plant: ['plant', 'plants'],
    lamp: ['light', 'lights'],
    furniture: ['piece of furniture', 'pieces of furniture'],
  }
  const kinds = new Set(items.map((i) => i.kind))
  if (kinds.size === 1) return `${items.length} ${nouns[items[0].kind][items.length === 1 ? 0 : 1]}`
  return `${items.length} items`
}

/** Default name of a group: what it holds and how many. */
export function defaultGroupName(members: { kind: DecorItem['kind'] }[]): string {
  const n = members.length
  if (members.every((i) => i.kind === 'artwork')) return `Gallery wall · ${n}`
  if (members.every((i) => i.kind === 'plant')) return `Plant group · ${n}`
  if (members.every((i) => i.kind === 'furniture')) return `Furniture group · ${n}`
  return `Group · ${n}`
}

export function groupName(groupId: string, s = useDecor.getState()): string {
  return s.groupNames[groupId] || defaultGroupName(s.items.filter((i) => i.groupId === groupId))
}

/** The group the whole selection is, if it is exactly one group. */
export function selectedGroup(s = useDecor.getState()): string | null {
  const g = s.items.find((i) => i.id === s.selectedIds[0])?.groupId
  if (!g || s.selectedIds.length < 2) return null
  const members = s.items.filter((i) => i.groupId === g)
  return members.length === s.selectedIds.length && members.every((m) => s.selectedIds.includes(m.id)) ? g : null
}
