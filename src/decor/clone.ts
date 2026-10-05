import type { DecorItem, DecorKind } from '../model/decor'

// Ids for new decor items and groups, and copies of items for duplicate and paste.

let sequence = 0
/**
 * Unique in this session and, in practice, across sessions: the time, a counter
 * for ids made in the same millisecond (duplicating a large selection), and a
 * random tail for other tabs.
 */
const unique = () =>
  Date.now().toString(36) + (sequence++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6)

export const newId = (kind: DecorKind) => `${kind}-${unique()}`

export const newGroupId = () => `g-${unique()}`

/** Ids of a group's members. */
export const membersOf = (items: DecorItem[], groupId: string) =>
  items.filter((i) => i.groupId === groupId).map((i) => i.id)

/**
 * Copies of a set of items, with fresh ids unless `fresh` is false. A group
 * copied whole becomes a new group; a lone member of a group is copied ungrouped.
 */
export function cloneSet(src: DecorItem[], all: DecorItem[], fresh = true): DecorItem[] {
  const ids = new Set(src.map((i) => i.id))
  const regroup = new Map<string, string>()
  return src.map((s) => {
    const copy = structuredClone(s) as DecorItem
    if (fresh) copy.id = newId(s.kind)
    // Plants lay out their leaves from the seed (the id by default): keep the copy identical.
    if (copy.kind === 'plant' && s.kind === 'plant') copy.seed = s.seed ?? s.id
    const g = s.groupId
    const whole =
      !!g &&
      src.filter((o) => o.groupId === g).length > 1 &&
      all.filter((o) => o.groupId === g).every((o) => ids.has(o.id))
    if (g && whole) {
      if (!regroup.has(g)) regroup.set(g, fresh ? newGroupId() : g)
      copy.groupId = regroup.get(g)
    } else delete copy.groupId
    return copy
  })
}
