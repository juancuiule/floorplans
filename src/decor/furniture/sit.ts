import type { FurnitureType } from '../../model/decor'
import { PLY, BLACK, finish, BODY_FINISHES, FABRIC_FINISHES, type FurnitureSpec } from './spec'

// Sofas, chairs and benches.

export const SIT = {
  sofa: {
    label: 'Low sofa',
    note: 'Box cushions, slim legs',
    group: 'Sit',
    mount: 'surface',
    size: [1.6, 0.7, 0.88],
    presets: [
      { label: '2 seats', size: [1.6, 0.7, 0.88] },
      { label: '3 seats', size: [2.1, 0.7, 0.88] },
    ],
    uses: ['fabric', 'metal'],
    finish: finish(PLY, BLACK, FABRIC_FINISHES[1].color),
    options: {},
    optionSpecs: [],
    editable: ['w', 'd'],
  },
  chair: {
    label: 'Plywood chair',
    note: 'Bent seat, steel legs',
    group: 'Sit',
    mount: 'surface',
    size: [0.45, 0.8, 0.5],
    uses: ['body', 'metal'],
    finish: finish(),
    options: {},
    optionSpecs: [],
    editable: [],
  },
  butterflyChair: {
    label: 'BKF butterfly chair',
    note: 'Argentine modernist classic',
    group: 'Sit',
    mount: 'surface',
    size: [0.78, 0.9, 0.8],
    uses: ['metal', 'fabric'],
    finish: finish(PLY, BLACK, FABRIC_FINISHES[6].color),
    options: {},
    optionSpecs: [],
    editable: [],
  },
  bistroChair: {
    label: 'Tube chair or stool',
    note: 'Bent steel tube, round wood seat',
    group: 'Sit',
    mount: 'surface',
    size: [0.42, 0.84, 0.44],
    // The footprint and height follow the type (the model itself is fixed-size).
    sizeFor: (o) =>
      o.variant === 'stool' ? [0.44, 0.46, 0.44] : o.variant === 'bar' ? [0.47, 0.66, 0.47] : [0.42, 0.84, 0.44],
    uses: ['body'],
    finish: finish(BODY_FINISHES[1].color),
    options: { variant: 'chair', color: '#e0662f' },
    optionSpecs: [
      {
        key: 'variant',
        label: 'Type',
        kind: 'chips',
        choices: [
          { id: 'chair', label: 'Chair' },
          { id: 'stool', label: 'Stool' },
          { id: 'bar', label: 'Bar stool' },
        ],
      },
      {
        key: 'color',
        label: 'Tube color',
        kind: 'chips',
        choices: [
          { id: '#e0662f', label: 'Orange' },
          { id: '#3f8a57', label: 'Green' },
          { id: '#2f5fb3', label: 'Blue' },
          { id: '#e5b92e', label: 'Yellow' },
          { id: '#c93a36', label: 'Red' },
          { id: '#f0eee9', label: 'White' },
        ],
      },
    ],
    editable: [],
  },
  windowBench: {
    label: 'Window bench',
    note: 'Plywood box seat with cushion',
    group: 'Sit',
    mount: 'surface',
    size: [1.2, 0.46, 0.42],
    presets: [
      { label: '90 cm', size: [0.9, 0.46, 0.42] },
      { label: '120 cm', size: [1.2, 0.46, 0.42] },
      { label: '160 cm', size: [1.6, 0.46, 0.42] },
    ],
    uses: ['body', 'fabric'],
    finish: finish(PLY, BLACK, FABRIC_FINISHES[4].color),
    options: { front: 'open', cushion: true },
    optionSpecs: [
      {
        key: 'front',
        label: 'Front',
        kind: 'chips',
        choices: [
          { id: 'open', label: 'Open cubbies' },
          { id: 'closed', label: 'Closed' },
        ],
      },
      { key: 'cushion', label: 'Seat cushion', kind: 'toggle' },
    ],
    editable: ['w', 'h', 'd'],
  },
} satisfies Partial<Record<FurnitureType, FurnitureSpec>>
