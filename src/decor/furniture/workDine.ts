import type { FurnitureType } from '../../model/decor'
import { PLY, BLACK, finish, BODY_FINISHES, type FurnitureSpec } from './spec'

// Desks, tables and the chairs that go with them.

export const WORK_DINE = {
  standingDesk: {
    label: 'Standing desk',
    note: 'Motorized, sit or stand',
    group: 'Work & dine',
    mount: 'surface',
    size: [1.4, 0.72, 0.7],
    presets: [
      { label: '120 × 60', size: [1.2, 0.72, 0.6] },
      { label: '140 × 70', size: [1.4, 0.72, 0.7] },
      { label: '160 × 80', size: [1.6, 0.72, 0.8] },
    ],
    uses: ['body', 'metal'],
    finish: finish(BODY_FINISHES[2].color, BLACK),
    options: { riser: true, monitor: true },
    optionSpecs: [
      { key: 'riser', label: 'Monitor riser (brass legs)', kind: 'toggle' },
      { key: 'monitor', label: 'Ultrawide monitor + keyboard', kind: 'toggle' },
    ],
    editable: ['w', 'd'],
  },
  diningTable: {
    label: 'Dining table',
    note: 'Round or rectangular',
    group: 'Work & dine',
    mount: 'surface',
    size: [1.2, 0.75, 0.75],
    presets: [
      { label: 'Round 90', size: [0.9, 0.75, 0.9] },
      { label: '120 × 75', size: [1.2, 0.75, 0.75] },
      { label: '140 × 80', size: [1.4, 0.75, 0.8] },
    ],
    uses: ['body', 'metal'],
    finish: finish(BODY_FINISHES[1].color, BLACK),
    options: { shape: 'rect', chairs: 2 },
    optionSpecs: [
      {
        key: 'shape',
        label: 'Shape',
        kind: 'chips',
        choices: [
          { id: 'rect', label: 'Rectangular' },
          { id: 'round', label: 'Round' },
        ],
      },
      {
        key: 'chairs',
        label: 'Chairs',
        kind: 'chips',
        choices: [
          { id: 0, label: 'None' },
          { id: 2, label: '2' },
          { id: 4, label: '4' },
        ],
      },
    ],
    editable: ['w', 'd'],
  },
  officeChair: {
    label: 'Ergonomic office chair',
    note: 'Mesh back, headrest, on casters',
    group: 'Work & dine',
    mount: 'surface',
    size: [0.66, 1.22, 0.66],
    uses: ['metal'],
    finish: finish(PLY, BLACK),
    options: { color: 'black', seat: 48, headrest: true },
    optionSpecs: [
      {
        key: 'color',
        label: 'Mesh',
        kind: 'chips',
        choices: [
          { id: 'black', label: 'Black' },
          { id: 'grey', label: 'Grey' },
        ],
      },
      { key: 'seat', label: 'Seat height', kind: 'range', min: 42, max: 56, step: 1, unit: 'cm' },
      { key: 'headrest', label: 'Headrest', kind: 'toggle' },
    ],
    editable: [],
  },
} satisfies Partial<Record<FurnitureType, FurnitureSpec>>
