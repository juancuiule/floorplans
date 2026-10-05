import { memo } from 'react'

// Line icons on a 20 × 20 grid, 1.5 stroke, round caps. Every path is drawn in
// currentColor so an icon takes the color of the text beside it.

const POT = 'M6.5 13h7l-1 4h-5z'

const PATHS = {
  // ---------- interface ----------
  search: 'M8.5 3.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12.2 12.2 16.5 16.5',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  plus: 'M10 4.5v11M4.5 10h11',
  minus: 'M4.5 10h11',
  chevron: 'M6 8l4 4 4-4',
  trash: 'M4 6h12M8 6V4.5h4V6M5.5 6l.7 10h7.6l.7-10M8.5 9v4.5M11.5 9v4.5',
  // floor plan editor
  pointer: 'M5.5 3.5l9.5 6-4.3 1.1L8.4 15z',
  room: 'M3.5 3.5h7v4h6v9h-13zM6.5 6.5v.01M13.5 13.5v.01',
  door: 'M5 16.5v-13h8v13M3 16.5h14M10.5 10v.5',
  window: 'M3.5 4.5h13v11h-13zM10 4.5v11M3.5 10h13',
  glassDoor: 'M4.5 16.5v-13h11v13M10 3.5v13M3 16.5h14M8.5 9.5v1.5M11.5 9.5v1.5',
  passage: 'M4.5 16.5v-9a5.5 5.5 0 0 1 11 0v9M3 16.5h14',
  fitting: 'M6 3.5h8v3.5H6zM4.5 7h11a5.5 5.5 0 0 1-11 0zM8 12l-.5 4.5h5L12 12',
  undo: 'M7.5 4.5 4 8l3.5 3.5M4 8h7.5a4.5 4.5 0 0 1 0 9H9',
  redo: 'M12.5 4.5 16 8l-3.5 3.5M16 8H8.5a4.5 4.5 0 0 0 0 9H11',
  fit: 'M3.5 7V3.5H7M13 3.5h3.5V7M16.5 13v3.5H13M7 16.5H3.5V13',
  eye: 'M2.5 10s3-5.5 7.5-5.5S17.5 10 17.5 10s-3 5.5-7.5 5.5S2.5 10 2.5 10zM10 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  upload: 'M10 13V4M6.5 7.5 10 4l3.5 3.5M4 12.5V16h12v-3.5',
  panel:
    'M4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9A1.5 1.5 0 0 1 4.5 4zM12 4v12',
  brush: 'M15.5 3.5l1 1-6.8 6.8-1.9-.1-.1-1.9zM7.4 11.8c-1.6 0-2.9 1.2-2.9 2.8 0 .9-.5 1.6-1.5 1.9 3 .8 6.2-.4 6.4-2.8',
  help: 'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM7.9 8a2.2 2.2 0 1 1 3.1 2c-.6.3-1 .8-1 1.4v.3M10 14.2v.1',
  sun: 'M10 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1 1M14.3 14.3l1 1M4.7 15.3l1-1M14.3 5.7l1-1',
  moon: 'M15.5 12.3A6 6 0 0 1 7.7 4.5a6 6 0 1 0 7.8 7.8z',
  downlight: 'M3 4h14M7 4v2h6V4M8 9l-2 4M12 9l2 4M10 9v5',
  walk: 'M11 3.2a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zM8 17l2-5.5 2.5 2V17M10 11.5l.8-3.6-3 1.3L7 11.5M10.8 7.9l1.8 2.3 2.4.8',
  tape: 'M3 7h14v6H3zM6 7v2.5M9 7v3.5M12 7v2.5M15 7v3.5',
  clearance: 'M7 7h6v6H7zM7 10H2.5M13 10h4.5M10 7V2.5M10 13v4.5M3.5 8.5 2.5 10l1 1.5M16.5 8.5l1 1.5-1 1.5',
  ruler: 'M3 6v8M17 6v8M3 10h14M5.5 8 3 10l2.5 2M14.5 8l2.5 2-2.5 2',
  dollhouse: 'M3 9.5 10 4l7 5.5M5 8v8h10V8M8.5 16v-4h3v4',
  xray: 'M10 3l6 3.5v7L10 17l-6-3.5v-7zM4 6.5 10 10l6-3.5M10 10v7',
  flip: 'M4 7.5h11.5M12.5 4.5l3 3-3 3M16 12.5H4.5M7.5 9.5l-3 3 3 3',
  camera: 'M3.5 6.5h3l1.5-2h4l1.5 2h3v9h-13zM10 8.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  move: 'M10 3v14M3 10h14M8 5l2-2 2 2M8 15l2 2 2-2M5 8l-2 2 2 2M15 8l2 2-2 2',
  duplicate: 'M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM13 4H5a1 1 0 0 0-1 1v8',
  image:
    'M4 4h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM3 13l4-4 3 3 2-2 5 4M13 6.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z',
  alert: 'M10 3.5 17 16H3zM10 8.5v3.5M10 14.2v.1',
  check: 'M4.5 10.5 8 14l7.5-8',
  layers: 'M10 3.5 17 7l-7 3.5L3 7zM3 10.5 10 14l7-3.5M3 14l7 3.5 7-3.5',
  pencil: 'M12.5 4.5l3 3L7 16H4v-3zM11 6l3 3',
  compare: 'M7 4v12M13 4v12M4 7l3-3 3 3M10 13l3 3 3-3',
  roller:
    'M4 3.5h10a1 1 0 0 1 1 1V7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM15 5.5h1.5a.5.5 0 0 1 .5.5v3.5a.5.5 0 0 1-.5.5H10v2.5M9 12.5h2v5H9z',

  // ---------- furniture ----------
  platformBed: 'M3 5v11M3 11h14v3H3M17 14v2M5 11V9.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V11',
  murphyBed: 'M5 3h10v14H5zM7 5h6v9H7zM3 17h14',
  daybed: 'M3 8v6M17 8v6M3 11h14M3 14h14M9 12.5h2M4 14v2M16 14v2',
  sofa: 'M5 10V6.5A1.5 1.5 0 0 1 6.5 5h7A1.5 1.5 0 0 1 15 6.5V10M3 10h14v4H3zM3 8v6M17 8v6M4.5 14v2M15.5 14v2',
  standingDesk: 'M3 8h14M6 8v8M14 8v8M4 16h4M12 16h4M7.5 3h5v3h-5zM10 6v2',
  diningTable: 'M2.5 8h15M5 8v8M15 8v8M7 8v2h6V8',
  chair: 'M6 3v13M6 10h8M14 10v6M6 6h1',
  butterflyChair: 'M4 16 8.5 4M16 16 11.5 4M8.5 4c.5 5 2 8 5.5 9.5M11.5 4c-.5 5-2 8-5.5 9.5',
  bookshelf: 'M4 3h12v14H4zM4 7.7h12M4 12.3h12M8 3v14M12 3v14',
  wardrobe: 'M4.5 2.5h11v13h-11zM10 2.5v13M8.5 8v2M11.5 8v2M5.5 15.5v2M14.5 15.5v2',
  sideboard: 'M3 7h14v7H3zM10 7v7M8.5 10.5h-1M12.5 10.5h-1M4.5 14v2.5M15.5 14v2.5',
  blockShelf: 'M3 6h14M3 11h14M3 16h14M4.5 6h2.5v5H4.5zM13 6h2.5v5H13zM4.5 11h2.5v5H4.5zM13 11h2.5v5H13z',
  rug: 'M3 6h14v8H3zM5.5 8.5h9v3h-9zM3 7.5H1.5M3 10H1.5M3 12.5H1.5M17 7.5h1.5M17 10h1.5M17 12.5h1.5',
  gridShelf: 'M4 3h12v10H4zM8 3v10M12 3v10M4 8h12M2.5 15.5h15M5 13v2.5M15 13v2.5',
  upperCabinets: 'M2.5 4h15v8h-15zM10 4v8M5 6v4M6.5 6v4M13.5 6v4M15 6v4M5 15h10',
  floatingShelf: 'M3 11h14v2H3zM5 13v2.5M15 13v2.5M6 11V6M8 11V7M12.5 11a1.8 1.8 0 1 1 3 0',
  pegGrid: 'M3 3h14v14H3zM7.7 3v14M12.3 3v14M3 7.7h14M3 12.3h14',
  kitchenRail: 'M3 5h14M6 5v4M10 5v9M14 5v6M5 9h2v3H5zM13 11h2v2.5h-2z',
  fruitBaskets: 'M10 2v3M4 5.5a6 3 0 0 0 12 0zM5 11a5 2.5 0 0 0 10 0zM6.5 15.5a3.5 2 0 0 0 7 0zM10 8.5V11M10 13.5v2',
  stationClock: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM10 6.5V10l2.5 1.5',
  hangingRack: 'M2 3h16M5 3v5M15 3v5M3 8h14v3H3zM7 8v3M10 8v3M13 8v3M6 11v4M14 11v3',
  speakers:
    'M2.5 4.5h5.5v11H2.5zM12 4.5h5.5v11H12zM5.25 9.9a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM14.75 9.9a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM5.25 7v.1M14.75 7v.1',
  standMixer:
    'M3.5 16.5h12M6 16.5V9M5 9V6.5A1.5 1.5 0 0 1 6.5 5h7.5a2 2 0 0 1 0 4H5zM9 11.5h6.5l-1.2 4h-4.1zM12.5 9v2.5',
  espressoMachine: 'M4 3.5h12V7H4zM5 7v9.5M3.5 16.5h13M8.5 7v1.5h3V7M11.5 8.5l4 1M8.5 12.5h3l-.4 3H8.9z',
  turntable: 'M2.5 5h15v10h-15zM8 6.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM8 9.9v.2M15 6.5V11l-2 1.5',
  acIndoor: 'M2.5 5h15v5.5A1.5 1.5 0 0 1 16 12H4a1.5 1.5 0 0 1-1.5-1.5zM5 9.5h10M6 14.5l-1 2M10 14.5v2M14 14.5l1 2',
  acOutdoor:
    'M2.5 4.5h15v11h-15zM8 6.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM8 8.5v3M6.5 10h3M14 7v6M15.8 7v6M4 15.5V17M16 15.5V17',
  tv: 'M2.5 4h15v9.5h-15zM5 17l2-3.5M15 17l-2-3.5',
  tvWall: 'M2 3.5v13M4.5 5h13v9h-13zM2 10h2.5',
  fridge: 'M5 2.5h10v15H5zM5 8h10M7.5 4.5v2M7.5 10v3',
  loftBed: 'M2.5 8.5H13v8H2.5zM2.5 6.5H13M5 12.5h2M8.5 12.5h2M13 13.5h2.5V11H18v5.5h-5',
  glassDivider: 'M3 3h14v13H3zM7.7 3v13M12.3 3v13M5.3 5v9M10 5v9M14.7 5v9M4 16v1.5M16 16v1.5',
  officeChair: 'M6.5 2.5h7v7h-7zM5 11h10M10 11v3.5M6 17l4-2.5 4 2.5M10 14.5V17M4 9v2M16 9v2',
  bistroChair: 'M6 9.5V4.5c0-1.5 8-1.5 8 0v5M4.5 9.5h11M6 9.5 4.5 17M14 9.5l1.5 7.5M8 9.5 7.5 17M12 9.5l.5 7.5',
  windowBench: 'M5 2.5h10v6H5zM10 2.5v6M2.5 11h15v5.5h-15zM2.5 11V9.5h15V11M7.5 11v5.5M12.5 11v5.5',
  wireBasket: 'M4 5h12l-1.2 11.5H5.2zM7 5l.5 11.5M10 5v11.5M13 5l-.5 11.5M4.4 9h11.2M4.8 13h10.4',
  balconyBench:
    'M2.5 11h15v2.5h-15zM3.5 13.5v3M16.5 13.5v3M4 11V7.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1V11M10.5 11V7.5a1 1 0 0 1 1-1H15a1 1 0 0 1 1 1V11',
  planterWall:
    'M3 4h14v12H3zM3 8h14M3 12h14M10 4v4M6.5 8v4M13.5 8v4M10 12v4M5.5 6.5c.5-1 1.5-1 2 0M12.5 14.5c.5-1 1.5-1 2 0',
  retroClock: 'M10 3 17 15.5H3zM10 8.5a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6zM10 11.3V9.8M10 11.3h1.2',
  railTable: 'M3.5 3v14M3.5 8H17M3.5 15.5 9 8M3.5 6h2',
  embroideryHoop:
    'M10 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM10 1.5V4M8.5 1.5h3M8 9h1.5v1.5H8zM10.5 10.5H12V12h-1.5zM8 12h1.5v1.5H8z',
  mugs: 'M2.5 8h5.5v7.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1zM8 10h1a1.5 1.5 0 0 1 0 3H8M11 6h5.5v9.5a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1zM16.5 8h1a1.5 1.5 0 0 1 0 3h-1M5 3.5c-.5 1 .5 1.5 0 2.5M14 1.5c-.5 1 .5 1.5 0 2.5',

  // ---------- plants ----------
  plantLeaves: `${POT}M10 13V8M10 8C6 9 4 7 4 4c4-1 6 1 6 4zM10 8c4 1 6-1 6-4-4-1-6 1-6 4z`,
  plantTree: `${POT}M10 13V9M10 2.5a3.8 3.8 0 1 1 0 7.5 3.8 3.8 0 0 1 0-7.5z`,
  plantBlades: `${POT}M8 13c-1-3-1-6 0-9 1 3 1 6 0 9zM10.5 13c-.5-3.5 0-7 1.5-10 .5 3.5.5 7-1.5 10zM12.5 13c0-2 .5-4 2-5.5`,
  plantFronds: `${POT}M10 13V4M10 13C9 9 6 7 3 7.5M10 13c1-4 4-6 7-5.5M10 9c-1-2-3-3-5-3M10 9c1-2 3-3 5-3`,
  plantCactus: `${POT}M8.5 13V5a1.5 1.5 0 0 1 3 0v8M8.5 10H7a1 1 0 0 1-1-1V7.5M11.5 8.5H13a1 1 0 0 0 1-1V6`,
  plantRosette: `${POT}M10 13c-3 0-4.5-2-5-4 2 0 4 1 5 4zM10 13c3 0 4.5-2 5-4-2 0-4 1-5 4zM10 13c-1.2-2.5-1.2-5 0-7 1.2 2 1.2 4.5 0 7z`,
  plantTrailing: 'M10 2v4M6.5 6h7l-1 3.5h-5zM7.5 9.5c-1 2 .5 3.5-.5 5.5s0 2.5 0 2.5M12.5 9.5c1 2-.5 3.5.5 5.5M10 9.5v4',
  plantBox: 'M3 12h14l-1 4H4zM6 12V7.5M10 12V6M14 12V7.5M6 9l-1.5-1M10 8l1.5-1M14 9.5l1.5-1',
  plantBush: `${POT}M10 13v-2.5M6 10.5a2.5 2.5 0 0 1 1.5-4.4 2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 1.5 4.4z`,
  plantCollection:
    'M2.5 13h4l-.5 3h-3zM8 13h4l-.5 3h-3zM13.5 13h4l-.5 3h-3zM4.5 13v-2M3.3 10.5l1.2.5 1.2-.5M10 13V9.5a1 1 0 0 1 1-1M15.5 13v-2.5M14.3 11l1.2-1 1.2 1',

  // ---------- lights ----------
  lampArc: 'M4 17h5M6.5 17V8.5A5.5 5.5 0 0 1 12 3h1.5M11.5 6.5h5L15 3.5h-2z',
  lampTripod: 'M6 3h8l1 4.5H5zM10 7.5v2M10 9.5 6 17M10 9.5l4 7.5M10 9.5V17',
  lampTable: 'M6 3.5h8l1 4.5H5zM10 8v7M7 15h6v1.5H7z',
  lampMushroom: 'M4 10a6 6 0 0 1 12 0zM9 10v5.5h2V10M6.5 16.5h7',
  lampFlowerpot: 'M4.5 8a5.5 4.5 0 0 1 11 0zM6.5 10a3.5 3 0 0 0 7 0zM10 13v3M7.5 16.5h5',
  lampPendant: 'M10 2v5M4 13a6 6 0 0 1 12 0zM8.5 15.5h3',
  lampGlobe: 'M10 2v5M10 7a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
  lampLantern: 'M10 2v3M10 5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM4.8 9h10.4M4.8 12h10.4',
  lampSconce: 'M4 4v12M4 10h3M6.5 5h7l-1.5 5h-4zM8.5 3l-.5-1M12 3l.5-1',
  lampExit: 'M4 5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM6.5 8.5h7M6.5 11.5h4',
  lampExitCeiling: 'M10 2v3.5M3 5.5h14v9H3zM6 8v4h2M6 10h1.5M6 8h2M9.5 8l2.5 4M12 8l-2.5 4M14 8v4',
  lampString:
    'M2 4.5c5 4 11 4 16 0M6 7.3v1.2M10 8v1.2M14 7.3v1.2M6 8.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM10 9.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM14 8.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z',
} as const

export type IconName = keyof typeof PATHS

export const Icon = memo(function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
})
