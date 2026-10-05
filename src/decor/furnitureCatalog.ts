import type { FurnitureType } from '../model/decor'
import { SLEEP } from './furniture/sleep'
import { SIT } from './furniture/sit'
import { WORK_DINE } from './furniture/workDine'
import { STORAGE } from './furniture/storage'
import { KITCHEN_WALL } from './furniture/kitchenWall'
import { BALCONY } from './furniture/balcony'
import { DECOR } from './furniture/decor'
import { DEVICES } from './furniture/devices'
import type { FurnitureSpec } from './furniture/spec'

// The furniture catalog: every piece that can be placed, with its sizes, finishes
// and options. Entries live in src/decor/furniture/, one file per catalog group;
// their models are under src/scene/decor/furniture/ (docs/adr/0007).

export { BODY_FINISHES, FABRIC_FINISHES, METAL_FINISHES } from './furniture/spec'
export type { FurnitureSpec, OptionSpec } from './furniture/spec'
export { CONDENSER_H, SPEAKER_W, TV_BEZEL, TV_INCHES, TV_LIFT, tvPanel } from './furniture/devices'

export const FURNITURE: Record<FurnitureType, FurnitureSpec> = {
  ...SLEEP,
  ...SIT,
  ...WORK_DINE,
  ...STORAGE,
  ...KITCHEN_WALL,
  ...BALCONY,
  ...DECOR,
  ...DEVICES,
} satisfies Record<FurnitureType, FurnitureSpec>

export const FURNITURE_GROUPS: FurnitureSpec['group'][] = [
  'Sleep',
  'Sit',
  'Work & dine',
  'Storage',
  'Kitchen & wall',
  'Balcony',
  'Decor',
  'Appliances & electronics',
]

/** Presentation only: extra words the panel search matches. */
export const FURNITURE_KEYWORDS: Partial<Record<FurnitureType, string>> = {
  platformBed: 'double single mattress',
  murphyBed: 'murphy fold',
  daybed: 'sofa bed guest',
  sofa: 'couch settee',
  standingDesk: 'office work table',
  diningTable: 'dinner eat',
  chair: 'seat',
  butterflyChair: 'bkf hardoy seat lounge',
  bookshelf: 'books cubes shelving',
  wardrobe: 'closet clothes',
  sideboard: 'tv cabinet credenza',
  blockShelf: 'bricks books shelving',
  rug: 'carpet',
  gridShelf: 'wall shelving',
  upperCabinets: 'kitchen wall cupboard glass',
  floatingShelf: 'wall',
  pegGrid: 'pegboard kitchen wall',
  kitchenRail: 'hooks knives utensils',
  fruitBaskets: 'kitchen wire',
  stationClock: 'wall time',
  hangingRack: 'pots pans ceiling kitchen',
  speakers: 'edifier r1700bt bookshelf audio music sound',
  standMixer: 'kitchenaid artisan baking kitchen',
  espressoMachine: 'oster coffee barista cafe kitchen',
  turntable: 'audio-technica at-lp120x record player vinyl music',
  acIndoor: 'air conditioner split aire acondicionado',
  acOutdoor: 'air conditioner condenser compressor split balcony',
  tv: 'television tele screen smart tv 32 43 50 55 65 75 inch pulgadas',
  tvWall: 'television tele screen smart tv wall mounted 32 43 50 55 65 75 inch pulgadas',
  fridge: 'refrigerator heladera freezer smeg retro kitchen',
  loftBed: 'loft mezzanine high bed stairs steps drawers',
  glassDivider: 'partition screen reeded fluted glass wall',
  officeChair: 'desk task swivel ergonomic mesh',
  bistroChair: 'stool cafe metal tube stacking',
  windowBench: 'kitchen seat banquette storage',
  wireBasket: 'laundry hamper burlap coffee sack jute',
  balconyBench: 'outdoor pallet sofa daybed terrace',
  planterWall: 'cinder concrete blocks plants succulents',
  retroClock: 'wall time red kitsch',
  railTable: 'folding drop leaf balcony bar table railing',
  embroideryHoop: 'embroidery cross stitch wall art egg',
  mugs: 'cups coffee tea ceramic stoneware kitchen',
}
