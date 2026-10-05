import { create } from 'zustand'
import { shell } from '../project'
import { launch, showLayoutInUrl } from '../project/launch'
import { migrateAccent, paintFaces } from '../project/paintFaces'
import { plan } from '../project/plan'
import { isPlaced, type DecorFile, type DecorItem, type DecorKind } from '../model/decor'
import { DEFAULT_FINISHES, normalizeFinishes, type Finishes } from '../model/finishes'
import type { Vec3 } from '../model/types'
import { listArtwork, readLayout, readLayoutText, uploadArtwork, writeLayout, type LibraryImage } from './api'
import { copyOffset, followLead, rotateAround, sameWall, type Patches } from './arrange'
import { carry } from './carry'
import { cloneSet, membersOf, newGroupId } from './clone'
import { editRefs } from './edit'
import { isWallItem, translated } from './extent'
import { createHistory, type MergeKey, type Snapshot } from './history'
import { namesOf, serialize } from './layoutFile'
import { createSaver } from './persistence'
import { mountOf, placeAt, slidesOnFloor } from './placement'
import { settleMoved } from './rest'
import { validateLayout } from './validateLayout'

// The open layout: its decor items, finishes and groups, the selection, and the
// item following the pointer. Everything here is saved to the layout file and
// recorded in the undo history (docs/adr/0004, 0005); transient editing state
// lives in useEdit (src/decor/edit.ts).
//
// Two subscribers do the bookkeeping, so no action has to: one records history
// (src/decor/history.ts), the other saves (src/decor/persistence.ts).

export type PanelTab = 'furniture' | 'artwork' | 'plants' | 'lights' | 'room'

/**
 * Whether changes are being saved. 'no-api': there is no dev server to save to
 * (a static build). 'broken-file': the file on disk is not a layout, so saving
 * pauses until it is fixed rather than overwrite the fix in progress.
 */
export type SaveStatus = 'ok' | 'no-api' | 'broken-file'

export const SAVE_STATUS_MESSAGE: Record<Exclude<SaveStatus, 'ok'>, string> = {
  'no-api': 'Saving is only available while running the dev server.',
  'broken-file': 'Saving paused: the layout file on disk is not a valid layout. Fix it and this tab reloads it.',
}

interface DecorState {
  items: DecorItem[]
  loaded: boolean
  saveStatus: SaveStatus
  /** With saveStatus 'broken-file': what is wrong with the file, for the person fixing it. */
  fileProblem: string | null
  /** The primary selected item: the one last clicked, shown in the inspector. */
  selectedId: string | null
  /** Every selected item (includes selectedId); more than one is a multi-selection. */
  selectedIds: string[]
  /** Names given to groups, by groupId (saved in the layout file, not part of undo). */
  groupNames: Record<string, string>
  /** Originals of the other selected items that move along with movingId in a drag. */
  followers: DecorItem[]
  /** Item following the pointer: a new draft being placed, or an existing one being dragged. */
  movingId: string | null
  /** True while movingId is a new item that has not been dropped yet. */
  isDraft: boolean
  /** Original state of an existing item being re-placed, restored on cancel. */
  backup: DecorItem | null
  library: LibraryImage[]
  /** Why the last upload failed, for the panel. */
  uploadError: string | null
  tab: PanelTab
  /** Floors, paint, tiles and walls taken out of this layout (saved in its file, part of undo). */
  finishes: Finishes
  /** The layout being edited: null for layouts/decor.json, else the <slug> of layouts/decor.<slug>.json. */
  layout: string | null
  /** Display name stored in the file ('' when it has none). */
  layoutName: string
  /** The other side of the A/B compare toggle (undefined: nothing to compare with). */
  compareWith: string | null | undefined
  hasClipboard: boolean
  canUndo: boolean
  canRedo: boolean

  load: () => Promise<void>
  refreshLibrary: () => Promise<void>
  upload: (file: File) => Promise<LibraryImage | null>
  /** Adds a new item that follows the pointer until the next click. */
  startPlacing: (item: DecorItem) => void
  startDragging: (id: string) => void
  /** Re-place an existing item with the next click, like a new one. */
  startRelocating: (id: string) => void
  stopMoving: () => void
  cancelPlacing: () => void
  /** Patches an item. Repeated patches of the same fields in quick succession (a slider scrub) are one undo step. */
  update: <T extends DecorItem>(id: string, patch: Partial<T>) => void
  remove: (id: string) => void
  /** Places a copy that follows the pointer until the next click. */
  duplicate: (id: string) => void
  /** Moves an item by a plan offset in meters; a burst of nudges is one undo step. */
  nudge: (id: string, delta: Vec3) => void
  /** Turns an item around y by `deg` (one undo step each). */
  rotateBy: (id: string, deg: number) => void
  copy: (id: string) => void
  /** Places a copy of the copied item, following the pointer. */
  paste: () => void
  /** Groups every change until endGesture into one undo step (a drag, a rotate-handle turn). */
  beginGesture: () => void
  endGesture: () => void
  /** Puts these exact item objects back (a cancelled gesture), with what rests on them. */
  restore: (originals: DecorItem[]) => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void
  /** Selects these items; `primary` (default: the last) is the one the inspector follows. */
  selectMany: (ids: string[], primary?: string | null) => void
  /** Shift+click: adds or removes an item (its whole group unless `single`). */
  toggleSelect: (id: string, opts?: { single?: boolean }) => void
  /** Click: selects an item's whole group (unless `single`), or keeps a multi-selection it is part of. */
  pick: (id: string, opts?: { single?: boolean }) => void
  /** Cmd+A: everything on the selected item's wall, or everything of its kind (or of `kind`). */
  selectAllLike: (kind?: DecorKind) => void
  /** Patches several items at once (one undo step, or part of the current gesture). */
  applyPatches: (patches: Patches) => void
  removeMany: (ids: string[]) => void
  /** Duplicates the selection: one item follows the pointer; several are placed next to their originals. */
  duplicateSelection: () => void
  /** Moves each item by its own offset; a burst of nudges is one undo step. */
  nudgeMany: (deltas: Record<string, Vec3>) => void
  /** Turns the selection's floor and surface pieces together about their center. */
  rotateSelection: (deg: number) => void
  /** Groups the selection (Cmd+G), ungroups it (Shift+Cmd+G). */
  group: () => void
  ungroup: () => void
  renameGroup: (groupId: string, name: string) => void
  setTab: (tab: PanelTab) => void
  setFinishes: (patch: Partial<Finishes>) => void
  /** Saves what is pending, then loads another layout (fresh undo history). The URL follows. */
  switchLayout: (slug: string | null) => Promise<void>
  /** Flips between this layout and compareWith. */
  toggleCompare: () => Promise<void>
  setCompareWith: (slug: string | null | undefined) => void
  /** After a rename on the server: the new slug and name of the open layout. */
  renamed: (slug: string | null, name: string) => void
}

/** The open plan's main layout ("Current"), decor.json in the plan's layouts folder. */
export const MAIN_SLUG: string | null = null

let decorFile = launch.layout ?? MAIN_SLUG

/** What is saved: a new item still following the pointer is left out; a relocated one keeps its old spot. */
export function committedItems(s: Pick<DecorState, 'items' | 'isDraft' | 'movingId' | 'backup'>): DecorItem[] {
  return s.isDraft ? s.items.flatMap((i) => (i.id !== s.movingId ? [i] : s.backup ? [s.backup] : [])) : s.items
}

/** A write to the store: a patch, or a function of the current state returning one. */
type Change = Partial<DecorState> | ((s: DecorState) => Partial<DecorState>)

const snapshotOf = (s: DecorState): Snapshot => ({ items: committedItems(s), finishes: s.finishes })

const history = createHistory({ items: [], finishes: DEFAULT_FINISHES })
const saver = createSaver<string | null>((body, slug) => writeLayout(slug, body))

/** Writes a pending (debounced) save right away; resolves once it is on disk. */
export const flushSave = () => saver.flush()

/** Merge key for the next write through `set`; read once by the history subscriber. */
let nextMerge: MergeKey = null
/** The open gesture, if any: every change until it ends is one undo step. */
let gesture: number | null = null
let gestureCount = 0
let clipboard: DecorItem[] | null = null

const HEX = /^#[0-9a-f]{6}$/i
/**
 * Merge key for a finishes patch: dragging a color picker is one step, so a
 * patch that only changes colors merges with the next one of the same colors.
 * Picking a floor or taking a wall out is always its own step.
 */
function finishesMerge(prev: Finishes, patch: Partial<Finishes>): MergeKey {
  const changed: string[] = []
  const walk = (a: unknown, b: unknown, path: string): boolean => {
    if (a === b) return true
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)])
      return [...keys].every((k) =>
        walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`),
      )
    }
    changed.push(path)
    return typeof a === 'string' && typeof b === 'string' && HEX.test(a) && HEX.test(b)
  }
  const colorsOnly = Object.entries(patch).every(([k, v]) => walk(prev[k as keyof Finishes], v, k))
  return colorsOnly && changed.length ? { key: `finishes:${changed.sort().join(',')}` } : null
}

export const useDecor = create<DecorState>((rawSet, get) => {
  /**
   * Every edit goes through here. It brings along what rests on the pieces it
   * moves (src/decor/carry.ts), and `merge` says how the change folds into the
   * undo history. Undo, redo and loading a file restore whole snapshots with
   * rawSet and skip both.
   */
  const set = (partial: Change, merge: MergeKey = null) => {
    nextMerge = merge
    rawSet((s) => {
      const p = typeof partial === 'function' ? partial(s) : partial
      if (!p || !('items' in p) || !p.items || p.items === s.items) return p
      return { ...p, items: carry(s.items, p.items) }
    })
  }

  const syncFlags = () => {
    const { canUndo, canRedo } = history
    if (get().canUndo !== canUndo || get().canRedo !== canRedo) rawSet({ canUndo, canRedo })
  }

  /** Restores a snapshot from history, selecting the items the step touched. */
  const restoreSnapshot = (to: Snapshot, from: Snapshot) => {
    const fromById = new Map(from.items.map((i) => [i.id, i]))
    const changed = to.items.filter((i) => fromById.get(i.id) !== i).map((i) => i.id)
    const { selectedId, selectedIds } = get()
    const ids = new Set(to.items.map((i) => i.id))
    const kept = selectedIds.filter((id) => ids.has(id))
    rawSet({
      items: to.items,
      finishes: to.finishes,
      ...(changed.length
        ? { selectedIds: changed, selectedId: selectedId && changed.includes(selectedId) ? selectedId : changed.at(-1) }
        : { selectedIds: kept, selectedId: selectedId && ids.has(selectedId) ? selectedId : (kept.at(-1) ?? null) }),
    })
    syncFlags()
  }

  /** Starts placing a copy (with its own id already), under the pointer when it is over the scene. */
  const placeCopy = (copy: DecorItem) => {
    const hit = editRefs.pointerInCanvas ? (slidesOnFloor(copy) ? editRefs.lastFloorHit : editRefs.lastHit) : null
    const patch = hit && placeAt(copy, hit)
    get().startPlacing(patch ? ({ ...copy, ...patch } as DecorItem) : copy)
  }

  /** Pastes several items at once: under the pointer when it is over a fitting surface, else next to the originals. */
  const pasteSet = (copies: DecorItem[]) => {
    const lead = copies[0]
    const hit = editRefs.pointerInCanvas ? (slidesOnFloor(lead) ? editRefs.lastFloorHit : editRefs.lastHit) : null
    const patch = hit && placeAt(lead, { ...hit, point: hit.point.clone() }, { free: true })
    let placed: DecorItem[]
    if (patch) {
      const leadTo = { ...lead, ...patch } as DecorItem
      placed = copies.map((c) => (c === lead ? leadTo : ({ ...c, ...followLead(lead, leadTo, c) } as DecorItem)))
    } else placed = copies.map((c) => ({ ...c, at: translated(c.at, copyOffset(c)) }) as DecorItem)
    set((s) => ({ items: [...s.items, ...placed] }))
    get().selectMany(
      placed.map((c) => c.id),
      placed[0].id,
    )
  }

  /** Drops groupId from items whose group has fewer than two members left. */
  const dissolveSingletons = (items: DecorItem[]) => {
    const size = new Map<string, number>()
    for (const i of items) if (i.groupId) size.set(i.groupId, (size.get(i.groupId) ?? 0) + 1)
    return items.map((i) => {
      if (!i.groupId || size.get(i.groupId)! > 1) return i
      const loose = { ...i }
      delete loose.groupId
      return loose
    })
  }

  return {
    items: [],
    loaded: false,
    saveStatus: 'ok',
    fileProblem: null,
    selectedId: null,
    selectedIds: [],
    groupNames: {},
    followers: [],
    movingId: null,
    isDraft: false,
    backup: null,
    library: [],
    uploadError: null,
    tab: 'artwork',
    finishes: DEFAULT_FINISHES,
    layout: decorFile,
    layoutName: '',
    compareWith: undefined,
    hasClipboard: false,
    canUndo: false,
    canRedo: false,

    load: async () => {
      const file = decorFile
      const read = await readLayout(file)
      // Switched again while this was loading: the newer load wins.
      if (file !== decorFile) return
      if (!read.ok) {
        // Without an API, start empty and do not persist. With a broken file (a
        // hand edit half done), keep what is on screen and do not overwrite it;
        // fixing the file reloads it.
        rawSet({
          loaded: true,
          saveStatus: read.reason,
          fileProblem: read.reason === 'broken-file' ? 'not valid JSON' : null,
        })
        return
      }
      const problems = validateLayout(read.json)
      if (problems.length) {
        const more = problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''
        rawSet({ loaded: true, saveStatus: 'broken-file', fileProblem: problems[0] + more })
        return
      }
      const data = read.json as DecorFile
      const items = data.items ?? []
      // A layout from before per-face paint: its accent wall becomes a painted face.
      const finishes = migrateAccent(normalizeFinishes(data.finishes, plan), paintFaces(shell.walls), shell.walls)
      const layoutName = typeof data.name === 'string' ? data.name : ''
      const groupNames = namesOf(data.groups)
      // Keep the item under the pointer when the file is reloaded mid-placement.
      const { movingId, isDraft, selectedId: prevId, selectedIds: prevIds } = get()
      const moving = isDraft ? get().items.find((i) => i.id === movingId) : undefined
      const next = moving ? [...items.filter((i) => i.id !== moving.id), moving] : items
      const ids = new Set(next.map((i) => i.id))
      const selectedIds = prevIds.filter((id) => ids.has(id))
      const selectedId = prevId && ids.has(prevId) ? prevId : (selectedIds.at(-1) ?? null)
      saver.synced(serialize(items, finishes, layoutName, groupNames))
      rawSet({
        items: next,
        loaded: true,
        saveStatus: 'ok',
        fileProblem: null,
        finishes,
        layoutName,
        groupNames,
        layout: file,
        selectedIds,
        selectedId,
      })
      // A file loaded from disk starts a fresh history: undo never reverts someone else's edit.
      history.reset(snapshotOf(get()))
      syncFlags()
    },

    refreshLibrary: async () => {
      const library = await listArtwork()
      if (library) rawSet({ library })
    },

    upload: async (file) => {
      try {
        const img = await uploadArtwork(file)
        rawSet((s) => ({ library: [...s.library.filter((x) => x.name !== img.name), img], uploadError: null }))
        return img
      } catch (e) {
        rawSet({ uploadError: e instanceof Error ? e.message : 'Upload failed' })
        return null
      }
    },

    startPlacing: (item) => {
      get().cancelPlacing()
      set((s) => ({
        items: [...s.items, item],
        movingId: item.id,
        isDraft: true,
        backup: null,
        selectedId: item.id,
        selectedIds: [item.id],
      }))
    },
    startDragging: (id) => {
      // Keep the item itself (not a copy) so Esc can put back exactly what was there.
      const s = get()
      const item = s.items.find((i) => i.id === id) ?? null
      const selectedIds = s.selectedIds.includes(id) ? s.selectedIds : [id]
      const followers = selectedIds.flatMap((x) => (x === id ? [] : s.items.filter((i) => i.id === x)))
      get().beginGesture()
      set({ movingId: id, isDraft: false, backup: item, selectedId: id, selectedIds, followers })
    },
    startRelocating: (id) => {
      get().cancelPlacing()
      const item = get().items.find((i) => i.id === id)
      if (item) set({ movingId: id, isDraft: true, backup: structuredClone(item), selectedId: id, selectedIds: [id] })
    },
    stopMoving: () => {
      set({ movingId: null, isDraft: false, backup: null, followers: [] })
      get().endGesture()
    },
    cancelPlacing: () => {
      const { movingId, backup, followers, isDraft } = get()
      if (movingId) {
        // A draft (new item or relocation) or a drag: put back what was there, or drop the new item.
        if (backup) get().restore([backup, ...followers])
        else if (isDraft)
          set((s) => ({ items: s.items.filter((i) => i.id !== movingId), selectedId: null, selectedIds: [] }))
      }
      set({ movingId: null, isDraft: false, backup: null, followers: [] })
      get().endGesture()
    },

    update: (id, patch) => {
      const merge = { key: `update:${id}:${Object.keys(patch).sort().join(',')}` }
      set((s) => ({ items: s.items.map((i) => (i.id === id ? ({ ...i, ...patch } as DecorItem) : i)) }), merge)
    },
    remove: (id) => {
      if (get().movingId === id) get().cancelPlacing()
      get().removeMany([id])
    },
    duplicate: (id) => {
      const src = get().items.find((i) => i.id === id)
      if (src) placeCopy(cloneSet([src], get().items)[0])
    },
    nudge: (id, delta) => get().nudgeMany({ [id]: delta }),
    rotateBy: (id, deg) => {
      const item = get().items.find((i) => i.id === id)
      if (!item || !('rotation' in item) || mountOf(item) === 'wall') return
      const rotation = (((item.rotation + deg) % 360) + 360) % 360
      set((s) => ({ items: s.items.map((i) => (i.id === id ? ({ ...i, rotation } as DecorItem) : i)) }))
    },
    copy: (id) => {
      const s = get()
      const ids = s.selectedIds.includes(id) ? s.selectedIds : [id]
      const items = s.items.filter((i) => ids.includes(i.id))
      if (!items.length) return
      // Keeps the group ids of groups copied whole, so a pasted gallery is a group again.
      clipboard = cloneSet(items, s.items, false)
      rawSet({ hasClipboard: true })
    },
    paste: () => {
      if (!clipboard?.length) return
      const copies = cloneSet(clipboard, clipboard)
      if (copies.length === 1) placeCopy(copies[0])
      else pasteSet(copies)
    },
    beginGesture: () => {
      gesture = ++gestureCount
    },
    endGesture: () => {
      gesture = null
    },
    restore: (originals) => {
      const byId = new Map(originals.map((i) => [i.id, i]))
      set((s) => ({ items: s.items.map((i) => byId.get(i.id) ?? i) }))
    },
    undo: () => {
      if (get().movingId) get().cancelPlacing()
      const step = history.undo()
      if (step) restoreSnapshot(step.to, step.from)
    },
    redo: () => {
      if (get().movingId) get().cancelPlacing()
      const step = history.redo()
      if (step) restoreSnapshot(step.to, step.from)
    },
    select: (id) => set({ selectedId: id, selectedIds: id ? [id] : [] }),
    selectMany: (ids, primary) => {
      const have = new Set(get().items.map((i) => i.id))
      const selectedIds = [...new Set(ids)].filter((id) => have.has(id))
      const selectedId = primary && selectedIds.includes(primary) ? primary : (selectedIds.at(-1) ?? null)
      set({ selectedIds, selectedId })
    },
    toggleSelect: (id, opts = {}) => {
      const s = get()
      const item = s.items.find((i) => i.id === id)
      if (!item) return
      const unit = !opts.single && item.groupId ? membersOf(s.items, item.groupId) : [id]
      if (unit.every((u) => s.selectedIds.includes(u))) {
        const rest = s.selectedIds.filter((x) => !unit.includes(x))
        get().selectMany(rest, s.selectedId && rest.includes(s.selectedId) ? s.selectedId : null)
      } else get().selectMany([...s.selectedIds, ...unit], id)
    },
    pick: (id, opts = {}) => {
      const s = get()
      const item = s.items.find((i) => i.id === id)
      if (!item) return
      if (opts.single) return get().selectMany([id], id)
      if (s.selectedIds.length > 1 && s.selectedIds.includes(id)) return set({ selectedId: id })
      get().selectMany(item.groupId ? membersOf(s.items, item.groupId) : [id], id)
    },
    selectAllLike: (kind) => {
      const s = get()
      const prim = s.items.find((i) => i.id === s.selectedId)
      const placed = s.items.filter(isPlaced)
      let ids: string[]
      if (prim && isWallItem(prim)) ids = placed.filter((i) => i.id === prim.id || sameWall(i, prim)).map((i) => i.id)
      else if (prim) ids = placed.filter((i) => i.kind === prim.kind && !isWallItem(i)).map((i) => i.id)
      else ids = placed.filter((i) => i.kind === kind).map((i) => i.id)
      get().selectMany(ids, prim?.id ?? null)
    },
    applyPatches: (patches) => {
      if (!Object.keys(patches).length) return
      set((s) => ({
        items: s.items.map((i) => (patches[i.id] ? ({ ...i, ...patches[i.id] } as DecorItem) : i)),
      }))
    },
    removeMany: (ids) => {
      const s = get()
      if (s.movingId && ids.includes(s.movingId)) s.cancelPlacing()
      const gone = new Set(ids)
      set((st) => {
        const selectedIds = st.selectedIds.filter((x) => !gone.has(x))
        return {
          // A group left with one piece is no group: that piece goes back to being loose.
          items: dissolveSingletons(st.items.filter((i) => !gone.has(i.id))),
          selectedIds,
          selectedId: st.selectedId && !gone.has(st.selectedId) ? st.selectedId : (selectedIds.at(-1) ?? null),
        }
      })
    },
    duplicateSelection: () => {
      const s = get()
      const items = s.items.filter((i) => s.selectedIds.includes(i.id))
      if (items.length <= 1) {
        if (s.selectedId) s.duplicate(s.selectedId)
        return
      }
      const copies = cloneSet(items, s.items).map((c) => ({ ...c, at: translated(c.at, copyOffset(c)) }) as DecorItem)
      set((st) => ({ items: [...st.items, ...copies] }))
      get().selectMany(
        copies.map((c) => c.id),
        copies[copies.length - 1].id,
      )
    },
    nudgeMany: (deltas) => {
      const ids = Object.keys(deltas)
      if (!ids.length) return
      const flat = Object.values(deltas).every((d) => d[1] === 0)
      const round = (v: number) => Math.round(v * 1000) / 1000
      const moved = new Map<string, DecorItem>()
      for (const i of get().items) {
        const d = deltas[i.id]
        if (!d) continue
        const [x, y, z] = translated(i.at, d)
        moved.set(i.id, { ...i, at: [round(x), round(Math.max(0, y)), round(z)] } as DecorItem)
      }
      // Slid sideways, a piece on a counter or a shelf settles onto what is under it now.
      if (flat) for (const m of settleMoved([...moved.values()])) moved.set(m.id, m)
      set((s) => ({ items: s.items.map((i) => moved.get(i.id) ?? i) }), { key: `nudge:${ids.sort().join(',')}` })
    },
    rotateSelection: (deg) => {
      const s = get()
      get().applyPatches(
        rotateAround(
          s.items.filter((i) => s.selectedIds.includes(i.id)),
          deg,
        ),
      )
    },
    group: () => {
      const s = get()
      if (s.selectedIds.length < 2) return
      const groupId = newGroupId()
      const ids = new Set(s.selectedIds)
      set({ items: s.items.map((i) => (ids.has(i.id) ? ({ ...i, groupId } as DecorItem) : i)) })
    },
    ungroup: () => {
      const s = get()
      const ids = new Set(s.selectedIds)
      if (!s.items.some((i) => ids.has(i.id) && i.groupId)) return
      set({
        items: s.items.map((i) => {
          if (!ids.has(i.id) || !i.groupId) return i
          const rest = { ...i }
          delete rest.groupId
          return rest
        }),
      })
    },
    renameGroup: (groupId, name) => {
      const groupNames = { ...get().groupNames }
      const n = name.trim()
      if (n) groupNames[groupId] = n
      else delete groupNames[groupId]
      set({ groupNames })
    },
    setTab: (tab) => set({ tab }),
    setFinishes: (patch) => {
      set((s) => ({ finishes: { ...s.finishes, ...patch } }), finishesMerge(get().finishes, patch))
    },
    switchLayout: async (slug) => {
      const from = decorFile
      if (slug === from) return
      const s = get()
      if (s.movingId) s.cancelPlacing()
      // Layouts copied from each other share item ids: start the other one with nothing selected.
      set({ selectedId: null, selectedIds: [] })
      await flushSave()
      decorFile = slug
      showLayoutInUrl(decorFile)
      set({ layout: slug, compareWith: from })
      await get().load()
    },
    toggleCompare: async () => {
      const other = get().compareWith
      if (other !== undefined) await get().switchLayout(other)
    },
    setCompareWith: (compareWith) => set({ compareWith }),
    renamed: (slug, name) => {
      if (slug !== decorFile) {
        decorFile = slug
        showLayoutInUrl(decorFile)
      }
      // The server already wrote the new name: do not write it again.
      const s = get()
      saver.synced(serialize(committedItems(s), s.finishes, name, s.groupNames))
      set({ layout: slug, layoutName: name })
    },
  }
})

// History: every change to the committed layout is a step, merged as its writer asked.
useDecor.subscribe((s) => {
  const merge: MergeKey = gesture !== null ? { gesture } : nextMerge
  nextMerge = null
  if (!s.loaded) return
  history.record(snapshotOf(s), merge)
  const { canUndo, canRedo } = history
  if (s.canUndo !== canUndo || s.canRedo !== canRedo) useDecor.setState({ canUndo, canRedo })
})

// Saving: the committed layout, once changes pause (not the item still following the pointer).
let lastSerialized: { items: DecorItem[]; finishes: Finishes; name: string; groups: Record<string, string> } | null =
  null
useDecor.subscribe((s) => {
  if (!s.loaded || s.saveStatus !== 'ok') return
  const items = committedItems(s)
  const l = lastSerialized
  if (l && l.items === items && l.finishes === s.finishes && l.name === s.layoutName && l.groups === s.groupNames)
    return
  lastSerialized = { items, finishes: s.finishes, name: s.layoutName, groups: s.groupNames }
  saver.change(serialize(items, s.finishes, s.layoutName, s.groupNames), decorFile)
})

// Someone (another tab, an editor, Claude) changed the file on disk: reload it
// unless it is what this tab just wrote.
if (import.meta.hot) {
  import.meta.hot.on('decor:changed', async (data: { space: string; plan: string; file: string | null }) => {
    if (data.space !== launch.space || data.plan !== plan.id || (data.file ?? null) !== (decorFile ?? null)) return
    const text = await readLayoutText(decorFile)
    // While saving is paused any good version is news, even the one last loaded.
    const paused = useDecor.getState().saveStatus !== 'ok'
    if (text === null || (!paused && saver.isOwn(text))) return
    saver.cancel()
    await useDecor.getState().load()
  })
}

declare global {
  interface Window {
    /**
     * Dev only: the live decor store, for test scripts. Importing /src/decor/store.ts
     * from a script is not enough: after an HMR update the app runs store.ts?t=…, a
     * different module instance.
     */
    __decor?: typeof useDecor
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') window.__decor = useDecor

// This module holds live state (the store, and here its undo history). Swapping it
// in place during development would leave parts of the app on the old copy, so a
// change to it reloads the page.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())
