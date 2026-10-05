import { useEffect, useRef, type RefObject } from 'react'
import { Icon } from './icons'
import { MOD } from './format'

const GROUPS: { title: string; items: [keys: string[][], what: string][] }[] = [
  {
    title: 'Placing and editing',
    items: [
      [[['Esc']], 'Cancel placing, or deselect'],
      [[['Alt']], 'Hold while placing to skip wall snapping and guides'],
      [[[MOD]], 'Hold while dragging to skip the smart guides'],
      [[['R'], ['Shift', 'R']], 'Rotate the selection, either way'],
      [[['←', '↑', '→', '↓']], 'Nudge the selection'],
      [[['Delete']], 'Delete the selection'],
      [[[MOD, 'D']], 'Duplicate'],
      [
        [
          [MOD, 'C'],
          [MOD, 'V'],
        ],
        'Copy and paste',
      ],
      [[[MOD, 'Z']], 'Undo'],
      [[['Shift', MOD, 'Z']], 'Redo'],
    ],
  },
  {
    title: 'Selecting and arranging',
    items: [
      [[['Shift', 'Click']], 'Add to or remove from the selection'],
      [[['Shift', 'Drag']], 'Select with a rectangle (drag on the room)'],
      [[[MOD, 'A']], 'Select everything on the same wall (or of the same kind)'],
      [
        [
          [MOD, 'G'],
          ['Shift', MOD, 'G'],
        ],
        'Group, ungroup',
      ],
      [[['Alt', 'Click']], 'Pick one piece of a group (or double-click it)'],
      [
        [
          ['Alt', 'A'],
          ['Alt', 'D'],
        ],
        'Align left, right',
      ],
      [[['Alt', 'H']], 'Align centers'],
      [
        [
          ['Alt', 'W'],
          ['Alt', 'S'],
        ],
        'Align tops, bottoms',
      ],
      [[['Alt', 'V']], 'Align middles'],
      [
        [
          ['Alt', 'Shift', 'H'],
          ['Alt', 'Shift', 'V'],
        ],
        'Distribute across, or up and down, with equal gaps',
      ],
    ],
  },
  {
    title: 'Walk and measure',
    items: [
      [[['W']], 'Walk through at eye level (double-click the floor to start there)'],
      [[['W', 'A', 'S', 'D']], 'Walk (arrows too: ← → turn); drag to look, Shift to hurry'],
      [[['T']], 'Measure between two points'],
      [[['Shift']], 'Hold while measuring to keep it straight'],
      [[['Delete']], 'Remove the hovered or last measurement'],
      [[['C']], 'Clearances around the selected piece'],
      [[['Esc']], 'Leave walk mode or the measure tool'],
    ],
  },
  {
    title: 'View',
    items: [
      [[['1'], ['5']], 'Camera presets, 1 to 5'],
      [[['X']], 'Switch dollhouse and X-ray'],
      [[['M']], 'Show or hide dimensions'],
      [[['L']], 'Switch day and evening (more in the clock menu)'],
      [[['F']], 'Flip the iso view to the other side'],
      [[[','], ['.']], 'Sun: 15 minutes earlier or later'],
      [[['B']], 'Flip A/B between two layouts'],
      [[['/']], 'Search the panel'],
      [[['\\']], 'Show or hide the panel'],
      [[['?']], 'Show these shortcuts'],
    ],
  },
]

/**
 * A non-modal dialog listing keyboard shortcuts. Focus moves into it when it
 * opens and back to the trigger when it closes (Esc, the close button, or a
 * click outside).
 */
export function ShortcutsPopover({
  onClose,
  triggerRef,
}: {
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = ref.current
    panel?.focus()
    const trigger = triggerRef.current
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel?.contains(t) && !trigger?.contains(t)) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      // Return focus only if it would otherwise be lost.
      if (
        !document.activeElement ||
        document.activeElement === document.body ||
        panel?.contains(document.activeElement)
      )
        trigger?.focus()
    }
  }, [onClose, triggerRef])

  return (
    <div
      ref={ref}
      className="popover shortcuts"
      role="dialog"
      aria-labelledby="shortcuts-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Keep the app from also deselecting the current item.
          e.stopPropagation()
          e.nativeEvent.stopImmediatePropagation()
          onClose()
        }
      }}
    >
      <div className="popover-head">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h3 className="group-label">{g.title}</h3>
          <dl>
            {g.items.map(([combos, what]) => (
              <div key={what} className="shortcut">
                <dt>
                  {combos.map((keys, i) => (
                    <span key={i} className="combo">
                      {i > 0 && <span className="or">{combos.length === 2 && what.includes(' to ') ? '–' : '/'}</span>}
                      {keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  ))}
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
