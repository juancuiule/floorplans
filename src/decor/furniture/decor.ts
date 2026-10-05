import type { FurnitureType } from '../../model/decor'
import { PLY, BLACK, finish, BODY_FINISHES, FABRIC_FINISHES, type FurnitureSpec } from './spec'

// Rugs, baskets, mugs and other small things.

export const DECOR = {
  rug: {
    label: 'Rug',
    note: 'Flat-woven',
    group: 'Decor',
    mount: 'surface',
    size: [2.0, 0.012, 1.4],
    presets: [
      { label: '120 × 170', size: [1.7, 0.012, 1.2] },
      { label: '140 × 200', size: [2.0, 0.012, 1.4] },
      { label: '160 × 230', size: [2.3, 0.012, 1.6] },
    ],
    uses: ['fabric'],
    finish: finish(PLY, BLACK, FABRIC_FINISHES[1].color),
    options: { border: true },
    optionSpecs: [{ key: 'border', label: 'Border stripe', kind: 'toggle' }],
    editable: ['w', 'd'],
  },
  glassDivider: {
    label: 'Glass room divider',
    note: 'Plywood frame, fluted glass',
    group: 'Decor',
    mount: 'surface',
    size: [1.4, 2.1, 0.3],
    presets: [
      { label: '2 panels', size: [0.9, 2.1, 0.3] },
      { label: '3 panels', size: [1.4, 2.1, 0.3] },
      { label: '4 panels · full height', size: [1.8, 2.4, 0.3] },
    ],
    uses: ['body'],
    finish: finish(),
    options: { panels: 3, glass: 'reeded', transom: true },
    optionSpecs: [
      { key: 'panels', label: 'Panels', kind: 'range', min: 1, max: 6, step: 1 },
      {
        key: 'glass',
        label: 'Glass',
        kind: 'chips',
        choices: [
          { id: 'reeded', label: 'Reeded' },
          { id: 'frosted', label: 'Frosted' },
          { id: 'clear', label: 'Clear' },
        ],
      },
      { key: 'transom', label: 'Top rail (transom)', kind: 'toggle' },
    ],
    editable: ['w', 'h'],
  },
  stationClock: {
    label: 'Station clock',
    note: 'Double-sided, shows the time',
    group: 'Decor',
    mount: 'wall',
    size: [0.09, 0.17, 0.38],
    uses: ['metal'],
    finish: finish(PLY, BLACK),
    options: {},
    optionSpecs: [],
    editable: [],
  },
  retroClock: {
    label: 'Retro wall clock',
    note: 'Rounded red triangle, shows the time',
    group: 'Decor',
    mount: 'wall',
    size: [0.32, 0.3, 0.05],
    uses: ['metal'],
    finish: finish(PLY, '#c9302c'),
    options: { shape: 'triangle' },
    optionSpecs: [
      {
        key: 'shape',
        label: 'Shape',
        kind: 'chips',
        choices: [
          { id: 'triangle', label: 'Triangle' },
          { id: 'round', label: 'Round' },
        ],
      },
    ],
    editable: [],
  },
  embroideryHoop: {
    label: 'Cross-stitch hoop',
    note: 'Pixel art on linen, wood hoop',
    group: 'Decor',
    mount: 'wall',
    size: [0.2, 0.2, 0.015],
    presets: [
      { label: '15 cm', size: [0.15, 0.15, 0.015] },
      { label: '20 cm', size: [0.2, 0.2, 0.015] },
      { label: '30 cm', size: [0.3, 0.3, 0.015] },
    ],
    uses: ['body'],
    finish: finish(BODY_FINISHES[0].color),
    options: { motif: 'egg' },
    optionSpecs: [
      {
        key: 'motif',
        label: 'Motif',
        kind: 'chips',
        choices: [
          { id: 'egg', label: 'Fried egg' },
          { id: 'cherries', label: 'Cherries' },
          { id: 'cactus', label: 'Cactus' },
          { id: 'heart', label: 'Heart' },
        ],
      },
    ],
    editable: [],
  },
} satisfies Partial<Record<FurnitureType, FurnitureSpec>>
