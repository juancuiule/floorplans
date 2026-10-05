import type { FurnitureItem } from '../../../model/decor'
import { B, Books, FingerHole, T } from './common'
import { mat } from './furnitureMaterials'
import { Bedding } from './Sleep'

/**
 * A raised sleeping platform: a plywood box about a meter high with drawers
 * along the front, the mattress on top in a shallow tray, and a column of
 * storage steps at one end that climbs from the front toward the wall.
 * The footprint (item.size) includes the steps.
 */
export function LoftBed({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const recess = mat('#8f7a5c', 'matte')
  const right = item.options.stairs !== 'left'
  const sgn = right ? 1 : -1
  const stairW = Math.min(0.5, w * 0.25)
  const pw = w - stairW
  const px = -sgn * (stairW / 2)
  const sx = sgn * (w / 2 - stairW / 2)
  const drawers = Math.max(0, Math.min(4, Math.round(Number(item.options.drawers ?? 3))))

  // Steps: equal risers up to the platform; the last "step" is the landing behind them.
  const flights = Math.max(2, Math.round(h / 0.26))
  const rise = h / flights
  const steps = flights - 1
  const run = Math.min(0.28, (d - 0.3) / steps)
  const landing = d - steps * run

  const plinth = 0.06
  const front = d / 2
  const innerH = h - plinth - T
  const gap = 0.005
  const trayH = 0.07
  return (
    <group>
      {/* platform carcass, set back behind the drawer fronts */}
      <B s={[pw, h - plinth, d - T]} p={[px, plinth + (h - plinth) / 2, -T / 2]} m={body} />
      <B s={[pw - 0.04, plinth, d - 0.06]} p={[px, plinth / 2, -0.03]} m={recess} edges={false} />
      {drawers > 0 ? (
        Array.from({ length: drawers }, (_, i) => {
          const cw = (pw - 2 * T) / drawers
          const cx = px - pw / 2 + T + cw * (i + 0.5)
          const lowH = innerH * 0.58
          return (
            <group key={i}>
              <B s={[cw - gap, lowH - gap, T]} p={[cx, plinth + lowH / 2, front - T / 2]} m={body} />
              <B
                s={[cw - gap, innerH - lowH - gap, T]}
                p={[cx, plinth + lowH + (innerH - lowH) / 2, front - T / 2]}
                m={body}
              />
              <FingerHole p={[cx, plinth + lowH - 0.06, front + 0.001]} vertical={false} />
              <FingerHole p={[cx, h - T - 0.06, front + 0.001]} vertical={false} />
            </group>
          )
        })
      ) : (
        <group>
          {/* open shelves: a dark recess with a shelf of books */}
          <B s={[pw - 2 * T, innerH, 0.004]} p={[px, plinth + innerH / 2, front - 0.3]} m={recess} edges={false} />
          <B s={[pw - 2 * T, T, 0.3]} p={[px, plinth + innerH / 2, front - 0.15]} m={body} />
          <Books
            w={pw - 0.1}
            h={innerH / 2 - T - 0.02}
            d={0.28}
            seed={item.id}
            p={[px, plinth + innerH / 2 + T / 2, front - 0.15]}
          />
          {[-1, 1].map((e) => (
            <B
              key={e}
              s={[T, innerH, 0.3]}
              p={[px + e * (pw / 2 - T / 2), plinth + innerH / 2, front - 0.15]}
              m={body}
            />
          ))}
        </group>
      )}
      {/* lipped tray the mattress sits in */}
      <B s={[pw, trayH, T]} p={[px, h + trayH / 2, front - T / 2]} m={body} />
      <B s={[pw, trayH, T]} p={[px, h + trayH / 2, -front + T / 2]} m={body} />
      <B s={[T, trayH, d - 2 * T]} p={[px - sgn * (pw / 2 - T / 2), h + trayH / 2, 0]} m={body} />
      <group rotation={[0, sgn * (Math.PI / 2), 0]} position={[px, h, 0]}>
        <Bedding w={d - 2 * T - 0.02} d={pw - T - 0.04} y={0} fabric={item.finish.fabric} />
      </group>

      {/* storage steps: each block reaches the floor; a drawer fills each riser */}
      <group position={[sx, 0, 0]}>
        {Array.from({ length: steps }, (_, i) => {
          const top = (i + 1) * rise
          const zc = front - i * run - run / 2
          return (
            <group key={i}>
              <B s={[stairW, top, run]} p={[0, top / 2, zc]} m={body} />
              <B s={[stairW + 0.01, 0.022, run + 0.015]} p={[0, top + 0.011, zc + 0.0075]} m={body} />
              <B s={[stairW - 0.03, rise - 0.03, 0.006]} p={[0, top - rise / 2, front - i * run + 0.003]} m={body} />
              <FingerHole p={[0, top - 0.055, front - i * run + 0.007]} vertical={false} />
            </group>
          )
        })}
        {/* landing, level with the platform, with a tall cupboard door on its riser */}
        <B s={[stairW, h, landing]} p={[0, h / 2, -front + landing / 2]} m={body} />
        <B s={[stairW + 0.01, 0.022, landing]} p={[0, h + 0.011, -front + landing / 2]} m={body} />
        <B s={[stairW - 0.03, rise - 0.03, 0.006]} p={[0, h - rise / 2, -front + landing + 0.003]} m={body} />
        <FingerHole p={[0, h - 0.055, -front + landing + 0.007]} vertical={false} />
      </group>
    </group>
  )
}
