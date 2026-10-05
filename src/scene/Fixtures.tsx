import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { SceneObject, Vec3 } from '../model/types'
import { project } from '../project'
import { ceilingFitting, useActiveShell } from '../project/structure'
import { Box } from './Box'
import { Merged } from './Merged'
import { Shower } from './Shower'
import { sharedEdgeMaterial, sharedMaterial } from './materials'

const m = sharedMaterial

export function Fixtures() {
  // Downlights sit in whatever ceiling is over them (the entry one can be raised).
  const { structure } = useActiveShell()
  return (
    <>
      <Merged>
        {project.objects.map((o) => {
          const at = o.type === 'downlight' ? ceilingFitting(o.position, structure) : o.position
          return (
            <group key={o.id} position={at} rotation={[0, THREE.MathUtils.degToRad(o.rotation ?? 0), 0]}>
              <Fixture object={o} ceilingY={at[1]} />
            </group>
          )
        })}
      </Merged>
      <Shower />
    </>
  )
}

/** Hidden together with the ceiling it is recessed into. */
function Downlight({ ceilingY }: { ceilingY: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = camera.position.y < ceilingY - 0.01
  })
  return (
    <mesh ref={ref} position={[0, -0.004, 0]} material={m('downlight')} userData={{ noMerge: true }}>
      <cylinderGeometry args={[0.045, 0.045, 0.008, 24]} />
    </mesh>
  )
}

function Fixture({ object: o, ceilingY }: { object: SceneObject; ceilingY: number }): ReactNode {
  const edge = sharedEdgeMaterial()
  const size: Vec3 = o.size ?? [0.5, 0.5, 0.5]
  const [w, h, d] = size

  switch (o.type) {
    case 'box':
      return <Box size={size} position={[0, h / 2, 0]} material={m(o.material ?? 'cabinet')} edgeMaterial={edge} />

    case 'toilet':
      return (
        <group>
          <Box size={[0.3, 0.36, 0.4]} position={[0, 0.18, 0.02]} material={m('ceramic')} edgeMaterial={edge} />
          <mesh position={[0, 0.39, 0.07]} scale={[1, 1, 1.3]} material={m('ceramic')} castShadow receiveShadow>
            <cylinderGeometry args={[0.18, 0.16, 0.08, 32]} />
          </mesh>
          <Box size={[0.4, 0.4, 0.17]} position={[0, 0.58, -0.235]} material={m('ceramic')} edgeMaterial={edge} />
          <Box size={[0.12, 0.015, 0.05]} position={[0, 0.785, -0.235]} material={m('steel')} />
        </group>
      )

    case 'basin':
      return (
        <group>
          <Box size={[w, 0.14, d]} position={[0, h - 0.07, 0]} material={m('ceramic')} edgeMaterial={edge} />
          <Box
            size={[w - 0.08, 0.02, d - 0.1]}
            position={[0, h - 0.005, 0.02]}
            material={m('tile')}
            castShadow={false}
          />
          <mesh position={[0, (h - 0.14) / 2, -0.02]} material={m('ceramic')} castShadow>
            <cylinderGeometry args={[0.07, 0.09, h - 0.14, 24]} />
          </mesh>
          <mesh position={[0, h + 0.08, -d / 2 + 0.05]} material={m('steel')}>
            <cylinderGeometry args={[0.015, 0.015, 0.16, 12]} />
          </mesh>
        </group>
      )

    case 'showerTray':
      return (
        <group>
          <Box size={size} position={[0, h / 2, 0]} material={m('ceramic')} edgeMaterial={edge} />
          <mesh position={[0, h + 0.002, 0]} material={m('steel')}>
            <cylinderGeometry args={[0.04, 0.04, 0.004, 24]} />
          </mesh>
        </group>
      )

    case 'counter': {
      const plinth = 0.1
      const top = 0.04
      const doors = Math.max(1, Math.round(w / 0.48))
      const dw = w / doors
      return (
        <group>
          <Box size={[w, plinth, d - 0.08]} position={[0, plinth / 2, -0.04]} material={m('countertop')} />
          <Box
            size={[w, h - top - plinth, d - 0.04]}
            position={[0, plinth + (h - top - plinth) / 2, -0.02]}
            material={m('cabinet')}
            edgeMaterial={edge}
          />
          {Array.from({ length: doors }, (_, i) => (
            <Box
              key={i}
              size={[dw - 0.006, h - top - plinth - 0.006, 0.018]}
              position={[-w / 2 + dw * (i + 0.5), plinth + (h - top - plinth) / 2, d / 2 - 0.02 + 0.009]}
              material={m('cabinet')}
              edgeMaterial={edge}
            />
          ))}
          <Box size={[w, top, d]} position={[0, h - top / 2, 0]} material={m('countertop')} edgeMaterial={edge} />
        </group>
      )
    }

    case 'kitchenSink':
      return (
        <group>
          <Box size={[w, 0.004, d]} position={[0, 0.002, 0]} material={m('steel')} castShadow={false} />
          <Box
            size={[w - 0.05, 0.005, d - 0.05]}
            position={[0, 0.004, 0]}
            material={m('bathFloor')}
            castShadow={false}
          />
          <mesh position={[0, 0.16, -d / 2 - 0.03]} material={m('steel')} castShadow>
            <cylinderGeometry args={[0.014, 0.018, 0.32, 16]} />
          </mesh>
          <Box size={[0.025, 0.025, 0.2]} position={[0, 0.31, -d / 2 + 0.07]} material={m('steel')} />
        </group>
      )

    case 'cooktop':
      return (
        <group>
          <Box size={[w, 0.006, d]} position={[0, 0.003, 0]} material={m('blackGlass')} castShadow={false} />
          {[-0.12, 0.12].map((z) => (
            <mesh key={z} position={[0, 0.0065, z]} material={m('steel')}>
              <cylinderGeometry args={[0.085, 0.085, 0.001, 32]} />
            </mesh>
          ))}
        </group>
      )

    case 'fridge':
      return (
        <group>
          <Box size={size} position={[0, h / 2, 0]} material={m('appliance')} edgeMaterial={edge} />
          <Box size={[w - 0.004, 0.008, 0.006]} position={[0, h * 0.68, d / 2 + 0.001]} material={m('steel')} />
          <Box size={[0.02, 0.3, 0.03]} position={[w / 2 - 0.06, h * 0.52, d / 2 + 0.015]} material={m('steel')} />
          <Box size={[0.02, 0.18, 0.03]} position={[w / 2 - 0.06, h * 0.8, d / 2 + 0.015]} material={m('steel')} />
        </group>
      )

    case 'downlight':
      return <Downlight ceilingY={ceilingY} />

    case 'railing':
      return (
        <group>
          <Box
            size={[w, h - 0.06, d]}
            position={[0, (h - 0.06) / 2 + 0.02, 0]}
            material={m('glass')}
            castShadow={false}
          />
          <mesh position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]} material={m('steel')} castShadow>
            <cylinderGeometry args={[0.025, 0.025, w, 16]} />
          </mesh>
          {[-w / 2 + 0.03, w / 2 - 0.03].map((x) => (
            <Box key={x} size={[0.04, h, 0.04]} position={[x, h / 2, 0]} material={m('steel')} />
          ))}
        </group>
      )
  }
}
