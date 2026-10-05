import * as THREE from 'three'
import { seeded } from '../plantGeometry'

// Speckled stoneware glazes for mugs, shared by the counter and shelf pieces.

/** Glazes: a speckled stoneware base color each. */
export const GLAZES = ['#efe9dc', '#2f4d6b', '#c96f4a', '#e7d49a', '#7f9b86', '#d9a3a0']
export const WHITE_GLAZE = '#f3f1ec'
export const SPECKLED = '#e3d6bf'

const glazeMaterials = new Map<string, THREE.MeshStandardMaterial>()

/** Glossy stoneware with dark iron speckles (a small tiled canvas texture). */
export function glazeMaterial(color: string, speckles = true): THREE.MeshStandardMaterial {
  const key = `${color}|${speckles}`
  let m = glazeMaterials.get(key)
  if (m) return m
  if (!speckles) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.25 })
  } else {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    g.fillStyle = color
    g.fillRect(0, 0, 128, 128)
    const r = seeded(color)
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(60,45,35,${0.25 + r() * 0.45})`
      g.beginPath()
      g.arc(r() * 128, r() * 128, 0.4 + r() * 1.1, 0, Math.PI * 2)
      g.fill()
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(2, 1)
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 })
  }
  glazeMaterials.set(key, m)
  return m
}
