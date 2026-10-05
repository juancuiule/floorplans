import type { DecorFile, DecorItem } from '../model/decor'
import { DEFAULT_FINISHES, isDefaultFinishes, type Finishes } from '../model/finishes'

// The layout file format (docs/adr/0003-layout-file-format.md): name, plan,
// finishes and group names are written only when there is something to say,
// so untouched files keep their shape and diffs stay small.

/** A layout as the text of its file. */
export function serialize(
  items: DecorItem[],
  finishes: Finishes = DEFAULT_FINISHES,
  name = '',
  groupNames: Record<string, string> = {},
): string {
  // Names only for groups that still exist.
  const live = new Set(items.map((i) => i.groupId).filter(Boolean))
  const named = Object.entries(groupNames).filter(([g, n]) => live.has(g) && n)
  const groups = named.length ? Object.fromEntries(named.map(([g, n]) => [g, { name: n }])) : undefined
  const file: DecorFile = {
    version: 1,
    ...(name ? { name } : {}),
    ...(isDefaultFinishes(finishes) ? {} : { finishes }),
    ...(groups ? { groups } : {}),
    items,
  }
  return JSON.stringify(file, null, 2) + '\n'
}

/** Group names from a layout file, skipping malformed entries. */
export function namesOf(groups: DecorFile['groups']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [g, v] of Object.entries(groups ?? {})) if (v && typeof v.name === 'string' && v.name) out[g] = v.name
  return out
}
