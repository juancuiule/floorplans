import { Component, type ReactNode } from 'react'
import type { ArtworkItem } from '../../model/decor'

/**
 * An artwork whose image cannot be loaded (deleted from the library, or a link
 * from another space) shows as a blank print instead of failing the whole
 * scene: a load error thrown inside the canvas would otherwise unmount the app.
 */
export class ArtworkBoundary extends Component<{ item: ArtworkItem; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn(`Artwork ${this.props.item.id}: ${error instanceof Error ? error.message : String(error)}`)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const { w, h } = this.props.item.size
    return (
      <mesh position={[0, 0, 0.01]}>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial color="#e4e1da" roughness={0.95} />
      </mesh>
    )
  }
}
