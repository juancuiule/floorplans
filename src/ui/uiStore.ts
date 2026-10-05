import { create } from 'zustand'

// Interface-only state: which parts of the panel are open. Never saved to the decor file.

interface UiState {
  panelOpen: boolean
  roomListOpen: boolean
  /** Inspector sections the viewer collapsed, by section title. */
  collapsed: Record<string, boolean>
  togglePanel: () => void
  setPanelOpen: (open: boolean) => void
  toggleRoomList: () => void
  toggleSection: (title: string) => void
}

const KEY = 'monoambiente.ui'

function readSaved(): Partial<Pick<UiState, 'panelOpen' | 'roomListOpen' | 'collapsed'>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

const saved = readSaved()

export const useUi = create<UiState>((set) => ({
  panelOpen: saved.panelOpen ?? true,
  roomListOpen: saved.roomListOpen ?? false,
  collapsed: saved.collapsed ?? {},
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  toggleRoomList: () => set((s) => ({ roomListOpen: !s.roomListOpen })),
  toggleSection: (title) => set((s) => ({ collapsed: { ...s.collapsed, [title]: !s.collapsed[title] } })),
}))

// The toolbar and the placement hint make room for the panel through this attribute.
const reflect = (open: boolean) => document.documentElement.toggleAttribute('data-panel-closed', !open)
reflect(useUi.getState().panelOpen)

useUi.subscribe((s) => {
  reflect(s.panelOpen)
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ panelOpen: s.panelOpen, roomListOpen: s.roomListOpen, collapsed: s.collapsed }),
    )
  } catch {
    /* private mode: keep it for this visit only */
  }
})
