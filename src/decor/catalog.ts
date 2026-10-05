import type { FrameStyle, LampType, PlantSpecies, PotSize, PotStyle, SizePreset, Warmth } from '../model/decor'

export type Mount = 'wall' | 'surface' | 'ceiling'

/** Portrait [w, h] in meters. */
export const SIZE_PRESETS: { id: Exclude<SizePreset, 'custom'>; label: string; size: [number, number] }[] = [
  { id: 'A5', label: 'A5', size: [0.148, 0.21] },
  { id: 'A4', label: 'A4', size: [0.21, 0.297] },
  { id: 'A3', label: 'A3', size: [0.297, 0.42] },
  { id: 'A2', label: 'A2', size: [0.42, 0.594] },
  { id: '50x70', label: '50×70', size: [0.5, 0.7] },
]

export const FRAME_STYLES: { id: FrameStyle; label: string; width: number; depth: number; mat: number }[] = [
  { id: 'none', label: 'Poster', width: 0, depth: 0.003, mat: 0 },
  { id: 'thin', label: 'Thin', width: 0.015, depth: 0.022, mat: 0 },
  { id: 'classic', label: 'Classic', width: 0.035, depth: 0.03, mat: 0.05 },
  { id: 'box', label: 'Box', width: 0.022, depth: 0.05, mat: 0.03 },
  { id: 'float', label: 'Float', width: 0.012, depth: 0.035, mat: 0.03 },
  { id: 'canvas', label: 'Canvas', width: 0, depth: 0.035, mat: 0 },
]

export const FRAME_COLORS: { label: string; color: string }[] = [
  { label: 'Black', color: '#1f1e1c' },
  { label: 'White', color: '#f3f1ec' },
  { label: 'Oak', color: '#c69f6d' },
  { label: 'Walnut', color: '#5a3c28' },
  { label: 'Brass', color: '#b99645' },
  { label: 'Gray', color: '#8b8a86' },
]

export const MAT_WIDTHS = [0, 0.03, 0.05, 0.08]

export const PLANTS: Record<PlantSpecies, { label: string; note: string; mount: Mount; pot: PotStyle }> = {
  monstera: { label: 'Monstera', note: 'Big split leaves · ~0.9 m', mount: 'surface', pot: 'ceramic' },
  fiddle: { label: 'Fiddle-leaf fig', note: 'Tall, glossy · ~1.4 m', mount: 'surface', pot: 'basket' },
  snake: { label: 'Snake plant', note: 'Upright blades · ~0.7 m', mount: 'surface', pot: 'concrete' },
  palm: { label: 'Areca palm', note: 'Arching fronds · ~1.2 m', mount: 'surface', pot: 'basket' },
  fern: { label: 'Boston fern', note: 'Soft, drooping · ~0.5 m', mount: 'surface', pot: 'terracotta' },
  olive: { label: 'Olive tree', note: 'Balcony tree · ~1.5 m', mount: 'surface', pot: 'terracotta' },
  cactus: { label: 'Cactus', note: 'Column with arms · ~0.6 m', mount: 'surface', pot: 'terracotta' },
  lavender: { label: 'Lavender box', note: 'Planter box · 70 cm long', mount: 'surface', pot: 'concrete' },
  pothos: { label: 'Hanging pothos', note: 'Hangs from the ceiling', mount: 'ceiling', pot: 'ceramic' },
  succulent: { label: 'Succulent', note: 'Echeveria rosette · small', mount: 'surface', pot: 'clay' },
  herbs: { label: 'Herbs', note: 'Basil bush · kitchen', mount: 'surface', pot: 'clay' },
  aloe: { label: 'Aloe', note: 'Spiky rosette · small', mount: 'surface', pot: 'clay' },
  haworthia: { label: 'Haworthia', note: 'Striped rosette · tiny', mount: 'surface', pot: 'clay' },
  jade: { label: 'Jade plant', note: 'Crassula, fat leaves · ~40 cm', mount: 'surface', pot: 'ceramic' },
  burro: { label: 'Burro’s tail', note: 'Trailing bead strands', mount: 'surface', pot: 'clay' },
  rubber: { label: 'Rubber plant', note: 'Variegated ficus · ~1 m', mount: 'surface', pot: 'basket' },
  croton: { label: 'Croton', note: 'Red and yellow leaves · ~50 cm', mount: 'surface', pot: 'ceramic' },
  spider: { label: 'Spider plant', note: 'Arching striped blades', mount: 'surface', pot: 'terracotta' },
  collection: { label: 'Succulent collection', note: 'A row of small clay pots', mount: 'surface', pot: 'clay' },
  windowBox: { label: 'Window box', note: 'Wall planter, trailing sedum', mount: 'wall', pot: 'terracotta' },
}

/** Default clay pot size for the small species; others keep their own pot. */
export const DEFAULT_POT_SIZE: Partial<Record<PlantSpecies, PotSize>> = {
  succulent: 8,
  herbs: 12,
  aloe: 12,
  haworthia: 8,
  burro: 12,
}

/** Species a collection draws from, with the clay pot sizes they come in. */
export const COLLECTION_SPECIES: { species: PlantSpecies; sizes: number[] }[] = [
  { species: 'succulent', sizes: [0.06, 0.08, 0.12] },
  { species: 'haworthia', sizes: [0.06, 0.08] },
  { species: 'aloe', sizes: [0.08, 0.12] },
  { species: 'jade', sizes: [0.12] },
  { species: 'cactus', sizes: [0.08, 0.12] },
  { species: 'burro', sizes: [0.12] },
]

export const POT_SIZES: { id: PotSize; label: string }[] = [
  { id: 'auto', label: 'Plant’s own' },
  { id: 6, label: '6 cm' },
  { id: 8, label: '8 cm' },
  { id: 12, label: '12 cm' },
]

export const POTS: { id: PotStyle; label: string; color: string }[] = [
  { id: 'terracotta', label: 'Terracotta', color: '#b86a45' },
  { id: 'ceramic', label: 'White ceramic', color: '#f2f0eb' },
  { id: 'concrete', label: 'Concrete', color: '#a8a59f' },
  { id: 'basket', label: 'Basket', color: '#c9ab7c' },
  { id: 'black', label: 'Matte black', color: '#2a2927' },
  { id: 'clay', label: 'Clay pot', color: '#c0714a' },
]

export const LAMPS: Record<LampType, { label: string; note: string; mount: Mount; color: string; power: number }> = {
  arc: { label: 'Arc floor lamp', note: 'Reaches over a sofa', mount: 'surface', color: '#e9e6e0', power: 7 },
  tripod: { label: 'Tripod lamp', note: 'Wood legs, drum shade', mount: 'surface', color: '#efe8dc', power: 5 },
  table: { label: 'Table lamp', note: 'Drum shade, for a side table', mount: 'surface', color: '#efe8dc', power: 2.5 },
  mushroom: { label: 'Mushroom lamp', note: 'Small dome, glows', mount: 'surface', color: '#e8d6b8', power: 2 },
  flowerpot: {
    label: 'Flowerpot lamp',
    note: 'Two domes, 70s table lamp',
    mount: 'surface',
    color: '#d8b53c',
    power: 2,
  },
  pendant: { label: 'Dome pendant', note: 'Hangs over a table', mount: 'ceiling', color: '#2b2a28', power: 6 },
  globe: { label: 'Globe pendant', note: 'Opal glass sphere', mount: 'ceiling', color: '#f5f2ea', power: 5 },
  lantern: { label: 'Paper lantern', note: 'Large rice-paper globe', mount: 'ceiling', color: '#f6ead8', power: 6 },
  sconce: { label: 'Wall sconce', note: 'Up-light on a wall', mount: 'wall', color: '#2b2a28', power: 2.5 },
  exit: { label: 'EXIT cube', note: 'Red glass cube on a wall', mount: 'wall', color: '#d42a1e', power: 1.2 },
  exitCeiling: {
    label: 'EXIT ceiling sign',
    note: 'Milk-glass box, red letters',
    mount: 'ceiling',
    color: '#d42a1e',
    power: 1.5,
  },
  string: { label: 'String lights', note: 'Festoon along a wall', mount: 'wall', color: '#2b2a28', power: 0.5 },
}

export const WARMTH: { id: Warmth; label: string; color: string }[] = [
  { id: 2700, label: '2700 K', color: '#ffcb94' },
  { id: 3000, label: '3000 K', color: '#ffd8b0' },
  { id: 4000, label: '4000 K', color: '#fff1df' },
]

export const warmthColor = (w: Warmth) => WARMTH.find((x) => x.id === w)?.color ?? '#ffc792'

// ---------- presentation only (panel grouping and search) ----------

export type PlantGroup = 'Floor plants' | 'Small and tabletop' | 'Planters' | 'Hanging and wall'
export const PLANT_GROUPS: PlantGroup[] = ['Floor plants', 'Small and tabletop', 'Planters', 'Hanging and wall']

export const PLANT_META: Record<PlantSpecies, { group: PlantGroup; keywords?: string }> = {
  monstera: { group: 'Floor plants', keywords: 'swiss cheese' },
  fiddle: { group: 'Floor plants', keywords: 'ficus lyrata tree' },
  snake: { group: 'Floor plants', keywords: 'sansevieria' },
  palm: { group: 'Floor plants', keywords: 'dypsis' },
  olive: { group: 'Floor plants', keywords: 'tree balcony outdoor' },
  rubber: { group: 'Floor plants', keywords: 'ficus elastica' },
  fern: { group: 'Small and tabletop' },
  cactus: { group: 'Small and tabletop', keywords: 'succulent' },
  succulent: { group: 'Small and tabletop', keywords: 'echeveria clay pot' },
  herbs: { group: 'Small and tabletop', keywords: 'basil kitchen clay pot' },
  aloe: { group: 'Small and tabletop', keywords: 'succulent clay pot' },
  haworthia: { group: 'Small and tabletop', keywords: 'succulent clay pot' },
  jade: { group: 'Small and tabletop', keywords: 'crassula succulent' },
  burro: { group: 'Small and tabletop', keywords: 'sedum trailing succulent clay pot' },
  croton: { group: 'Small and tabletop' },
  spider: { group: 'Small and tabletop', keywords: 'chlorophytum' },
  lavender: { group: 'Planters', keywords: 'box balcony' },
  collection: { group: 'Planters', keywords: 'succulents row clay pots' },
  pothos: { group: 'Hanging and wall', keywords: 'ceiling trailing' },
  windowBox: { group: 'Hanging and wall', keywords: 'sedum planter' },
}

export const MOUNT_GROUP: Record<Mount, string> = { surface: 'Floor and table', ceiling: 'Ceiling', wall: 'Wall' }
export const MOUNT_ORDER: Mount[] = ['surface', 'ceiling', 'wall']

export const LAMP_KEYWORDS: Partial<Record<LampType, string>> = {
  arc: 'floor',
  tripod: 'floor',
  table: 'desk bedside',
  mushroom: 'desk bedside',
  flowerpot: 'desk bedside panton',
  pendant: 'ceiling',
  globe: 'ceiling',
  lantern: 'ceiling noguchi',
  sconce: 'wall',
  exit: 'wall sign',
  exitCeiling: 'sign vintage milk glass ceiling',
  string: 'festoon fairy wall',
}
