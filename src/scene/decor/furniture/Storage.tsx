import type { FurnitureItem } from '../../../model/decor'
import { B, Books, FingerHole, Rod, T } from './common'
import { mat } from './furnitureMaterials'

export function Bookshelf({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const cols = Math.max(1, Math.round(w / 0.35))
  const rows = Math.max(1, Math.round(h / 0.36))
  const cw = (w - T) / cols
  const rh = (h - T) / rows
  return (
    <group>
      <B s={[w, h, T]} p={[0, h / 2, -d / 2 + T / 2]} m={body} />
      {Array.from({ length: cols + 1 }, (_, i) => (
        <B key={`v${i}`} s={[T, h, d]} p={[-w / 2 + T / 2 + i * cw, h / 2, 0]} m={body} />
      ))}
      {Array.from({ length: rows + 1 }, (_, j) => (
        <B key={`h${j}`} s={[w, T, d]} p={[0, T / 2 + j * rh, 0]} m={body} />
      ))}
      {item.options.books !== false &&
        Array.from({ length: cols * rows }, (_, k) => {
          const i = k % cols
          const j = Math.floor(k / cols)
          if ((i * 7 + j * 3) % 4 === 3) return null
          return (
            <Books
              key={k}
              w={cw - T}
              h={rh - T}
              d={d - T}
              seed={`${item.id}${k}`}
              p={[-w / 2 + T / 2 + (i + 0.5) * cw, T + j * rh, T / 2]}
            />
          )
        })}
    </group>
  )
}

export function Wardrobe({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const side = item.options.sideShelf !== false ? 0.3 : 0
  const plinth = 0.08
  const doorsW = w - side
  const n = Math.max(1, Math.round(doorsW / 0.52))
  const dw = doorsW / n
  const topH = 0.62
  const gap = 0.004
  const x0 = -w / 2 + side
  return (
    <group>
      <B s={[w, h - plinth, d - 0.02]} p={[0, plinth + (h - plinth) / 2, -0.01]} m={body} />
      <B s={[w - 0.04, plinth, d - 0.08]} p={[0, plinth / 2, -0.03]} m={body} />
      {Array.from({ length: n }, (_, i) => {
        const cx = x0 + dw * (i + 0.5)
        const lowH = h - plinth - topH
        const pullX = cx + (i % 2 === 0 ? 1 : -1) * (dw / 2 - 0.06)
        return (
          <group key={i}>
            <B s={[dw - gap, lowH - gap, T]} p={[cx, plinth + lowH / 2, d / 2 - T / 2]} m={body} />
            <B s={[dw - gap, topH - gap, T]} p={[cx, plinth + lowH + topH / 2, d / 2 - T / 2]} m={body} />
            <FingerHole p={[pullX, plinth + lowH * 0.62, d / 2 + 0.001]} />
            <FingerHole p={[pullX, plinth + lowH + 0.08, d / 2 + 0.001]} vertical={false} />
          </group>
        )
      })}
      {side > 0 && (
        <group>
          {/* open shelving column, cut into the carcass front */}
          <B
            s={[side - T, h - plinth - 2 * T, 0.004]}
            p={[-w / 2 + side / 2, plinth + (h - plinth) / 2, d / 2 - 0.3]}
            m={mat('#b9a27f')}
            edges={false}
          />
          {Array.from({ length: 6 }, (_, j) => {
            const y = plinth + ((h - plinth) / 6) * j
            return (
              <group key={j}>
                <B s={[side, T, 0.3]} p={[-w / 2 + side / 2, y + T / 2, d / 2 - 0.15]} m={body} />
                {j < 5 && (
                  <Books
                    w={side - T * 2}
                    h={(h - plinth) / 6 - T - 0.02}
                    d={0.28}
                    seed={`${item.id}${j}`}
                    p={[-w / 2 + side / 2, y + T, d / 2 - 0.15]}
                  />
                )}
              </group>
            )
          })}
        </group>
      )}
    </group>
  )
}

export function Sideboard({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const steel = mat(item.finish.metal, 'metal')
  const legs = item.options.legs !== false
  const legH = legs ? 0.16 : 0
  const boxH = h - legH
  const n = Math.max(2, Math.round(w / 0.55))
  const dw = w / n
  return (
    <group>
      {legs &&
        [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <Rod
              key={`${sx}${sz}`}
              a={[sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)]}
              b={[sx * (w / 2 - 0.05), legH, sz * (d / 2 - 0.05)]}
              radius={0.01}
              m={steel}
            />
          )),
        )}
      <B s={[w, boxH, d - 0.03]} p={[0, legH + boxH / 2, -0.015]} m={body} />
      {Array.from({ length: n }, (_, i) => (
        // Sliding doors on two tracks, slightly overlapping.
        <group key={i}>
          <B
            s={[dw + 0.02, boxH - 0.04, 0.014]}
            p={[-w / 2 + dw * (i + 0.5), legH + boxH / 2, d / 2 - 0.03 + (i % 2 ? 0.016 : 0.001)]}
            m={body}
          />
          <B
            s={[0.012, 0.1, 0.006]}
            p={[
              -w / 2 + dw * (i + 0.5) + (i % 2 ? -1 : 1) * (dw / 2 - 0.05),
              legH + boxH / 2,
              d / 2 - 0.02 + (i % 2 ? 0.018 : 0.004),
            ]}
            m={steel}
            edges={false}
          />
        </group>
      ))}
    </group>
  )
}

export function Rug({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  return (
    <group>
      <B s={[w, h, d]} p={[0, h / 2, 0]} m={mat(item.finish.fabric, 'fabric')} shadow={false} />
      {item.options.border !== false && (
        <B
          s={[w - 0.16, 0.002, d - 0.16]}
          p={[0, h + 0.001, 0]}
          m={mat('#efe9dd', 'fabric')}
          edges={false}
          shadow={false}
        />
      )}
      {item.options.border !== false && (
        <B
          s={[w - 0.2, 0.003, d - 0.2]}
          p={[0, h + 0.0015, 0]}
          m={mat(item.finish.fabric, 'fabric')}
          edges={false}
          shadow={false}
        />
      )}
    </group>
  )
}

const BLOCK = '#a9a6a0'

/** Cinder blocks stood on end with planks between them, like the balcony photos. */
export function BlockShelf({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const plank = mat(item.finish.body)
  const block = mat(BLOCK, 'matte')
  const levels = Math.max(1, Math.round(Number(item.options.levels ?? 2)))
  const plankT = 0.025
  const stepH = h / levels
  const bw = 0.19
  const bd = Math.min(0.19, d)
  const hole = mat('#6f6c67', 'matte')
  return (
    <group>
      {Array.from({ length: levels }, (_, j) => {
        const y0 = j * stepH
        const blockH = stepH - plankT
        return (
          <group key={j}>
            {[-1, 1].map((sx) => (
              <group key={sx} position={[sx * (w / 2 - bw / 2 - 0.04), y0, 0]}>
                <B s={[bw, blockH, bd]} p={[0, blockH / 2, 0]} m={block} />
                {/* the two hollow cells show on the front face */}
                {[0.25, 0.72].map((t) => (
                  <B
                    key={t}
                    s={[bw - 0.05, blockH * 0.36, 0.004]}
                    p={[0, blockH * t, bd / 2 + 0.001]}
                    m={hole}
                    edges={false}
                  />
                ))}
              </group>
            ))}
            <B s={[w, plankT, d]} p={[0, y0 + blockH + plankT / 2, 0]} m={plank} />
          </group>
        )
      })}
    </group>
  )
}
