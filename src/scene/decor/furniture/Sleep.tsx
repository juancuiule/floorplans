import type { FurnitureItem } from '../../../model/decor'
import { B, Books, FingerHole, T } from './common'
import { mat } from './furnitureMaterials'

const MATTRESS = '#f5f4f0'
const PILLOW = '#fbfaf7'

/** Mattress, duvet and pillows on a sleeping area centered at (cx, cz), top of base at y. */
export function Bedding({
  w,
  d,
  y,
  cx = 0,
  cz = 0,
  fabric,
}: {
  w: number
  d: number
  y: number
  cx?: number
  cz?: number
  fabric: string
}) {
  const mh = 0.2
  const duvetD = d * 0.72
  const pillows = w > 1.1 ? 2 : 1
  return (
    <group position={[cx, y, cz]}>
      <B s={[w, mh, d]} p={[0, mh / 2, 0]} m={mat(MATTRESS, 'fabric')} />
      <B s={[w + 0.03, 0.05, duvetD]} p={[0, mh + 0.02, d / 2 - duvetD / 2 + 0.015]} m={mat(fabric, 'fabric')} />
      {Array.from({ length: pillows }, (_, i) => {
        const pw = Math.min(0.62, (w - 0.1) / pillows - 0.04)
        const x = pillows === 1 ? 0 : (i === 0 ? -1 : 1) * (pw / 2 + 0.03)
        return <B key={i} s={[pw, 0.11, 0.38]} p={[x, mh + 0.06, -d / 2 + 0.24]} m={mat(PILLOW, 'fabric')} />
      })}
    </group>
  )
}

/** A row of open cubbies facing +z, spanning [x0, x1], depth `cd`, total height `h`. */
function CubbyRow({
  x0,
  x1,
  z,
  h,
  cd,
  m,
  books,
  seed,
}: {
  x0: number
  x1: number
  z: number
  h: number
  cd: number
  m: ReturnType<typeof mat>
  books: boolean
  seed: string
}) {
  const len = x1 - x0
  const n = Math.max(1, Math.round(len / 0.42))
  const cw = len / n
  return (
    <group>
      {/* back of the cubbies */}
      <B s={[len, h - 2 * T, T]} p={[(x0 + x1) / 2, h / 2, z - cd + T / 2]} m={m} />
      {Array.from({ length: n + 1 }, (_, i) => (
        <B
          key={i}
          s={[T, h - 2 * T, cd]}
          p={[x0 + i * cw + (i === 0 ? T / 2 : i === n ? -T / 2 : 0), h / 2, z - cd / 2]}
          m={m}
        />
      ))}
      {books &&
        Array.from({ length: n }, (_, i) =>
          i % 3 === 1 ? null : (
            <Books
              key={i}
              w={cw - T * 1.5}
              h={h - 2 * T - 0.01}
              d={cd - T}
              seed={`${seed}${i}`}
              p={[x0 + (i + 0.5) * cw, T, z - cd / 2 + T / 2]}
            />
          ),
        )}
    </group>
  )
}

export function PlatformBed({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const books = item.options.books !== false
  const shelf = item.options.headShelf as 'none' | 'head' | 'L'
  const sd = shelf === 'none' ? 0 : 0.26
  const side = shelf === 'L' ? 0.26 : 0
  const cd = 0.3
  const sleepW = w - side
  const sleepD = d - sd
  const shelfH = h + 0.36
  return (
    <group>
      {/* top deck, bottom and head panel */}
      <B s={[w, T, d]} p={[0, h - T / 2, 0]} m={body} />
      <B s={[w, T, d]} p={[0, T / 2, 0]} m={body} edges={false} />
      <B s={[w, h - 2 * T, T]} p={[0, h / 2, -d / 2 + T / 2]} m={body} />
      {/* cubbies: foot end (+z) and the free long side (-x) */}
      <CubbyRow x0={-w / 2} x1={w / 2} z={d / 2} h={h} cd={cd} m={body} books={books} seed={item.id + 'f'} />
      <group rotation={[0, -Math.PI / 2, 0]}>
        <CubbyRow
          x0={-d / 2 + sd}
          x1={d / 2 - cd}
          z={w / 2}
          h={h}
          cd={cd}
          m={body}
          books={books}
          seed={item.id + 's'}
        />
      </group>
      {/* closed long side under the L shelf */}
      <B s={[T, h - 2 * T, d]} p={[w / 2 - T / 2, h / 2, 0]} m={body} />

      {sd > 0 && (
        <group>
          <B s={[w, shelfH - h, T]} p={[0, h + (shelfH - h) / 2, -d / 2 + sd - T / 2]} m={body} />
          <B s={[w, T, sd]} p={[0, shelfH - T / 2, -d / 2 + sd / 2]} m={body} />
          <B s={[w, shelfH - h, T]} p={[0, h + (shelfH - h) / 2, -d / 2 + T / 2]} m={body} />
          {[-1, 1].map((sx) => (
            <B
              key={sx}
              s={[T, shelfH - h, sd]}
              p={[sx * (w / 2 - T / 2), h + (shelfH - h) / 2, -d / 2 + sd / 2]}
              m={body}
            />
          ))}
        </group>
      )}
      {side > 0 && (
        <group>
          <B s={[T, shelfH - h, d - sd]} p={[w / 2 - side + T / 2, h + (shelfH - h) / 2, sd / 2]} m={body} />
          <B s={[side, T, d - sd]} p={[w / 2 - side / 2, shelfH - T / 2, sd / 2]} m={body} />
          <B s={[T, shelfH - h, d - sd]} p={[w / 2 - T / 2, h + (shelfH - h) / 2, sd / 2]} m={body} />
          <B s={[side, shelfH - h, T]} p={[w / 2 - side / 2, h + (shelfH - h) / 2, d / 2 - T / 2]} m={body} />
        </group>
      )}
      <Bedding w={sleepW - 0.06} d={sleepD - 0.05} y={h} cx={-side / 2} cz={sd / 2} fabric={item.finish.fabric} />
    </group>
  )
}

export function MurphyBed({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const open = item.options.open !== false
  const towers = item.options.sideTowers === true
  const tw = 0.45
  const bedLen = 2.0
  const upperY = 2.0
  const innerW = w - 2 * T
  return (
    <group>
      {/* carcass */}
      {[-1, 1].map((sx) => (
        <B key={sx} s={[T, h, d]} p={[sx * (w / 2 - T / 2), h / 2, 0]} m={body} />
      ))}
      <B s={[w, T, d]} p={[0, h - T / 2, 0]} m={body} />
      <B s={[innerW, h, T]} p={[0, h / 2, -d / 2 + T / 2]} m={body} />
      {/* top cabinets over the bed niche */}
      <B s={[innerW, T, d]} p={[0, upperY, 0]} m={body} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <B
            s={[innerW / 2 - 0.004, h - upperY - T - 0.006, T]}
            p={[(sx * innerW) / 4, (h + upperY) / 2, d / 2 - T / 2]}
            m={body}
          />
          <FingerHole p={[(sx * innerW) / 4 - sx * (innerW / 4 - 0.06), upperY + 0.08, d / 2 + 0.001]} />
        </group>
      ))}

      {open ? (
        <group>
          {/* bed frame folded down, resting on a front leg */}
          <B s={[innerW - 0.02, 0.26, bedLen]} p={[0, 0.07 + 0.13, d / 2 - 0.12 + bedLen / 2]} m={body} />
          <B s={[innerW - 0.1, 0.07, T]} p={[0, 0.035, d / 2 - 0.12 + bedLen - 0.1]} m={body} />
          <Bedding
            w={innerW - 0.08}
            d={bedLen - 0.06}
            y={0.33}
            cz={d / 2 - 0.12 + bedLen / 2}
            fabric={item.finish.fabric}
          />
        </group>
      ) : (
        <group>
          {/* the underside of the folded bed reads as a plywood front */}
          <B s={[innerW - 0.02, upperY - 0.06, 0.3]} p={[0, (upperY - 0.06) / 2 + 0.03, d / 2 - 0.15]} m={body} />
          <FingerHole p={[0, 0.9, d / 2 + 0.001]} vertical={false} />
        </group>
      )}

      {towers &&
        [-1, 1].map((sx) => (
          <group key={sx} position={[sx * (w / 2 + tw / 2), 0, 0]}>
            <B s={[tw, h, d]} p={[0, h / 2, 0]} m={body} />
            <B s={[tw - 0.006, h * 0.62, 0.004]} p={[0, h * 0.31 + 0.003, d / 2 + 0.002]} m={body} />
            <B s={[tw - 0.006, h * 0.38 - 0.012, 0.004]} p={[0, h * 0.81, d / 2 + 0.002]} m={body} />
            <FingerHole p={[-sx * (tw / 2 - 0.06), h * 0.55, d / 2 + 0.005]} />
            <FingerHole p={[-sx * (tw / 2 - 0.06), h * 0.66, d / 2 + 0.005]} />
          </group>
        ))}
    </group>
  )
}

export function Daybed({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const steel = mat(item.finish.metal, 'metal')
  const caster = 0.06
  const boxH = h - caster - 0.12
  const chestW = w * 0.45
  return (
    <group>
      {[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].map(([sx, sz]) => (
        <mesh
          key={`${sx}${sz}`}
          position={[sx * (w / 2 - 0.06), caster / 2, sz * (d / 2 - 0.06)]}
          rotation={[0, 0, Math.PI / 2]}
          material={mat('#2a2a2a', 'matte')}
        >
          <cylinderGeometry args={[caster / 2, caster / 2, 0.025, 16]} />
        </mesh>
      ))}
      <group position={[0, caster, 0]}>
        <B s={[w, T, d]} p={[0, T / 2, 0]} m={body} />
        <B s={[w, T, d]} p={[0, boxH - T / 2, 0]} m={body} />
        {[-1, 1].map((sx) => (
          <B key={sx} s={[T, boxH, d]} p={[sx * (w / 2 - T / 2), boxH / 2, 0]} m={body} />
        ))}
        <B s={[w, boxH, T]} p={[0, boxH / 2, -d / 2 + T / 2]} m={body} />
        {/* left: one wide drawer */}
        <B s={[w * 0.24, boxH - 2 * T - 0.006, T]} p={[-w / 2 + T + w * 0.12, boxH / 2, d / 2 - T / 2]} m={body} />
        <FingerHole p={[-w / 2 + T + w * 0.12, boxH * 0.72, d / 2 + 0.001]} vertical={false} />
        {/* middle: books */}
        <Books
          w={w * 0.26}
          h={boxH - 2 * T - 0.01}
          d={d - 0.1}
          seed={item.id}
          p={[-w / 2 + T + w * 0.24 + w * 0.13, T, 0.02]}
        />
        {/* right: flat-file chest */}
        {item.options.drawers !== false && (
          <group position={[w / 2 - T - chestW / 2, T, d / 2 - 0.02]}>
            <B s={[chestW, boxH - 2 * T, 0.04]} p={[0, (boxH - 2 * T) / 2, -0.02]} m={steel} />
            {Array.from({ length: 6 }, (_, i) => {
              const dh = (boxH - 2 * T) / 6
              return (
                <group key={i}>
                  <B s={[chestW - 0.012, dh - 0.006, 0.004]} p={[0, dh * (i + 0.5), 0.002]} m={steel} />
                  <B
                    s={[0.08, 0.008, 0.012]}
                    p={[0, dh * (i + 0.5), 0.008]}
                    m={mat('#d9dadb', 'metal')}
                    edges={false}
                  />
                </group>
              )
            })}
          </group>
        )}
        {/* cushion and pillows */}
        <B s={[w - 0.02, 0.12, d - 0.02]} p={[0, boxH + 0.06, 0]} m={mat(item.finish.fabric, 'fabric')} />
        {item.options.pillows !== false &&
          [-0.55, 0, 0.55].map((x, i) => (
            <B
              key={i}
              s={[0.55, 0.42, 0.14]}
              p={[x * (w / 2), boxH + 0.12 + 0.2, -d / 2 + 0.12]}
              r={[-0.18, 0, 0]}
              m={mat(i === 1 ? '#e8e6e1' : item.finish.fabric, 'fabric')}
            />
          ))}
      </group>
    </group>
  )
}
