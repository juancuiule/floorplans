import { LAMPS, MOUNT_GROUP, PLANT_META, PLANTS } from '../decor/catalog'
import { FURNITURE } from '../decor/furnitureCatalog'
import type { PanelTab } from '../decor/store'
import type { DecorItem, DecorKind } from '../model/decor'
import type { IconName } from './icons'

export const TABS: { id: PanelTab; label: string; kind: DecorKind; icon: IconName; noun: string }[] = [
  { id: 'furniture', label: 'Furniture', kind: 'furniture', icon: 'sofa', noun: 'furniture' },
  { id: 'artwork', label: 'Artwork', kind: 'artwork', icon: 'image', noun: 'artwork' },
  { id: 'plants', label: 'Plants', kind: 'plant', icon: 'plantLeaves', noun: 'plants' },
  { id: 'lights', label: 'Lights', kind: 'lamp', icon: 'lampTable', noun: 'lights' },
]

export const tabOfKind = (kind: DecorKind) => TABS.find((t) => t.kind === kind)!

/** Meters to centimeters, one decimal at most. */
export const cm = (m: number) => Math.round(m * 1000) / 10

export const fileName = (url: string) => decodeURIComponent(url.split('/').pop() ?? '').replace(/\.[^.]+$/, '')

/** Items parked below the floor are drafts that have not been dropped yet. */

export function itemLabel(item: DecorItem) {
  if (item.kind === 'artwork') return fileName(item.image)
  if (item.kind === 'plant') return PLANTS[item.species].label
  if (item.kind === 'furniture') return FURNITURE[item.type].label
  return LAMPS[item.type].label
}

/** Second line of the inspector header: what kind of thing this is and where it goes. */
export function itemKindLine(item: DecorItem) {
  if (item.kind === 'artwork')
    return `Artwork · ${item.size.preset === 'custom' ? 'custom size' : `${item.size.preset.replace('x', '×')} print`}`
  if (item.kind === 'plant') return `Plant · ${PLANT_META[item.species].group.toLowerCase()}`
  if (item.kind === 'furniture') return `Furniture · ${FURNITURE[item.type].group.replace('&', 'and').toLowerCase()}`
  return `Light · ${MOUNT_GROUP[LAMPS[item.type].mount].toLowerCase()}`
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').toLowerCase()

/** Every word of the query must appear somewhere in the haystack. */
export function matches(query: string, ...haystack: (string | undefined)[]) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = fold(haystack.filter(Boolean).join(' '))
  return words.every((w) => text.includes(w))
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
/** The command key's label on this platform. */
export const MOD = isMac ? '⌘' : 'Ctrl'
