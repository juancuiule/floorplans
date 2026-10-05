import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FRAME_STYLES } from '../../decor/catalog'
import type { ArtworkItem } from '../../model/decor'

const PAPER = '#f7f5f0'

/**
 * A framed print in local space: centered at the origin on the wall surface,
 * facing +z. The parent group handles position and facing.
 */
export function Artwork({ item }: { item: ArtworkItem }) {
  const source = useTexture(item.image)
  const { w, h } = item.size
  const style = FRAME_STYLES.find((s) => s.id === item.frame.style) ?? FRAME_STYLES[1]
  const framed = style.id !== 'none' && style.id !== 'canvas'
  const mat = framed ? item.frame.mat : 0

  const texture = useMemo(() => {
    const t = source.clone()
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    const img = source.image as { width: number; height: number } | undefined
    const imageAspect = img ? img.width / img.height : 1
    const printAspect = w / h
    t.repeat.set(1, 1)
    t.offset.set(0, 0)
    if (item.fit === 'cover') {
      if (imageAspect > printAspect) {
        t.repeat.x = printAspect / imageAspect
        t.offset.x = (1 - t.repeat.x) / 2
      } else {
        t.repeat.y = imageAspect / printAspect
        t.offset.y = (1 - t.repeat.y) / 2
      }
    }
    t.needsUpdate = true
    return t
  }, [source, w, h, item.fit])
  useEffect(() => () => texture.dispose(), [texture])

  // With "contain" the image keeps its aspect inside the print area, on paper.
  const imageSize = useMemo<[number, number]>(() => {
    if (item.fit === 'cover') return [w, h]
    const img = source.image as { width: number; height: number } | undefined
    const a = img ? img.width / img.height : 1
    return a > w / h ? [w, w / a] : [h * a, h]
  }, [item.fit, source, w, h])

  const materials = useMemo(
    () => ({
      frame: new THREE.MeshStandardMaterial({ color: item.frame.color, roughness: 0.55 }),
      paper: new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.95 }),
      image: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),
    }),
    [item.frame.color, texture],
  )
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  const innerW = w + mat * 2
  const innerH = h + mat * 2
  const fw = style.width
  const fd = style.depth
  const outerW = innerW + fw * 2
  const outerH = innerH + fw * 2

  if (style.id === 'none') {
    return (
      <group>
        <mesh position={[0, 0, 0.0015]} material={materials.paper} castShadow>
          <boxGeometry args={[w, h, 0.002]} />
        </mesh>
        <ImagePlane size={imageSize} z={0.0027} material={materials.image} />
      </group>
    )
  }

  if (style.id === 'canvas') {
    return (
      <group>
        <mesh position={[0, 0, fd / 2]} material={materials.frame} castShadow receiveShadow>
          <boxGeometry args={[w, h, fd]} />
        </mesh>
        <ImagePlane size={imageSize} z={fd + 0.0005} material={materials.image} />
      </group>
    )
  }

  // Framed: back board, four rails, passe-partout (paper), then the print.
  const recess = style.id === 'box' ? fd * 0.55 : style.id === 'float' ? fd * 0.5 : fd * 0.3
  const paperZ = fd - recess
  const floatLift = style.id === 'float' ? 0.006 : 0
  const rails: [number, number, number, number][] = [
    [0, outerH / 2 - fw / 2, outerW, fw],
    [0, -outerH / 2 + fw / 2, outerW, fw],
    [-outerW / 2 + fw / 2, 0, fw, innerH],
    [outerW / 2 - fw / 2, 0, fw, innerH],
  ]
  return (
    <group>
      <mesh position={[0, 0, 0.003]} material={materials.frame} castShadow>
        <boxGeometry args={[outerW, outerH, 0.006]} />
      </mesh>
      {rails.map(([x, y, rw, rh], i) => (
        <mesh key={i} position={[x, y, fd / 2]} material={materials.frame} castShadow receiveShadow>
          <boxGeometry args={[rw, rh, fd]} />
        </mesh>
      ))}
      <mesh position={[0, 0, paperZ]} material={materials.paper} receiveShadow>
        <planeGeometry args={[innerW, innerH]} />
      </mesh>
      {floatLift > 0 && (
        <mesh position={[0, 0, paperZ + floatLift / 2]} material={materials.paper} castShadow>
          <boxGeometry args={[w, h, floatLift]} />
        </mesh>
      )}
      <ImagePlane size={imageSize} z={paperZ + floatLift + 0.0008} material={materials.image} />
    </group>
  )
}

function ImagePlane({ size, z, material }: { size: [number, number]; z: number; material: THREE.Material }) {
  return (
    <mesh position={[0, 0, z]} material={material} receiveShadow>
      <planeGeometry args={size} />
    </mesh>
  )
}
