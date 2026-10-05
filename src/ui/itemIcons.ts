import type { DecorItem, FurnitureType, LampType, PlantSpecies } from '../model/decor'
import type { IconName } from './icons'

// Which icon stands for each catalog entry, in the libraries and the room list.

export const FURNITURE_ICON: Record<FurnitureType, IconName> = {
  platformBed: 'platformBed',
  murphyBed: 'murphyBed',
  daybed: 'daybed',
  sofa: 'sofa',
  standingDesk: 'standingDesk',
  diningTable: 'diningTable',
  chair: 'chair',
  butterflyChair: 'butterflyChair',
  bookshelf: 'bookshelf',
  wardrobe: 'wardrobe',
  sideboard: 'sideboard',
  blockShelf: 'blockShelf',
  rug: 'rug',
  gridShelf: 'gridShelf',
  upperCabinets: 'upperCabinets',
  floatingShelf: 'floatingShelf',
  pegGrid: 'pegGrid',
  kitchenRail: 'kitchenRail',
  fruitBaskets: 'fruitBaskets',
  stationClock: 'stationClock',
  hangingRack: 'hangingRack',
  speakers: 'speakers',
  standMixer: 'standMixer',
  espressoMachine: 'espressoMachine',
  turntable: 'turntable',
  acIndoor: 'acIndoor',
  acOutdoor: 'acOutdoor',
  tv: 'tv',
  tvWall: 'tvWall',
  fridge: 'fridge',
  loftBed: 'loftBed',
  glassDivider: 'glassDivider',
  officeChair: 'officeChair',
  bistroChair: 'bistroChair',
  windowBench: 'windowBench',
  wireBasket: 'wireBasket',
  balconyBench: 'balconyBench',
  planterWall: 'planterWall',
  retroClock: 'retroClock',
  railTable: 'railTable',
  embroideryHoop: 'embroideryHoop',
  mugs: 'mugs',
}

export const PLANT_ICON: Record<PlantSpecies, IconName> = {
  monstera: 'plantLeaves',
  fiddle: 'plantTree',
  snake: 'plantBlades',
  palm: 'plantFronds',
  fern: 'plantFronds',
  olive: 'plantTree',
  cactus: 'plantCactus',
  lavender: 'plantBox',
  pothos: 'plantTrailing',
  succulent: 'plantRosette',
  herbs: 'plantBush',
  aloe: 'plantRosette',
  haworthia: 'plantRosette',
  jade: 'plantBush',
  burro: 'plantTrailing',
  rubber: 'plantTree',
  croton: 'plantLeaves',
  spider: 'plantFronds',
  collection: 'plantCollection',
  windowBox: 'plantBox',
}

export const LAMP_ICON: Record<LampType, IconName> = {
  arc: 'lampArc',
  tripod: 'lampTripod',
  table: 'lampTable',
  mushroom: 'lampMushroom',
  flowerpot: 'lampFlowerpot',
  pendant: 'lampPendant',
  globe: 'lampGlobe',
  lantern: 'lampLantern',
  sconce: 'lampSconce',
  exit: 'lampExit',
  exitCeiling: 'lampExitCeiling',
  string: 'lampString',
}

export function itemIcon(item: DecorItem): IconName {
  if (item.kind === 'furniture') return FURNITURE_ICON[item.type]
  if (item.kind === 'plant') return PLANT_ICON[item.species]
  if (item.kind === 'lamp') return LAMP_ICON[item.type]
  return 'image'
}
