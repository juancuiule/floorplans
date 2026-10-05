import type { FurnitureType } from '../../model/decor'
import { PLY, finish, FABRIC_FINISHES, type FurnitureSpec } from './spec'

// Beds and daybeds.

export const SLEEP = {
  platformBed: {
    label: 'Platform bed',
    note: 'Plywood base with cubbies',
    group: 'Sleep',
    mount: 'surface',
    size: [1.56, 0.4, 2.04],
    presets: [
      { label: '90 × 190', size: [1.06, 0.4, 2.04] },
      { label: '140 × 190', size: [1.56, 0.4, 2.04] },
      { label: '160 × 200', size: [1.76, 0.4, 2.14] },
    ],
    uses: ['body', 'fabric'],
    finish: finish(),
    options: { headShelf: 'L', books: true },
    optionSpecs: [
      {
        key: 'headShelf',
        label: 'Head shelf',
        kind: 'chips',
        choices: [
          { id: 'none', label: 'None' },
          { id: 'head', label: 'Behind the head' },
          { id: 'L', label: 'L-shaped' },
        ],
      },
      { key: 'books', label: 'Books in the cubbies', kind: 'toggle' },
    ],
    editable: ['w', 'h', 'd'],
  },
  murphyBed: {
    label: 'Wall bed',
    note: 'Folds into a plywood cabinet',
    group: 'Sleep',
    mount: 'surface',
    size: [1.6, 2.3, 0.45],
    presets: [
      { label: '90 × 190', size: [1.1, 2.3, 0.45] },
      { label: '140 × 190', size: [1.6, 2.3, 0.45] },
    ],
    uses: ['body', 'fabric'],
    finish: finish(),
    options: { open: true, sideTowers: true },
    optionSpecs: [
      { key: 'open', label: 'Bed down', kind: 'toggle' },
      { key: 'sideTowers', label: 'Storage towers each side', kind: 'toggle' },
    ],
    editable: ['w', 'h'],
  },
  daybed: {
    label: 'Daybed',
    note: 'On casters, drawers and books',
    group: 'Sleep',
    mount: 'surface',
    size: [1.95, 0.46, 0.85],
    uses: ['body', 'metal', 'fabric'],
    finish: finish(PLY, '#5d6570', FABRIC_FINISHES[2].color),
    options: { drawers: true, pillows: true },
    optionSpecs: [
      { key: 'drawers', label: 'Flat-file drawers', kind: 'toggle' },
      { key: 'pillows', label: 'Back pillows', kind: 'toggle' },
    ],
    editable: ['w', 'd'],
  },
  loftBed: {
    label: 'Raised sleeping platform',
    note: 'Loft bed on drawers, storage steps',
    group: 'Sleep',
    mount: 'surface',
    size: [2.55, 1.0, 1.5],
    presets: [
      { label: '90 × 190', size: [2.45, 1.0, 0.98] },
      { label: '140 × 190', size: [2.55, 1.0, 1.5] },
      { label: '160 × 200', size: [2.65, 1.05, 1.7] },
    ],
    uses: ['body', 'fabric'],
    finish: finish(),
    options: { stairs: 'right', drawers: 3 },
    optionSpecs: [
      {
        key: 'stairs',
        label: 'Steps on the',
        kind: 'chips',
        choices: [
          { id: 'left', label: 'Left' },
          { id: 'right', label: 'Right' },
        ],
      },
      { key: 'drawers', label: 'Drawers under the bed', kind: 'range', min: 0, max: 4, step: 1 },
    ],
    editable: ['w', 'h', 'd'],
  },
} satisfies Partial<Record<FurnitureType, FurnitureSpec>>
