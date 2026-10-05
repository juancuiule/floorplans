import {
  DEFAULT_POT_SIZE,
  LAMP_KEYWORDS,
  LAMPS,
  MOUNT_GROUP,
  MOUNT_ORDER,
  PLANT_GROUPS,
  PLANT_META,
  PLANTS,
} from '../decor/catalog'
import { FURNITURE, FURNITURE_GROUPS, FURNITURE_KEYWORDS } from '../decor/furnitureCatalog'
import { newId } from '../decor/clone'
import { unplacedAt, type DecorItem, type FurnitureType, type LampType, type PlantSpecies } from '../model/decor'
import type { Vec3 } from '../model/types'
import { cm } from './format'
import type { IconName } from './icons'
import { FURNITURE_ICON, LAMP_ICON, PLANT_ICON } from './itemIcons'

// The catalog rows of the furniture, plants and lights libraries. Choosing a
// row creates a new item that is not placed yet.

export interface Entry {
  key: string
  group: string
  icon: IconName
  name: string
  note: string
  meta?: string
  /** Extra words for search only. */
  keywords?: string
  create: () => DecorItem
}

const FURNITURE_ENTRIES: Entry[] = FURNITURE_GROUPS.flatMap((group) =>
  (Object.keys(FURNITURE) as FurnitureType[])
    .filter((t) => FURNITURE[t].group === group)
    .map((t) => {
      const spec = FURNITURE[t]
      const [w, h, d] = spec.size
      // Wall pieces are read by their face; floor pieces by their footprint.
      const meta = spec.mount === 'wall' ? `${cm(w)} × ${cm(h)}` : `${cm(w)} × ${cm(d)}`
      return {
        key: t,
        group: group.replace('&', 'and'),
        icon: FURNITURE_ICON[t],
        name: spec.label,
        note: spec.note,
        meta: `${meta} cm`,
        keywords: `${FURNITURE_KEYWORDS[t] ?? ''} ${spec.mount}`,
        create: () => ({
          kind: 'furniture',
          id: newId('furniture'),
          type: t,
          at: unplacedAt(),
          rotation: 0,
          size: [...spec.size] as Vec3,
          finish: { ...spec.finish },
          options: { ...spec.options },
        }),
      }
    }),
)

const PLANT_ENTRIES: Entry[] = PLANT_GROUPS.flatMap((group) =>
  (Object.keys(PLANTS) as PlantSpecies[])
    .filter((sp) => PLANT_META[sp].group === group)
    .map((sp) => ({
      key: sp,
      group,
      icon: PLANT_ICON[sp],
      name: PLANTS[sp].label,
      note: PLANTS[sp].note,
      keywords: PLANT_META[sp].keywords,
      create: () => ({
        kind: 'plant',
        id: newId('plant'),
        species: sp,
        pot: PLANTS[sp].pot,
        at: unplacedAt(),
        rotation: sp === 'collection' || sp === 'windowBox' ? 0 : Math.round(Math.random() * 360),
        scale: 1,
        potSize: DEFAULT_POT_SIZE[sp],
        ...(sp === 'collection' ? { count: 10, spread: 0.9 } : {}),
      }),
    })),
)

const LAMP_ENTRIES: Entry[] = MOUNT_ORDER.flatMap((mount) =>
  (Object.keys(LAMPS) as LampType[])
    .filter((t) => LAMPS[t].mount === mount)
    .map((t) => ({
      key: t,
      group: MOUNT_GROUP[mount],
      icon: LAMP_ICON[t],
      name: LAMPS[t].label,
      note: LAMPS[t].note,
      keywords: LAMP_KEYWORDS[t],
      create: () => ({
        kind: 'lamp',
        id: newId('lamp'),
        type: t,
        at: unplacedAt(),
        rotation: 0,
        on: true,
        brightness: 1,
        warmth: 2700,
        color: LAMPS[t].color,
        length: t === 'string' ? 2.4 : undefined,
      }),
    })),
)

export const LIBRARY_ENTRIES = { furniture: FURNITURE_ENTRIES, plants: PLANT_ENTRIES, lights: LAMP_ENTRIES }
