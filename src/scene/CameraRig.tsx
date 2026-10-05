import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { isFlippable } from '../project/cameraSides'
import { launch } from '../project/launch'
import { useView } from '../store'
import { EYE_FOV, presetCamera } from './cameraPresets'

export function CameraRig() {
  const ref = useRef<CameraControls>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const preset = useView((s) => s.preset)
  const nonce = useView((s) => s.presetNonce)
  const flipped = useView((s) => (isFlippable(s.preset) ? s.isoFlip[s.preset] : false))
  const first = useRef(true)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    // ?cam= opens at an exact camera, for screenshots.
    const exact = launch.camera
    if (first.current && exact) {
      camera.fov = exact.fov ?? EYE_FOV
      camera.updateProjectionMatrix()
      c.setLookAt(...exact.position, ...exact.target, false)
      first.current = false
      return
    }
    const p = presetCamera(preset, flipped)
    camera.fov = p.fov
    camera.updateProjectionMatrix()
    c.setLookAt(...p.position, ...p.target, !first.current)
    first.current = false
  }, [preset, nonce, flipped, camera])

  return <CameraControls ref={ref} makeDefault minDistance={0.1} maxDistance={30} dollyToCursor smoothTime={0.35} />
}
