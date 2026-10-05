import { useEffect } from 'react'
import type { AlignMode } from '../decor/arrange'
import { useEdit } from '../decor/edit'
import { mountOf } from '../decor/placement'
import { alignSelection, distributeSelection, nudgeDelta, selectedItems } from '../decor/selection'
import { useDecor } from '../decor/store'
import type { Vec3 } from '../model/types'
import { useMeasure } from '../plan/measureStore'
import { useView } from '../store'
import { TABS } from './format'

/** Alt+key align shortcuts (by physical key, since Alt changes the character on a Mac). */
const ALIGN_KEYS: Record<string, AlignMode> = {
  KeyA: 'left',
  KeyH: 'hcenter',
  KeyD: 'right',
  KeyW: 'top',
  KeyV: 'vmiddle',
  KeyS: 'bottom',
}

/** Typing fields keep their own keys; sliders, checkboxes and buttons do not need Cmd+Z etc. */
function isTextField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el?.closest) return false
  if (el.closest('textarea, select, [contenteditable="true"]')) return true
  const input = el.closest('input') as HTMLInputElement | null
  return !!input && !['range', 'checkbox', 'radio', 'button', 'color'].includes(input.type)
}

/** The inspector's number fields (text inputs with a decimal keypad). */
function isNumberField(t: EventTarget | null): boolean {
  const el = t as HTMLInputElement | null
  return el?.tagName === 'INPUT' && (el.type === 'number' || el.inputMode === 'decimal' || el.inputMode === 'numeric')
}

/**
 * The editing keys, on the window: undo and redo, copy and paste, select all,
 * group, delete, rotate, nudge, align and distribute, and Esc. Walk mode and the
 * measure tool take Esc, Delete and the arrows first. Each key is documented in
 * the shortcuts popover (ShortcutsPopover.tsx) and checked by
 * tests/e2e/shortcuts.mjs.
 */
export function useEditShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useDecor.getState()
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      // Undo / redo work everywhere except inside a text field (which has its own undo).
      // Number fields (sizes, heights) are edits of the room, not text: commit what was
      // typed and undo in the room.
      if (mod && !e.altKey && (key === 'z' || key === 'y') && (!isTextField(e.target) || isNumberField(e.target))) {
        e.preventDefault()
        if (isNumberField(e.target)) (e.target as HTMLInputElement).blur()
        if (key === 'y' || e.shiftKey) s.redo()
        else s.undo()
        return
      }

      // Walk mode and the measure tool: Esc steps out, Delete drops a measurement,
      // and the arrows walk instead of nudging the selection.
      const v = useView.getState()
      if (!mod && (v.walking || v.tool) && !isTextField(e.target)) {
        if (e.key === 'Escape') {
          e.preventDefault()
          const m = useMeasure.getState()
          if (v.tool === 'measure' && m.start) m.cancel()
          else if (v.tool) v.setTool(null)
          else v.exitWalk()
          return
        }
        if (v.tool === 'measure' && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault()
          useMeasure.getState().removeOne()
          return
        }
        if (v.walking && e.key.startsWith('Arrow')) return
      }

      const t = e.target as HTMLElement
      if (t.closest?.('input, select, textarea')) return
      const sel = s.items.find((i) => i.id === s.selectedId)
      const many = s.selectedIds.length > 1
      const busy = !!s.movingId || useEdit.getState().rotating

      if (mod && key === 'c' && sel) {
        if (window.getSelection()?.toString()) return
        e.preventDefault()
        s.copy(sel.id)
      } else if (mod && key === 'v' && s.hasClipboard) {
        e.preventDefault()
        s.paste()
      } else if (mod && key === 'd' && sel) {
        e.preventDefault()
        s.duplicateSelection()
      } else if (mod && key === 'a' && !busy) {
        // Everything on the selected piece's wall, or everything of its kind (or of the open tab).
        e.preventDefault()
        s.selectAllLike(TABS.find((t) => t.id === s.tab)?.kind)
      } else if (mod && key === 'g' && !busy) {
        e.preventDefault()
        if (e.shiftKey) s.ungroup()
        else s.group()
      } else if (mod) {
        return
      } else if (e.key === 'Escape') {
        if (s.movingId) s.cancelPlacing()
        else s.select(null)
      } else if (busy) {
        // Keys below edit a placed item; not while it is following the pointer.
        return
      } else if (e.altKey && many && ALIGN_KEYS[e.code]) {
        // Align (Alt+A/H/D, W/V/S) and distribute (Alt+Shift+H/V) the selection.
        e.preventDefault()
        const k = ALIGN_KEYS[e.code]
        if (e.shiftKey && (e.code === 'KeyH' || e.code === 'KeyV')) distributeSelection(e.code === 'KeyH' ? 'u' : 'v')
        else if (!e.shiftKey) alignSelection(k)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        s.removeMany(many ? s.selectedIds : [sel.id])
      } else if (
        key === 'r' &&
        !e.altKey &&
        sel &&
        selectedItems(s).some((i) => 'rotation' in i && mountOf(i) !== 'wall')
      ) {
        // Furniture turns in quarter turns; plants and lamps in small steps. A selection turns as one.
        const furniture = selectedItems(s).some((i) => i.kind === 'furniture')
        s.rotateSelection((furniture ? 90 : 15) * (e.shiftKey ? -1 : 1))
      } else if (
        sel &&
        (e.key.startsWith('Arrow') || e.key === 'PageUp' || e.key === 'PageDown' || e.key === '[' || e.key === ']')
      ) {
        const d = e.shiftKey ? 0.1 : 0.01
        const deltas: Record<string, Vec3> = {}
        for (const i of selectedItems(s)) {
          const delta = nudgeDelta(i, e.key, d)
          if (delta) deltas[i.id] = delta
        }
        if (Object.keys(deltas).length) {
          e.preventDefault()
          s.nudgeMany(deltas)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
