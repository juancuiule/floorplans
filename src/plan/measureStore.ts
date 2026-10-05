import { create } from 'zustand'
import type { Vec3 } from '../model/types'

// Tape measurements. Session-only: they are a way of checking, not part of the layout.

export interface Measurement {
  id: number
  a: Vec3
  b: Vec3
}

interface MeasureState {
  items: Measurement[]
  /** First point of the measurement being taken. */
  start: Vec3 | null
  /** Measurement under the pointer (its label), which Delete removes first. */
  hoverId: number | null
  begin: (p: Vec3) => void
  finish: (b: Vec3) => void
  cancel: () => void
  /** Removes the hovered measurement, or the newest. Returns false when there was nothing to remove. */
  removeOne: () => boolean
  remove: (id: number) => void
  clear: () => void
  setHover: (id: number | null) => void
}

let nextId = 1

export const useMeasure = create<MeasureState>((set, get) => ({
  items: [],
  start: null,
  hoverId: null,
  begin: (p) => set({ start: p }),
  finish: (b) => {
    const a = get().start
    if (!a) return
    set((s) => ({ items: [...s.items, { id: nextId++, a, b }], start: null }))
  },
  cancel: () => set({ start: null }),
  removeOne: () => {
    const { items, hoverId } = get()
    if (!items.length) return false
    const id = hoverId ?? items[items.length - 1].id
    get().remove(id)
    return true
  },
  remove: (id) =>
    set((s) => ({ items: s.items.filter((m) => m.id !== id), hoverId: s.hoverId === id ? null : s.hoverId })),
  clear: () => set({ items: [], start: null, hoverId: null }),
  setHover: (hoverId) => set({ hoverId }),
}))
