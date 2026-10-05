import type { DecorItem } from '../model/decor'
import type { Finishes } from '../model/finishes'

// Undo history of a layout (see docs/adr/0005-undo-by-snapshots.md).
//
// Entries are before/after snapshots of the committed layout: what is saved to
// disk. Items are immutable and shared between snapshots, so an entry costs an
// array. Changes recorded with the same merge key fold into one entry: a gesture
// (a drag, a rotate-ring turn) for as long as it lasts, anything else (a slider
// scrub, a burst of nudges) while the changes keep coming within `mergeMs`.

export interface Snapshot {
  items: DecorItem[]
  finishes: Finishes
}

/** How a change merges with the one before it. */
export type MergeKey =
  /** Its own step. */
  | null
  /** Same key within mergeMs: one step. */
  | { key: string }
  /** Same gesture: one step, however long it takes. */
  | { gesture: number }

export interface History {
  /** Starts over from `current` (a file was loaded): nothing to undo or redo. */
  reset(current: Snapshot): void
  /** The layout is now `next`. Records a step unless nothing changed; clears redo. */
  record(next: Snapshot, merge: MergeKey): void
  /** The snapshot to restore, and the one it replaces; null when there is nothing to undo. */
  undo(): { to: Snapshot; from: Snapshot } | null
  redo(): { to: Snapshot; from: Snapshot } | null
  readonly canUndo: boolean
  readonly canRedo: boolean
}

interface Entry {
  before: Snapshot
  after: Snapshot
  merge: string | null
  t: number
}

const sameItems = (a: DecorItem[], b: DecorItem[]) => a.length === b.length && a.every((x, i) => x === b[i])
export const sameSnapshot = (a: Snapshot, b: Snapshot) => a.finishes === b.finishes && sameItems(a.items, b.items)

const mergeId = (m: MergeKey) => (m === null ? null : 'gesture' in m ? `g:${m.gesture}` : `k:${m.key}`)

export function createHistory(
  initial: Snapshot,
  { limit = 200, mergeMs = 1000, now = () => performance.now() } = {},
): History {
  const past: Entry[] = []
  const future: Entry[] = []
  let current = initial

  return {
    reset(snapshot) {
      past.length = 0
      future.length = 0
      current = snapshot
    },
    record(next, merge) {
      if (sameSnapshot(next, current)) return
      const prev = current
      current = next
      const id = mergeId(merge)
      const t = now()
      const top = past.at(-1)
      if (top && id && top.merge === id && (id.startsWith('g:') || t - top.t < mergeMs)) {
        top.after = next
        top.t = t
        // A gesture that ended where it started (or was cancelled) is no step at all.
        if (sameSnapshot(top.before, next)) past.pop()
      } else {
        past.push({ before: prev, after: next, merge: id, t })
        if (past.length > limit) past.shift()
      }
      future.length = 0
    },
    undo() {
      const e = past.pop()
      if (!e) return null
      future.push(e)
      current = e.before
      return { to: e.before, from: e.after }
    },
    redo() {
      const e = future.pop()
      if (!e) return null
      past.push(e)
      current = e.after
      return { to: e.after, from: e.before }
    },
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
  }
}
