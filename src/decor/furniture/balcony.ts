import type { FurnitureType } from '../../model/decor'
import { BLACK, finish, BODY_FINISHES, FABRIC_FINISHES, type FurnitureSpec } from './spec'

// Outdoor pieces for the balcony.

export const BALCONY = {
  balconyBench: {
    label: 'Balcony daybed',
    note: 'Slats or pallets, cushions, pillows',
    group: 'Balcony',
    mount: 'surface',
    size: [1.6, 0.42, 0.7],
    presets: [
      { label: 'Bench 120', size: [1.2, 0.42, 0.6] },
      { label: 'Daybed 160', size: [1.6, 0.42, 0.7] },
      { label: 'Pallets 120 × 80', size: [1.2, 0.42, 0.8] },
    ],
    uses: ['body', 'fabric'],
    finish: finish(BODY_FINISHES[1].color, BLACK, FABRIC_FINISHES[0].color),
    options: { base: 'slats', pillows: 3 },
    optionSpecs: [
      {
        key: 'base',
        label: 'Base',
        kind: 'chips',
        choices: [
          { id: 'slats', label: 'Wood slats' },
          { id: 'pallet', label: 'Pallets' },
        ],
      },
      { key: 'pillows', label: 'Back pillows', kind: 'range', min: 0, max: 4, step: 1 },
    ],
    editable: ['w', 'h', 'd'],
  },
  planterWall: {
    label: 'Cinder-block planter wall',
    note: 'Staggered blocks, plants in the cells',
    group: 'Balcony',
    mount: 'surface',
    size: [1.2, 0.8, 0.2],
    presets: [
      { label: '3 × 4', size: [1.2, 0.8, 0.2] },
      { label: '4 × 6', size: [1.6, 1.2, 0.2] },
      { label: '2 × 3 low', size: [0.8, 0.6, 0.2] },
    ],
    uses: ['body'],
    finish: finish('#a9a6a0'),
    options: { plants: 60 },
    optionSpecs: [{ key: 'plants', label: 'Cells planted', kind: 'range', min: 0, max: 100, step: 10, unit: '%' }],
    editable: ['w', 'h'],
  },
  railTable: {
    label: 'Folding rail table',
    note: 'Drop-leaf, on a wall or railing',
    group: 'Balcony',
    mount: 'wall',
    // Brackets 45 cm up put the leaf at table height (75 cm).
    mountHeight: 0.45,
    size: [0.6, 0.3, 0.4],
    presets: [
      { label: '60 × 40', size: [0.6, 0.3, 0.4] },
      { label: '80 × 40', size: [0.8, 0.3, 0.4] },
      { label: 'Bar 100 × 30', size: [1.0, 0.25, 0.3] },
    ],
    uses: ['body', 'metal'],
    finish: finish(BODY_FINISHES[1].color, BLACK),
    options: { open: true },
    optionSpecs: [{ key: 'open', label: 'Leaf up', kind: 'toggle' }],
    editable: ['w', 'd'],
  },
} satisfies Partial<Record<FurnitureType, FurnitureSpec>>
