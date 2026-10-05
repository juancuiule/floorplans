// The spaces this browser has opened, newest first, so the home page can list
// them. There are no accounts yet (docs/adr/0010): a space's link is the key to
// it, and this list is only a convenience; clearing it loses nothing on the server.

const KEY = 'floorplan.spaces'

export interface RecentSpace {
  id: string
  name: string
  /** ISO time it was last opened here. */
  opened: string
}

export function recentSpaces(): RecentSpace[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((s): s is RecentSpace => typeof s?.id === 'string') : []
  } catch {
    return []
  }
}

/** Puts a space at the top of the list (with its name, once known). */
export function rememberSpace(id: string, name?: string) {
  const list = recentSpaces()
  const known = list.find((s) => s.id === id)
  const entry = { id, name: name ?? known?.name ?? '', opened: new Date().toISOString() }
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...list.filter((s) => s.id !== id)].slice(0, 20)))
  } catch {
    /* storage blocked: the link still works */
  }
}

export function forgetSpace(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(recentSpaces().filter((s) => s.id !== id)))
  } catch {
    /* storage blocked */
  }
}
