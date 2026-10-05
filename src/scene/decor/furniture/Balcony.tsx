import { useEffect, useMemo } from 'react'
import type { FurnitureItem, PlantSpecies } from '../../../model/decor'
import { MATS, potMaterial } from '../plantMaterials'
import { buildPlant, POT_SIZES, seeded } from '../plantGeometry'
import { B, Pillow, Rod } from './common'
import { mat } from './furnitureMaterials'
import { cushionGeometry } from './softGeometry'

const PILLOWS = ['#b3664b', '#d8b24a', '#9aab8e', '#e8e2d3']

/** One EUR-style pallet, w × d, height ph: deck boards on stringers on blocks on runners. */
function Pallet({ w, d, ph, y, m }: { w: number; d: number; ph: number; y: number; m: ReturnType<typeof mat> }) {
  const bt = 0.022
  const blockH = ph - 3 * bt
  const boards = 5
  const bw = 0.1
  return (
    <group position={[0, y, 0]}>
      {/* bottom runners */}
      {[-1, 0, 1].map((k) => (
        <B key={`r${k}`} s={[w, bt, bw]} p={[0, bt / 2, k * (d / 2 - bw / 2)]} m={m} />
      ))}
      {/* blocks */}
      {[-1, 0, 1].flatMap((i) =>
        [-1, 0, 1].map((k) => (
          <B
            key={`b${i}${k}`}
            s={[0.12, blockH, bw]}
            p={[i * (w / 2 - 0.06), bt + blockH / 2, k * (d / 2 - bw / 2)]}
            m={m}
          />
        )),
      )}
      {/* stringers across the blocks */}
      {[-1, 0, 1].map((i) => (
        <B key={`s${i}`} s={[0.12, bt, d]} p={[i * (w / 2 - 0.06), bt + blockH + bt / 2, 0]} m={m} />
      ))}
      {/* deck boards with gaps */}
      {Array.from({ length: boards }, (_, k) => (
        <B
          key={`d${k}`}
          s={[w, bt, bw + 0.02]}
          p={[0, ph - bt / 2, -d / 2 + (bw + 0.02) / 2 + (k * (d - bw - 0.02)) / (boards - 1)]}
          m={m}
        />
      ))}
    </group>
  )
}

/** Balcony bench or daybed: a slatted frame or stacked pallets, a mattress cushion and back pillows. */
export function BalconyBench({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const wood = mat(item.finish.body)
  const fabric = mat(item.finish.fabric, 'fabric')
  const pallet = item.options.base === 'pallet'
  const cushionH = 0.1
  const baseH = Math.max(0.1, h - cushionH)
  const pillows = Math.max(0, Math.min(4, Math.round(Number(item.options.pillows ?? 3))))
  const pw = pillows ? Math.min(0.55, (w - 0.08) / pillows - 0.03) : 0
  let base
  if (pallet) {
    const n = Math.max(1, Math.round(baseH / 0.144))
    const ph = baseH / n
    base = Array.from({ length: n }, (_, i) => <Pallet key={i} w={w} d={d} ph={ph} y={i * ph} m={wood} />)
  } else {
    const leg = 0.05
    const slats = Math.max(4, Math.round(d / 0.09))
    base = (
      <group>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <B
              key={`${sx}${sz}`}
              s={[leg, baseH - 0.02, leg]}
              p={[sx * (w / 2 - leg / 2), (baseH - 0.02) / 2, sz * (d / 2 - leg / 2)]}
              m={wood}
            />
          )),
        )}
        {/* apron */}
        {[-1, 1].map((sz) => (
          <B key={`a${sz}`} s={[w - 2 * leg, 0.08, 0.022]} p={[0, baseH - 0.06, sz * (d / 2 - 0.011)]} m={wood} />
        ))}
        {[-1, 1].map((sx) => (
          <B key={`e${sx}`} s={[0.022, 0.08, d - 2 * leg]} p={[sx * (w / 2 - 0.011), baseH - 0.06, 0]} m={wood} />
        ))}
        {/* slats running the length */}
        {Array.from({ length: slats }, (_, k) => (
          <B
            key={`s${k}`}
            s={[w, 0.02, d / slats - 0.015]}
            p={[0, baseH - 0.01, -d / 2 + (k + 0.5) * (d / slats)]}
            m={wood}
          />
        ))}
        {/* low stretcher */}
        <B s={[w - 2 * leg, 0.03, 0.03]} p={[0, 0.1, 0]} m={wood} />
      </group>
    )
  }
  return (
    <group>
      {base}
      <mesh
        geometry={cushionGeometry(w - 0.02, cushionH, d - 0.02, 0.04)}
        position={[0, baseH, 0]}
        material={fabric}
        castShadow
        receiveShadow
      />
      {Array.from({ length: pillows }, (_, i) => {
        const x = -((pillows - 1) * (pw + 0.03)) / 2 + i * (pw + 0.03)
        const ph = Math.min(0.45, pw * 0.95)
        return (
          <Pillow
            key={i}
            s={[pw, ph, 0.16]}
            p={[x, baseH + cushionH + ph / 2 - 0.01, -d / 2 + 0.1]}
            r={[-0.22, (i - (pillows - 1) / 2) * 0.06, (i % 2 ? 1 : -1) * 0.03]}
            m={mat(PILLOWS[i % PILLOWS.length], 'fabric')}
          />
        )
      })}
    </group>
  )
}

// ---------- cinder-block planter wall ----------

const CELL_PLANTS: PlantSpecies[] = ['succulent', 'haworthia', 'aloe', 'succulent', 'burro']
/** Clay pot diameter that fits a block cell. */
const CELL_POT = 0.1

/**
 * Concrete blocks laid on their side in running bond, the two cells of each
 * block open to the front; some cells hold a small potted succulent.
 */
export function PlanterWall({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const concrete = mat(item.finish.body, 'matte')
  const cols = Math.max(1, Math.round(w / 0.4))
  const rows = Math.max(1, Math.round(h / 0.2))
  const bw = w / cols
  const bh = h / rows
  const shell = 0.032
  const share = Math.max(0, Math.min(1, Number(item.options.plants ?? 60) / 100))
  // Blocks per row: even rows full blocks, odd rows start and end with a half block.
  const blocks = useMemo(() => {
    const out: { x: number; y: number; bw: number; cells: number }[] = []
    for (let j = 0; j < rows; j++) {
      const y = j * bh
      if (j % 2 === 0 || cols === 1) {
        for (let i = 0; i < cols; i++) out.push({ x: -w / 2 + (i + 0.5) * bw, y, bw, cells: 2 })
      } else {
        out.push({ x: -w / 2 + bw / 4, y, bw: bw / 2, cells: 1 })
        for (let i = 0; i < cols - 1; i++) out.push({ x: -w / 2 + bw / 2 + (i + 0.5) * bw, y, bw, cells: 2 })
        out.push({ x: w / 2 - bw / 4, y, bw: bw / 2, cells: 1 })
      }
    }
    return out
  }, [rows, cols, bw, bh, w])
  const cells = useMemo(() => {
    const r = seeded(item.id)
    const out: { x: number; y: number; cw: number }[] = []
    for (const b of blocks) {
      const cw = (b.bw - (b.cells + 1) * shell) / b.cells
      for (let c = 0; c < b.cells; c++) out.push({ x: b.x - b.bw / 2 + shell + cw / 2 + c * (cw + shell), y: b.y, cw })
    }
    return out.filter(() => r() < share)
  }, [blocks, share, item.id])
  const plants = useMemo(
    () =>
      cells.map((c, i) => {
        const species = CELL_PLANTS[i % CELL_PLANTS.length]
        const model = buildPlant(species, 'clay', `${item.id}${i}`)
        return { ...c, species, model, scale: CELL_POT / 2 / POT_SIZES[species].r }
      }),
    [cells, item.id],
  )
  useEffect(() => () => plants.forEach((p) => p.model.parts.forEach((q) => q.geometry.dispose())), [plants])
  return (
    <group>
      {blocks.map((b, k) => {
        const cw = (b.bw - (b.cells + 1) * shell) / b.cells
        const inner = bh - 2 * shell
        return (
          <group key={k} position={[b.x, b.y, 0]}>
            <B s={[b.bw - 0.004, shell, d]} p={[0, shell / 2, 0]} m={concrete} />
            <B s={[b.bw - 0.004, shell, d]} p={[0, bh - shell / 2, 0]} m={concrete} />
            {Array.from({ length: b.cells + 1 }, (_, c) => (
              <B
                key={c}
                s={[shell, inner, d]}
                p={[-b.bw / 2 + shell / 2 + c * (cw + shell), bh / 2, 0]}
                m={concrete}
                edges={c === 0 || c === b.cells}
              />
            ))}
          </group>
        )
      })}
      {plants.map((p, i) => (
        <group key={i} position={[p.x, p.y + shell + 0.004, 0.02]} scale={p.scale} rotation={[0, i * 1.7, 0]}>
          {p.model.parts.map((q) => (
            <mesh
              key={q.mat}
              geometry={q.geometry}
              material={q.mat === 'pot' ? potMaterial('clay') : MATS[q.mat]}
              castShadow
            />
          ))}
        </group>
      ))}
    </group>
  )
}

// ---------- folding rail table ----------

/** A drop-leaf table on a wall batten: open, the leaf rests on two folding brackets; closed, it hangs flat. */
export function RailTable({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const wood = mat(item.finish.body)
  const steel = mat(item.finish.metal, 'metal')
  const open = item.options.open !== false
  const leafT = 0.022
  const batten = 0.07
  const bz = 0.025
  const bx = w / 2 - 0.08
  return (
    <group>
      {/* batten the hinges are screwed to, and a lower bracket plate for each strut */}
      <B s={[w, batten, bz]} p={[0, h - batten / 2, bz / 2]} m={wood} />
      {[-1, 1].map((sx) => (
        <B key={sx} s={[0.03, 0.08, 0.006]} p={[sx * bx, 0.04, 0.003]} m={steel} edges={false} />
      ))}
      {open ? (
        <group>
          <B s={[w, leafT, d]} p={[0, h + leafT / 2, bz + d / 2 - 0.02]} m={wood} />
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <Rod
                a={[sx * bx, 0.04, 0.008]}
                b={[sx * bx, h - 0.004, bz + d * 0.62]}
                radius={0.007}
                m={steel}
                segments={8}
              />
              <B s={[0.025, 0.01, d * 0.62]} p={[sx * bx, h - 0.005, bz + (d * 0.62) / 2]} m={steel} edges={false} />
            </group>
          ))}
          {/* hinges along the top of the batten */}
          {[-1, 1].map((sx) => (
            <B
              key={`h${sx}`}
              s={[0.06, 0.004, 0.04]}
              p={[sx * (w / 2 - 0.12), h + 0.002, bz + 0.005]}
              m={steel}
              edges={false}
            />
          ))}
        </group>
      ) : (
        <group>
          <B s={[w, d, leafT]} p={[0, h - d / 2, bz + leafT / 2 + 0.004]} m={wood} />
          {[-1, 1].map((sx) => (
            <Rod
              key={sx}
              a={[sx * bx, 0.04, 0.008]}
              b={[sx * bx, h - 0.1, 0.012]}
              radius={0.007}
              m={steel}
              segments={8}
            />
          ))}
        </group>
      )}
    </group>
  )
}
