import { memo, type ReactNode } from 'react'
import type { FurnitureItem, FurnitureType } from '../../../model/decor'
import { Merged } from '../../Merged'
import { Daybed, MurphyBed, PlatformBed } from './Sleep'
import { ButterflyChair, ChairItem, DiningTable, Sofa, StandingDesk } from './SitWork'
import { BlockShelf, Bookshelf, Rug, Sideboard, Wardrobe } from './Storage'
import { BalconyBench, PlanterWall, RailTable } from './Balcony'
import { EmbroideryHoop, GlassDivider, Mugs, RetroClock, WireBasket } from './Decor'
import { LoftBed } from './Loft'
import { BistroChair, OfficeChair, WindowBench } from './Seating'
import {
  FloatingShelf,
  FruitBaskets,
  GridShelf,
  HangingRack,
  KitchenRail,
  PegGrid,
  StationClock,
  UpperCabinets,
} from './Wall'
import { AcIndoor, AcOutdoor, Fridge, EspressoMachine, Speakers, StandMixer, Turntable } from './Devices'
import { Tv } from './Tv'

const VIEWS: Record<FurnitureType, (p: { item: FurnitureItem }) => ReactNode> = {
  platformBed: PlatformBed,
  murphyBed: MurphyBed,
  daybed: Daybed,
  sofa: Sofa,
  standingDesk: StandingDesk,
  diningTable: DiningTable,
  chair: ChairItem,
  butterflyChair: ButterflyChair,
  bookshelf: Bookshelf,
  wardrobe: Wardrobe,
  sideboard: Sideboard,
  blockShelf: BlockShelf,
  rug: Rug,
  loftBed: LoftBed,
  glassDivider: GlassDivider,
  officeChair: OfficeChair,
  bistroChair: BistroChair,
  windowBench: WindowBench,
  wireBasket: WireBasket,
  balconyBench: BalconyBench,
  planterWall: PlanterWall,
  mugs: Mugs,
  gridShelf: GridShelf,
  upperCabinets: UpperCabinets,
  floatingShelf: FloatingShelf,
  pegGrid: PegGrid,
  kitchenRail: KitchenRail,
  fruitBaskets: FruitBaskets,
  stationClock: StationClock,
  retroClock: RetroClock,
  railTable: RailTable,
  embroideryHoop: EmbroideryHoop,
  hangingRack: HangingRack,
  speakers: Speakers,
  standMixer: StandMixer,
  espressoMachine: EspressoMachine,
  turntable: Turntable,
  acIndoor: AcIndoor,
  acOutdoor: AcOutdoor,
  tv: Tv,
  tvWall: Tv,
  fridge: Fridge,
}

/** Only these fields change the model; moving or rotating a piece does not rebuild it. */
function sameModel(a: FurnitureItem, b: FurnitureItem): boolean {
  if (a === b) return true
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.size.every((v, i) => v === b.size[i]) &&
    a.finish.body === b.finish.body &&
    a.finish.metal === b.finish.metal &&
    a.finish.fabric === b.finish.fabric &&
    JSON.stringify(a.options) === JSON.stringify(b.options)
  )
}

/**
 * A furniture piece in local space (see FurnitureItem.at for where the origin sits).
 * Its boxes and outlines are merged into one mesh per material (see Merged).
 */
export const Furniture = memo(
  function Furniture({ item }: { item: FurnitureItem }) {
    const View = VIEWS[item.type]
    return (
      <Merged>
        <View item={item} />
      </Merged>
    )
  },
  (a, b) => sameModel(a.item, b.item),
)
