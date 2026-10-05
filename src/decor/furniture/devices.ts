import type { FurnitureType } from '../../model/decor'
import { PLY, finish, METAL_FINISHES, type FurnitureSpec, type OptionSpec, roundMm } from './spec'

// Appliances and electronics: the owner's own models, at their real sizes.

/** Width of one Edifier R1700BT speaker. */
export const SPEAKER_W = 0.155
/** Height of the AC condenser itself, without a bracket. */
export const CONDENSER_H = 0.55

/** Common TV sizes, diagonal in inches. */
export const TV_INCHES = [32, 43, 50, 55, 65, 75]
/** Bezel on each side of the picture, meters. */
export const TV_BEZEL = 0.008
/** How high the feet / pedestal lift the panel off the surface. */
export const TV_LIFT = { feet: 0.07, pedestal: 0.1 } as const
/** Outer [width, height] in meters of a 16:9 panel with the given diagonal in inches. */
export function tvPanel(inches: number): [number, number] {
  const d = inches * 0.0254
  const k = Math.hypot(16, 9)
  return [roundMm((d * 16) / k + 2 * TV_BEZEL), roundMm((d * 9) / k + 2 * TV_BEZEL)]
}
const tvSizeChoices = TV_INCHES.map((n) => ({ id: n, label: `${n}″` }))
const tvScreen: OptionSpec = {
  key: 'screen',
  label: 'Screen',
  kind: 'chips',
  choices: [
    { id: 'off', label: 'Off' },
    { id: 'on', label: 'Picture' },
    { id: 'youtube', label: 'YouTube' },
  ],
}
const tvImage: OptionSpec = {
  key: 'image',
  label: 'Image link',
  kind: 'text',
  placeholder: 'https://…/photo.jpg',
  hint: 'Any image link, or /artwork/… from your library. Cropped to the screen; empty shows the skyline.',
  when: ['screen', 'on'],
}
const tvYouTube: OptionSpec = {
  key: 'youtube',
  label: 'YouTube link',
  kind: 'text',
  placeholder: 'https://youtu.be/…',
  hint: 'Plays on the screen. Drag the TV by its frame; clicks on the picture go to YouTube.',
  when: ['screen', 'youtube'],
}

export const DEVICES = {
  speakers: {
    label: 'Edifier R1700BT',
    note: 'Pair of bookshelf speakers',
    group: 'Appliances & electronics',
    mount: 'surface',
    tabletop: true,
    size: [roundMm(2 * SPEAKER_W + 0.6), 0.24, 0.2],
    sizeFor: (o, s) => [roundMm(2 * SPEAKER_W + Number(o.spacing ?? 60) / 100), s[1], s[2]],
    uses: ['body'],
    finish: finish('#8a5b3b'),
    options: { spacing: 60, grille: true },
    optionSpecs: [
      { key: 'spacing', label: 'Gap between speakers', kind: 'range', min: 10, max: 250, step: 5, unit: 'cm' },
      { key: 'grille', label: 'Grilles on', kind: 'toggle' },
    ],
    editable: [],
  },
  standMixer: {
    label: 'KitchenAid Artisan',
    note: 'Tilt-head stand mixer',
    group: 'Appliances & electronics',
    mount: 'surface',
    tabletop: true,
    size: [0.24, 0.36, 0.36],
    uses: ['metal'],
    finish: finish(PLY, '#dfe2e5'),
    options: { color: 'red' },
    optionSpecs: [
      {
        key: 'color',
        label: 'Color',
        kind: 'chips',
        choices: [
          { id: 'red', label: 'Empire red' },
          { id: 'white', label: 'White' },
          { id: 'black', label: 'Black' },
          { id: 'pistachio', label: 'Pistachio' },
          { id: 'almond', label: 'Almond cream' },
        ],
      },
    ],
    editable: [],
  },
  espressoMachine: {
    label: 'Oster Perfect Brew',
    note: 'Barista espresso machine',
    group: 'Appliances & electronics',
    mount: 'surface',
    tabletop: true,
    size: [0.22, 0.3, 0.28],
    uses: ['metal'],
    finish: finish(PLY, '#d9dcdf'),
    options: { cup: true },
    optionSpecs: [{ key: 'cup', label: 'Cup on the tray', kind: 'toggle' }],
    editable: [],
  },
  turntable: {
    label: 'Audio-Technica AT-LP120X',
    note: 'USB turntable, direct drive',
    group: 'Appliances & electronics',
    mount: 'surface',
    tabletop: true,
    size: [0.45, 0.157, 0.352],
    uses: ['metal'],
    finish: finish(PLY, '#d3d6d8'),
    options: { plinth: 'black', label: 'red', cover: 'closed' },
    optionSpecs: [
      {
        key: 'plinth',
        label: 'Plinth',
        kind: 'chips',
        choices: [
          { id: 'black', label: 'Black' },
          { id: 'silver', label: 'Silver' },
        ],
      },
      {
        key: 'label',
        label: 'Record label',
        kind: 'chips',
        choices: [
          { id: 'red', label: 'Red' },
          { id: 'yellow', label: 'Yellow' },
          { id: 'blue', label: 'Blue' },
          { id: 'white', label: 'White' },
          { id: 'green', label: 'Green' },
        ],
      },
      {
        key: 'cover',
        label: 'Dust cover',
        kind: 'chips',
        choices: [
          { id: 'closed', label: 'Closed' },
          { id: 'open', label: 'Open' },
          { id: 'removed', label: 'Removed' },
        ],
      },
    ],
    editable: [],
  },
  acIndoor: {
    label: 'Split AC, indoor unit',
    note: 'Wall unit, hung high',
    group: 'Appliances & electronics',
    mount: 'wall',
    size: [0.8, 0.28, 0.21],
    mountHeight: 2.1,
    uses: ['body'],
    finish: finish('#f3f3f0'),
    options: { display: true },
    optionSpecs: [{ key: 'display', label: 'Display lit', kind: 'toggle' }],
    editable: [],
  },
  acOutdoor: {
    label: 'Split AC, outdoor unit',
    note: 'Condenser, for the balcony',
    group: 'Appliances & electronics',
    mount: 'surface',
    size: [0.78, CONDENSER_H, 0.29],
    sizeFor: (o, s) => [s[0], roundMm(CONDENSER_H + (o.bracket === true ? Number(o.lift ?? 100) / 100 : 0)), s[2]],
    uses: ['body', 'metal'],
    finish: finish('#e6e4dd', METAL_FINISHES[3].color),
    options: { bracket: false, lift: 100 },
    optionSpecs: [
      { key: 'bracket', label: 'On a wall bracket', kind: 'toggle' },
      { key: 'lift', label: 'Bracket height', kind: 'range', min: 30, max: 180, step: 5, unit: 'cm' },
    ],
    editable: [],
  },
  tv: {
    label: 'TV on a stand',
    note: '16:9, for a sideboard or desk',
    group: 'Appliances & electronics',
    mount: 'surface',
    tabletop: true,
    size: [tvPanel(55)[0], roundMm(tvPanel(55)[1] + TV_LIFT.feet), 0.25],
    sizeFor: (o) => {
      const [w, h] = tvPanel(Number(o.inches ?? 55))
      return [w, roundMm(h + (o.stand === 'pedestal' ? TV_LIFT.pedestal : TV_LIFT.feet)), 0.25]
    },
    uses: ['metal'],
    finish: finish(PLY, '#161718'),
    options: { inches: 55, stand: 'feet', screen: 'off', youtube: '', image: '' },
    optionSpecs: [
      { key: 'inches', label: 'Size', kind: 'chips', choices: tvSizeChoices },
      {
        key: 'stand',
        label: 'Stand',
        kind: 'chips',
        choices: [
          { id: 'feet', label: 'Two feet' },
          { id: 'pedestal', label: 'Center pedestal' },
        ],
      },
      tvScreen,
      tvImage,
      tvYouTube,
    ],
    editable: [],
  },
  tvWall: {
    label: 'TV on the wall',
    note: '16:9, slim wall mount',
    group: 'Appliances & electronics',
    mount: 'wall',
    size: [...tvPanel(55), 0.06],
    // Bottom edge that puts a 55″ screen's center at a seated eye height of about 1.1 m.
    mountHeight: 0.75,
    sizeFor: (o) => [...tvPanel(Number(o.inches ?? 55)), 0.06],
    uses: ['metal'],
    finish: finish(PLY, '#161718'),
    options: { inches: 55, screen: 'off', youtube: '', image: '' },
    optionSpecs: [
      { key: 'inches', label: 'Size', kind: 'chips', choices: tvSizeChoices },
      tvScreen,
      tvImage,
      tvYouTube,
    ],
    editable: [],
  },
  fridge: {
    label: 'Fridge',
    note: 'Built-in look or retro, any color',
    group: 'Appliances & electronics',
    mount: 'surface',
    size: [0.6, 1.75, 0.62],
    presets: [
      { label: 'Compact 55', size: [0.55, 1.45, 0.6] },
      { label: 'Standard 60', size: [0.6, 1.75, 0.62] },
      { label: 'Tall 60', size: [0.6, 1.9, 0.66] },
      { label: 'Wide 70', size: [0.7, 1.9, 0.7] },
      { label: 'Retro FAB28', size: [0.6, 1.5, 0.73] },
    ],
    uses: ['body', 'metal'],
    bodyColors: [
      { label: 'White', color: '#e2e3e4' },
      { label: 'Stainless', color: '#c9ccce' },
      { label: 'Black', color: '#2a2b2d' },
      { label: 'Cream', color: '#efe3c8' },
      { label: 'Pastel blue', color: '#9fc3d6' },
      { label: 'Pastel green', color: '#b5d3b0' },
      { label: 'Pink', color: '#eab8c0' },
      { label: 'Red', color: '#b8322a' },
    ],
    finish: finish('#e2e3e4', METAL_FINISHES[3].color),
    options: { style: 'modern', freezer: 'top' },
    optionSpecs: [
      {
        key: 'style',
        label: 'Style',
        kind: 'chips',
        choices: [
          { id: 'modern', label: 'Modern' },
          { id: 'retro', label: 'Retro (rounded)' },
        ],
      },
      {
        key: 'freezer',
        label: 'Freezer',
        kind: 'chips',
        choices: [
          { id: 'top', label: 'On top' },
          { id: 'bottom', label: 'At the bottom' },
          { id: 'none', label: 'None (one door)' },
        ],
      },
    ],
    editable: ['w', 'h', 'd'],
  },
} satisfies Partial<Record<FurnitureType, FurnitureSpec>>
