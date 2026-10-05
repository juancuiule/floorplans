import { create } from 'zustand'
import { createLayout, deleteLayout, listLayouts, readOtherPlan, renameLayout, type LayoutInfo } from './api'
import type { DecorFile } from '../model/decor'
import type { Plan } from '../model/plan'
import { serialize } from './layoutFile'
import { fitLayout } from './transfer'
import { launch } from '../project/launch'
import { plan } from '../project/plan'
import { committedItems, flushSave, MAIN_SLUG, useDecor } from './store'

// Client side of the layouts API (server/layouts.ts): the list for the menu
// and the actions on it. Switching itself lives in the decor store.

export type { LayoutInfo }

interface LayoutsState {
  list: LayoutInfo[]
  error: string | null
  refresh: () => Promise<void>
  /** Saves the editor's current state as a new layout and switches to it. */
  saveAs: (name: string) => Promise<void>
  /** Copies another plan's current layout, fitted to this plan, as a new layout, and switches to it. */
  bringFrom: (plan: string, name: string) => Promise<void>
  rename: (slug: string | null, name: string) => Promise<void>
  remove: (slug: string | null) => Promise<void>
}

export const useLayouts = create<LayoutsState>((set, get) => ({
  list: [],
  error: null,
  refresh: async () => {
    try {
      set({ list: await listLayouts(), error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
  saveAs: async (name) => {
    await flushSave()
    const d = useDecor.getState()
    try {
      // Group names travel with the copy; the server writes the new name.
      const data = JSON.parse(serialize(committedItems(d), d.finishes, '', d.groupNames))
      const { slug } = await createLayout(name, data)
      await useDecor.getState().switchLayout(slug)
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
  bringFrom: async (other, name) => {
    await flushSave()
    try {
      const read = await readOtherPlan(other)
      const data = fitLayout(read.layout as DecorFile, read.plan as Plan, plan)
      const { slug } = await createLayout(name, data)
      await useDecor.getState().switchLayout(slug)
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
  rename: async (slug, name) => {
    const d = useDecor.getState()
    if (slug === d.layout) await flushSave()
    try {
      const out = await renameLayout(slug, name)
      if (slug === useDecor.getState().layout) useDecor.getState().renamed(out.slug, out.name)
      if (slug === useDecor.getState().compareWith) useDecor.getState().setCompareWith(out.slug)
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
  remove: async (slug) => {
    try {
      const d = useDecor.getState()
      if (slug === d.layout) {
        // Leave it first so no pending save writes it back.
        if (slug === MAIN_SLUG) throw new Error('The current layout cannot be deleted')
        await d.switchLayout(MAIN_SLUG)
      }
      await deleteLayout(slug)
      if (useDecor.getState().compareWith === slug) useDecor.getState().setCompareWith(undefined)
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
}))

// Another tab (or Claude) added, removed or wrote a layout: keep the list fresh.
if (import.meta.hot) {
  import.meta.hot.on('layouts:changed', (data: { space: string; plan: string }) => {
    if (data.space === launch.space && data.plan === plan.id) void useLayouts.getState().refresh()
  })
}
