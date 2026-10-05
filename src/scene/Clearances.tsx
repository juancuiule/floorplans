import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { isFloorPiece } from '../decor/placement'
import { useDecor } from '../decor/store'
import type { Vec3 } from '../model/types'
import { clearancesOf, type Clearance } from '../plan/clearance'
import { formatCm } from '../plan/measure'
import { useStructure } from '../project/structure'
import { useView } from '../store'

// Clearance check for the selected floor piece: a dimension from each free
// side to the nearest wall or piece, amber under 60 cm and red under 45 cm.

const COLOR: Record<Clearance['level'], string> = { ok: '#2f6fd6', tight: '#d97706', blocked: '#e5484d' }
const Y = 0.03
const noRaycast = () => {}

export function Clearances() {
  const on = useView((s) => s.clearances)
  const items = useDecor((s) => s.items)
  const activeId = useDecor((s) => s.movingId ?? s.selectedId)
  // Walls taken out or put back change what each side runs into.
  const structure = useStructure((s) => s.structure)
  const list = useMemo(() => {
    void structure // read by clearancesOf through the active walls
    const item = items.find((i) => i.id === activeId)
    return on && item && isFloorPiece(item) ? clearancesOf(item, items) : []
  }, [on, items, activeId, structure])

  return (
    <group>
      {list.map((c) => {
        const a: Vec3 = [c.from[0], Y, c.from[1]]
        const b: Vec3 = [c.to[0], Y, c.to[1]]
        return (
          <group key={c.side}>
            <Line
              points={[a, b]}
              color={COLOR[c.level]}
              lineWidth={2}
              dashed
              dashSize={0.05}
              gapSize={0.035}
              depthTest={false}
              transparent
              renderOrder={11}
              raycast={noRaycast}
            />
            <Html
              position={[(a[0] + b[0]) / 2, Y, (a[2] + b[2]) / 2]}
              center
              zIndexRange={[20, 10]}
              className={`clearance-label ${c.level}`}
            >
              <span data-clearance={c.side}>{formatCm(c.dist)}</span>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
