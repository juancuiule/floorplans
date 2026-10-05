import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useState } from 'react'
import { project } from '../project'
import { useView } from '../store'

const fmt = (n: number) => n.toFixed(2)

/** Labels are overlays that ignore walls, so they only make sense from above. */
const MIN_CAMERA_Y = 3

export function Labels() {
  const show = useView((s) => s.showDims)
  const [above, setAbove] = useState(true)
  useFrame(({ camera }) => {
    const next = camera.position.y > MIN_CAMERA_Y
    if (next !== above) setAbove(next)
  })
  const visible = show && above
  return (
    <group>
      {project.shell.rooms
        .filter((r) => r.label)
        .map((r) => {
          const [x0, z0, x1, z1] = r.rect
          const [x, z] = r.labelAt ?? [(x0 + x1) / 2, (z0 + z1) / 2]
          const dims = r.labelDims ?? `${fmt(x1 - x0)} × ${fmt(z1 - z0)}`
          return (
            <Html
              key={r.id}
              position={[x, 0.02, z]}
              center
              zIndexRange={[10, 0]}
              className="room-label"
              style={{ display: visible ? undefined : 'none' }}
            >
              <strong>{r.name}</strong>
              <span>{dims}</span>
            </Html>
          )
        })}
    </group>
  )
}
