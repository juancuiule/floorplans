import { useMemo } from 'react'
import { useDecor } from '../decor/store'
import { isPlaced } from '../model/decor'
import { TABS } from './format'

/** How many items of each panel tab's kind are placed, in TABS order. */
export function useRoomCounts() {
  const sig = useDecor((s) => TABS.map((t) => s.items.filter((i) => i.kind === t.kind && isPlaced(i)).length).join(','))
  return useMemo(() => sig.split(',').map(Number), [sig])
}
